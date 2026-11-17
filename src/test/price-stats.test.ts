import { describe, expect, it } from "vitest";
import {
  buildSummary,
  computeStats,
  extractBRLAmounts,
  formatBRL,
  histogram,
  isGroundedReading,
  priceAppearsInText,
  quantile,
  selectComparable,
  type Offer,
} from "@/lib/price-stats";

const offer = (over: Partial<Offer> & { price: number }): Offer => ({
  store: "Loja",
  title: "Produto",
  originalPrice: null,
  condition: "novo",
  reach: "nacional",
  city: "",
  relevance: 1,
  url: `https://loja.com/p/${over.price}`,
  evidence: "",
  ...over,
});

describe("formatBRL", () => {
  it("formats with thousands dots and comma cents", () => {
    expect(formatBRL(1299.9)).toBe("R$ 1.299,90");
    expect(formatBRL(5)).toBe("R$ 5,00");
    expect(formatBRL(1234567.891)).toBe("R$ 1.234.567,89");
  });
});

describe("quantile", () => {
  it("interpolates between values", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([10], 0.25)).toBe(10);
  });
});

describe("priceAppearsInText", () => {
  it("finds a price written in Brazilian format", () => {
    expect(priceAppearsInText(1299.9, "Por apenas R$ 1.299,90 à vista")).toBe(true);
    expect(priceAppearsInText(129.9, "R$ 129,90")).toBe(true);
  });

  it("does not match a different price that shares digits", () => {
    expect(priceAppearsInText(129, "10x de R$ 129,90")).toBe(false);
    expect(priceAppearsInText(29.9, "R$ 129,90")).toBe(false);
    expect(priceAppearsInText(1299, "R$ 1.299,90")).toBe(false);
  });

  it("accepts round prices written without cents", () => {
    expect(priceAppearsInText(150, "Preço: R$ 150 no pix")).toBe(true);
  });
});

describe("selectComparable", () => {
  it("drops items without price, low relevance, used and duplicates, and counts why", () => {
    const { kept, dropped } = selectComparable([
      offer({ price: 100 }),
      offer({ price: 0 }),
      offer({ price: 110, relevance: 0.3 }),
      offer({ price: 90, condition: "usado" }),
      offer({ price: 100 }),
      offer({ price: 120, url: "https://outra.com/x" }),
    ]);
    expect(kept.map((o) => o.price)).toEqual([100, 120]);
    expect(dropped.sem_preco).toBe(1);
    expect(dropped.baixa_relevancia).toBe(1);
    expect(dropped.usado).toBe(1);
    expect(dropped.duplicada).toBe(1);
  });

  it("removes absurd outliers only when there is enough data", () => {
    const base = [100, 102, 105, 98, 101, 99].map((p) => offer({ price: p }));
    const withOutlier = [...base, offer({ price: 900 })];
    const { kept, dropped } = selectComparable(withOutlier);
    expect(kept.some((o) => o.price === 900)).toBe(false);
    expect(dropped.fora_da_curva).toBe(1);

    const few = selectComparable([offer({ price: 100 }), offer({ price: 900 })]);
    expect(few.kept).toHaveLength(2);
  });

  it("keeps small differences when prices are tightly clustered", () => {
    const tight = [100, 100, 100, 100, 105].map((p, i) => offer({ price: p, url: `https://l.com/${i}` }));
    expect(selectComparable(tight).kept).toHaveLength(5);
  });
});

describe("histogram", () => {
  it("counts every value exactly once", () => {
    const values = [10, 12, 15, 20, 25, 30, 30];
    const bins = histogram(values, 4);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(values.length);
    expect(bins).toHaveLength(4);
  });

  it("returns a single bin when all prices are equal", () => {
    expect(histogram([50, 50, 50])).toEqual([{ from: 50, to: 50, count: 3 }]);
  });
});

describe("computeStats", () => {
  const kept = [
    offer({ price: 100, store: "A", reach: "local" }),
    offer({ price: 120, store: "B", reach: "nacional", originalPrice: 150 }),
    offer({ price: 140, store: "C", reach: "marketplace" }),
    offer({ price: 160, store: "D", reach: "nacional" }),
  ];

  it("computes the main figures", () => {
    const s = computeStats(kept)!;
    expect(s.n).toBe(4);
    expect(s.stores).toBe(4);
    expect(s.min).toBe(100);
    expect(s.max).toBe(160);
    expect(s.median).toBe(130);
    expect(s.mean).toBe(130);
    expect(s.cheapest.store).toBe("A");
    expect(s.promo.n).toBe(1);
    expect(s.promo.avgDiscountPct).toBe(20);
  });

  it("returns null with no offers and low confidence with few", () => {
    expect(computeStats([])).toBeNull();
    expect(computeStats(kept)!.confidence).toBe("baixa");
  });
});

describe("buildSummary", () => {
  it("states only computed numbers", () => {
    const kept = [100, 120, 140, 160].map((p, i) => offer({ price: p, store: `L${i}`, url: `https://l.com/${i}` }));
    const lines = buildSummary(computeStats(kept), { sem_preco: 2, sem_evidencia: 0, baixa_relevancia: 0, usado: 0, duplicada: 0, fora_da_curva: 0 }, "Disjuntor 20A", "Belo Horizonte, MG");
    const text = lines.join(" ");
    expect(text).toContain("R$ 130,00");
    expect(text).toContain("R$ 100,00 a R$ 160,00");
    expect(text).toContain("2 sem preço claro");
  });

  it("explains when nothing was found", () => {
    const lines = buildSummary(null, { sem_preco: 0, sem_evidencia: 0, baixa_relevancia: 0, usado: 0, duplicada: 0, fora_da_curva: 0 }, "X", "Y");
    expect(lines[0]).toContain("Não encontramos");
  });
});

describe("AI reading guard", () => {
  it("extracts reais amounts", () => {
    expect(extractBRLAmounts("de R$ 1.299,90 por R$ 999 ou R$ 85,5")).toEqual([1299.9, 999, 85.5]);
  });

  it("accepts text whose amounts all exist in the data", () => {
    expect(isGroundedReading("A mediana é R$ 130,00 e o mínimo R$ 100,00.", [130, 100, 160])).toBe(true);
  });

  it("rejects invented amounts and percentages", () => {
    expect(isGroundedReading("A mediana é R$ 131,00.", [130, 100])).toBe(false);
    expect(isGroundedReading("Há 20% de desconto.", [130])).toBe(false);
  });
});
