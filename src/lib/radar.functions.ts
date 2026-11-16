import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

export const findOpportunities = createServerFn({ method: 'POST' })
  .inputValidator((d) =>
    z.object({ service: z.string().min(2).max(200), keywords: z.string().max(500), regions: z.string().max(300) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { searchRealLeads } = await import('./radar-search.server');
    try {
      const found = await searchRealLeads(data);
      // Persiste os resultados. Se o banco não estiver configurado, devolve só a busca (em memória).
      try {
        const { replaceRealLeads } = await import('./workspace.server');
        return { leads: await replaceRealLeads(found), error: null as string | null, persisted: true };
      } catch (e) {
        console.error('Persistência dos leads falhou; devolvendo resultado em memória.', e);
        return { leads: found, error: null as string | null, persisted: false };
      }
    } catch (e) {
      console.error(e);
      return { leads: [], error: e instanceof Error ? e.message : 'Falha na busca', persisted: false };
    }
  });
