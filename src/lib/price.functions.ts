import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AnalysisListItem, PriceAnalysis } from "./price-stats";

const analyzeInput = z.object({
  niche: z.string().trim().max(120).default(""),
  product: z.string().trim().min(2).max(160),
  region: z.string().trim().min(2).max(120),
});

export const analyzePricesFn = createServerFn({ method: "POST" })
  .inputValidator((d) => analyzeInput.parse(d))
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; analysis: PriceAnalysis; persisted: boolean } | { ok: false; error: string }> => {
      try {
        const { analyzePrices } = await import("./price-search.server");
        const analysis = await analyzePrices(data);
        // Persistir é "melhor esforço": sem banco configurado, o usuário ainda vê o resultado.
        try {
          const { saveAnalysis } = await import("./price-analyses.server");
          const id = await saveAnalysis(analysis);
          return { ok: true, analysis: { ...analysis, id }, persisted: true };
        } catch (e) {
          console.error("[Preços] Persistência falhou; devolvendo resultado em memória.", e);
          return { ok: true, analysis, persisted: false };
        }
      } catch (e) {
        console.error(e);
        return { ok: false, error: e instanceof Error ? e.message : "Falha na análise de preços" };
      }
    },
  );

export const listAnalysesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ ok: true; items: AnalysisListItem[] } | { ok: false; error: string }> => {
    try {
      const { listAnalyses } = await import("./price-analyses.server");
      return { ok: true, items: await listAnalyses() };
    } catch (e) {
      console.error(e);
      return { ok: false, error: e instanceof Error ? e.message : "Falha ao listar análises" };
    }
  },
);

export const getAnalysisFn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(
    async ({ data }): Promise<{ ok: true; analysis: PriceAnalysis } | { ok: false; error: string }> => {
      try {
        const { getAnalysis } = await import("./price-analyses.server");
        const analysis = await getAnalysis(data.id);
        return analysis ? { ok: true, analysis } : { ok: false, error: "Análise não encontrada." };
      } catch (e) {
        console.error(e);
        return { ok: false, error: e instanceof Error ? e.message : "Falha ao abrir análise" };
      }
    },
  );
