import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ command, mode }) => {
  // O Vite só expõe VITE_* ao navegador; o servidor lê process.env. Carregamos o .env aqui
  // (na Vercel as variáveis já vêm do ambiente e não são sobrescritas).
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) {
    process.env[key] ??= value;
  }

  return {
    resolve: { dedupe: ["react", "react-dom", "@tanstack/react-router"] },
    plugins: [
      tsconfigPaths(),
      tanstackStart({ server: { entry: "server" } }),
      ...(command === "build" ? [nitro()] : []),
      viteReact(),
      tailwindcss(),
    ],
  };
});