// Migration'lari PROD veritabanina (Supabase) uygular.
//
// Ayri bir betik, cunku prod'a yazmak kazara olmamali: --onayla bayragi
// olmadan calismaz ve hangi host'a bagladigini sifreyi basmadan soyler.
//
// Baglanti Supavisor SESSION MODE (5432) uzerinden gider. Direct baglanti
// (db.<ref>.supabase.co) yalnizca IPv6 cozuyor ve IPv4 yollarindan
// erisilemiyor.

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config();

const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error("SUPABASE_DB_URL tanimli degil. .env.example'a bak.");

const hedef = new URL(url);
console.log(`hedef: ${hedef.hostname}:${hedef.port}${hedef.pathname} (PROD)`);

if (!process.argv.includes("--onayla")) {
  console.error("\nBu betik PROD veritabanina yazar. Emin isen --onayla ekle.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("migration'lar uygulandi.");
} finally {
  await sql.end();
}
