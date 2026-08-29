import "dotenv/config";

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/sema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Yerel gelistirme veritabani. Prod'a uygulamak icin scripts/prod-goc.ts.
    url: process.env.DATABASE_URL!,
  },
});
