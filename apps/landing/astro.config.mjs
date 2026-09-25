// @ts-check
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://yotrade.xyz",
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
