import { describe, it, expect } from 'vitest';
import type { Lead } from '@/lib/leads';
import { leadToInsert, rowToLead, type LeadRow } from '@/lib/workspace-mappers';

const row: LeadRow = {
  id: 10001, name: 'Prefeitura de Contagem', initials: 'PC', niche: 'Energia Solar', city: 'Contagem, MG',
  score: 88, urgency: 'Alta', signal: 'Cotação para usina fotovoltaica.', source: 'contagem.mg.gov.br', age: 'Último ano',
  person: 'Não identificado', role: 'Não identificado', email: '', phone: '', value: '120000.50', url: 'https://contagem.mg.gov.br/cotacao',
};

describe('workspace mappers', () => {
  it('converts a database row into a real lead, parsing numeric strings', () => {
    const lead = rowToLead(row);
    expect(lead.real).toBe(true);
    expect(lead.value).toBe(120000.5);
    expect(lead.url).toBe('https://contagem.mg.gov.br/cotacao');
  });

  it('omits url when the row has none', () => {
    expect('url' in rowToLead({ ...row, url: null })).toBe(false);
  });

  it('does not send id or flags on insert and keeps a missing url as null', () => {
    const lead: Lead = { ...rowToLead(row) };
    delete lead.url;
    const insert = leadToInsert(lead);
    expect('id' in insert).toBe(false);
    expect('real' in insert).toBe(false);
    expect(insert.url).toBeNull();
  });
});
