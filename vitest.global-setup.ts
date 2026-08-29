import "dotenv/config";
import { execFileSync } from "node:child_process";

import { veritabaniniOlustur } from "./scripts/db-hazirla";

// Testler gercek Postgres'e kosar (SQLite ya da mock degil): EXCLUDE kisiti,
// transaction ve yarisan istek davranisi ancak gercek motorda dogrulanir.
export default async function setup(): Promise<void> {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error(
      "TEST_DATABASE_URL tanimli degil. Docker Postgres ayakta mi? " +
        "npm run db:hazirla ile veritabanlarini kurabilirsin.",
    );
  }

  await veritabaniniOlustur(testUrl);

  // migrate deploy, migrate dev'in aksine sema uretmez - yalnizca var olan
  // migration'lari uygular. Testin sema uretmesi istenmez.
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "inherit",
    shell: true, // Windows'ta npx bir .cmd
  });
}
