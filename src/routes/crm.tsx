import { createFileRoute } from '@tanstack/react-router';
import { RadarPage } from '@/components/dorradar/radar';
export const Route = createFileRoute('/crm')({
  head: () => ({ meta: [ { title: 'Leads Salvos | DorRadar' }, { name: 'description', content: 'Organize as oportunidades de negócio salvas no CRM do DorRadar.' }, { property: 'og:title', content: 'Leads Salvos | DorRadar' }, { property: 'og:description', content: 'Suas melhores oportunidades B2B em um só lugar.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' } ] }),
  component: CRM,
});
function CRM() { return <RadarPage crm />; }