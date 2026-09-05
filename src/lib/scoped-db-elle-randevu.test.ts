import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { hizmet, isletme, kullanici, musteri, personel, randevu } from "@/db/sema";
import { tablolariBosalt } from "@/db/test-temizlik";
import { baglantiyiKapat, getDb } from "@/lib/db";
import { getScopedDb, type IsletmeOturumu } from "@/lib/scoped-db";

// Faz H2: panelden elle randevu yazmanin kapsam testleri.
//
// NEDEN AYRI DOSYA: scoped-db-randevu.test.ts panel TAKVIMININ okuma
// kapsamini anlatiyor; burasi yazma yolu ve bambaska sorulari var - baska
// isletmenin personeline randevu yazilabiliyor mu, kisit uygulaniyor mu,
// musteri satiri tekilleniyor mu.
//
// BU DOSYANIN KILITLEDIGI DORT SEY:
//   1. IDOR - baska isletmenin personel ya da hizmet id'si "yok" doner.
//      FOREIGN KEY BUNU YAKALAMIYOR: `randevu.personel_id` yalnizca
//      `personel.id`ye bakiyor, isletmeye degil. Yani bu kontrolun tek yeri
//      kapinin kendisi ve kaybolursa veritabani sessiz kalir.
//   2. Elle randevunun KAYNAK ve DURUM degerleri - `ISLETME` / `ONAYLI`.
//   3. Cakisma kisiti (DEGISMEZ 8) elle yazmada da gecerli - `zorla` onu
//      ASMIYOR.
//   4. Gelmedi kisitinin elle yazmada UYGULANMADIGI - isletmenin affetme
//      yolu bu.
//
// Kurulum verisi kasten HAM `db` ile yaziliyor: test edilen katmana
// guvenmesin.

type Kurulum = {
  isletmeId: string;
  oturum: IsletmeOturumu;
  personelId: string;
  hizmetId: string;
};

function saat(h: number, dk = 0): Date {
  return new Date(Date.UTC(2026, 2, 10, h, dk));
}

let tokenSayaci = 0;
function token(): string {
  tokenSayaci += 1;
  return `elle-token-${tokenSayaci}`;
}

async function isletmeKur(slug: string): Promise<Kurulum> {
  const db = await getDb();

  const [i] = await db
    .insert(isletme)
    .values({ ad: `${slug} kuaforu`, slug })
    .returning();

  const [sahip] = await db
    .insert(kullanici)
    .values({
      authUserId: `auth-${slug}`,
      eposta: `${slug}@ornek.test`,
      ad: `${slug} sahibi`,
      rol: "SAHIP",
      isletmeId: i.id,
    })
    .returning();

  const [p] = await db
    .insert(personel)
    .values({ isletmeId: i.id, ad: `${slug} personeli` })
    .returning();

  const [h] = await db
    .insert(hizmet)
    .values({ isletmeId: i.id, ad: `${slug} hizmeti`, sureDk: 30 })
    .returning();

  return {
    isletmeId: i.id,
    personelId: p.id,
    hizmetId: h.id,
    oturum: {
      kullaniciId: sahip.id,
      authUserId: sahip.authUserId,
      isletmeId: i.id,
      rol: "SAHIP",
    },
  };
}

function girdi(k: Kurulum, ustuneYaz: Record<string, unknown> = {}) {
  return {
    personelId: k.personelId,
    hizmetId: k.hizmetId,
    baslangic: saat(10),
    bitis: saat(10, 30),
    musteriAd: "Telefonla Arayan",
    telefon: "5551112233",
    eposta: null,
    not: null,
    iptalToken: token(),
    ...ustuneYaz,
  };
}

beforeEach(async () => {
  await tablolariBosalt();
});

afterAll(async () => {
  await baglantiyiKapat();
});

describe("mutlu yol", () => {
  test("randevu ISLETME kaynagiyla ve ONAYLI olarak yaziliyor", async () => {
    const k = await isletmeKur("mutlu");
    const db = await getScopedDb(k.oturum);

    const sonuc = await db.randevuElleOlustur(girdi(k));

    expect(sonuc.durum).toBe("tamam");
    if (sonuc.durum !== "tamam") return;

    // Isletmenin `otomatikOnay` ayarina BAKILMIYOR: kendi girdigi randevuyu
    // kendi onaylayacak olurdu.
    expect(sonuc.randevu.durum).toBe("ONAYLI");
    expect(sonuc.randevu.kaynak).toBe("ISLETME");
    expect(sonuc.randevu.isletmeId).toBe(k.isletmeId);
  });

  test("yeni musteri kaydi aciliyor", async () => {
    const k = await isletmeKur("yenimusteri");
    const db = await getScopedDb(k.oturum);

    await db.randevuElleOlustur(girdi(k, { musteriAd: "Ayse Yilmaz" }));

    const ham = await getDb();
    const kayitlar = await ham
      .select()
      .from(musteri)
      .where(eq(musteri.isletmeId, k.isletmeId));

    expect(kayitlar).toHaveLength(1);
    expect(kayitlar[0].ad).toBe("Ayse Yilmaz");
    expect(kayitlar[0].telefon).toBe("5551112233");
  });

  test("ayni numara ikinci kez girildiginde YENI musteri acilmiyor", async () => {
    const k = await isletmeKur("tekilleme");
    const db = await getScopedDb(k.oturum);

    await db.randevuElleOlustur(girdi(k));
    const ikinci = await db.randevuElleOlustur(
      girdi(k, { baslangic: saat(14), bitis: saat(14, 30) }),
    );

    expect(ikinci.durum).toBe("tamam");

    const ham = await getDb();
    const kayitlar = await ham
      .select()
      .from(musteri)
      .where(eq(musteri.isletmeId, k.isletmeId));

    // `(isletmeId, telefon)` tekil (sema: musteri_isletme_telefon_idx).
    expect(kayitlar).toHaveLength(1);
  });

  test("mevcut musterinin adi DEGISTIRILMIYOR", async () => {
    const k = await isletmeKur("adkorunuyor");
    const ham = await getDb();
    await ham.insert(musteri).values({
      isletmeId: k.isletmeId,
      ad: "Kayitli Ad",
      telefon: "5551112233",
      not: "kisa sac sever",
    });

    const db = await getScopedDb(k.oturum);
    await db.randevuElleOlustur(girdi(k, { musteriAd: "Bambaska Ad" }));

    const [kayit] = await ham
      .select()
      .from(musteri)
      .where(eq(musteri.isletmeId, k.isletmeId));

    // Sessiz yeniden adlandirma surpriz olurdu; isletmenin kendi notu da
    // yerinde duruyor.
    expect(kayit.ad).toBe("Kayitli Ad");
    expect(kayit.not).toBe("kisa sac sever");
  });
});

describe("IDOR - baska isletmenin kaydi", () => {
  test("baska isletmenin PERSONELINE randevu yazilamiyor", async () => {
    const a = await isletmeKur("idor-a");
    const b = await isletmeKur("idor-b");

    const db = await getScopedDb(a.oturum);
    const sonuc = await db.randevuElleOlustur(
      girdi(a, { personelId: b.personelId }),
    );

    // Foreign key bunu YAKALAMAZDI: `personel.id` gecerli bir satir.
    expect(sonuc.durum).toBe("yok");

    const ham = await getDb();
    const yazilanlar = await ham.select().from(randevu);
    expect(yazilanlar).toHaveLength(0);
  });

  test("baska isletmenin HIZMETIYLE randevu yazilamiyor", async () => {
    const a = await isletmeKur("idor-h-a");
    const b = await isletmeKur("idor-h-b");

    const db = await getScopedDb(a.oturum);
    const sonuc = await db.randevuElleOlustur(
      girdi(a, { hizmetId: b.hizmetId }),
    );

    expect(sonuc.durum).toBe("yok");
  });

  test("olmayan id ile baskasinin id'si AYNI cevabi aliyor", async () => {
    const a = await isletmeKur("idor-ayni-a");
    const b = await isletmeKur("idor-ayni-b");

    const db = await getScopedDb(a.oturum);

    const yabanci = await db.randevuElleOlustur(
      girdi(a, { personelId: b.personelId }),
    );
    const yok = await db.randevuElleOlustur(
      girdi(a, { personelId: "00000000-0000-4000-8000-000000000000" }),
    );

    // Ikisi ayrisirsa kaydin varligi sizar.
    expect(yabanci.durum).toBe(yok.durum);
  });

  test("pasif personele randevu yazilamiyor", async () => {
    const k = await isletmeKur("pasif-personel");
    const ham = await getDb();
    await ham
      .update(personel)
      .set({ aktif: false })
      .where(eq(personel.id, k.personelId));

    const db = await getScopedDb(k.oturum);
    const sonuc = await db.randevuElleOlustur(girdi(k));

    expect(sonuc.durum).toBe("yok");
  });
});

describe("cakisma - DEGISMEZ 8", () => {
  test("ayni personelin ustuste binen ikinci randevusu 'dolu' donuyor", async () => {
    const k = await isletmeKur("cakisma");
    const db = await getScopedDb(k.oturum);

    const ilk = await db.randevuElleOlustur(girdi(k));
    expect(ilk.durum).toBe("tamam");

    // 10:15 - 10:45, ilkiyle kesisiyor.
    const ikinci = await db.randevuElleOlustur(
      girdi(k, {
        baslangic: saat(10, 15),
        bitis: saat(10, 45),
        telefon: "5559998877",
      }),
    );

    // Serbest saat yazabilmek cakismayi ASMIYOR: serbestlik calisma saatine
    // karsi, ayni personelin ustuste iki randevusuna karsi degil.
    expect(ikinci.durum).toBe("dolu");
  });

  test("bitisik randevu cakisma DEGIL", async () => {
    const k = await isletmeKur("bitisik");
    const db = await getScopedDb(k.oturum);

    await db.randevuElleOlustur(girdi(k));
    // 10:30'da basliyor, ilki 10:30'da bitiyor. Aralik `'[)'`.
    const ikinci = await db.randevuElleOlustur(
      girdi(k, { baslangic: saat(10, 30), bitis: saat(11) }),
    );

    expect(ikinci.durum).toBe("tamam");
  });

  test("iptal edilmis randevunun saati bosaliyor", async () => {
    const k = await isletmeKur("iptalli");
    const db = await getScopedDb(k.oturum);

    const ilk = await db.randevuElleOlustur(girdi(k));
    if (ilk.durum !== "tamam") throw new Error("ilk randevu yazilamadi");

    const ham = await getDb();
    await ham
      .update(randevu)
      .set({ durum: "IPTAL" })
      .where(eq(randevu.id, ilk.randevu.id));

    const ikinci = await db.randevuElleOlustur(
      girdi(k, { telefon: "5559998877" }),
    );

    expect(ikinci.durum).toBe("tamam");
  });
});

describe("kisitlar elle yazmada UYGULANMIYOR", () => {
  test("gelmedi kisiti olan musteriye randevu yazilabiliyor", async () => {
    const k = await isletmeKur("kisitli");
    const ham = await getDb();

    // Kisit bir yil ileride: halka acik yoldan bu numara randevu alamazdi.
    await ham.insert(musteri).values({
      isletmeId: k.isletmeId,
      ad: "Gelmemis Musteri",
      telefon: "5551112233",
      randevuKisitiBitis: new Date(Date.UTC(2027, 0, 1)),
    });

    const db = await getScopedDb(k.oturum);
    const sonuc = await db.randevuElleOlustur(girdi(k));

    // Isletmenin AFFETME yolu: telefonla arayip ozur dileyen musteriyi
    // panelden yazabiliyor.
    expect(sonuc.durum).toBe("tamam");
  });

  test("acik randevu tavani elle yazmayi durdurmuyor", async () => {
    const k = await isletmeKur("tavan");
    const db = await getScopedDb(k.oturum);

    // Halka acik yolda tavan 3; burada dordunculer de yazilabiliyor.
    for (const s of [10, 12, 14, 16]) {
      const sonuc = await db.randevuElleOlustur(
        girdi(k, { baslangic: saat(s), bitis: saat(s, 30) }),
      );
      expect(sonuc.durum).toBe("tamam");
    }
  });
});
