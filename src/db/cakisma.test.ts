import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, expect, test } from "vitest";

import {
  hizmet,
  isletme,
  musteri,
  personel,
  randevu,
} from "@/db/sema";
import { tablolariBosalt } from "@/db/test-temizlik";
import { baglantiyiKapat, getDb } from "@/lib/db";

// DEGISMEZ 8'in kaniti: ayni personelin cakisan iki AKTIF randevusu
// veritabani seviyesinde imkansiz.
//
// Bu dosya kisiti UYGULAMA KATMANINDAN GECMEDEN sinıyor - ham insert atiyor.
// Sebep: kisitin degeri tam olarak "uygulama unutsa bile tutuyor" olmasi.
// scoped-db uzerinden sinasaydik, sinanan sey scoped-db'nin kontrolu olurdu.

type Kurulum = { isletmeId: string; personelId: string; hizmetId: string; musteriId: string };

async function kur(slug: string): Promise<Kurulum> {
  const db = await getDb();

  const [i] = await db
    .insert(isletme)
    .values({ ad: `${slug} salonu`, slug })
    .returning();

  const [p] = await db
    .insert(personel)
    .values({ isletmeId: i.id, ad: "Tek Personel" })
    .returning();

  const [h] = await db
    .insert(hizmet)
    .values({ isletmeId: i.id, ad: "Saç kesimi", sureDk: 60, fiyatKurus: 35000 })
    .returning();

  const [m] = await db
    .insert(musteri)
    .values({ isletmeId: i.id, ad: "Deneme Müşteri", telefon: `532${slug.length}000000` })
    .returning();

  return { isletmeId: i.id, personelId: p.id, hizmetId: h.id, musteriId: m.id };
}

async function randevuYaz(
  k: Kurulum,
  bas: string,
  bit: string,
  durum: "BEKLIYOR" | "ONAYLI" | "IPTAL" | "TAMAMLANDI" | "GELMEDI",
  token: string,
) {
  const db = await getDb();
  return db.insert(randevu).values({
    isletmeId: k.isletmeId,
    personelId: k.personelId,
    hizmetId: k.hizmetId,
    musteriId: k.musteriId,
    baslangic: new Date(bas),
    bitis: new Date(bit),
    durum,
    iptalToken: token,
  });
}

/// Postgres hata kodunu okur. Kod adiyla dogrulamak, mesaj metnine bakmaktan
/// saglam: mesaj yerellestirilebiliyor ve surumle degisiyor.
///
/// `cause` zinciri geziliyor cunku Drizzle, postgres.js'in hatasini kendi
/// DrizzleQueryError'una sariyor ve kod yalnizca en icteki nesnede duruyor.
/// Bu ayrinti uygulama kodunu da ilgilendiriyor: kisit ihlalini 409'a
/// cevirecek olan yer ayni zinciri gezmek zorunda.
async function hataKodu(is: Promise<unknown>): Promise<string | null> {
  try {
    await is;
    return null;
  } catch (hata) {
    let mevcut: unknown = hata;
    for (let derinlik = 0; mevcut && derinlik < 5; derinlik++) {
      const kod = (mevcut as { code?: unknown }).code;
      if (typeof kod === "string") return kod;
      mevcut = (mevcut as { cause?: unknown }).cause;
    }
    return "bilinmeyen";
  }
}

const CAKISMA = "23P01"; // exclusion_violation
const KONTROL = "23514"; // check_violation

beforeEach(async () => {
  await tablolariBosalt();
});

afterAll(async () => {
  await baglantiyiKapat();
});

test("btree_gist uzantisi kurulu", async () => {
  // Kisit bu uzanti olmadan olusturulamiyor; migration'i elle degistiren biri
  // uzantiyi dusurmesin diye burada da kontrol ediliyor.
  const db = await getDb();
  const satirlar = await db.execute<{ var: boolean }>(
    sql`select exists(select 1 from pg_extension where extname = 'btree_gist') as var`,
  );
  expect(satirlar[0].var).toBe(true);
});

test("cakisan ikinci randevu veritabaninda reddediliyor", async () => {
  const k = await kur("cakisma");
  await randevuYaz(k, "2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z", "ONAYLI", "t1");

  const kod = await hataKodu(
    randevuYaz(k, "2026-09-01T10:30:00Z", "2026-09-01T11:30:00Z", "BEKLIYOR", "t2"),
  );

  expect(kod).toBe(CAKISMA);
});

test("bitisik randevular cakisma sayilmiyor", async () => {
  // Aralik '[)': baslangic dahil, bitis haric. '[]' olsaydi 10-11 randevusu
  // 11-12'yi de engellerdi ve gun boyunca ardisik randevu alinamazdi.
  const k = await kur("bitisik");
  await randevuYaz(k, "2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z", "ONAYLI", "t1");

  const kod = await hataKodu(
    randevuYaz(k, "2026-09-01T11:00:00Z", "2026-09-01T12:00:00Z", "ONAYLI", "t2"),
  );

  expect(kod).toBeNull();
});

test("iptal edilen randevu saati bosaltiyor", async () => {
  // Kisitin WHERE kosulu bunun icin: iptal ve gelmedi durumlari saati
  // kapatmamali, yoksa iptal edilen bir saate bir daha randevu alinamazdi.
  const k = await kur("iptal");
  await randevuYaz(k, "2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z", "ONAYLI", "t1");

  const db = await getDb();
  await db.update(randevu).set({ durum: "IPTAL" }).where(eq(randevu.iptalToken, "t1"));

  const kod = await hataKodu(
    randevuYaz(k, "2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z", "ONAYLI", "t2"),
  );

  expect(kod).toBeNull();
});

test("gelmedi durumu da saati bosaltiyor", async () => {
  const k = await kur("gelmedi");
  await randevuYaz(k, "2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z", "ONAYLI", "t1");

  const db = await getDb();
  await db.update(randevu).set({ durum: "GELMEDI" }).where(eq(randevu.iptalToken, "t1"));

  const kod = await hataKodu(
    randevuYaz(k, "2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z", "ONAYLI", "t2"),
  );

  expect(kod).toBeNull();
});

test("BASKA personelin ayni saati serbest", async () => {
  // Kisit personel bazinda; iki kisilik bir salonda ikisi ayni anda calisir.
  const k = await kur("iki-personel");
  await randevuYaz(k, "2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z", "ONAYLI", "t1");

  const db = await getDb();
  const [ikinci] = await db
    .insert(personel)
    .values({ isletmeId: k.isletmeId, ad: "İkinci Personel", sira: 1 })
    .returning();

  const kod = await hataKodu(
    db.insert(randevu).values({
      isletmeId: k.isletmeId,
      personelId: ikinci.id,
      hizmetId: k.hizmetId,
      musteriId: k.musteriId,
      baslangic: new Date("2026-09-01T10:00:00Z"),
      bitis: new Date("2026-09-01T11:00:00Z"),
      durum: "ONAYLI",
      iptalToken: "t2",
    }),
  );

  expect(kod).toBeNull();
});

test("bitis baslangictan once olamaz", async () => {
  const k = await kur("ters");
  const kod = await hataKodu(
    randevuYaz(k, "2026-09-01T15:00:00Z", "2026-09-01T14:00:00Z", "ONAYLI", "t1"),
  );

  expect(kod).toBe(KONTROL);
});

test("ayni anda gelen iki randevudan biri kaybediyor", async () => {
  // Urundeki tek gercek yaris burasi: iki musteri ayni saniyede ayni saate
  // basiyor. Uygulama katmani ikisine de "bos" der; kesin cevabi kisit veriyor.
  const k = await kur("yaris");

  const sonuclar = await Promise.allSettled([
    randevuYaz(k, "2026-09-01T09:00:00Z", "2026-09-01T10:00:00Z", "ONAYLI", "y1"),
    randevuYaz(k, "2026-09-01T09:00:00Z", "2026-09-01T10:00:00Z", "ONAYLI", "y2"),
  ]);

  const basarili = sonuclar.filter((s) => s.status === "fulfilled");
  expect(basarili).toHaveLength(1);

  const db = await getDb();
  expect(await db.select().from(randevu)).toHaveLength(1);
});
