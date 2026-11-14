import { createFileRoute } from '@tanstack/react-router';
import { NichePage } from '@/components/dorradar/configuration';
export const Route = createFileRoute('/nichos')({
  head: () => ({ meta: [ { title: 'Meus Nichos & Gatilhos | DorRadar' }, { name: 'description', content: 'Configure serviços, palavras-chave de intenção e regiões do seu radar comercial.' }, { property: 'og:title', content: 'Meus Nichos & Gatilhos | DorRadar' }, { property: 'og:description', content: 'Ajuste seu radar às dores que a sua solução resolve.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' } ] }),
  component: NichePage,
});