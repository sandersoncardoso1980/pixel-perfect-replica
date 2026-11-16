import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, Output } from 'ai';
import { z } from 'zod';
import type { Lead } from './leads';

const FIRECRAWL_SEARCH_URL = 'https://api.firecrawl.dev/v2/search';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_FALLBACK_MODELS = ['gemini-2.5-flash'];
const FIRECRAWL_TIMEOUT_MS = 25_000;
const GEMINI_TIMEOUT_MS = 45_000;

const qualified = z.object({
  index: z.number(),
  isOpportunity: z.boolean(),
  company: z.string(),
  city: z.string(),
  signal: z.string(),
  score: z.number(),
  urgency: z.enum(['Alta', 'Média', 'Baixa']),
  person: z.string(),
  role: z.string(),
  niche: z.string(),
  value: z.number(),
});

type WebResult = { url: string; title?: string; description?: string };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function statusOf(err: unknown, depth = 0): number | undefined {
  if (!err || depth > 4) return undefined;
  const e = err as { statusCode?: unknown; lastError?: unknown; errors?: unknown };
  if (typeof e.statusCode === 'number') return e.statusCode;
  const fromLast = statusOf(e.lastError, depth + 1);
  if (fromLast) return fromLast;
  if (Array.isArray(e.errors)) {
    for (const x of [...e.errors].reverse()) {
      const s = statusOf(x, depth + 1);
      if (s) return s;
    }
  }
  return undefined;
}

export async function searchRealLeads(input: {
  service: string;
  keywords: string;
  regions: string;
}): Promise<Lead[]> {
  const firecrawlKey = process.env['FIRECRAWL_API_KEY']?.trim();
  const geminiKey = process.env['GEMINI_API_KEY']?.trim();
  if (!firecrawlKey || !geminiKey) {
    throw new Error('Busca na web não configurada. Defina FIRECRAWL_API_KEY e GEMINI_API_KEY.');
  }

  const modelName = process.env['GEMINI_MODEL']?.trim() || DEFAULT_GEMINI_MODEL;
  const fallbackFromEnv = (process.env['GEMINI_FALLBACK_MODELS'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const models = [
    ...new Set([modelName, ...(fallbackFromEnv.length ? fallbackFromEnv : DEFAULT_FALLBACK_MODELS)]),
  ];

  const kws = input.keywords.split(',').map((s) => s.trim()).filter(Boolean);
  const regionList = input.regions.split(';').map((s) => s.trim()).filter(Boolean);
  const region = regionList[0] ?? '';

  const queries = [
    ...new Set([
      `${input.service} ${region}`,
      ...kws.map((k) => `${input.service} ${k} ${region}`),
      ...kws.slice(0, 2).map((k) => `${k} ${region}`),
      ...regionList.slice(1, 3).map((r) => `${input.service} ${r}`),
    ]),
  ].filter(Boolean).slice(0, 4);

  console.log('[DorRadar] Buscando no Firecrawl:', queries);

  const failures: number[] = [];
  const results = (
    await Promise.all(
      queries.map(async (query): Promise<WebResult[]> => {
        try {
          const r = await fetch(FIRECRAWL_SEARCH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
            body: JSON.stringify({ query, limit: 6, country: 'BR', lang: 'pt', tbs: 'qdr:y' }),
            signal: AbortSignal.timeout(FIRECRAWL_TIMEOUT_MS),
          });
          if (!r.ok) {
            console.error(`[DorRadar] Firecrawl ${r.status}: ${(await r.text()).slice(0, 200)}`);
            failures.push(r.status);
            return [];
          }
          const j = (await r.json()) as { data?: { web?: WebResult[] } };
          return j.data?.web ?? [];
        } catch (e) {
          console.error(`[DorRadar] Firecrawl falhou/timeout em "${query}":`, e);
          failures.push(0);
          return [];
        }
      }),
    )
  )
    .flat()
    .filter((v, i, a) => a.findIndex((x) => x.url === v.url) === i)
    .slice(0, 15);

  console.log('[DorRadar] Resultados únicos enviados para a IA:', results.length);

  if (!results.length) {
    if (failures.includes(402)) throw new Error('Os créditos do Firecrawl acabaram. Verifique seu plano no Firecrawl.');
    if (failures.includes(401)) throw new Error('FIRECRAWL_API_KEY inválida.');
    if (failures.includes(429)) throw new Error('Muitas buscas seguidas. Aguarde 1 minuto e tente novamente.');
    if (failures.includes(0)) throw new Error('O Firecrawl não respondeu a tempo. Tente novamente.');
    if (failures.length) throw new Error('A busca na web falhou. Tente novamente.');
    return [];
  }

  const google = createGoogleGenerativeAI({ apiKey: geminiKey });
  
  const listing = results
    .map((r, i) => `[${i}] Título: ${r.title ?? ''}\nResumo: ${(r.description ?? '').slice(0, 250)}\nURL: ${r.url}`)
    .join('\n\n');

  const system = `Você qualifica oportunidades comerciais para um negócio que oferece: "${input.service}". O foco da busca é: "${input.keywords}". 
Para cada resultado, seja PERMISSIVO e analítico: marque isOpportunity=true para qualquer pessoa física, perfil, anúncio, evento ou estabelecimento que represente uma oportunidade válida dentro da região alvo. 
No campo 'city', extraia a cidade mencionada no texto. Se não houver cidade clara no texto, retorne exatamente a string vazia "" para que o sistema preencha com a região principal buscada.
No campo 'company', se for uma pessoa física ou perfil sem nome de empresa comercial, utilize o nome da pessoa ou o identificador da página. No campo 'signal', descreva a oportunidade identificada. 
Use o score de 0 a 100 para força do sinal, e urgency correspondente (Alta, Média, Baixa). Use apenas fatos do texto; se nome não aparecer, use "Não identificado". value = valor estimado em reais (0 se desconhecido). Responda estritamente em português.`;

  let out;
  let lastStatus: number | undefined;

  for (const m of models) {
    console.log('[DorRadar] Chamando Gemini, modelo:', m);

    let aiError = null as unknown;
    const res = streamText({
      abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      maxRetries: 1,
      onError: ({ error }) => {
        aiError = error;
      },
      model: google(m),
      output: Output.object({ schema: z.object({ items: z.array(qualified) }) }),
      system,
      prompt: listing,
    });

    try {
      out = await res.output;
      console.log(
        `[DorRadar] IA (${m}) devolveu`,
        out.items.length,
        'itens;',
        out.items.filter((x) => x.isOpportunity).length,
        'como oportunidade válida',
      );
      break;
    } catch (e) {
      const status = statusOf(aiError) ?? statusOf(e);
      console.error(`[DorRadar] Modelo ${m} falhou (status ${status ?? 'timeout/rede'}):`, aiError ?? e);

      if (status === 400 || status === 401 || status === 403) {
        throw new Error('GEMINI_API_KEY inválida ou sem permissão para o modelo configurado.');
      }
      lastStatus = status;
    }
  }

  if (!out) {
    if (lastStatus === 429) throw new Error('Limite de uso do Gemini atingido. Aguarde um pouco e tente novamente.');
    if (lastStatus === 503 || lastStatus === 500) {
      throw new Error('O Gemini está sobrecarregado no momento. Tente novamente em alguns minutos.');
    }
    if (lastStatus === 404) throw new Error('Nenhum modelo Gemini encontrado. Verifique GEMINI_MODEL.');
    throw new Error('A análise por IA falhou ou demorou demais. Tente novamente.');
  }

  // Lista de termos inválidos que a IA costuma inventar quando falta dado
  const invalidCityTerms = ['não definido', 'não informado', 'desconhecido', 'n/a', 'nao definido', 'nao informado', 'não especificado'];

  return out.items
    .filter((x) => x.isOpportunity && results[x.index])
    .map((x, n) => {
      const src = results[x.index]!;
      const rawCity = (x.city ?? '').trim();
      
      // Valida se a cidade retornada pela IA é real ou lixo/vazia
      const isInvalid = !rawCity || invalidCityTerms.includes(rawCity.toLowerCase());
      const resolvedCity = isInvalid ? region : rawCity;

      return {
        id: 10000 + n,
        name: x.company,
        initials: x.company.split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase(),
        niche: input.service,
        city: resolvedCity,
        score: Math.round(x.score),
        urgency: x.urgency,
        signal: x.signal,
        source: hostOf(src.url),
        age: 'Último ano',
        person: x.person,
        role: x.role,
        email: '',
        phone: '',
        value: x.value,
        url: src.url,
        real: true,
      };
    });
}