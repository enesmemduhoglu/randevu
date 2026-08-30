import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { calismaSaati, hizmet, isletme, kullanici, personel } from "@/db/sema";
import { tablolariBosalt } from "@/db/test-temizlik";
import { baglantiyiKapat, getDb } from "@/lib/db";
import { getScopedDb, type IsletmeOturumu } from "@/lib/scoped-db";

// Faz E'de gelen kapsamlarin IDOR testleri. Kurulus mantigi
// scoped-db.test.ts ile ayni: HER test en az iki isletme kuruyor ve birinin
// oturumuyla digerinin kaydina uzanmaya calisiyor.
//
// Ayri dosya cunku scoped-db.test.ts personel kapsamini anlatiyor ve iki
// konuyu tek dosyaya yigmak, bir gun birinin bozuldugunu gorunmez kilardi.

type Kurulum = {
  isletmeId: string;
  oturum: IsletmeOturumu;
  personelId: string;
};

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

  return {
    isletmeId: i.id,
    personelId: p.id,
    oturum: {
      kullaniciId: sahip.id,
      authUserId: sahip.authUserId,
      isletmeId: i.id,
      rol: "SAHIP",
    },
  };
}

/// Hizmeti kasten HAM db ile ekliyoruz: kurulum verisi test edilen katmana
/// guvenmesin.
async function hamHizmetEkle(isletmeId: string, ad: string, ekstra = {}) {
  const db = await getDb();
  const [kayit] = await db
    .insert(hizmet)
    .values({ isletmeId, ad, sureDk: 30, ...ekstra })
    .returning();
  return kayit;
}

async function hamHizmetOku(id: string) {
  const db = await getDb();
  const [kayit] = await db.select().from(hizmet).where(eq(hizmet.id, id)).limit(1);
  return kayit ?? null;
}

beforeEach(async () => {
  await tablolariBosalt();
});

afterAll(async () => {
  await baglantiyiKapat();
});

describe("hizmet kapsami", () => {
  test("listede yalnizca kendi hizmetleri var", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");
    await hamHizmetEkle(a.isletmeId, "A hizmeti");
    await hamHizmetEkle(b.isletmeId, "B hizmeti");

    const db = await getScopedDb(a.oturum);
    const liste = await db.hizmetleriListele();

    expect(liste).toHaveLength(1);
    expect(liste[0].ad).toBe("A hizmeti");
  });

  test("pasif hizmet varsayilan listede yok, istenince geliyor", async () => {
    const a = await isletmeKur("a");
    await hamHizmetEkle(a.isletmeId, "Aktif");
    await hamHizmetEkle(a.isletmeId, "Pasif", { aktif: false });

    const db = await getScopedDb(a.oturum);
    expect(await db.hizmetleriListele()).toHaveLength(1);
    expect(await db.hizmetleriListele({ pasifDahil: true })).toHaveLength(2);
  });

  test("IDOR: baska isletmenin hizmeti getirilemiyor", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");
    const bHizmet = await hamHizmetEkle(b.isletmeId, "B hizmeti");

    const db = await getScopedDb(a.oturum);
    expect(await db.hizmetGetir(bHizmet.id)).toBeNull();
  });

  test("IDOR: baska isletmenin hizmeti guncellenemiyor", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");
    const bHizmet = await hamHizmetEkle(b.isletmeId, "B hizmeti");

    const db = await getScopedDb(a.oturum);
    const etkilenen = await db.hizmetGuncelle(bHizmet.id, { ad: "Ele gecirildi" });

    // 0 donmeli - ve kayit gercekten degismemis olmali. Ikinci kontrol sart:
    // donus degerine bakip yaziyi dogrulamamak, sizintiyi gorunmez kilardi.
    expect(etkilenen).toBe(0);
    expect((await hamHizmetOku(bHizmet.id))?.ad).toBe("B hizmeti");
  });

  test("IDOR: baska isletmenin hizmeti pasiflenemiyor", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");
    const bHizmet = await hamHizmetEkle(b.isletmeId, "B hizmeti");

    const db = await getScopedDb(a.oturum);
    expect(await db.hizmetPasifleStir(bHizmet.id)).toBe(0);
    expect((await hamHizmetOku(bHizmet.id))?.aktif).toBe(true);
  });

  test("eklenen hizmet oturumun isletmesine yaziliyor", async () => {
    const a = await isletmeKur("a");
    await isletmeKur("b");

    const db = await getScopedDb(a.oturum);
    const yeni = await db.hizmetEkle({ ad: "Saç kesimi", sureDk: 45, fiyatKurus: 35000 });

    // Cagiran taraf isletmeId VEREMIYOR; filtre kapanis degiskeni.
    expect((await hamHizmetOku(yeni.id))?.isletmeId).toBe(a.isletmeId);
  });
});

describe("personel-hizmet kapsami", () => {
  test("kendi personeline kendi hizmetleri baglaniyor", async () => {
    const a = await isletmeKur("a");
    const h1 = await hamHizmetEkle(a.isletmeId, "Bir");
    const h2 = await hamHizmetEkle(a.isletmeId, "Iki");

    const db = await getScopedDb(a.oturum);
    const sonuc = await db.personelHizmetleriniYaz(a.personelId, [h1.id, h2.id]);
    expect(sonuc.durum).toBe("tamam");

    const bagli = await db.personelHizmetleriniListele(a.personelId);
    expect(bagli.map((b) => b.hizmetId).sort()).toEqual([h1.id, h2.id].sort());
  });

  test("toplu yazma onceki kumeyi degistiriyor", async () => {
    const a = await isletmeKur("a");
    const h1 = await hamHizmetEkle(a.isletmeId, "Bir");
    const h2 = await hamHizmetEkle(a.isletmeId, "Iki");

    const db = await getScopedDb(a.oturum);
    await db.personelHizmetleriniYaz(a.personelId, [h1.id, h2.id]);
    await db.personelHizmetleriniYaz(a.personelId, [h2.id]);

    const bagli = await db.personelHizmetleriniListele(a.personelId);
    expect(bagli).toHaveLength(1);
    expect(bagli[0].hizmetId).toBe(h2.id);
  });

  test("IDOR: baska isletmenin personeline yazilamiyor", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");
    const aHizmet = await hamHizmetEkle(a.isletmeId, "A hizmeti");

    const db = await getScopedDb(a.oturum);
    const sonuc = await db.personelHizmetleriniYaz(b.personelId, [aHizmet.id]);

    expect(sonuc.durum).toBe("yok");
  });

  test("IDOR: baska isletmenin hizmeti baglanamiyor", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");
    const bHizmet = await hamHizmetEkle(b.isletmeId, "B hizmeti");

    const db = await getScopedDb(a.oturum);
    const sonuc = await db.personelHizmetleriniYaz(a.personelId, [bHizmet.id]);

    // Sessizce atlanmiyor, REDDEDILIYOR: yabanci id'yi gormezden gelmek
    // kullaniciya "kaydettim" deyip yarim bir kume birakmak olurdu.
    expect(sonuc.durum).toBe("gecersiz-hizmet");
    expect(await db.personelHizmetleriniListele(a.personelId)).toHaveLength(0);
  });
});

describe("calisma saati kapsami", () => {
  const HAFTA = [
    { haftaninGunu: 1, baslangicDk: 540, bitisDk: 720 },
    { haftaninGunu: 1, baslangicDk: 780, bitisDk: 1080 },
  ];

  test("haftalik duzen yaziliyor ve geri okunuyor", async () => {
    const a = await isletmeKur("a");
    const db = await getScopedDb(a.oturum);

    expect((await db.calismaSaatleriniYaz(a.personelId, HAFTA)).durum).toBe("tamam");

    const liste = await db.calismaSaatleriniListele(a.personelId);
    expect(liste).toHaveLength(2);
    // Ogle arasi: ayni gune iki satir, baslangica gore sirali.
    expect(liste[0].baslangicDk).toBe(540);
    expect(liste[1].baslangicDk).toBe(780);
  });

  test("yeniden yazma eskisini siliyor", async () => {
    const a = await isletmeKur("a");
    const db = await getScopedDb(a.oturum);

    await db.calismaSaatleriniYaz(a.personelId, HAFTA);
    await db.calismaSaatleriniYaz(a.personelId, [
      { haftaninGunu: 2, baslangicDk: 600, bitisDk: 1020 },
    ]);

    const liste = await db.calismaSaatleriniListele(a.personelId);
    expect(liste).toHaveLength(1);
    expect(liste[0].haftaninGunu).toBe(2);
  });

  test("bos liste gunleri temizliyor", async () => {
    const a = await isletmeKur("a");
    const db = await getScopedDb(a.oturum);

    await db.calismaSaatleriniYaz(a.personelId, HAFTA);
    await db.calismaSaatleriniYaz(a.personelId, []);

    expect(await db.calismaSaatleriniListele(a.personelId)).toHaveLength(0);
  });

  test("IDOR: baska isletmenin personeline calisma saati yazilamiyor", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");

    const db = await getScopedDb(a.oturum);
    const sonuc = await db.calismaSaatleriniYaz(b.personelId, HAFTA);

    expect(sonuc.durum).toBe("yok");

    const ham = await getDb();
    expect(
      await ham
        .select()
        .from(calismaSaati)
        .where(eq(calismaSaati.personelId, b.personelId)),
    ).toHaveLength(0);
  });

  test("IDOR: liste baska isletmenin saatlerini gostermiyor", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");

    const bDb = await getScopedDb(b.oturum);
    await bDb.calismaSaatleriniYaz(b.personelId, HAFTA);

    const aDb = await getScopedDb(a.oturum);
    expect(await aDb.calismaSaatleriniListele()).toHaveLength(0);
    // Personel id'sini bilse bile:
    expect(await aDb.calismaSaatleriniListele(b.personelId)).toHaveLength(0);
  });
});

describe("ayarlar kapsami", () => {
  test("kendi isletmesinin ayarlari guncelleniyor", async () => {
    const a = await isletmeKur("a");
    const db = await getScopedDb(a.oturum);

    expect(await db.ayarlariGuncelle({ ad: "Yeni Ad", slotAraligiDk: 30 })).toBe(1);

    const guncel = await db.isletmeyiGetir();
    expect(guncel?.ad).toBe("Yeni Ad");
    expect(guncel?.slotAraligiDk).toBe(30);
  });

  test("IDOR: ayar guncellemesi baska isletmeye dokunmuyor", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");

    const db = await getScopedDb(a.oturum);
    await db.ayarlariGuncelle({ ad: "Yeni Ad" });

    // Cagiran taraf hedef isletmeyi SECEMIYOR - metot parametre almiyor.
    // Yine de b'nin degismedigini bagimsiz dogruluyoruz.
    const ham = await getDb();
    const [bKayit] = await ham
      .select()
      .from(isletme)
      .where(eq(isletme.id, b.isletmeId));
    expect(bKayit.ad).toBe("b kuaforu");
  });
});
