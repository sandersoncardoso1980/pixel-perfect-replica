import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

// Se o banco não estiver configurado ou falhar, devolve ok:false e o app segue só em memória.
export const loadWorkspaceFn = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const { loadWorkspace } = await import('./workspace.server');
    return { ok: true as const, ...(await loadWorkspace()) };
  } catch (e) {
    console.error(e);
    return { ok: false as const, error: e instanceof Error ? e.message : 'Falha ao carregar o workspace' };
  }
});

export const setLeadStateFn = createServerFn({ method: 'POST' })
  .inputValidator((d) =>
    z.object({ leadId: z.number().int().positive(), saved: z.boolean().optional(), discarded: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { setLeadState } = await import('./workspace.server');
    const { leadId, ...patch } = data;
    try {
      await setLeadState(leadId, {
        ...(patch.saved !== undefined ? { saved: patch.saved } : {}),
        ...(patch.discarded !== undefined ? { discarded: patch.discarded } : {}),
      });
      return { ok: true as const };
    } catch (e) {
      console.error(e);
      return { ok: false as const, error: e instanceof Error ? e.message : 'Falha ao salvar' };
    }
  });

export const saveConfigFn = createServerFn({ method: 'POST' })
  .inputValidator((d) =>
    z
      .object({
        service: z.string().min(2).max(200),
        keywords: z.string().max(500),
        regions: z.string().max(300),
        monitoring: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { saveConfig } = await import('./workspace.server');
    try {
      await saveConfig(data);
      return { ok: true as const };
    } catch (e) {
      console.error(e);
      return { ok: false as const, error: e instanceof Error ? e.message : 'Falha ao salvar' };
    }
  });
