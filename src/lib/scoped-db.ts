// KAPI DISI DOSYA (bkz. CLAUDE.md degismez 1): kiraci filtresini enjekte eden
// tek yer burasi. Route handler'lar @/lib/db'yi degil bu dosyayi kullanir;
// bunu eslint.config.mjs icindeki no-restricted-imports kurali zorluyor.
//
// Tasarimin ozu: cagiran taraf isletmeId'yi VEREMEZ. Filtre parametre degil,
// kapanis degiskeni. Yanlis kiracinin verisini istemek icin once bu dosyayi
// degistirmek gerekiyor - unutmakla olmuyor.

import { and, eq } from "drizzle-orm";

import { isletme, kullanici, personel } from "@/db/sema";
import { getDb } from "@/lib/db";

export type Rol = "SAHIP" | "PERSONEL" | "MUSTERI";

/// Oturum sozlesmesi. DEGISMEZ 6: isletmeId duz string kalir.
export type IsletmeOturumu = {
  kullaniciId: string;
  authUserId: string;
  isletmeId: string;
  rol: "SAHIP" | "PERSONEL";
};

type YeniPersonel = {
  ad: string;
  unvan?: string | null;
  sira?: number;
};

/// Isletme oturumuna bagli, kiraci filtresi enjekte edilmis veri kapisi.
export async function getScopedDb(oturum: IsletmeOturumu) {
  const db = await getDb();
  // Kapanista tutuluyor: asagidaki hicbir metot bunu disaridan almiyor.
  const kiraci = oturum.isletmeId;

  return {
    async isletmeyiGetir() {
      const [kayit] = await db
        .select()
        .from(isletme)
        .where(eq(isletme.id, kiraci))
        .limit(1);
      return kayit ?? null;
    },

    async isletmeyiGuncelle(veri: { ad?: string; saatDilimi?: string }) {
      const sonuc = await db
        .update(isletme)
        .set(veri)
        .where(eq(isletme.id, kiraci))
        .returning({ id: isletme.id });
      return sonuc.length;
    },

    async personelleriListele() {
      return db
        .select()
        .from(personel)
        .where(eq(personel.isletmeId, kiraci))
        .orderBy(personel.sira);
    },

    async personelGetir(id: string) {
      const [kayit] = await db
        .select()
        .from(personel)
        // Iki kosul birlikte: id tek basina yeterli DEGIL. Baska isletmenin
        // personel id'si buraya gelirse bos donuyor, 404'e ceviriliyor.
        .where(and(eq(personel.id, id), eq(personel.isletmeId, kiraci)))
        .limit(1);
      return kayit ?? null;
    },

    async personelEkle(veri: YeniPersonel) {
      const [kayit] = await db
        .insert(personel)
        .values({ ...veri, isletmeId: kiraci })
        .returning();
      return kayit;
    },

    async personelGuncelle(id: string, veri: Partial<YeniPersonel>) {
      const sonuc = await db
        .update(personel)
        .set(veri)
        .where(and(eq(personel.id, id), eq(personel.isletmeId, kiraci)))
        .returning({ id: personel.id });
      // 0 donuyorsa kayit yok YA DA baska kiraciya ait - ikisi de cagirana
      // ayni gorunmeli, yoksa varligi sizdirmis oluruz.
      return sonuc.length;
    },

    async personelPasifleStir(id: string) {
      const sonuc = await db
        .update(personel)
        .set({ aktif: false })
        .where(and(eq(personel.id, id), eq(personel.isletmeId, kiraci)))
        .returning({ id: personel.id });
      return sonuc.length;
    },

    async kullanicilariListele() {
      return db
        .select()
        .from(kullanici)
        .where(eq(kullanici.isletmeId, kiraci));
    },
  };
}

export type ScopedDb = Awaited<ReturnType<typeof getScopedDb>>;

/// Oturumsuz, halka acik okumalar icin. Kiraci slug'dan cozuluyor ve yalnizca
/// AKTIF isletme donuyor - pasif bir isletmenin randevu sayfasi acilmamali.
export async function getHalkaAcikDb(slug: string) {
  const db = await getDb();

  const [sahip] = await db
    .select({ id: isletme.id, ad: isletme.ad, saatDilimi: isletme.saatDilimi })
    .from(isletme)
    .where(and(eq(isletme.slug, slug), eq(isletme.aktif, true)))
    .limit(1);

  if (!sahip) return null;

  const kiraci = sahip.id;

  return {
    isletme: sahip,

    async personelleriListele() {
      return db
        .select({ id: personel.id, ad: personel.ad, unvan: personel.unvan })
        .from(personel)
        .where(and(eq(personel.isletmeId, kiraci), eq(personel.aktif, true)))
        .orderBy(personel.sira);
    },
  };
}
