// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("/node_modules/")) return;
            if (id.includes("/node_modules/firebase/") || id.includes("/node_modules/@firebase/")) return "firebase-vendor";
            if (id.includes("/node_modules/@supabase/")) return "supabase-vendor";
            if (id.includes("/node_modules/recharts/") || id.includes("/node_modules/d3-")) return "charts-vendor";
            if (id.includes("/node_modules/@tanstack/")) return "tanstack-vendor";
            if (id.includes("/node_modules/@radix-ui/")) return "radix-vendor";
            if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/") || id.includes("/node_modules/scheduler/")) return "react-vendor";
          },
        },
      },
    },
    // Fallback for hosted preview/published builds where .env is not shipped.
    // These are the public (publishable) backend URL and key — safe for browser code.
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        process.env.VITE_SUPABASE_URL || "https://zvfdymcalzqhvwnipuup.supabase.co",
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2ZmR5bWNhbHpxaHZ3bmlwdXVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNzgxNzUsImV4cCI6MjA5Njc1NDE3NX0.eUgHgV8VMpemI32SA4V8dcgQtb-w6ahAiytOAsXU7e8",
      ),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
        process.env.VITE_SUPABASE_PROJECT_ID || "zvfdymcalzqhvwnipuup",
      ),
    },
  },
});
