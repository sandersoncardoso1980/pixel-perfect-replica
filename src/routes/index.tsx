import { createFileRoute } from "@tanstack/react-router";
import { PricePage } from "@/components/dorradar/price-page";

// A rota inicial não define og:image: a hospedagem injeta a prévia social do projeto.
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Análise de Preços de Mercado | DorRadar" },
      {
        name: "description",
        content: "Descubra quanto o mercado cobra por um produto na sua região, com base em preços de páginas públicas.",
      },
      { property: "og:title", content: "Análise de Preços de Mercado | DorRadar" },
      {
        property: "og:description",
        content: "Preço típico, faixa, mais barato e promoções de um produto na sua região.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PricePage,
});
