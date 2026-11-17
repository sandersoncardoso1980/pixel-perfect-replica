// Núcleo da análise de preços. Código puro (sem rede, sem IA), seguro para o navegador e o servidor.
// Toda estatística que o usuário vê sai daqui, nunca de um modelo de IA.

export type Condition = "novo" | "usado" | "recondicionado" | "desconhecida";
export type Reach = "local" | "nacional" | "marketplace" | "desconhecido";

export type Offer = {
  store: string;
  title: string;
  price: number;
  originalPrice: number | null;
  condition: Condition;
  reach: Reach;
  city: string;
  relevance: number;
  url: string;
  evidence: string;
};

export type DropReason =
  | "sem_preco"
  | "sem_evidencia"
  | "baixa_relevancia"
  | "usado"
  | "duplicada"
  | "fora_da_curva";

export type DropCounts = Record<DropReason, number>;

export type Bin = { from: number; to: number; count: number };
export type ReachStat = { reach: Reach; n: number; min: number; median: number };
export type Confidence = "baixa" | "media" | "alta";

export type PriceStats = {
  n: number;
  stores: number;
  min: number;
  q1: number;
  median: number;
  mean: number;
  q3: number;
  max: number;
  bins: Bin[];
  byReach: ReachStat[];
  promo: { n: number; avgDiscountPct: number | null };
  cheapest: Offer;
  confidence: Confidence;
};

export type PriceAnalysis = {
  id: string | null;
  niche: string;
  product: string;
  region: string;
  createdAt: string;
  pagesScanned: number;
  offers: Offer[];
  droppedCounts: DropCounts;
  stats: PriceStats | null;
  summary: string[];
  reading: string | null;
  warnings: string[];
};

export type AnalysisListItem = {
  id: string;
  niche: string;
  product: string;
  region: string;
  createdAt: string;
  n: number;
  median: number | null;
};

export const DROP_LABELS: Record<DropReason, string> = {
  sem_preco: "sem preço claro",
  sem_evidencia: "preço não confirmado no texto da página",
  baixa_relevancia: "produto diferente ou acessório",
  usado: "usado ou recondicionado",
  duplicada: "repetida",
  fora_da_curva: "preço muito fora da faixa",
};

export function emptyDropCounts(): DropCounts {
  return {
    sem_preco: 0,
    sem_evidencia: 0,
    baixa_relevancia: 0,
    usado: 0,
    duplicada: 0,
    fora_da_curva: 0,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return Number.NaN;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (pos - lo);
}

export function formatBRL(n: number): string {
  const cents = Math.round(n * 100);
  const int = Math.floor(Math.abs(cents) / 100);
  const frac = String(Math.abs(cents) % 100).padStart(2, "0");
  const dots = String(int).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cents < 0 ? "-" : ""}R$ ${dots},${frac}`;
}

// Formas como um preço costuma aparecer escrito em páginas brasileiras.
export function brVariants(price: number): string[] {
  const cents = Math.round(price * 100);
  const int = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, "0");
  const dots = String(int).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const set = new Set<string>([`${dots},${frac}`, `${int},${frac}`]);
  if (frac === "00") {
    set.add(dots);
    set.add(String(int));
  }
  return [...set];
}

// Confere se o preço extraído realmente aparece no texto da página (barra preço inventado pela IA).
export function priceAppearsInText(price: number, text: string): boolean {
  return brVariants(price).some((v) => {
    const escaped = v.replace(/[.,]/g, "\\$&");
    const re = new RegExp(`(?<![\\d.,])${escaped}(?!\\d|,\\d|\\.\\d)`);
    return re.test(text);
  });
}

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

export function normalizeStore(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type SelectOptions = { minRelevance?: number; allowUsed?: boolean };

// Escolhe as ofertas comparáveis e conta por que descartou as demais.
export function selectComparable(
  offers: Offer[],
  options: SelectOptions = {},
): { kept: Offer[]; dropped: DropCounts } {
  const { minRelevance = 0.6, allowUsed = false } = options;
  const dropped = emptyDropCounts();
  const seen = new Set<string>();
  let kept: Offer[] = [];

  for (const o of offers) {
    if (!Number.isFinite(o.price) || o.price <= 0) {
      dropped.sem_preco++;
      continue;
    }
    if (o.relevance < minRelevance) {
      dropped.baixa_relevancia++;
      continue;
    }
    if (!allowUsed && (o.condition === "usado" || o.condition === "recondicionado")) {
      dropped.usado++;
      continue;
    }
    const key = `${normalizeUrl(o.url)}|${round2(o.price)}`;
    if (seen.has(key)) {
      dropped.duplicada++;
      continue;
    }
    seen.add(key);
    kept.push(o);
  }

  // Corta preços absurdos (ex.: um kit de 10 unidades ou um erro de leitura) quando há amostra suficiente.
  if (kept.length >= 5) {
    const sorted = kept.map((o) => o.price).sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const median = quantile(sorted, 0.5);
    const margin = Math.max(1.5 * (q3 - q1), 0.3 * median);
    const low = q1 - margin;
    const high = q3 + margin;
    const inside = kept.filter((o) => o.price >= low && o.price <= high);
    dropped.fora_da_curva += kept.length - inside.length;
    kept = inside;
  }

  kept.sort((a, b) => a.price - b.price);
  return { kept, dropped };
}

export function histogram(values: number[], bins = 6): Bin[] {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ from: round2(min), to: round2(max), count: values.length }];
  const width = (max - min) / bins;
  const out: Bin[] = Array.from({ length: bins }, (_, i) => ({
    from: round2(min + i * width),
    to: round2(min + (i + 1) * width),
    count: 0,
  }));
  for (const v of values) {
    const i = Math.min(bins - 1, Math.floor((v - min) / width));
    (out[i] as Bin).count++;
  }
  return out;
}

function confidenceOf(n: number, stores: number): Confidence {
  const base: Confidence = n < 5 ? "baixa" : n < 12 ? "media" : "alta";
  if (stores < 3 && base === "alta") return "media";
  if (stores < 3 && base === "media") return "baixa";
  return base;
}

export function computeStats(kept: Offer[]): PriceStats | null {
  if (!kept.length) return null;
  const prices = kept.map((o) => o.price).sort((a, b) => a - b);
  const stores = new Set(kept.map((o) => normalizeStore(o.store) || normalizeUrl(o.url))).size;

  const groups = new Map<Reach, number[]>();
  for (const o of kept) groups.set(o.reach, [...(groups.get(o.reach) ?? []), o.price]);
  const byReach: ReachStat[] = [...groups.entries()]
    .map(([reach, list]) => {
      const s = [...list].sort((a, b) => a - b);
      return {
        reach,
        n: s.length,
        min: round2(s[0] as number),
        median: round2(quantile(s, 0.5)),
      };
    })
    .sort((a, b) => b.n - a.n);

  const promos = kept.filter((o) => o.originalPrice !== null && o.originalPrice > o.price);
  const avgDiscountPct = promos.length
    ? Math.round(
        (promos.reduce((acc, o) => acc + ((o.originalPrice as number) - o.price) / (o.originalPrice as number), 0) /
          promos.length) *
          1000,
      ) / 10
    : null;

  return {
    n: prices.length,
    stores,
    min: round2(prices[0] as number),
    q1: round2(quantile(prices, 0.25)),
    median: round2(quantile(prices, 0.5)),
    mean: round2(prices.reduce((a, b) => a + b, 0) / prices.length),
    q3: round2(quantile(prices, 0.75)),
    max: round2(prices[prices.length - 1] as number),
    bins: histogram(prices),
    byReach,
    promo: { n: promos.length, avgDiscountPct },
    cheapest: [...kept].sort((a, b) => a.price - b.price)[0] as Offer,
    confidence: confidenceOf(prices.length, stores),
  };
}

const REACH_LABEL: Record<Reach, string> = {
  local: "lojas locais",
  nacional: "lojas online nacionais",
  marketplace: "marketplaces",
  desconhecido: "lojas de alcance não identificado",
};
export const reachLabel = (r: Reach): string => REACH_LABEL[r];

// Resumo determinístico: só frases montadas com os números calculados acima.
export function buildSummary(
  stats: PriceStats | null,
  dropped: DropCounts,
  product: string,
  region: string,
): string[] {
  const out: string[] = [];
  if (!stats) {
    out.push(`Não encontramos ofertas comparáveis de "${product}" em páginas públicas para ${region}.`);
  } else {
    out.push(
      `Encontramos ${stats.n} oferta${stats.n === 1 ? "" : "s"} comparáve${stats.n === 1 ? "l" : "is"} de "${product}" em ${stats.stores} loja${stats.stores === 1 ? "" : "s"} (busca para ${region}).`,
    );
    out.push(
      `Preço típico (mediana): ${formatBRL(stats.median)}. Faixa: ${formatBRL(stats.min)} a ${formatBRL(stats.max)}; metade das ofertas fica entre ${formatBRL(stats.q1)} e ${formatBRL(stats.q3)}.`,
    );
    out.push(`Oferta mais barata: ${stats.cheapest.store} por ${formatBRL(stats.cheapest.price)}.`);
    if (stats.promo.n > 0) {
      out.push(
        `${stats.promo.n} oferta${stats.promo.n === 1 ? "" : "s"} em promoção${stats.promo.avgDiscountPct !== null ? `, com desconto médio de ${String(stats.promo.avgDiscountPct).replace(".", ",")}%` : ""}.`,
      );
    }
    const local = stats.byReach.find((g) => g.reach === "local");
    const others = stats.byReach.filter((g) => g.reach !== "local" && g.reach !== "desconhecido");
    if (local && others.length) {
      const total = others.reduce((a, g) => a + g.n, 0);
      out.push(
        `${reachLabel("local")[0]!.toUpperCase()}${reachLabel("local").slice(1)}: mediana de ${formatBRL(local.median)} (${local.n} oferta${local.n === 1 ? "" : "s"}). Online (nacionais e marketplaces): ${total} oferta${total === 1 ? "" : "s"}, a partir de ${formatBRL(Math.min(...others.map((g) => g.min)))}.`,
      );
    }
    if (stats.confidence === "baixa") {
      out.push("Poucas ofertas ou poucas lojas: trate o resultado como indicativo, não como média de mercado.");
    }
  }
  const droppedTotal = Object.values(dropped).reduce((a, b) => a + b, 0);
  if (droppedTotal > 0) {
    const parts = (Object.keys(dropped) as DropReason[])
      .filter((k) => dropped[k] > 0)
      .map((k) => `${dropped[k]} ${DROP_LABELS[k]}`);
    out.push(`Resultados descartados: ${parts.join("; ")}.`);
  }
  return out;
}

// Valores em reais citados em um texto (ex.: "R$ 1.299,90").
export function extractBRLAmounts(text: string): number[] {
  const out: number[] = [];
  const re = /R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const int = Number((m[1] as string).replace(/\./g, ""));
    const frac = m[2] ? Number(m[2].padEnd(2, "0")) / 100 : 0;
    out.push(round2(int + frac));
  }
  return out;
}

// Um texto escrito pela IA só é aceito se todo valor em reais citado existir nos dados reais e sem percentuais.
export function isGroundedReading(text: string, allowed: number[]): boolean {
  if (text.includes("%")) return false;
  const set = allowed.map(round2);
  return extractBRLAmounts(text).every((v) => set.some((a) => Math.abs(a - v) < 0.011));
}
