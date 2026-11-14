import { createFileRoute } from "@tanstack/react-router";
import { RadarPage } from '@/components/dorradar/radar';

// The home route ships no og:image, so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: 'Radar de Oportunidades | DorRadar' },
    { name: 'description', content: 'Encontre oportunidades B2B no Brasil com sinais de intenção de compra, filtros e abordagens personalizadas.' },
    { property: 'og:title', content: 'Radar de Oportunidades | DorRadar' },
    { property: 'og:description', content: 'Inteligência comercial para encontrar o próximo cliente no momento certo.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: RadarPage,
});
