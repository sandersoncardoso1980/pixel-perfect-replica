import type { Lead } from './leads';

export type LeadRow = {
  id: number;
  name: string;
  initials: string;
  niche: string;
  city: string;
  score: number;
  urgency: string;
  signal: string;
  source: string;
  age: string;
  person: string;
  role: string;
  email: string;
  phone: string;
  value: number | string;
  url: string | null;
};

// Todo lead que vem do banco é um lead real (os demonstrativos ficam no código).
export function rowToLead(r: LeadRow): Lead {
  return {
    id: r.id,
    name: r.name,
    initials: r.initials,
    niche: r.niche,
    city: r.city,
    score: r.score,
    urgency: r.urgency,
    signal: r.signal,
    source: r.source,
    age: r.age,
    person: r.person,
    role: r.role,
    email: r.email,
    phone: r.phone,
    value: Number(r.value),
    ...(r.url ? { url: r.url } : {}),
    real: true,
  };
}

// O id é gerado pelo banco, então não vai no insert.
export function leadToInsert(l: Lead) {
  return {
    name: l.name,
    initials: l.initials,
    niche: l.niche,
    city: l.city,
    score: l.score,
    urgency: l.urgency,
    signal: l.signal,
    source: l.source,
    age: l.age,
    person: l.person,
    role: l.role,
    email: l.email,
    phone: l.phone,
    value: l.value,
    url: l.url ?? null,
  };
}
