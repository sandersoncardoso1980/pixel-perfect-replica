-- DorRadar: análises de preço de mercado (fase sem login).
-- Cada linha guarda uma análise completa como JSON, para reabrir no histórico.
-- RLS ligado e SEM policies: a chave anon não lê nem escreve. Acesso só pelo servidor (service role).
-- Quando o login entrar, adicionamos user_id e policies por usuário.

create table if not exists public.analises_preco (
  id uuid primary key default gen_random_uuid(),
  nicho text not null default '',
  produto text not null,
  regiao text not null,
  resultado jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists analises_preco_created_at_idx
  on public.analises_preco (created_at desc);

alter table public.analises_preco enable row level security;
