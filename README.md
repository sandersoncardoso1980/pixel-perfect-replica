# DorRadar

Radar de oportunidades B2B: encontra empresas e órgãos com sinais de compra (licitações, cotações, pedidos de orçamento) para quem presta serviços, e ajuda a abordá-los.

O projeto nasceu de um protótipo gerado no Lovable e hoje é mantido de forma independente.

## Stack

- TanStack Start (React 19, TanStack Router) + Tailwind 4 + shadcn/ui
- Busca na web: [Firecrawl](https://firecrawl.dev)
- Qualificação de leads por IA: Google Gemini (via AI SDK)
- Banco e login (em implantação): Supabase
- Hospedagem: Vercel

## Desenvolvimento

```sh
npm i        # ou: bun install
cp .env.example .env   # preencha as chaves
npm run dev
```

Scripts: `npm run lint`, `npm test`, `npm run build`.

## Variáveis de ambiente

Veja `.env.example`. Sem `FIRECRAWL_API_KEY` e `GEMINI_API_KEY`, o botão "Buscar oportunidades reais" retorna erro de configuração; os leads demonstrativos continuam funcionando.

## Deploy na Vercel

Importe o repositório, configure as variáveis acima em Project Settings → Environment Variables e faça o deploy. O Nitro detecta a Vercel no build e gera a saída correta.
