import { db } from "./workspace.server";
import type { AnalysisListItem, PriceAnalysis } from "./price-stats";

// Somente servidor (service role). Guarda cada análise inteira como JSON para reabrir depois.

type Row = {
  id: string;
  nicho: string;
  produto: string;
  regiao: string;
  created_at: string;
  resultado: PriceAnalysis;
};

export async function saveAnalysis(a: PriceAnalysis): Promise<string> {
  const { data, error } = await db()
    .from("analises_preco")
    .insert({ nicho: a.niche, produto: a.product, regiao: a.region, resultado: { ...a, id: null } })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao salvar análise: ${error.message}`);
  return (data as { id: string }).id;
}

export async function listAnalyses(limit = 30): Promise<AnalysisListItem[]> {
  const { data, error } = await db()
    .from("analises_preco")
    .select("id, nicho, produto, regiao, created_at, resultado")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Falha ao listar análises: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    niche: r.nicho,
    product: r.produto,
    region: r.regiao,
    createdAt: r.created_at,
    n: r.resultado?.stats?.n ?? 0,
    median: r.resultado?.stats?.median ?? null,
  }));
}

export async function getAnalysis(id: string): Promise<PriceAnalysis | null> {
  const { data, error } = await db()
    .from("analises_preco")
    .select("id, resultado, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Falha ao abrir análise: ${error.message}`);
  if (!data) return null;
  const row = data as { id: string; resultado: PriceAnalysis; created_at: string };
  return { ...row.resultado, id: row.id, createdAt: row.created_at };
}
