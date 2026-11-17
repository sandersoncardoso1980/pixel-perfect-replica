# DorRadar

## Direção atual: análise de preços de mercado
- [x] Análise sob demanda: nicho + produto + região → balanço de preços com ofertas e links.
- [x] Estatísticas em código com testes; preço só aceito se estiver escrito na página.
- [x] Histórico de análises no Supabase (migration 0002).
- [ ] Validar com 3 clientes reais: os resultados são úteis e confiáveis o bastante para pagarem?
- [ ] Qualidade da coleta: testar produtos reais e ajustar consultas, filtros e prompt.
- [ ] Comparar duas análises (variação de preço ao longo do tempo) e alertas.
- [ ] Login e multiusuário antes de abrir para clientes.
- [ ] Limpar a interface: remover cartões e textos decorativos do radar antigo.

## Feito (radar de leads, em espera)
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
