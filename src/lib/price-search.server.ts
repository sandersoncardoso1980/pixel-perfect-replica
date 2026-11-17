import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output, streamText } from "ai";
import { z } from "zod";
import {
  buildSummary,
  computeStats,
  emptyDropCounts,
  isGroundedReading,
  normalizeUrl,
  priceAppearsInText,
  selectComparable,
  formatBRL,
  type Offer,
  type PriceAnalysis,
} from "./price-stats";

// Somente servidor. A IA só LÊ preços que estão escritos nas páginas; toda conta é feita em price-stats.ts.

const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v2/search";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const FIRECRAWL_TIMEOUT_MS = 75_000;
const GEMINI_TIMEOUT_MS = 60_000;
const MAX_PAGES = 14;
const RESULTS_PER_QUERY = 8;

export type PriceSearchInput = { niche: string; product: string; region: string };

type WebPage = { url: string; title?: string; description?: string; markdown?: string | null };

const adSchema = z.object({
  title: z.string(),
  store: z.string(),
  price: z.number().nullable(),
  originalPrice: z.number().nullable(),
  condition: z.enum(["novo", "usado", "recondicionado", "desconhecida"]),
  reach: z.enum(["local", "nacional", "marketplace", "desconhecido"]),
  city: z.string(),
  relevance: z.number(),
  evidence: z.string(),
});

const extractionSchema = z.object({
  pages: z.array(z.object({ index: z.number().int(), ads: z.array(adSchema).max(5) })),
});

function statusOf(err: unknown, depth = 0): number | undefined {
  if (!err || depth > 4) return undefined;
  const e = err as { statusCode?: unknown; lastError?: unknown; errors?: unknown };
  if (typeof e.statusCode === "number") return e.statusCode;
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

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Mantém o começo da página e os trechos em volta de cada "R$", que é onde os preços estão.
function priceWindows(md: string, max = 2600): string {
  const headLen = 900;
  const parts: string[] = [md.slice(0, headLen)];
  let covered = headLen;
  let used = headLen;
  const re = /R\$\s?\d/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) && used < max) {
    const end = Math.min(md.length, m.index + 160);
    if (end <= covered) continue;
    const start = Math.max(covered, m.index - 140);
    const seg = md.slice(start, end);
    parts.push(`… ${seg}`);
    used += seg.length;
    covered = end;
  }
  return parts.join("\n");
}

async function firecrawlSearch(
  query: string,
  key: string,
  region: string,
  warnings: string[],
  failures: number[],
): Promise<WebPage[]> {
  const call = async (withLocation: boolean) =>
    fetch(FIRECRAWL_SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        query,
        limit: RESULTS_PER_QUERY,
        country: "BR",
        ...(withLocation ? { location: `${region}, Brazil` } : {}),
        timeout: 60_000,
        scrapeOptions: { formats: [{ type: "markdown" }], onlyMainContent: true },
      }),
      signal: AbortSignal.timeout(FIRECRAWL_TIMEOUT_MS),
    });

  try {
    let r = await call(true);
    if (r.status === 400) r = await call(false); // região em texto livre pode ser recusada como localização
    if (!r.ok) {
      console.error(`[Preços] Firecrawl ${r.status}: ${(await r.text()).slice(0, 200)}`);
      failures.push(r.status);
      return [];
    }
    const j = (await r.json()) as { data?: { web?: WebPage[] }; warning?: string | null };
    if (j.warning) warnings.push(`Firecrawl: ${j.warning}`);
    return j.data?.web ?? [];
  } catch (e) {
    console.error(`[Preços] Firecrawl falhou/timeout em "${query}":`, e);
    failures.push(0);
    return [];
  }
}

function extractionPrompt(input: PriceSearchInput) {
  return `Você extrai preços de páginas da web para uma pesquisa de preço de mercado.
Produto pesquisado: "${input.product}"${input.niche ? ` (segmento: ${input.niche})` : ""}. Região de interesse: "${input.region}".

Para cada página numerada, liste até 5 ofertas do produto (ou de equivalentes diretos) com preço ESCRITO no texto. Regras:
1. Use apenas números que aparecem no texto. Nunca estime, calcule nem converta moeda.
2. price = preço à vista em reais, como número (ex.: 1299.9). Se só houver parcelas ("10x de R$ 129,90"), NÃO use a parcela: price = null.
3. originalPrice = preço "de" (riscado) quando houver promoção; caso contrário null.
4. Para "a partir de", use o valor e escreva "a partir de" na evidência.
5. relevance de 0 a 1: 1 = mesmo produto (marca, modelo e especificação iguais ao pesquisado); 0.6 = variação próxima; abaixo de 0.4 = acessório, peça, outro produto ou página que não vende.
6. condition: "usado" para usado/seminovo; "recondicionado" para recondicionado/reembalado; "novo" para novo ou venda de varejo sem indicação de uso; senão "desconhecida".
7. reach: "local" se for loja física ou negócio da região do usuário; "marketplace" para Mercado Livre, Amazon, Shopee, OLX, Magalu (vendedores terceiros) e similares; "nacional" para e-commerce de alcance nacional; "desconhecido" se não der para saber.
8. evidence = trecho curto copiado do texto que contém o preço.
9. store = nome da loja ou vendedor (se não houver, use o domínio).
10. city = cidade da oferta se estiver no texto, senão "".
Se a página não tiver preço, devolva ads vazio. Responda em português.`;
}

async function extractAds(
  pages: WebPage[],
  input: PriceSearchInput,
  geminiKey: string,
): Promise<z.infer<typeof extractionSchema>> {
  const google = createGoogleGenerativeAI({ apiKey: geminiKey });
  const listing = pages
    .map((p, i) => `[${i}] URL: ${p.url}\nTítulo: ${p.title ?? ""}\nTexto:\n${priceWindows(p.markdown ?? "")}`)
    .join("\n\n=====\n\n");

  const primary = process.env["GEMINI_MODEL"]?.trim() || DEFAULT_GEMINI_MODEL;
  const fallbacks = (process.env["GEMINI_FALLBACK_MODELS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const models = [...new Set([primary, ...fallbacks])];

  let lastStatus: number | undefined;
  for (const m of models) {
    let aiError: unknown = null;
    const res = streamText({
      abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      maxRetries: 1,
      onError: ({ error }) => {
        aiError = error;
      },
      model: google(m),
      output: Output.object({ schema: extractionSchema }),
      system: extractionPrompt(input),
      prompt: listing,
    });
    try {
      return await res.output;
    } catch (e) {
      const status = statusOf(aiError) ?? statusOf(e);
      console.error(`[Preços] Modelo ${m} falhou (status ${status ?? "timeout/rede"}):`, aiError ?? e);
      if (status === 400 || status === 401 || status === 403) {
        throw new Error("GEMINI_API_KEY inválida ou sem permissão para o modelo configurado.");
      }
      lastStatus = status;
    }
  }
  if (lastStatus === 429) throw new Error("Limite de uso do Gemini atingido. Aguarde um pouco e tente novamente.");
  if (lastStatus === 503 || lastStatus === 500) {
    throw new Error("O Gemini está sobrecarregado no momento. Tente novamente em alguns minutos.");
  }
  if (lastStatus === 404) throw new Error("Nenhum modelo Gemini encontrado. Verifique GEMINI_MODEL.");
  throw new Error("A leitura dos preços por IA falhou ou demorou demais. Tente novamente.");
}

// Leitura opcional em texto. Só é exibida se todos os valores citados existirem nos dados reais.
async function writeReading(analysis: PriceAnalysis, geminiKey: string): Promise<string | null> {
  const stats = analysis.stats;
  if (!stats || stats.n < 3) return null;
  try {
    const google = createGoogleGenerativeAI({ apiKey: geminiKey });
    const model = process.env["GEMINI_MODEL"]?.trim() || DEFAULT_GEMINI_MODEL;
    const data = {
      produto: analysis.product,
      regiao: analysis.region,
      ofertas: stats.n,
      lojas: stats.stores,
      minimo: formatBRL(stats.min),
      q1: formatBRL(stats.q1),
      mediana: formatBRL(stats.median),
      q3: formatBRL(stats.q3),
      maximo: formatBRL(stats.max),
      por_alcance: stats.byReach.map((g) => ({
        alcance: g.reach,
        ofertas: g.n,
        minimo: formatBRL(g.min),
        mediana: formatBRL(g.median),
      })),
      confianca: stats.confidence,
    };
    const { text } = await generateText({
      abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      maxRetries: 1,
      model: google(model),
      system:
        "Você é um analista de preços. Escreva de 2 a 4 frases curtas, em português, com uma leitura do cenário: dispersão dos preços, diferença entre tipos de loja e onde pode haver espaço de posicionamento. Regras: use SOMENTE valores em reais que aparecem nos dados, no formato 'R$ 1.234,56'; não invente números, nomes de lojas nem porcentagens; não use o símbolo %; se a confiança for baixa, diga que é indicativo.",
      prompt: JSON.stringify(data),
    });
    const reading = text.trim();
    const allowed = [
      stats.min,
      stats.q1,
      stats.median,
      stats.mean,
      stats.q3,
      stats.max,
      ...stats.byReach.flatMap((g) => [g.min, g.median]),
    ];
    if (reading.length > 0 && reading.length <= 800 && isGroundedReading(reading, allowed)) return reading;
    console.warn("[Preços] Leitura da IA descartada: citava valores fora dos dados.");
    return null;
  } catch (e) {
    console.warn("[Preços] Leitura da IA indisponível:", e);
    return null;
  }
}

export async function analyzePrices(input: PriceSearchInput): Promise<PriceAnalysis> {
  const firecrawlKey = process.env["FIRECRAWL_API_KEY"]?.trim();
  const geminiKey = process.env["GEMINI_API_KEY"]?.trim();
  if (!firecrawlKey || !geminiKey) {
    throw new Error("Busca na web não configurada. Defina FIRECRAWL_API_KEY e GEMINI_API_KEY.");
  }

  const warnings: string[] = [];
  const failures: number[] = [];
  const dropped = emptyDropCounts();

  const queries = [
    ...new Set([
      `${input.product} preço ${input.region}`,
      `${input.niche ? `${input.niche} ` : ""}${input.product} comprar ${input.region}`,
    ]),
  ];
  console.log("[Preços] Buscando:", queries);

  const found = (await Promise.all(queries.map((q) => firecrawlSearch(q, firecrawlKey, input.region, warnings, failures)))).flat();

  const seen = new Set<string>();
  const pages = found
    .filter((p) => p.url && (p.markdown ?? "").length > 80)
    .filter((p) => {
      const k = normalizeUrl(p.url);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAX_PAGES);

  if (!pages.length) {
    if (failures.includes(402)) throw new Error("Os créditos do Firecrawl acabaram. Verifique seu plano no Firecrawl.");
    if (failures.includes(401)) throw new Error("FIRECRAWL_API_KEY inválida.");
    if (failures.includes(429)) throw new Error("Muitas buscas seguidas. Aguarde 1 minuto e tente novamente.");
    if (failures.includes(0)) throw new Error("O Firecrawl não respondeu a tempo. Tente novamente.");
    if (failures.length) throw new Error("A busca na web falhou. Tente novamente.");
    warnings.push("A busca não retornou páginas com conteúdo.");
  }

  const offers: Offer[] = [];
  if (pages.length) {
    const extracted = await extractAds(pages, input, geminiKey);
    for (const pg of extracted.pages) {
      const page = pages[pg.index];
      if (!page) continue;
      const text = page.markdown ?? "";
      for (const ad of pg.ads) {
        if (ad.price === null || !Number.isFinite(ad.price) || ad.price <= 0) {
          dropped.sem_preco++;
          continue;
        }
        // Barreira contra preço inventado: o valor precisa estar escrito na página.
        if (!priceAppearsInText(ad.price, text)) {
          dropped.sem_evidencia++;
          continue;
        }
        const originalPrice =
          ad.originalPrice !== null && ad.originalPrice > ad.price && priceAppearsInText(ad.originalPrice, text)
            ? ad.originalPrice
            : null;
        offers.push({
          store: ad.store.trim() || hostOf(page.url),
          title: ad.title.trim(),
          price: ad.price,
          originalPrice,
          condition: ad.condition,
          reach: ad.reach,
          city: ad.city.trim(),
          relevance: Math.max(0, Math.min(1, ad.relevance)),
          url: page.url,
          evidence: ad.evidence.trim().slice(0, 240),
        });
      }
    }
  }

  const { kept, dropped: droppedSelect } = selectComparable(offers);
  for (const k of Object.keys(droppedSelect) as (keyof typeof dropped)[]) dropped[k] += droppedSelect[k];

  const stats = computeStats(kept);
  const analysis: PriceAnalysis = {
    id: null,
    niche: input.niche,
    product: input.product,
    region: input.region,
    createdAt: new Date().toISOString(),
    pagesScanned: pages.length,
    offers: kept,
    droppedCounts: dropped,
    stats,
    summary: buildSummary(stats, dropped, input.product, input.region),
    reading: null,
    warnings,
  };
  analysis.reading = await writeReading(analysis, geminiKey);
  return analysis;
}
