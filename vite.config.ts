import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Nitro empacota o servidor só no build. Na Vercel ele detecta o ambiente (VERCEL=1)
// e gera a saída no formato correto sozinho; localmente roda como servidor Node.
export default defineConfig(({ command }) => ({
  resolve: { dedupe: ["react", "react-dom", "@tanstack/react-router"] },
  plugins: [
    tsconfigPaths(),
    // Redireciona a entrada de servidor do TanStack Start para src/server.ts (wrapper de erros SSR).
    tanstackStart({ server: { entry: "server" } }),
    ...(command === "build" ? [nitro()] : []),
    viteReact(),
    tailwindcss(),
  ],
}));
