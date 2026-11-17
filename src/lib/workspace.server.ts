import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Lead } from './leads';
import { leadToInsert, rowToLead, type LeadRow } from './workspace-mappers';

// Somente servidor: usa a service role, que ignora o RLS. Nunca importe este módulo no navegador.
let client: SupabaseClient | undefined;
export function db(): SupabaseClient {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('Banco não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export type ConfigRow = { service: string; keywords: string; regions: string; monitoring: boolean };

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

export async function loadWorkspace() {
  const d = db();
  const [leads, states, config] = await Promise.all([
    d.from('leads').select('*').order('id'),
    d.from('lead_states').select('lead_id, saved, discarded'),
    d.from('niche_config').select('service, keywords, regions, monitoring').eq('id', 1).maybeSingle(),
  ]);
  const stateRows = check(states, 'Falha ao ler estados') as { lead_id: number; saved: boolean; discarded: boolean }[];
  return {
    realLeads: (check(leads, 'Falha ao ler leads') as LeadRow[]).map(rowToLead),
    saved: stateRows.filter((s) => s.saved).map((s) => s.lead_id),
    discarded: stateRows.filter((s) => s.discarded).map((s) => s.lead_id),
    config: check(config, 'Falha ao ler configuração') as ConfigRow | null,
  };
}

export async function setLeadState(leadId: number, patch: { saved?: boolean; discarded?: boolean }) {
  check(
    await db().from('lead_states').upsert({ lead_id: leadId, ...patch, updated_at: new Date().toISOString() }),
    'Falha ao salvar estado do lead',
  );
}

export async function saveConfig(cfg: ConfigRow) {
  check(
    await db().from('niche_config').upsert({ id: 1, ...cfg, updated_at: new Date().toISOString() }),
    'Falha ao salvar configuração',
  );
}

// Uma nova busca troca os leads reais que não foram salvos no CRM; os salvos permanecem.
export async function replaceRealLeads(found: Lead[]): Promise<Lead[]> {
  const d = db();
  const savedStates = check(
    await d.from('lead_states').select('lead_id').eq('saved', true).gte('lead_id', 10000),
    'Falha ao ler salvos',
  ) as { lead_id: number }[];
  const keep = savedStates.map((s) => s.lead_id);
  const keepList = `(${keep.join(',')})`;

  let delLeads = d.from('leads').delete().gte('id', 0);
  if (keep.length) delLeads = delLeads.not('id', 'in', keepList);
  check(await delLeads, 'Falha ao limpar leads antigos');

  let delStates = d.from('lead_states').delete().gte('lead_id', 10000);
  if (keep.length) delStates = delStates.not('lead_id', 'in', keepList);
  check(await delStates, 'Falha ao limpar estados antigos');

  const keptUrls = new Set(
    (check(await d.from('leads').select('url'), 'Falha ao ler leads mantidos') as { url: string | null }[])
      .map((r) => r.url)
      .filter(Boolean),
  );
  const fresh = found.filter((l) => !l.url || !keptUrls.has(l.url));
  if (fresh.length) check(await d.from('leads').insert(fresh.map(leadToInsert)), 'Falha ao gravar leads');

  return (check(await d.from('leads').select('*').order('id'), 'Falha ao ler leads') as LeadRow[]).map(rowToLead);
}
