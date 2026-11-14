import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
export const findOpportunities = createServerFn({ method: 'POST' })
  .inputValidator((d) => z.object({ service: z.string().min(2).max(200), keywords: z.string().max(500), regions: z.string().max(300) }).parse(d))
  .handler(async ({ data }) => {
    const { searchRealLeads } = await import('./radar-search.server');
    try { return { leads: await searchRealLeads(data), error: null as string | null }; }
    catch (e) { console.error(e); return { leads: [], error: e instanceof Error ? e.message : 'Falha na busca' }; }
  });
