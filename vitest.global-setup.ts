import "dotenv/config";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

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

  // Migration programatik kosuyor, alt surec olarak degil: Windows'ta npx
  // kabuk gerektiriyordu ve her kosuma ~1sn ekliyordu.
  const sql = postgres(testUrl, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  } finally {
    await sql.end();
  }
}
