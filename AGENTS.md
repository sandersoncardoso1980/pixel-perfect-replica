# Instruções para agentes e colaboradores

## Regras do projeto
- Não commite segredos. Chaves vão em `.env` (local) e nas variáveis de ambiente da Vercel; mantenha `.env.example` atualizado.
- Chaves de API (`FIRECRAWL_API_KEY`, `GEMINI_API_KEY`, e a service key do Supabase quando existir) só são usadas em código de servidor (`*.server.ts` e server functions), nunca no navegador.
- Mudanças de esquema do banco entram como migrations versionadas em `supabase/migrations/`.
- Antes de abrir PR: `npm run lint`, `npm test` e `npm run build` precisam passar.

## Arquitetura da aplicação
- O estado do workspace fica em um provider React compartilhado acima do outlet das rotas, para que navegação dentro do app preserve salvos, descartes e preferências do radar. Esse estado está sendo migrado para o Supabase para persistir de verdade.
- Os leads de exemplo ficam em um módulo seguro para o navegador, rotulado como demonstrativo. Os leads reais vêm de uma busca somente no servidor (Firecrawl + qualificação com Gemini), disparada sob demanda.
- Rotas de conteúdo separadas do TanStack (radar, nichos, CRM, configurações) sob um shell comum, para que navegação e metadados de página sejam independentes.
