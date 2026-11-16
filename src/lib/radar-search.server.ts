import { createOpenAI } from '@ai-sdk/openai';
import { streamText, Output } from 'ai';
import { z } from 'zod';
import type { Lead } from './leads';

const FIRECRAWL = 'https://connector-gateway.lovable.dev/firecrawl/v2';
const item = z.object({
  index: z.number(), isOpportunity: z.boolean(), company: z.string(), city: z.string(),
  signal: z.string(), score: z.number(), urgency: z.enum(['Alta', 'Média', 'Baixa']),
  person: z.string(), role: z.string(), niche: z.string(), value: z.number(),
});

export async function searchRealLeads(input: { service: string; keywords: string; regions: string }): Promise<Lead[]> {
  const lovableKey = process.env['LOVABLE_API_KEY']; const fcKey = process.env['FIRECRAWL_API_KEY'];
  if (!lovableKey || !fcKey) throw new Error('Busca na web não configurada.');
  const kws = input.keywords.split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);
  const region = input.regions.split(';')[0]?.trim() ?? '';
  const queries = (kws.length ? kws : [input.service]).map(k => `${k} ${region} empresa procura orçamento`);
  const results = (await Promise.all(queries.map(async query => {
    const r = await fetch(`${FIRECRAWL}/search`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lovableKey}`, 'X-Connection-Api-Key': fcKey }, body: JSON.stringify({ query, limit: 6, country: 'BR', lang: 'pt', tbs: 'qdr:m' }) });
    if (!r.ok) throw new Error(`Busca na web falhou (${r.status}): ${(await r.text()).slice(0, 200)}`);
    const j = await r.json() as { data?: { web?: { url: string; title?: string; description?: string }[] } };
    return j.data?.web ?? [];
  }))).flat().filter((v, i, a) => a.findIndex(x => x.url === v.url) === i).slice(0, 15);
  if (!results.length) return [];

  const provider = createOpenAI({ baseURL: 'https://ai.gateway.lovable.dev/v1', apiKey: lovableKey, headers: { 'Lovable-API-Key': lovableKey, 'X-Lovable-AIG-SDK': 'vercel-ai-sdk' } });
  const listing = results.map((r, i) => `[${i}] ${r.title ?? ''}\n${r.description ?? ''}\n${r.url}`).join('\n\n');
  const res = streamText({
    model: provider.responses('openai/gpt-6-astra'),
    output: Output.object({ schema: z.object({ items: z.array(item) }) }),
    system: `Você qualifica sinais de compra B2B para quem vende "${input.service}". Para cada resultado, marque isOpportunity=true SOMENTE se mostrar uma empresa/organização que PRECISA ou PROCURA esse serviço (não fornecedores fazendo propaganda). Use apenas fatos do texto; se nome de pessoa/cargo não aparecer, use "Não identificado". score de 0 a 100. value = valor estimado em reais (0 se desconhecido). Responda em português.`,
    prompt: listing,
    providerOptions: { openai: { store: false, forceReasoning: true, reasoningEffort: 'low', include: ['reasoning.encrypted_content'] } },
  });
  const out = await res.output;
  return out.items.filter(x => x.isOpportunity && results[x.index]).map((x, n) => {
    const src = results[x.index]!; const host = new URL(src.url).hostname.replace(/^www\./, '');
    return { id: 10000 + n, name: x.company, initials: x.company.split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase(), niche: x.niche || input.service, city: x.city || region, score: Math.round(x.score), urgency: x.urgency, signal: x.signal, source: host, age: 'Último mês', person: x.person, role: x.role, email: '', phone: '', value: x.value, url: src.url, real: true };
  });
}
