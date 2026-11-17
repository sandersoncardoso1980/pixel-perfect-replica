# DorRadar

Análise de preços de mercado: o usuário informa nicho, produto e região, e o sistema lê preços em páginas públicas e devolve um balanço (preço típico, faixa, mais barato, promoções, ofertas com link).

> O código do radar de leads (B2B) continua no repositório (`radar.tsx`, `/crm`, `/nichos`, `/configuracoes`), mas saiu da navegação. A tela inicial agora é a análise de preços.

## Como a análise funciona

1. O Firecrawl busca páginas públicas que vendem o produto na região e devolve o texto delas.
2. O Gemini **só lê** os preços escritos em cada página (preço, preço "de", condição, tipo de loja).
3. O sistema **confere** que cada preço aparece no texto da página. O que não aparece é descartado.
4. Mediana, quartis, mínimo, máximo, média, histograma e promoções são calculados em código (`src/lib/price-stats.ts`), nunca pela IA.
5. Uma "leitura" opcional da IA só é exibida se todo valor em reais citado existir nos dados.

Limites a ter em mente: é um retrato do que apareceu na busca, não uma pesquisa completa; frete e parcelamento não entram; páginas que exigem login ou carregam preço por JavaScript pesado podem não ser lidas.

**Custo estimado por análise** (a partir da documentação do Firecrawl: 2 créditos por 10 resultados de busca + 1 crédito por página lida): cerca de 20 créditos. No plano gratuito, de 1.000 créditos por mês, isso dá aproximadamente 50 análises.

O projeto nasceu de um protótipo gerado no Lovable e hoje é mantido de forma independente.

## Stack

- TanStack Start (React 19, TanStack Router) + Tailwind 4 + shadcn/ui
- Busca na web: [Firecrawl](https://firecrawl.dev)
- Leitura de preços por IA: Google Gemini (via AI SDK)
- Banco: Supabase (login ainda não implementado)
- Hospedagem: Vercel

## Desenvolvimento

```sh
npm i        # ou: bun install
cp .env.example .env   # preencha as chaves
npm run dev
```

Scripts: `npm run lint`, `npm test`, `npm run build`.

## Variáveis de ambiente

Veja `.env.example`. Sem `FIRECRAWL_API_KEY` e `GEMINI_API_KEY`, a análise retorna erro de configuração. `GEMINI_MODEL` e `GEMINI_FALLBACK_MODELS` (lista separada por vírgulas) são opcionais.

## Banco de dados (Supabase)

Aplique `supabase/migrations/0001_workspace.sql` e `supabase/migrations/0002_analises_preco.sql` no seu projeto (SQL Editor do Supabase ou `supabase db push`) e preencha `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. Sem essas variáveis a análise de preços ainda funciona, mas não fica salva no histórico.

> **Atenção:** enquanto não houver login, qualquer pessoa com acesso ao app lê e altera os dados do workspace. Use apenas localmente ou em um deploy protegido (ex.: Vercel Deployment Protection) até a fase de login.

## Deploy na Vercel

Importe o repositório, configure as variáveis acima em Project Settings → Environment Variables e faça o deploy. O Nitro detecta a Vercel no build e gera a saída correta.
