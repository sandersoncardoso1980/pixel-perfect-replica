# DorRadar

## Feito
- [x] Radar com seis leads demonstrativos em português e filtros.
- [x] Modal de abordagem, CRM de sessão e descarte.
- [x] Telas de nichos e configurações.
- [x] Busca real na web (Firecrawl + qualificação por IA).
- [x] Independente do Lovable: Vite, busca (Firecrawl direto + Gemini) e erros sem dependências deles.

## Próximas fases
- [x] Fase 2a: Supabase sem login (workspace único) — leads reais, salvos, descartes e configuração do radar persistidos. Acesso só pelo servidor (service role, RLS sem policies).
- [ ] Fase 2b: Login e multiusuário — adicionar `user_id` e policies por usuário (adiado de propósito para facilitar os testes).
- [ ] Fase 3: CRM de verdade — etapas (novo, contatado, proposta, ganho, perdido), notas e métrica de leads ganhos por mês.
- [ ] Fase 4: KPIs calculados com dados reais (hoje os cartões do topo são fixos).
- [ ] Fase 5: Monitoramento agendado com alertas por e-mail.
- [ ] Fase 6: Contato do decisor nos leads reais.
