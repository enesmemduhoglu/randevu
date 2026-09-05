import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import {
  calismaSaati,
  hizmet,
  isletme,
  kapali,
  musteri,
  personel,
  personelHizmet,
  randevu,
} from "@/db/sema";
import { tablolariBosalt } from "@/db/test-temizlik";
import { baglantiyiKapat, getDb } from "@/lib/db";
import { gununSlotlari } from "@/lib/musaitlik-sorgu";
import { getHalkaAcikDb } from "@/lib/scoped-db";
import { yerelDenUtc } from "@/lib/zaman";

// Motorun kendisi saf ve ayri sinaniyor (musaitlik.test.ts). Buradaki is,
// GERCEK veriyle kurulan sorgunun dogru olmasi: hangi personel, hangi
// randevular, hangi izinler motora giriyor?
//
// Ozellikle IDOR: bu yol OTURUMSUZ ve halka acik. Kiraci slug'dan cozuluyor;
// bir salonun sayfasindan baska bir salonun doluluk takvimi gorunmemeli.

const ISTANBUL = "Europe/Istanbul";
const SALI = { yil: 2026, ay: 9, gun: 1 };
/// Sali sabah 09:00, yani listeler hep gelecekte.
const SIMDI = new Date("2026-08-25T06:00:00Z");

type Kurulum = {
  isletmeId: string;
  slug: string;
  personelId: string;
  hizmetId: string;
  musteriId: string;
};

async function isletmeKur(
  slug: string,
  { personelAdi = "Tek Personel" } = {},
): Promise<Kurulum> {
  const db = await getDb();

  const [i] = await db
    .insert(isletme)
    .values({ ad: `${slug} salonu`, slug, saatDilimi: ISTANBUL })
    .returning();

  const [p] = await db
    .insert(personel)
    .values({ isletmeId: i.id, ad: personelAdi, sira: 0 })
    .returning();

  const [h] = await db
    .insert(hizmet)
    .values({ isletmeId: i.id, ad: "Saç kesimi", sureDk: 60 })
    .returning();

  const [m] = await db
    .insert(musteri)
    .values({ isletmeId: i.id, ad: "Müşteri", telefon: `532${slug.length}111111` })
    .returning();

  // Sali 09:00-18:00.
  await db.insert(calismaSaati).values({
    isletmeId: i.id,
    personelId: p.id,
    haftaninGunu: 2,
    baslangicDk: 540,
    bitisDk: 1080,
  });

  return {
    isletmeId: i.id,
    slug,
    personelId: p.id,
    hizmetId: h.id,
    musteriId: m.id,
  };
}

async function randevuYaz(
  k: Kurulum,
  baslangicDk: number,
  bitisDk: number,
  durum: "BEKLIYOR" | "ONAYLI" | "IPTAL" | "GELMEDI",
  token: string,
  personelId = k.personelId,
) {
  const db = await getDb();
  await db.insert(randevu).values({
    isletmeId: k.isletmeId,
    personelId,
    hizmetId: k.hizmetId,
    musteriId: k.musteriId,
    baslangic: yerelDenUtc(ISTANBUL, SALI, baslangicDk),
    bitis: yerelDenUtc(ISTANBUL, SALI, bitisDk),
    durum,
    iptalToken: token,
  });
}

/// Slotlari "09:00" gibi yerel saatlere cevirir.
function saatler(slotlar: { baslangic: Date }[]): string[] {
  return slotlar.map((s) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ISTANBUL,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(s.baslangic),
  );
}

async function slotlariAl(k: Kurulum, personelId?: string) {
  const db = await getHalkaAcikDb(k.slug);
  if (!db) throw new Error("isletme bulunamadi");

  return gununSlotlari({
    db,
    isletme: db.isletme,
    hizmetId: k.hizmetId,
    hizmetSuresiDk: 60,
    tarih: SALI,
    simdi: SIMDI,
    personelId,
  });
}

beforeEach(async () => {
  await tablolariBosalt();
});

afterAll(async () => {
  await baglantiyiKapat();
});

describe("temel akis", () => {
  test("calisma saatlerinden slotlar uretiliyor", async () => {
    const a = await isletmeKur("a");
    const slotlar = await slotlariAl(a);

    // Varsayilan slot araligi 15 dk; 09:00-18:00 arasi 60 dakikalik hizmet.
    expect(saatler(slotlar)[0]).toBe("09:00");
    expect(saatler(slotlar).at(-1)).toBe("17:00");
    expect(slotlar.every((s) => s.personelId === a.personelId)).toBe(true);
  });

  test("pasif isletmenin sayfasi acilmiyor", async () => {
    const a = await isletmeKur("a");
    const db = await getDb();
    await db.update(isletme).set({ aktif: false });

    expect(await getHalkaAcikDb(a.slug)).toBeNull();
  });
});

describe("dolu randevular", () => {
  test("ONAYLI randevu sloti kapatiyor", async () => {
    const a = await isletmeKur("a");
    await randevuYaz(a, 600, 660, "ONAYLI", "t1"); // 10:00-11:00

    const liste = saatler(await slotlariAl(a));
    expect(liste).not.toContain("10:00");
    expect(liste).not.toContain("10:15");
    expect(liste).toContain("11:00");
  });

  test("BEKLIYOR randevu da kapatiyor", async () => {
    const a = await isletmeKur("a");
    await randevuYaz(a, 600, 660, "BEKLIYOR", "t1");

    expect(saatler(await slotlariAl(a))).not.toContain("10:00");
  });

  test("IPTAL ve GELMEDI saati BOSALTIYOR", async () => {
    // Veritabanindaki EXCLUDE kisitinin WHERE kosuluyla ayni kume. Ikisi
    // ayrisirsa motor "bos" dedigi bir sloti kisit reddeder.
    const a = await isletmeKur("a");
    await randevuYaz(a, 600, 660, "IPTAL", "t1");
    await randevuYaz(a, 720, 780, "GELMEDI", "t2");

    const liste = saatler(await slotlariAl(a));
    expect(liste).toContain("10:00");
    expect(liste).toContain("12:00");
  });

  test("gece yarisini asan randevu da yakalaniyor", async () => {
    // Pencere "icinde olanlar" degil "kesisenler" olarak sorgulaniyor; aksi
    // halde onceki gunden tasan bir randevu gorunmezdi.
    const a = await isletmeKur("a");
    const db = await getDb();
    await db.insert(randevu).values({
      isletmeId: a.isletmeId,
      personelId: a.personelId,
      hizmetId: a.hizmetId,
      musteriId: a.musteriId,
      // 31 Agustos 23:00 -> 1 Eylul 10:00 (yerel).
      baslangic: yerelDenUtc(ISTANBUL, { yil: 2026, ay: 8, gun: 31 }, 1380),
      bitis: yerelDenUtc(ISTANBUL, SALI, 600),
      durum: "ONAYLI",
      iptalToken: "gece",
    });

    const liste = saatler(await slotlariAl(a));
    expect(liste).not.toContain("09:00");
    expect(liste).toContain("10:00");
  });
});

describe("kapali araliklar", () => {
  test("personel izni sloti kapatiyor", async () => {
    const a = await isletmeKur("a");
    const db = await getDb();
    await db.insert(kapali).values({
      isletmeId: a.isletmeId,
      personelId: a.personelId,
      baslangic: yerelDenUtc(ISTANBUL, SALI, 540),
      bitis: yerelDenUtc(ISTANBUL, SALI, 720),
      aciklama: "İzinli",
    });

    const liste = saatler(await slotlariAl(a));
    expect(liste).not.toContain("09:00");
    expect(liste).toContain("12:00");
  });

  test("personelsiz kapali kayit HERKESI kapatiyor", async () => {
    // personelId NULL = butun isletme kapali (resmi tatil).
    const a = await isletmeKur("a");
    const db = await getDb();
    await db.insert(kapali).values({
      isletmeId: a.isletmeId,
      personelId: null,
      baslangic: yerelDenUtc(ISTANBUL, SALI, 0),
      bitis: yerelDenUtc(ISTANBUL, SALI, 1440),
      aciklama: "Resmî tatil",
    });

    expect(await slotlariAl(a)).toEqual([]);
  });

  test("gunu kapsayan cok gunlu tatil yakalaniyor", async () => {
    const a = await isletmeKur("a");
    const db = await getDb();
    await db.insert(kapali).values({
      isletmeId: a.isletmeId,
      personelId: null,
      baslangic: yerelDenUtc(ISTANBUL, { yil: 2026, ay: 8, gun: 28 }, 0),
      bitis: yerelDenUtc(ISTANBUL, { yil: 2026, ay: 9, gun: 5 }, 0),
      aciklama: "Yıllık izin",
    });

    expect(await slotlariAl(a)).toEqual([]);
  });
});

describe("personel secimi", () => {
  test("eslemesi olmayan personel TUM hizmetleri veriyor", async () => {
    // personel_hizmet bos olmasi "hicbiri" degil "hepsi" demek.
    const a = await isletmeKur("a");
    expect((await slotlariAl(a)).length).toBeGreaterThan(0);
  });

  test("eslemesi olan personel yalnizca kendi hizmetlerini veriyor", async () => {
    const a = await isletmeKur("a");
    const db = await getDb();

    const [baskaHizmet] = await db
      .insert(hizmet)
      .values({ isletmeId: a.isletmeId, ad: "Boya", sureDk: 120 })
      .returning();

    // Personel yalnizca "Boya" veriyor; "Saç kesimi" icin musait degil.
    await db.insert(personelHizmet).values({
      isletmeId: a.isletmeId,
      personelId: a.personelId,
      hizmetId: baskaHizmet.id,
    });

    expect(await slotlariAl(a)).toEqual([]);
  });

  test("iki personel varken ayni saat TEK secenek olarak donuyor", async () => {
    const a = await isletmeKur("a");
    const db = await getDb();

    const [ikinci] = await db
      .insert(personel)
      .values({ isletmeId: a.isletmeId, ad: "İkinci Personel", sira: 1 })
      .returning();
    await db.insert(calismaSaati).values({
      isletmeId: a.isletmeId,
      personelId: ikinci.id,
      haftaninGunu: 2,
      baslangicDk: 540,
      bitisDk: 1080,
    });

    const liste = saatler(await slotlariAl(a));
    expect(new Set(liste).size).toBe(liste.length);
    // Sirasi 0 olan personel once geliyor.
    expect((await slotlariAl(a))[0].personelId).toBe(a.personelId);
  });

  test("biri dolu digeri bossa saat yine aciik", async () => {
    const a = await isletmeKur("a");
    const db = await getDb();

    const [ikinci] = await db
      .insert(personel)
      .values({ isletmeId: a.isletmeId, ad: "İkinci Personel", sira: 1 })
      .returning();
    await db.insert(calismaSaati).values({
      isletmeId: a.isletmeId,
      personelId: ikinci.id,
      haftaninGunu: 2,
      baslangicDk: 540,
      bitisDk: 1080,
    });

    // Ilk personelin 10:00'i dolu.
    await randevuYaz(a, 600, 660, "ONAYLI", "t1");

    const slotlar = await slotlariAl(a);
    const onda = slotlar.find(
      (s) => s.baslangic.getTime() === yerelDenUtc(ISTANBUL, SALI, 600).getTime(),
    );

    expect(onda).toBeDefined();
    expect(onda?.personelId).toBe(ikinci.id);
  });

  test("belirli personel istenince yalnizca o deneniyor", async () => {
    const a = await isletmeKur("a");
    const db = await getDb();

    const [ikinci] = await db
      .insert(personel)
      .values({ isletmeId: a.isletmeId, ad: "İkinci Personel", sira: 1 })
      .returning();
    // Ikincinin calisma saati YOK.

    expect(await slotlariAl(a, ikinci.id)).toEqual([]);
    expect((await slotlariAl(a, a.personelId)).length).toBeGreaterThan(0);
  });

  test("pasif personel listede yok", async () => {
    const a = await isletmeKur("a");
    const db = await getDb();
    await db.update(personel).set({ aktif: false });

    expect(await slotlariAl(a)).toEqual([]);
  });
});

describe("IDOR - halka acik yol", () => {
  test("bir salonun sayfasi digerinin randevularini gormuyor", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");

    // b'nin butun gunu dolu.
    await randevuYaz(b, 540, 1080, "ONAYLI", "b1");

    // a'nin sayfasi bundan etkilenmemeli.
    const liste = saatler(await slotlariAl(a));
    expect(liste).toContain("09:00");
    expect(liste.length).toBeGreaterThan(30);
  });

  test("baska isletmenin hizmet id'si bulunamiyor", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");

    const db = await getHalkaAcikDb(a.slug);
    expect(await db!.hizmetGetir(b.hizmetId)).toBeNull();
  });

  test("baska isletmenin personel id'si slot uretmiyor", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");

    // b'nin personel id'si a'nin sayfasinda istense bile aday listesinde yok.
    expect(await slotlariAl(a, b.personelId)).toEqual([]);
  });

  test("baska isletmenin izni bizim saatlerimizi kapatmiyor", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");

    const db = await getDb();
    await db.insert(kapali).values({
      isletmeId: b.isletmeId,
      personelId: null,
      baslangic: yerelDenUtc(ISTANBUL, SALI, 0),
      bitis: yerelDenUtc(ISTANBUL, SALI, 1440),
    });

    expect((await slotlariAl(a)).length).toBeGreaterThan(0);
  });

  test("baska isletmenin calisma saati bizim gunumuzu acmiyor", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");

    const db = await getDb();
    // a'nin calisma saatlerini sil; b'ninkiler duruyor.
    await db.delete(calismaSaati).where(eq(calismaSaati.isletmeId, a.isletmeId));

    expect(await slotlariAl(a)).toEqual([]);
    expect((await slotlariAl(b)).length).toBeGreaterThan(0);
  });
});
