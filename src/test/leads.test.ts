import { describe, it, expect } from 'vitest';
import { leads, filterLeads, approachMessage } from '@/lib/leads';
describe('DorRadar opportunity rules', () => {
  it('includes six initial Brazilian demo leads', () => { expect(leads).toHaveLength(6); });
  it('filters by niche', () => { expect(filterLeads(leads, '', 'Energia Solar', 'all', 'all').map(l => l.id)).toEqual([1, 6]); });
  it('filters by urgency', () => { expect(filterLeads(leads, '', 'all', 'Média', 'all').map(l => l.id)).toEqual([5, 6]); });
  it('filters by city', () => { expect(filterLeads(leads, '', 'all', 'all', 'São Paulo, SP').map(l => l.id)).toEqual([2]); });
  it('searches signals without accent sensitivity', () => { expect(filterLeads(leads, 'lentidao', 'all', 'all', 'all').map(l => l.id)).toEqual([2]); });
  it('personalizes the message using the detected pain', () => { const lead = leads[0]; if (!lead) throw new Error('missing demo lead'); expect(approachMessage(lead, 'whatsapp')).toContain(lead.signal.slice(1)); });
});