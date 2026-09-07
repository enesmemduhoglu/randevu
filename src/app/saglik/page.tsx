import type { Metadata } from "next";
import { connection } from "next/server";

import { uretimMi } from "@/lib/mod";
import { kamuyaAcilanYoklama, veritabaniniYokla } from "@/lib/saglik";

// Faz B teshis sayfasi: Worker -> Hyperdrive -> Supavisor -> Supabase zincirinin
// gercekten kurulup kurulmadigini gozle gormek icin. Kiraci verisi okumaz,
// yalnizca gidis-donusun calistigini kanitlar.
//
// Sorgunun kendisi src/lib/saglik.ts'te: src/app altindan @/lib/db import
// etmek eslint kuraliyla yasak (degismez 1).
//
// ARAMA MOTORUNDAN CEKILDI (Faz P). Sayfa halka acik kaliyor - teshis degeri
// tam da deploy'dan sonra tarayicidan acilabilmesinde - ama dizine girmesinin
// hicbir faydasi yok ve her tarama bir Supabase gidis-donusu demek. Iki kapi
// ust uste, `/r/*/randevu/` ile ayni gerekce: `robots.txt` bir RICA, meta
// etiketi ise ancak sayfa TARANIRSA goruluyor; tek basina hicbiri yeterli degil.
export const metadata: Metadata = {
  title: "Sağlık",
  robots: { index: false, follow: false },
};

export default async function SaglikSayfasi() {
  // Prerender'i burada kes: sorgu build aninda degil, istek aninda kosmali.
  await connection();
  const yoklama = await veritabaniniYokla();
  const kamu = kamuyaAcilanYoklama(yoklama);

  return (
    <main className="mx-auto w-full max-w-md px-5 py-10">
      <h1 className="font-heading mb-4 text-2xl font-semibold">Sağlık</h1>
      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Durum</dt>
        <dd
          className={
            kamu.durum === "saglikli" ? "text-emerald-600" : "text-red-600"
          }
        >
          {kamu.durum}
        </dd>
        <dt className="text-muted-foreground">PostgreSQL sürümü</dt>
        <dd>{kamu.surum ?? "—"}</dd>
        <dt className="text-muted-foreground">Göçler</dt>
        <dd>{kamu.goc}</dd>
        <dt className="text-muted-foreground">Gidiş-dönüş</dt>
        <dd>{kamu.sureMs} ms</dd>
      </dl>

      {/* Eksik kolon adlari ve kisit durumu drift bilgisi tasir - halka acik
          govdeye girmiyor (CLAUDE.md degismez 5, degismez 8). Uretim disinda
          teshis icin gosteriliyor. */}
      {!uretimMi() && yoklama.durum !== "saglikli" && (
        <dl className="mt-6 grid grid-cols-2 gap-y-2 text-xs text-muted-foreground">
          <dt>Eksik kolonlar</dt>
          <dd>{yoklama.eksikKolonlar.join(", ") || "—"}</dd>
          <dt>Çakışma kısıtı</dt>
          <dd>{yoklama.cakismaKisitiVar ? "var" : "yok"}</dd>
        </dl>
      )}
    </main>
  );
}
