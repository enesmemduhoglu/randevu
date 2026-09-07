import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import {
  hizmet,
  isletme,
  kullanici,
  musteri,
  personel,
  randevu,
} from "@/db/sema";
import { tablolariBosalt } from "@/db/test-temizlik";
import { baglantiyiKapat, getDb } from "@/lib/db";
import { getScopedDb, type IsletmeOturumu } from "@/lib/scoped-db";

// Faz H2 (ikinci yari): panelin musteri listesi, gecmisi ve duzenlemesi.
//
// BU DOSYANIN KILITLEDIGI BES SEY:
//   1. IDOR - baska isletmenin musterisi listede GORUNMUYOR, detayi `null`,
//      guncellemesi 0 satir, kisit kaldirmasi "yok". Musteri kaydinda
//      `isletmeId` var ama sorguya yazilmayi UNUTMAK mumkun; kilit burasi.
//   2. Arama - ad VE telefon, telefondaki bosluklar/parantezler yok sayilarak.
//   3. Joker kacirma - tek bir "%" butun musterileri getirmiyor.
//   4. Sayimlar - randevu sayisi ve son randevu tarihi satir basina dogru
//      (LEFT JOIN + GROUP BY yanlis yazilirsa sessizce sismis sayilar uretir).
//   5. Kisit kaldirmanin UC sonucu - tamam / zaten yok / musteri yok.
//
// Kurulum verisi kasten HAM `db` ile yaziliyor: test edilen katmana guvenmesin.

type Kurulum = {
  isletmeId: string;
  oturum: IsletmeOturumu;
  personelId: string;
  hizmetId: string;
};

function saat(gun: number, h: number): Date {
  return new Date(Date.UTC(2026, 2, gun, h, 0));
}

let tokenSayaci = 0;
function token(): string {
  tokenSayaci += 1;
  return `musteri-token-${tokenSayaci}`;
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

async function musteriKur(
  k: Kurulum,
  veri: { ad: string; telefon: string; eposta?: string | null; not?: string | null; kisitBitis?: Date | null },
): Promise<string> {
  const db = await getDb();
  const [m] = await db
    .insert(musteri)
    .values({
      isletmeId: k.isletmeId,
      ad: veri.ad,
      telefon: veri.telefon,
      eposta: veri.eposta ?? null,
      not: veri.not ?? null,
      randevuKisitiBitis: veri.kisitBitis ?? null,
    })
    .returning();
  return m.id;
}

async function randevuKur(
  k: Kurulum,
  musteriId: string,
  baslangic: Date,
  durum: "BEKLIYOR" | "ONAYLI" | "IPTAL" | "TAMAMLANDI" | "GELMEDI" = "ONAYLI",
): Promise<string> {
  const db = await getDb();
  const [r] = await db
    .insert(randevu)
    .values({
      isletmeId: k.isletmeId,
      personelId: k.personelId,
      hizmetId: k.hizmetId,
      musteriId,
      baslangic,
      bitis: new Date(baslangic.getTime() + 30 * 60_000),
      durum,
      iptalToken: token(),
    })
    .returning();
  return r.id;
}

let a: Kurulum;
let b: Kurulum;

beforeEach(async () => {
  await tablolariBosalt();
  a = await isletmeKur("a");
  b = await isletmeKur("b");
});

afterAll(async () => {
  await baglantiyiKapat();
});

describe("musterileriListele", () => {
  test("randevu sayisi ve son randevu satir basina dogru", async () => {
    const db = await getScopedDb(a.oturum);

    const ayse = await musteriKur(a, { ad: "Ayşe Yılmaz", telefon: "5321112233" });
    const mehmet = await musteriKur(a, { ad: "Mehmet Kaya", telefon: "5324445566" });

    await randevuKur(a, ayse, saat(10, 9));
    await randevuKur(a, ayse, saat(12, 14));
    await randevuKur(a, mehmet, saat(11, 10));

    const { satirlar, dahaVar } = await db.musterileriListele();

    expect(dahaVar).toBe(false);
    // Son randevusu en yeni olan ustte: Ayse 12 Mart, Mehmet 11 Mart.
    expect(satirlar.map((m) => m.ad)).toEqual(["Ayşe Yılmaz", "Mehmet Kaya"]);
    expect(satirlar[0].randevuSayisi).toBe(2);
    expect(satirlar[1].randevuSayisi).toBe(1);
    expect(satirlar[0].sonRandevu?.getTime()).toBe(saat(12, 14).getTime());
  });

  test("randevusu olmayan musteri de listede, en sonda", async () => {
    const db = await getScopedDb(a.oturum);

    const yeni = await musteriKur(a, { ad: "Zeynep Ak", telefon: "5327778899" });
    const eski = await musteriKur(a, { ad: "Ayşe Yılmaz", telefon: "5321112233" });
    await randevuKur(a, eski, saat(10, 9));

    const { satirlar } = await db.musterileriListele();

    expect(satirlar.map((m) => m.id)).toEqual([eski, yeni]);
    expect(satirlar[1].randevuSayisi).toBe(0);
    expect(satirlar[1].sonRandevu).toBeNull();
  });

  test("ad ile arama", async () => {
    const db = await getScopedDb(a.oturum);
    await musteriKur(a, { ad: "Ayşe Yılmaz", telefon: "5321112233" });
    await musteriKur(a, { ad: "Mehmet Kaya", telefon: "5324445566" });

    const { satirlar } = await db.musterileriListele({ arama: "yılmaz" });

    expect(satirlar.map((m) => m.ad)).toEqual(["Ayşe Yılmaz"]);
  });

  test("telefon ile arama: bosluk ve parantez yok sayiliyor", async () => {
    const db = await getScopedDb(a.oturum);
    await musteriKur(a, { ad: "Ayşe Yılmaz", telefon: "5321112233" });
    await musteriKur(a, { ad: "Mehmet Kaya", telefon: "5324445566" });

    // Kullanici numarayi bosluklu yaziyor; veritabaninda yalnizca rakam var.
    const { satirlar } = await db.musterileriListele({ arama: "(532) 444" });

    expect(satirlar.map((m) => m.ad)).toEqual(["Mehmet Kaya"]);
  });

  test("tek bir % butun musterileri getirmiyor", async () => {
    const db = await getScopedDb(a.oturum);
    await musteriKur(a, { ad: "Ayşe Yılmaz", telefon: "5321112233" });
    await musteriKur(a, { ad: "Mehmet Kaya", telefon: "5324445566" });

    const { satirlar } = await db.musterileriListele({ arama: "%" });

    // Joker kacirilmasaydi ikisi de donerdi.
    expect(satirlar).toHaveLength(0);
  });

  test("IDOR: baska isletmenin musterisi listede yok", async () => {
    await musteriKur(a, { ad: "Ayşe Yılmaz", telefon: "5321112233" });
    // AYNI numara, baska isletme - kayitlar ayri satirlar.
    await musteriKur(b, { ad: "Ayşe Yılmaz", telefon: "5321112233" });

    const aDb = await getScopedDb(a.oturum);
    const bDb = await getScopedDb(b.oturum);

    expect((await aDb.musterileriListele()).satirlar).toHaveLength(1);
    expect((await bDb.musterileriListele()).satirlar).toHaveLength(1);
  });

  test("baska isletmenin randevusu sayima girmiyor", async () => {
    const ayse = await musteriKur(a, { ad: "Ayşe Yılmaz", telefon: "5321112233" });
    await randevuKur(a, ayse, saat(10, 9));

    const bMusteri = await musteriKur(b, { ad: "Ayşe Yılmaz", telefon: "5321112233" });
    await randevuKur(b, bMusteri, saat(11, 9));
    await randevuKur(b, bMusteri, saat(12, 9));

    const db = await getScopedDb(a.oturum);
    const { satirlar } = await db.musterileriListele();

    expect(satirlar[0].randevuSayisi).toBe(1);
  });
});

describe("musteriGetir", () => {
  test("kendi musterisi notuyla birlikte donuyor", async () => {
    const id = await musteriKur(a, {
      ad: "Ayşe Yılmaz",
      telefon: "5321112233",
      not: "Peşin ödemeyi tercih ediyor",
    });
    await randevuKur(a, id, saat(10, 9));

    const db = await getScopedDb(a.oturum);
    const kayit = await db.musteriGetir(id);

    expect(kayit?.ad).toBe("Ayşe Yılmaz");
    expect(kayit?.not).toBe("Peşin ödemeyi tercih ediyor");
    expect(kayit?.randevuSayisi).toBe(1);
  });

  test("IDOR: baska isletmenin musterisi null", async () => {
    const bMusteri = await musteriKur(b, { ad: "Yabancı", telefon: "5329998877" });

    const db = await getScopedDb(a.oturum);

    expect(await db.musteriGetir(bMusteri)).toBeNull();
  });

  test("hic olmayan id ile yabanci id ayni cevabi veriyor", async () => {
    const bMusteri = await musteriKur(b, { ad: "Yabancı", telefon: "5329998877" });
    const db = await getScopedDb(a.oturum);

    const yabanci = await db.musteriGetir(bMusteri);
    const yok = await db.musteriGetir("00000000-0000-4000-8000-000000000000");

    expect(yabanci).toBe(yok);
  });
});

describe("musteriRandevulariniListele", () => {
  test("yalnizca o musterinin randevulari, en yeni ustte", async () => {
    const ayse = await musteriKur(a, { ad: "Ayşe Yılmaz", telefon: "5321112233" });
    const mehmet = await musteriKur(a, { ad: "Mehmet Kaya", telefon: "5324445566" });

    await randevuKur(a, ayse, saat(10, 9));
    await randevuKur(a, ayse, saat(12, 14));
    await randevuKur(a, mehmet, saat(11, 10));

    const db = await getScopedDb(a.oturum);
    const gecmis = await db.musteriRandevulariniListele(ayse);

    expect(gecmis).toHaveLength(2);
    expect(gecmis[0].baslangic.getTime()).toBe(saat(12, 14).getTime());
    expect(gecmis[1].baslangic.getTime()).toBe(saat(10, 9).getTime());
  });

  test("IPTAL ve GELMEDI de donuyor", async () => {
    const ayse = await musteriKur(a, { ad: "Ayşe Yılmaz", telefon: "5321112233" });
    await randevuKur(a, ayse, saat(10, 9), "GELMEDI");
    await randevuKur(a, ayse, saat(11, 9), "IPTAL");

    const db = await getScopedDb(a.oturum);
    const gecmis = await db.musteriRandevulariniListele(ayse);

    // Musteri gecmisinin asil sorusu zaten bu: "kac kez gelmedi".
    expect(gecmis.map((r) => r.durum).sort()).toEqual(["GELMEDI", "IPTAL"]);
  });

  test("IDOR: baska isletmenin musteri id'si bos liste donduruyor", async () => {
    const bMusteri = await musteriKur(b, { ad: "Yabancı", telefon: "5329998877" });
    await randevuKur(b, bMusteri, saat(10, 9));

    const db = await getScopedDb(a.oturum);

    expect(await db.musteriRandevulariniListele(bMusteri)).toHaveLength(0);
  });
});

describe("musteriGuncelle", () => {
  test("ad, e-posta ve not degisiyor", async () => {
    const id = await musteriKur(a, { ad: "Ahmet", telefon: "5321112233" });
    const db = await getScopedDb(a.oturum);

    const etkilenen = await db.musteriGuncelle(id, {
      ad: "Ahmet Yılmaz",
      eposta: "ahmet@ornek.test",
      not: "Cumartesi geliyor",
    });

    expect(etkilenen).toBe(1);

    const kayit = await db.musteriGetir(id);
    expect(kayit?.ad).toBe("Ahmet Yılmaz");
    expect(kayit?.eposta).toBe("ahmet@ornek.test");
    expect(kayit?.not).toBe("Cumartesi geliyor");
  });

  test("telefon DEGISMIYOR: kapinin yuzeyinde yok", async () => {
    const id = await musteriKur(a, { ad: "Ahmet", telefon: "5321112233" });
    const db = await getScopedDb(a.oturum);

    await db.musteriGuncelle(id, { ad: "Ahmet Yılmaz", eposta: null, not: null });

    const ham = await getDb();
    const [kayit] = await ham
      .select({ telefon: musteri.telefon })
      .from(musteri)
      .where(eq(musteri.id, id));

    expect(kayit.telefon).toBe("5321112233");
  });

  test("IDOR: baska isletmenin musterisi 0 satir", async () => {
    const bMusteri = await musteriKur(b, { ad: "Yabancı", telefon: "5329998877" });
    const db = await getScopedDb(a.oturum);

    const etkilenen = await db.musteriGuncelle(bMusteri, {
      ad: "Ele Geçirildi",
      eposta: null,
      not: null,
    });

    expect(etkilenen).toBe(0);

    // Yabanci kayit gercekten DOKUNULMAMIS olmali - 0 donmek yetmez.
    const ham = await getDb();
    const [kayit] = await ham
      .select({ ad: musteri.ad })
      .from(musteri)
      .where(eq(musteri.id, bMusteri));

    expect(kayit.ad).toBe("Yabancı");
  });
});

describe("musteriKisitiniKaldir", () => {
  const yarin = new Date(Date.now() + 24 * 60 * 60_000);

  test("kisitli musteride kisit siliniyor", async () => {
    const id = await musteriKur(a, {
      ad: "Ayşe Yılmaz",
      telefon: "5321112233",
      kisitBitis: yarin,
    });

    const db = await getScopedDb(a.oturum);
    const sonuc = await db.musteriKisitiniKaldir(id);

    expect(sonuc.durum).toBe("tamam");
    expect((await db.musteriGetir(id))?.randevuKisitiBitis).toBeNull();
  });

  test("kisiti olmayan musteri 'kisit-yok' donduruyor", async () => {
    const id = await musteriKur(a, { ad: "Ayşe Yılmaz", telefon: "5321112233" });
    const db = await getScopedDb(a.oturum);

    expect((await db.musteriKisitiniKaldir(id)).durum).toBe("kisit-yok");
  });

  test("ikinci kaldirma 'kisit-yok' donduruyor", async () => {
    const id = await musteriKur(a, {
      ad: "Ayşe Yılmaz",
      telefon: "5321112233",
      kisitBitis: yarin,
    });
    const db = await getScopedDb(a.oturum);

    expect((await db.musteriKisitiniKaldir(id)).durum).toBe("tamam");
    // Ayni anda iki sekmeden kaldirilirsa ikincisinin gordugu sey bu.
    expect((await db.musteriKisitiniKaldir(id)).durum).toBe("kisit-yok");
  });

  test("IDOR: baska isletmenin musterisi 'yok' ve kisiti duruyor", async () => {
    const bMusteri = await musteriKur(b, {
      ad: "Yabancı",
      telefon: "5329998877",
      kisitBitis: yarin,
    });

    const db = await getScopedDb(a.oturum);
    expect((await db.musteriKisitiniKaldir(bMusteri)).durum).toBe("yok");

    const bDb = await getScopedDb(b.oturum);
    expect((await bDb.musteriGetir(bMusteri))?.randevuKisitiBitis).not.toBeNull();
  });

  test("hic olmayan id de 'yok'", async () => {
    const db = await getScopedDb(a.oturum);
    const sonuc = await db.musteriKisitiniKaldir(
      "00000000-0000-4000-8000-000000000000",
    );
    expect(sonuc.durum).toBe("yok");
  });
});
