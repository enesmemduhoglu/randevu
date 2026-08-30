import { connection } from "next/server";

import { veritabaniniYokla } from "@/lib/saglik";

// Faz B teshis sayfasi: Worker -> Hyperdrive -> Supavisor -> Supabase zincirinin
// gercekten kurulup kurulmadigini gozle gormek icin. Kiraci verisi okumaz,
// yalnizca gidis-donusun calistigini kanitlar.
//
// Sorgunun kendisi src/lib/saglik.ts'te: src/app altindan @/lib/db import
// etmek eslint kuraliyla yasak (degismez 1).

export default async function SaglikSayfasi() {
  // Prerender'i burada kes: sorgu build aninda degil, istek aninda kosmali.
  await connection();
  const yoklama = await veritabaniniYokla();

  return (
    <main className="mx-auto w-full max-w-md px-5 py-10">
      <h1 className="font-heading mb-4 text-2xl font-semibold">Sağlık</h1>
      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Veritabanı</dt>
        <dd>{yoklama.durum}</dd>
        <dt className="text-muted-foreground">PostgreSQL sürümü</dt>
        <dd>{yoklama.surum ?? "—"}</dd>
        <dt className="text-muted-foreground">Gidiş-dönüş</dt>
        <dd>{yoklama.sureMs} ms</dd>
      </dl>
    </main>
  );
}
