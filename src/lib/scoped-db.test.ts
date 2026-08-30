import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, test } from "vitest";

import { isletme, kullanici, personel } from "@/db/sema";
import { tablolariBosalt } from "@/db/test-temizlik";
import { baglantiyiKapat, getDb } from "@/lib/db";
import {
  getHalkaAcikDb,
  getScopedDb,
  type IsletmeOturumu,
} from "@/lib/scoped-db";

// Kiraci izolasyonunun kaniti. Postgres tarafinda RLS yok: ayrim tamamen
// scoped-db'nin enjekte ettigi filtreye dayaniyor. Bu yuzden her test EN AZ IKI
// isletme kuruyor ve birinin oturumuyla digerinin kaydini istemeye calisiyor -
// sizinti varsa burada gorunur.

type Kurulum = {
  isletmeId: string;
  slug: string;
  oturum: IsletmeOturumu;
};

/// Bir isletme + sahibi kullanici + o sahibin oturumu kurar.
async function isletmeKur(slug: string): Promise<Kurulum> {
  const db = await getDb();

  const [olusanIsletme] = await db
    .insert(isletme)
    .values({ ad: `${slug} kuaforu`, slug })
    .returning();

  const [sahip] = await db
    .insert(kullanici)
    .values({
      // DEGISMEZ 9: auth.users'a FK yok, duz string yeterli.
      authUserId: `auth-${slug}`,
      eposta: `${slug}@ornek.test`,
      ad: `${slug} sahibi`,
      rol: "SAHIP",
      isletmeId: olusanIsletme.id,
    })
    .returning();

  return {
    isletmeId: olusanIsletme.id,
    slug,
    oturum: {
      kullaniciId: sahip.id,
      authUserId: sahip.authUserId,
      isletmeId: olusanIsletme.id,
      rol: "SAHIP",
    },
  };
}

/// Personeli kasten HAM db ile ekliyoruz: kurulum verisi scoped-db'ye
/// guvenmesin, yoksa test edilen sey kendi kurulumunu dogrulamis olur.
async function hamPersonelEkle(
  isletmeId: string,
  ad: string,
  ekstra: { sira?: number; unvan?: string | null; aktif?: boolean } = {},
) {
  const db = await getDb();
  const [kayit] = await db
    .insert(personel)
    .values({ isletmeId, ad, ...ekstra })
    .returning();
  return kayit;
}

/// Kaydi ham db ile geri okur - scoped-db'nin "etkilemedim" iddiasini bagimsiz
/// dogrulamak icin.
async function hamPersonelOku(id: string) {
  const db = await getDb();
  const [kayit] = await db
    .select()
    .from(personel)
    .where(eq(personel.id, id))
    .limit(1);
  return kayit ?? null;
}

beforeEach(async () => {
  await tablolariBosalt();
});

afterAll(async () => {
  await baglantiyiKapat();
});

test("personelleriListele yalnizca kendi isletmesinin personelini donuyor", async () => {
  const a = await isletmeKur("isletme-a");
  const b = await isletmeKur("isletme-b");

  await hamPersonelEkle(a.isletmeId, "A Ayse", { sira: 1 });
  await hamPersonelEkle(a.isletmeId, "A Ahmet", { sira: 2 });
  const bPersonel = await hamPersonelEkle(b.isletmeId, "B Berk", { sira: 1 });

  const aDb = await getScopedDb(a.oturum);
  const liste = await aDb.personelleriListele();

  expect(liste.map((p) => p.ad)).toEqual(["A Ayse", "A Ahmet"]);
  // Diger kiracinin kaydi listede HIC gorunmuyor.
  expect(liste.some((p) => p.id === bPersonel.id)).toBe(false);
  expect(liste.every((p) => p.isletmeId === a.isletmeId)).toBe(true);
});

test("personelGetir baska isletmenin personel id'si icin null donuyor", async () => {
  const a = await isletmeKur("isletme-a");
  const b = await isletmeKur("isletme-b");

  const aPersonel = await hamPersonelEkle(a.isletmeId, "A Ayse");
  const bPersonel = await hamPersonelEkle(b.isletmeId, "B Berk");

  const aDb = await getScopedDb(a.oturum);

  // Kendi kaydi geliyor...
  expect((await aDb.personelGetir(aPersonel.id))?.ad).toBe("A Ayse");

  // ...digerininki gelmiyor. Var olan ama baska kiraciya ait bir kayit ile hic
  // olmayan bir kayit cagirana ayni gorunmeli: varlik sizdirmiyoruz.
  const yabanci = await aDb.personelGetir(bPersonel.id);
  const olmayan = await aDb.personelGetir(
    "00000000-0000-0000-0000-000000000000",
  );
  expect(yabanci).toBeNull();
  expect(yabanci).toEqual(olmayan);
});

test("personelGuncelle baska isletmenin kaydini degistirmiyor", async () => {
  const a = await isletmeKur("isletme-a");
  const b = await isletmeKur("isletme-b");

  const bPersonel = await hamPersonelEkle(b.isletmeId, "B Berk", {
    unvan: "Usta",
  });

  const aDb = await getScopedDb(a.oturum);
  const etkilenen = await aDb.personelGuncelle(bPersonel.id, {
    ad: "Ele Gecirildi",
    unvan: "Sahte",
  });

  expect(etkilenen).toBe(0);

  // Donen sayiya guvenmiyoruz: hedef kaydi ayrica sorguluyoruz.
  const sonrasi = await hamPersonelOku(bPersonel.id);
  expect(sonrasi?.ad).toBe("B Berk");
  expect(sonrasi?.unvan).toBe("Usta");

  // Kendi kaydinda ayni cagri calisiyor - yani 0 donmesinin sebebi metodun
  // topyekun bozuk olmasi degil.
  const aPersonel = await hamPersonelEkle(a.isletmeId, "A Ayse");
  expect(await aDb.personelGuncelle(aPersonel.id, { ad: "A Ayse Yeni" })).toBe(
    1,
  );
  expect((await hamPersonelOku(aPersonel.id))?.ad).toBe("A Ayse Yeni");
});

test("personelPasifleStir baska isletmenin personelini pasife alamiyor", async () => {
  const a = await isletmeKur("isletme-a");
  const b = await isletmeKur("isletme-b");

  const bPersonel = await hamPersonelEkle(b.isletmeId, "B Berk");

  const aDb = await getScopedDb(a.oturum);
  const etkilenen = await aDb.personelPasifleStir(bPersonel.id);

  expect(etkilenen).toBe(0);

  const sonrasi = await hamPersonelOku(bPersonel.id);
  expect(sonrasi?.aktif).toBe(true);

  // Kendi personelini pasife alabiliyor.
  const aPersonel = await hamPersonelEkle(a.isletmeId, "A Ayse");
  expect(await aDb.personelPasifleStir(aPersonel.id)).toBe(1);
  expect((await hamPersonelOku(aPersonel.id))?.aktif).toBe(false);
});

test("personelEkle kaydi her zaman oturumun isletmesine bagliyor", async () => {
  const a = await isletmeKur("isletme-a");
  const b = await isletmeKur("isletme-b");

  const aDb = await getScopedDb(a.oturum);

  // Tip zaten isletmeId almiyor; kasten tip disina cikiyoruz cunku sorulan sey
  // calisma zamaninda ne oldugu: cagiran israr etse bile filtre kazaniyor mu?
  type EkleGirdisi = Parameters<typeof aDb.personelEkle>[0];
  const kotucul = {
    ad: "Sizmaya calisan",
    isletmeId: b.isletmeId,
  } as unknown as EkleGirdisi;

  const eklenen = await aDb.personelEkle(kotucul);

  expect(eklenen.isletmeId).toBe(a.isletmeId);
  expect(eklenen.isletmeId).not.toBe(b.isletmeId);

  // Ham okumada da oyle: kayit B'nin listesine hic dusmemis.
  expect((await hamPersonelOku(eklenen.id))?.isletmeId).toBe(a.isletmeId);
  const bDb = await getScopedDb(b.oturum);
  expect(await bDb.personelleriListele()).toHaveLength(0);
});

test("isletmeyiGetir yalnizca kendi isletmesini donuyor", async () => {
  const a = await isletmeKur("isletme-a");
  const b = await isletmeKur("isletme-b");

  const aDb = await getScopedDb(a.oturum);
  const bDb = await getScopedDb(b.oturum);

  const aKayit = await aDb.isletmeyiGetir();
  const bKayit = await bDb.isletmeyiGetir();

  expect(aKayit?.id).toBe(a.isletmeId);
  expect(aKayit?.slug).toBe("isletme-a");
  expect(bKayit?.id).toBe(b.isletmeId);
  expect(aKayit?.id).not.toBe(bKayit?.id);

  // Isletmesi silinmis bir oturum hicbir seye ulasamaz - komsu kayit dolgu
  // olarak donmuyor.
  const db = await getDb();
  await db.delete(isletme).where(eq(isletme.id, a.isletmeId));
  expect(await aDb.isletmeyiGetir()).toBeNull();
});

test("isletmeyiGuncelle baska isletmeyi etkilemiyor", async () => {
  const a = await isletmeKur("isletme-a");
  const b = await isletmeKur("isletme-b");

  const aDb = await getScopedDb(a.oturum);
  const etkilenen = await aDb.isletmeyiGuncelle({
    ad: "Yeni A",
    saatDilimi: "Europe/Berlin",
  });

  // Yalnizca tek satir - hepsi degil.
  expect(etkilenen).toBe(1);

  const db = await getDb();
  const [bSonrasi] = await db
    .select()
    .from(isletme)
    .where(eq(isletme.id, b.isletmeId));

  expect(bSonrasi.ad).toBe("isletme-b kuaforu");
  expect(bSonrasi.saatDilimi).toBe("Europe/Istanbul");

  const [aSonrasi] = await db
    .select()
    .from(isletme)
    .where(eq(isletme.id, a.isletmeId));
  expect(aSonrasi.ad).toBe("Yeni A");
});

test("getHalkaAcikDb aktif isletme icin kayit donuyor", async () => {
  const a = await isletmeKur("isletme-a");
  await isletmeKur("isletme-b");

  const halka = await getHalkaAcikDb("isletme-a");

  expect(halka).not.toBeNull();
  expect(halka?.isletme.id).toBe(a.isletmeId);
  expect(halka?.isletme.ad).toBe("isletme-a kuaforu");
});

test("getHalkaAcikDb pasif isletme icin null donuyor", async () => {
  const a = await isletmeKur("isletme-a");
  const b = await isletmeKur("isletme-b");

  const db = await getDb();
  await db
    .update(isletme)
    .set({ aktif: false })
    .where(eq(isletme.id, a.isletmeId));

  // Pasif isletmenin randevu sayfasi acilmamali; komsu isletme de dolgu olarak
  // donmemeli.
  expect(await getHalkaAcikDb("isletme-a")).toBeNull();
  expect((await getHalkaAcikDb("isletme-b"))?.isletme.id).toBe(b.isletmeId);
  expect(await getHalkaAcikDb("olmayan-slug")).toBeNull();
});

test("getHalkaAcikDb personelleriListele yalnizca aktif personeli donuyor", async () => {
  const a = await isletmeKur("isletme-a");
  const b = await isletmeKur("isletme-b");

  await hamPersonelEkle(a.isletmeId, "A Aktif", { sira: 1 });
  const aPasif = await hamPersonelEkle(a.isletmeId, "A Pasif", {
    sira: 2,
    aktif: false,
  });
  const bAktif = await hamPersonelEkle(b.isletmeId, "B Aktif", { sira: 1 });

  const halka = await getHalkaAcikDb("isletme-a");
  const liste = (await halka?.personelleriListele()) ?? [];

  expect(liste.map((p) => p.ad)).toEqual(["A Aktif"]);
  expect(liste.some((p) => p.id === aPasif.id)).toBe(false);
  // Diger kiracinin aktif personeli de sizmiyor.
  expect(liste.some((p) => p.id === bAktif.id)).toBe(false);
});
