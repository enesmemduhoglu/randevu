import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    globalSetup: ["./vitest.global-setup.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // Entegrasyon testleri tek bir gercek Postgres'i paylasiyor; paralel kosan
    // iki dosya birbirinin verisini siler. Hiz burada dogrulugun onune gecemez.
    fileParallelism: false,
    include: ["src/**/*.{test,spec}.ts"],
  },
});
