import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowUpRight, Clock, Download, Info, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { analyzePricesFn, getAnalysisFn, listAnalysesFn } from "@/lib/price.functions";
import {
  formatBRL,
  reachLabel,
  type AnalysisListItem,
  type Confidence,
  type PriceAnalysis,
  type PriceStats,
} from "@/lib/price-stats";

const STEPS = [
  "Buscando páginas públicas com preços…",
  "Lendo os preços de cada página…",
  "Conferindo se cada preço está escrito na página…",
  "Calculando o balanço de mercado…",
];

const CONFIDENCE: Record<Confidence, { label: string; cls: string }> = {
  baixa: { label: "Confiança baixa", cls: "border-red-500/40 text-red-700 dark:text-red-400" },
  media: { label: "Confiança média", cls: "border-amber-500/40 text-amber-700 dark:text-amber-400" },
  alta: { label: "Confiança alta", cls: "border-green-600/40 text-green-700 dark:text-green-400" },
};

function safeHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : "#";
}

// Evita que um título vindo da web vire fórmula ao abrir o CSV no Excel.
function csvCell(v: string | number): string {
  const s = String(v);
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function toCsv(a: PriceAnalysis): string {
  const num = (n: number | null) => (n === null ? "" : n.toFixed(2).replace(".", ","));
  const head = ["Loja", "Produto", "Preço (R$)", "Preço original (R$)", "Condição", "Alcance", "Cidade", "Link"];
  const rows = a.offers.map((o) =>
    [o.store, o.title, num(o.price), num(o.originalPrice), o.condition, o.reach, o.city, o.url].map(csvCell).join(";"),
  );
  return "﻿" + [head.map(csvCell).join(";"), ...rows].join("\r\n");
}

function downloadCsv(a: PriceAnalysis) {
  const slug = a.product.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const url = URL.createObjectURL(new Blob([toCsv(a)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `precos-${slug || "analise"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function StatCard({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg border bg-card p-4 xl:p-5 ${strong ? "border-primary/40 ring-1 ring-primary/20" : ""}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function RangeBar({ stats }: { stats: PriceStats }) {
  const span = stats.max - stats.min;
  const pct = (v: number) => (span === 0 ? 50 : ((v - stats.min) / span) * 100);
  return (
    <div className="rounded-lg border bg-card p-4 xl:p-5">
      <div className="mb-3 text-xs font-semibold">Onde estão os preços</div>
      <div className="relative h-3 rounded-full bg-muted" role="img" aria-label={`Preços de ${formatBRL(stats.min)} a ${formatBRL(stats.max)}, mediana ${formatBRL(stats.median)}`}>
        <div
          className="absolute top-0 h-3 rounded-full bg-primary/30"
          style={{ left: `${pct(stats.q1)}%`, width: `${Math.max(2, pct(stats.q3) - pct(stats.q1))}%` }}
        />
        <div className="absolute -top-1 h-5 w-0.5 bg-primary" style={{ left: `${pct(stats.median)}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>{formatBRL(stats.min)}</span>
        <span className="font-medium text-foreground">mediana {formatBRL(stats.median)}</span>
        <span>{formatBRL(stats.max)}</span>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">A faixa colorida mostra onde está a metade central das ofertas.</div>
    </div>
  );
}

function Histogram({ stats }: { stats: PriceStats }) {
  const maxCount = Math.max(...stats.bins.map((b) => b.count), 1);
  return (
    <div className="rounded-lg border bg-card p-4 xl:p-5">
      <div className="mb-3 text-xs font-semibold">Distribuição das ofertas</div>
      <div className="flex h-32 items-end gap-1.5">
        {stats.bins.map((b) => (
          <div key={`${b.from}-${b.to}`} className="flex h-full flex-1 flex-col items-center justify-end">
            <span className="mb-1 text-[10px] tabular-nums text-muted-foreground">{b.count || ""}</span>
            <div
              className="w-full rounded-t bg-primary/70"
              style={{ height: `${b.count ? Math.max(4, (b.count / maxCount) * 100) : 0}%` }}
              title={`${formatBRL(b.from)} a ${formatBRL(b.to)}: ${b.count} oferta(s)`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {stats.bins.map((b) => (
          <div key={`l-${b.from}-${b.to}`} className="flex-1 text-center text-[10px] tabular-nums text-muted-foreground">
            {Math.round(b.from)}
          </div>
        ))}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">Preço de início de cada faixa, em reais.</div>
    </div>
  );
}

function Results({ a, persisted }: { a: PriceAnalysis; persisted: boolean }) {
  const s = a.stats;
  return (
    <section className="space-y-5" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">
            {a.product} <span className="font-medium text-muted-foreground">· {a.region}</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Coletado em {new Date(a.createdAt).toLocaleString("pt-BR")} · {a.pagesScanned} página{a.pagesScanned === 1 ? "" : "s"} lida{a.pagesScanned === 1 ? "" : "s"}
            {!persisted && " · não foi salvo no histórico (banco não configurado)"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {s && (
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${CONFIDENCE[s.confidence].cls}`}>
              {CONFIDENCE[s.confidence].label}
            </span>
          )}
          {a.offers.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => downloadCsv(a)}>
              <Download className="mr-1.5 size-3.5" /> Baixar CSV
            </Button>
          )}
        </div>
      </div>

      {s && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard strong label="Preço típico (mediana)" value={formatBRL(s.median)} hint={`média ${formatBRL(s.mean)}`} />
          <StatCard label="Mais barato" value={formatBRL(s.min)} hint={s.cheapest.store} />
          <StatCard label="Mais caro" value={formatBRL(s.max)} />
          <StatCard label="Ofertas comparadas" value={String(s.n)} hint={`em ${s.stores} loja${s.stores === 1 ? "" : "s"}`} />
        </div>
      )}

      {s && (
        <div className="grid gap-3 lg:grid-cols-2">
          <RangeBar stats={s} />
          <Histogram stats={s} />
        </div>
      )}

      <div className="rounded-lg border bg-card p-4 xl:p-5">
        <div className="mb-2 text-xs font-semibold">Balanço</div>
        <ul className="space-y-1.5 text-sm">
          {a.summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {a.reading && (
          <div className="mt-4 border-t pt-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Leitura da IA · usa só valores encontrados nas páginas
            </div>
            <p className="text-sm">{a.reading}</p>
          </div>
        )}
        {a.warnings.length > 0 && (
          <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
            {a.warnings.map((w) => (
              <li key={w}>Aviso: {w}</li>
            ))}
          </ul>
        )}
      </div>

      {s && s.byReach.length > 0 && (
        <div className="rounded-lg border bg-card p-4 xl:p-5">
          <div className="mb-2 text-xs font-semibold">Por tipo de loja</div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {s.byReach.map((g) => (
              <div key={g.reach} className="rounded-md bg-muted/50 p-3 text-xs">
                <div className="font-medium capitalize">{reachLabel(g.reach)}</div>
                <div className="mt-1 tabular-nums text-muted-foreground">
                  {g.n} oferta{g.n === 1 ? "" : "s"} · mediana {formatBRL(g.median)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {a.offers.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3 text-xs font-semibold">Ofertas encontradas (da mais barata para a mais cara)</div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loja</TableHead>
                  <TableHead>Oferta</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="w-24 text-right">Página</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.offers.map((o) => (
                  <TableRow key={`${o.url}-${o.price}`}>
                    <TableCell className="whitespace-nowrap text-xs font-medium">{o.store}</TableCell>
                    <TableCell className="max-w-[420px]">
                      <div className="line-clamp-2 text-xs">{o.title}</div>
                      {o.evidence && (
                        <div className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground" title={o.evidence}>
                          “{o.evidence}”
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm font-semibold tabular-nums">
                      {formatBRL(o.price)}
                      {o.originalPrice !== null && (
                        <div className="text-[10px] font-normal text-muted-foreground line-through">{formatBRL(o.originalPrice)}</div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs capitalize text-muted-foreground">{reachLabel(o.reach)}</TableCell>
                    <TableCell className="text-right">
                      <a
                        href={safeHref(o.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Abrir <ArrowUpRight className="size-3" />
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Preços lidos de páginas públicas na data acima; podem ter mudado, e o frete e as condições de pagamento não entram na conta. Confira no link antes de decidir. É um retrato do que apareceu na busca, não uma pesquisa completa do mercado.
      </p>
    </section>
  );
}

export function PricePage() {
  const analyze = useServerFn(analyzePricesFn);
  const listFn = useServerFn(listAnalysesFn);
  const openFn = useServerFn(getAnalysisFn);

  const [niche, setNiche] = useState("");
  const [product, setProduct] = useState("");
  const [region, setRegion] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [analysis, setAnalysis] = useState<PriceAnalysis | null>(null);
  const [persisted, setPersisted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AnalysisListItem[]>([]);

  function refreshHistory() {
    listFn()
      .then((r) => {
        if (r.ok) setHistory(r.items);
      })
      .catch(() => undefined);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refreshHistory, []);

  useEffect(() => {
    if (!loading) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 7000);
    return () => clearInterval(t);
  }, [loading]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (product.trim().length < 2 || region.trim().length < 2) {
      setError("Informe o produto e a região.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const r = await analyze({ data: { niche: niche.trim(), product: product.trim(), region: region.trim() } });
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error);
        return;
      }
      setAnalysis(r.analysis);
      setPersisted(r.persisted);
      if (r.persisted) refreshHistory();
    } catch {
      const msg = "Não foi possível concluir a análise. Tente novamente.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function openFromHistory(id: string) {
    setError(null);
    try {
      const r = await openFn({ data: { id } });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setAnalysis(r.analysis);
      setPersisted(true);
      setProduct(r.analysis.product);
      setRegion(r.analysis.region);
      setNiche(r.analysis.niche);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast.error("Não foi possível abrir esta análise.");
    }
  }

  return (
    <main className="mx-auto max-w-[1600px] px-5 py-7 md:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Análise de preços de mercado</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Informe o produto e a região. O sistema lê preços em páginas públicas e mostra quanto o mercado cobra: preço típico, faixa, mais barato e promoções.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mb-6 grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[1fr_1.4fr_1fr_auto] md:items-end xl:p-5">
        <div className="space-y-1.5">
          <Label htmlFor="niche">Nicho (opcional)</Label>
          <Input id="niche" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="ex.: materiais elétricos" maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product">Produto</Label>
          <Input id="product" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="ex.: disjuntor bipolar 20A" maxLength={160} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="region">Região</Label>
          <Input id="region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="ex.: Belo Horizonte, MG" maxLength={120} required />
        </div>
        <Button type="submit" disabled={loading} className="md:h-10">
          {loading ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <Search className="mr-2 size-4" />}
          {loading ? "Analisando…" : "Analisar preços"}
        </Button>
      </form>

      {loading && (
        <div className="mb-6 rounded-lg border bg-card p-5 text-sm" role="status" aria-live="polite">
          <div className="font-medium">{STEPS[step]}</div>
          <div className="mt-1 text-xs text-muted-foreground">Costuma levar de 20 a 60 segundos.</div>
        </div>
      )}

      {error && !loading && (
        <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <div>
          {analysis ? (
            <Results a={analysis} persisted={persisted} />
          ) : (
            !loading && (
              <div className="rounded-lg border border-dashed bg-card/50 p-8 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Como funciona</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>Busca páginas públicas que vendem o produto na sua região.</li>
                  <li>A IA lê o preço de cada página, e o sistema só aceita o que está escrito nela.</li>
                  <li>Os cálculos (mediana, faixa, mais barato) são feitos pelo sistema, não pela IA.</li>
                </ol>
              </div>
            )
          )}
        </div>

        <aside className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Clock className="size-3.5" /> Análises anteriores
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma análise salva ainda.</p>
          ) : (
            <ul className="space-y-1.5">
              {history.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => openFromHistory(h.id)}
                    className={`w-full rounded-md border bg-card p-2.5 text-left text-xs transition-colors hover:bg-accent ${analysis?.id === h.id ? "border-primary/50" : ""}`}
                  >
                    <div className="line-clamp-1 font-medium">{h.product}</div>
                    <div className="line-clamp-1 text-muted-foreground">{h.region}</div>
                    <div className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
                      {new Date(h.createdAt).toLocaleDateString("pt-BR")} · {h.n} oferta{h.n === 1 ? "" : "s"}
                      {h.median !== null && ` · mediana ${formatBRL(h.median)}`}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </main>
  );
}
