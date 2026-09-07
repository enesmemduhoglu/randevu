import { is, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

import { getDb } from "@/lib/db";
import * as sema from "@/db/sema";
// Derleme aninda pakete gomulur; calisma aninda dosya sistemi YOK, workerd'de
// sorun cikmaz. `drizzle-kit generate` her kostugunda otomatik guncellenir,
// yani elle senkron tutulmasi gereken ikinci bir gercekleik kaynagi degil.
import gunluk from "../../drizzle/meta/_journal.json";

// Teshis sorgusu burada, sayfada degil: src/app/** altindan @/lib/db import
// etmek eslint kuraliyla yasak (bkz. CLAUDE.md degismez 1). Kural route
// handler'lara degil butun app dizinine uygulaniyor, cunku sunucu bilesenleri
// de sorgu yapabiliyor ve risk ayni.
//
// NEDEN "200 DONUYOR" YETMIYOR (TODOS.md > Faz L3): bu sayfa eskiden yalnizca
// `select version()` kosuyordu - "Postgres ayakta" diyordu, "sema uyumlu"
// demiyordu. Eksik bir kolon boyle bir kontrolden GECIP uygulamada L3 gibi
// bir olayla ortaya cikabiliyordu. Asagidaki sorgu artik uygulamanin GERCEKTEN
// okudugu seye dokunuyor: kolon kumesi, uygulanmis goc sayisi, DEGISMEZ 8'in
// veritabani kisitinin varligi.

const beklenenGocAdedi = gunluk.entries.length;
const beklenenSonGoc = gunluk.entries.at(-1)!.when;

function semadanBeklenenKolonlar(): Set<string> {
  const kumesi = new Set<string>();
  for (const nesne of Object.values(sema)) {
    if (!is(nesne, PgTable)) continue;
    const cfg = getTableConfig(nesne);
    for (const kolon of cfg.columns) kumesi.add(`${cfg.name}.${kolon.name}`);
  }
  return kumesi;
}

type SatirTipi = {
  surum: string;
  goc_adet: number;
  goc_son: string | null;
  cakisma_kisiti: number;
  kolonlar: string[];
};

/// DISA cikan tip - halka acik. Eksik kolon adlari, kisit durumu gibi drift
/// bilgisi buraya GIRMEZ: "kisit yok" cumlesi saldirgana "uygulama katmani tek
/// koruma, TOCTOU'ya acik" der (CLAUDE.md degismez 8). Sebep yalnizca log'a
/// gidiyor.
export type KamuYoklama = {
  durum: "saglikli" | "bozuk" | "baglanamadi";
  surum: string | null;
  sureMs: number;
  goc: string;
};

/// IC tip - teshis. Yalnizca uretim disinda (bkz. saglik.ts disindaki cagiran)
/// gosterilir.
export type Yoklama = KamuYoklama & {
  eksikKolonlar: string[];
  fazlaKolonlar: string[];
  gocEksik: boolean;
  cakismaKisitiVar: boolean;
};

export async function veritabaniniYokla(): Promise<Yoklama> {
  const baslangic = Date.now();
  try {
    const db = await getDb();
    const satirlar = await db.execute<SatirTipi>(sql`
      select
        version() as surum,

        -- Drizzle'in KENDI gunlugu. supabase_migrations DEGIL: o Supabase
        -- CLI'in tablosu ve bu depoda hep bos (TODOS.md > Faz L3).
        (select count(*)::int from drizzle.__drizzle_migrations) as goc_adet,
        (select max(created_at)::text from drizzle.__drizzle_migrations) as goc_son,

        -- DEGISMEZ 8. contype='x' sart: ayni adla bir CHECK kisiti "kisit var"
        -- diye gecmesin.
        (select count(*)::int
           from pg_constraint  c
           join pg_class       t on t.oid = c.conrelid
           join pg_namespace   n on n.oid = t.relnamespace
          where n.nspname = 'public'
            and t.relname = 'randevu'
            and c.conname = 'randevu_cakisma_yok'
            and c.contype = 'x') as cakisma_kisiti,

        -- Gercek zemin. Beklenen kume sema.ts'ten TURETILIYOR, elle yazilmiyor.
        coalesce(
          (select json_agg(k.table_name || '.' || k.column_name)
             from information_schema.columns k
            where k.table_schema = 'public'),
          '[]'::json
        ) as kolonlar
    `);

    const satir = satirlar[0];
    const dbKolonlari = new Set(satir.kolonlar);
    const beklenenKolonlar = semadanBeklenenKolonlar();

    const eksikKolonlar = [...beklenenKolonlar].filter((k) => !dbKolonlari.has(k));
    const fazlaKolonlar = [...dbKolonlari].filter((k) => !beklenenKolonlar.has(k));

    // YON ONEMLI. Eksik kolon = bozuk (L3). Fazla kolon = SAGLIKLI - dogru goc
    // sirasinin normal ara durumu (goc kosmus, deploy henuz cikmamis); hata
    // sayilirsa dogru davranis cezalandirilir.
    const gocEksik =
      satir.goc_adet < beklenenGocAdedi ||
      (satir.goc_son !== null && Number(satir.goc_son) < beklenenSonGoc);
    const cakismaKisitiVar = satir.cakisma_kisiti > 0;

    const bozuk = eksikKolonlar.length > 0 || gocEksik || !cakismaKisitiVar;

    return {
      durum: bozuk ? "bozuk" : "saglikli",
      // Tam surum dizesi yama seviyesini de sizdirir; major yeter.
      surum: satir.surum.match(/PostgreSQL (\d+)/)?.[1] ?? null,
      sureMs: Date.now() - baslangic,
      goc: `${satir.goc_adet}/${beklenenGocAdedi}`,
      eksikKolonlar,
      fazlaKolonlar,
      gocEksik,
      cakismaKisitiVar,
    };
  } catch {
    // Hata metni disariya verilmez: baglanti dizesi ve host bilgisi tasiyabilir
    // (CLAUDE.md degismez 5).
    return {
      durum: "baglanamadi",
      surum: null,
      sureMs: Date.now() - baslangic,
      goc: `0/${beklenenGocAdedi}`,
      eksikKolonlar: [],
      fazlaKolonlar: [],
      gocEksik: true,
      cakismaKisitiVar: false,
    };
  }
}

/// Halka acik govdeye giden daraltma - eksik kolon adlari, kisit durumu gibi
/// teshis alanlarini biler. Iki yuzey (sayfa, /api/saglik) AYNI suzgecten
/// gecsin diye tek fonksiyon.
export function kamuyaAcilanYoklama(yoklama: Yoklama): KamuYoklama {
  return {
    durum: yoklama.durum,
    surum: yoklama.surum,
    sureMs: yoklama.sureMs,
    goc: yoklama.goc,
  };
}
