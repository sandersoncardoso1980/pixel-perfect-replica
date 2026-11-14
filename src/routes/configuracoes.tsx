import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '@/components/dorradar/configuration';
export const Route = createFileRoute('/configuracoes')({
  head: () => ({ meta: [ { title: 'Configurações | DorRadar' }, { name: 'description', content: 'Gerencie perfil, workspace e preferências do DorRadar.' }, { property: 'og:title', content: 'Configurações | DorRadar' }, { property: 'og:description', content: 'Seu workspace e preferências de inteligência comercial.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' } ] }),
  component: SettingsPage,
});