import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, Output } from 'ai';
import { z } from 'zod';
import type { Lead } from './leads';

const FIRECRAWL_SEARCH_URL = 'https://api.firecrawl.dev/v2/search';
const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

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

export async function searchRealLeads(input: {
  service: string;
  keywords: string;
  regions: string;
}): Promise<Lead[]> {
  const firecrawlKey = process.env['FIRECRAWL_API_KEY'];
  const geminiKey = process.env['GEMINI_API_KEY'];
  if (!firecrawlKey || !geminiKey) {
    throw new Error('Busca na web não configurada. Defina FIRECRAWL_API_KEY e GEMINI_API_KEY.');
  }

  const kws = input.keywords.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3);
  const regionList = input.regions.split(';').map((s) => s.trim()).filter(Boolean);
  const region = regionList[0] ?? '';
  const queries = [
    ...new Set([
      `licitação ${input.service} ${region}`,
      `cotação ${input.service} ${region}`,
      `${input.service} ${region}`,
      ...kws.map((k) => `${k} ${region}`),
      ...regionList.slice(1, 3).map((r) => `${input.service} ${r}`),
    ]),
  ].slice(0, 5);

  const failures: number[] = [];
  const results = (
    await Promise.all(
      queries.map(async (query): Promise<WebResult[]> => {
        const r = await fetch(FIRECRAWL_SEARCH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
          body: JSON.stringify({ query, limit: 8, country: 'BR', lang: 'pt', tbs: 'qdr:y' }),
        });
        if (!r.ok) {
          console.error(`Firecrawl ${r.status}: ${(await r.text()).slice(0, 200)}`);
          failures.push(r.status);
          return [];
        }
        const j = (await r.json()) as { data?: { web?: WebResult[] } };
        return j.data?.web ?? [];
      }),
    )
  )
    .flat()
    .filter((v, i, a) => a.findIndex((x) => x.url === v.url) === i)
    .slice(0, 30);

  if (!results.length) {
    if (failures.includes(402)) throw new Error('Os créditos do Firecrawl acabaram. Verifique seu plano no Firecrawl.');
    if (failures.includes(401)) throw new Error('FIRECRAWL_API_KEY inválida.');
    if (failures.includes(429)) throw new Error('Muitas buscas seguidas. Aguarde 1 minuto e tente novamente.');
    if (failures.length) throw new Error('A busca na web falhou. Tente novamente.');
    return [];
  }

  const google = createGoogleGenerativeAI({ apiKey: geminiKey });
  const listing = results
    .map((r, i) => `[${i}] ${r.title ?? ''}\n${r.description ?? ''}\n${r.url}`)
    .join('\n\n');

  let aiError: unknown = null;
  const res = streamText({
    onError: ({ error }) => {
      aiError = error;
    },
    model: google(process.env['GEMINI_MODEL'] ?? DEFAULT_GEMINI_MODEL),
    output: Output.object({ schema: z.object({ items: z.array(qualified) }) }),
    system: `Você qualifica sinais de compra B2B para quem vende "${input.service}". Para cada resultado, seja PERMISSIVO: marque isOpportunity=true para qualquer empresa, órgão ou organização citada que possa ser um possível cliente, mesmo com sinal fraco ou indireto (o usuário filtra manualmente). Marque false apenas para páginas sem nenhuma organização identificável. Fornecedores concorrentes podem entrar com score baixo (10-30). Use o score para refletir a força do sinal: forte (licitação, cotação, pedido de orçamento) 70-100, médio 40-69, fraco 10-39, e urgency Baixa para sinais fracos. Se não houver empresa nomeada, use o título da página como company. Use apenas fatos do texto; se nome de pessoa/cargo não aparecer, use "Não identificado". score de 0 a 100. value = valor estimado em reais (0 se desconhecido). Responda em português.`,
    prompt: listing,
  });

  let out;
  try {
    out = await res.output;
  } catch (e) {
    console.error('AI output failed', e, await res.finishReason.catch(() => null));
    const status = (aiError as { statusCode?: number } | null)?.statusCode;
    if (status === 429) throw new Error('Limite de uso do Gemini atingido. Aguarde um pouco e tente novamente.');
    if (status === 400 || status === 401 || status === 403) {
      throw new Error('GEMINI_API_KEY inválida ou sem permissão para o modelo configurado.');
    }
    throw new Error('A análise por IA falhou. Tente novamente.');
  }

  return out.items
    .filter((x) => x.isOpportunity && results[x.index])
    .map((x, n) => {
      const src = results[x.index]!;
      const host = new URL(src.url).hostname.replace(/^www\./, '');
      return {
        id: 10000 + n,
        name: x.company,
        initials: x.company.split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase(),
        niche: input.service,
        city: x.city || region,
        score: Math.round(x.score),
        urgency: x.urgency,
        signal: x.signal,
        source: host,
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
