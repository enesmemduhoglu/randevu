import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { getDb } from "@/lib/db";

// Faz B teshis sayfasi: Worker -> Hyperdrive -> Supavisor -> Supabase zincirinin
// gercekten kurulup kurulmadigini gozle gormek icin. Kiraci verisi okumaz,
// yalnizca gidis-donusun calistigini kanitlar. Faz D'de panel gelince kaldirilir.

type Yoklama = {
  durum: "bagli" | "baglanamadi";
  surum: string | null;
  sureMs: number;
};

// Olcum bilesenin disinda: React'in saflik kurali render sirasinda Date.now()
// gibi yan etkili cagrilari reddediyor.
async function veritabaniniYokla(): Promise<Yoklama> {
  const baslangic = Date.now();
  try {
    const db = await getDb();
    const satirlar = await db.execute<{ surum: string }>(
      sql`select version() as surum`,
    );
    return {
      durum: "bagli",
      // Tam surum dizesi yama seviyesini de sizdirir; major yeter.
      surum: satirlar[0]?.surum.match(/PostgreSQL (\d+)/)?.[1] ?? null,
      sureMs: Date.now() - baslangic,
    };
  } catch {
    // Hata metni disariya verilmez: baglanti dizesi ve host bilgisi tasiyabilir
    // (CLAUDE.md degismez 5).
    return { durum: "baglanamadi", surum: null, sureMs: Date.now() - baslangic };
  }
}

export default async function SaglikSayfasi() {
  // Prerender'i burada kes: sorgu build aninda degil, istek aninda kosmali.
  await connection();
  const yoklama = await veritabaniniYokla();

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", lineHeight: 1.6 }}>
      <h1>Sağlık</h1>
      <dl>
        <dt>Veritabanı</dt>
        <dd>{yoklama.durum}</dd>
        <dt>PostgreSQL sürümü</dt>
        <dd>{yoklama.surum ?? "—"}</dd>
        <dt>Gidiş-dönüş</dt>
        <dd>{yoklama.sureMs} ms</dd>
      </dl>
    </main>
  );
}
