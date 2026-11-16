-- DorRadar: persistência do workspace (fase sem login).
-- Todas as tabelas têm RLS ligado e NENHUMA policy: a chave anon/publishable não lê nem
-- escreve nada. O acesso é só pelo servidor, com a service role (SUPABASE_SERVICE_ROLE_KEY).
-- Quando o login entrar, adicionamos user_id e policies por usuário.

-- Leads reais encontrados pela busca na web. Os leads demonstrativos (ids 1 a 6) ficam no código.
create table if not exists public.leads (
  id bigint generated always as identity (start with 10000) primary key,
  name text not null,
  initials text not null default '',
  niche text not null,
  city text not null default '',
  score int not null default 0 check (score between 0 and 100),
  urgency text not null default 'Baixa' check (urgency in ('Alta', 'Média', 'Baixa')),
  signal text not null default '',
  source text not null default '',
  age text not null default '',
  person text not null default 'Não identificado',
  role text not null default 'Não identificado',
  email text not null default '',
  phone text not null default '',
  value numeric not null default 0,
  url text,
  created_at timestamptz not null default now()
);

-- Estado de qualquer lead (demonstrativo ou real): salvo no CRM e/ou descartado.
create table if not exists public.lead_states (
  lead_id bigint primary key,
  saved boolean not null default false,
  discarded boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Configuração do radar. Uma única linha (id = 1) enquanto não há multiusuário.
create table if not exists public.niche_config (
  id int primary key default 1 check (id = 1),
  service text not null,
  keywords text not null,
  regions text not null,
  monitoring boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.leads enable row level security;
alter table public.lead_states enable row level security;
alter table public.niche_config enable row level security;
