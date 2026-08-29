import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";

// Teshis sorgusu burada, sayfada degil: src/app/** altindan @/lib/db import
// etmek eslint kuraliyla yasak (bkz. CLAUDE.md degismez 1). Kural route
// handler'lara degil butun app dizinine uygulaniyor, cunku sunucu bilesenleri
// de sorgu yapabiliyor ve risk ayni.

export type Yoklama = {
  durum: "bagli" | "baglanamadi";
  surum: string | null;
  sureMs: number;
};

export async function veritabaniniYokla(): Promise<Yoklama> {
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
