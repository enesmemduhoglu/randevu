import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { hizmet, isletme, kullanici, musteri, personel, randevu } from "@/db/sema";
import { tablolariBosalt } from "@/db/test-temizlik";
import { baglantiyiKapat, getDb } from "@/lib/db";
import type { RandevuDurumu } from "@/lib/randevu-durum";
import {
  getHalkaAcikDb,
  getScopedDb,
  type IsletmeOturumu,
} from "@/lib/scoped-db";

// Faz H'de gelen panel takvimi kapsaminin testleri.
//
// NEDEN AYRI DOSYA: scoped-db-hizmet.test.ts hizmet ve calisma saati
// kapsamini anlatiyor; randevu kapsami bambaska bir yuzey - iki isletme, dort
// join ve durum gecisleri. Ikisini tek dosyaya yigmak, birinin bozuldugunu
// digerinin gurultusu icinde gorunmez kilardi.
//
// BU DOSYANIN KILITLEDIGI UC SEY:
//   1. IDOR - takvim yalnizca oturumun isletmesini gosteriyor, personel
//      suzgecine yabanci bir id verilse bile.
//   2. ARALIK SEMANTIGI - pencere KESISME ile sorgulaniyor ("icinde olma" ile
//      degil) ve sinirlar `[)` gibi davraniyor. Bu kural bozulursa gece
//      yarisini asan randevu takvimden kaybolur ama slotu doldurmaya devam
//      eder; kimse fark etmeden musaitlik yanlis gorunur.
//   3. DEGISMEZ 3 - durum degisimi kosullu UPDATE. Yarisan ikinci karar
//      kaybediyor ve terminal durumdan cikis yok.
//
// Kurulum verisi kasten HAM `db` ile yaziliyor: test edilen katmana
// guvenmesin. Randevuyu scoped-db ile eklemek, listeyi kendi yazdigi filtreyle
// dogrulamak olurdu.

type Kurulum = {
  isletmeId: string;
  oturum: IsletmeOturumu;
  personelId: string;
  hizmetId: string;
  musteriId: string;
};

/// Gunun sabit bir noktasi. Tarih UTC olarak kuruluyor cunku DEGISMEZ 7:
/// randevu zamanlari veritabaninda timestamptz ve bu katman saat dilimi
/// cevirmesi YAPMIYOR - o is zaman.ts'in.
function saat(h: number, dk = 0): Date {
  return new Date(Date.UTC(2026, 2, 10, h, dk));
}

/// Pencere: 09:00 - 12:00.
const ALT = saat(9);
const UST = saat(12);

/// iptal_token NOT NULL ve UNIQUE (sema: randevu_iptal_token_idx). Test
/// verisinde her randevuya farkli bir token gerekiyor, yoksa ikinci ekleme
/// benzersizlik ihlaliyle duser ve hata testin konusuyla ilgisiz gorunur.
let tokenSayaci = 0;
function token(): string {
  tokenSayaci += 1;
  return `test-token-${tokenSayaci}`;
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
    .values({
      isletmeId: i.id,
      ad: `${slug} hizmeti`,
      sureDk: 30,
      renk: "#aabbcc",
    })
    .returning();

  const [m] = await db
    .insert(musteri)
    .values({ isletmeId: i.id, ad: `${slug} musterisi`, telefon: "5551112233" })
    .returning();

  return {
    isletmeId: i.id,
    personelId: p.id,
    hizmetId: h.id,
    musteriId: m.id,
    oturum: {
      kullaniciId: sahip.id,
      authUserId: sahip.authUserId,
      isletmeId: i.id,
      rol: "SAHIP",
    },
  };
}

/// Ikinci personel: cakisma kisiti (DEGISMEZ 8) ayni personelin ustuste binen
/// iki AKTIF randevusuna izin vermiyor. Ayni saate iki randevu gereken
/// testlerde ikinci kisi kullaniliyor.
async function hamPersonelEkle(isletmeId: string, ad: string) {
  const db = await getDb();
  const [kayit] = await db
    .insert(personel)
    .values({ isletmeId, ad })
    .returning();
  return kayit;
}

async function hamRandevuEkle(
  k: Kurulum,
  veri: {
    baslangic: Date;
    bitis: Date;
    personelId?: string;
    durum?: RandevuDurumu;
    not?: string | null;
  },
) {
  const db = await getDb();
  const [kayit] = await db
    .insert(randevu)
    .values({
      isletmeId: k.isletmeId,
      personelId: veri.personelId ?? k.personelId,
      hizmetId: k.hizmetId,
      musteriId: k.musteriId,
      baslangic: veri.baslangic,
      bitis: veri.bitis,
      durum: veri.durum ?? "BEKLIYOR",
      not: veri.not ?? null,
      iptalToken: token(),
    })
    .returning();
  return kayit;
}

async function hamRandevuOku(id: string) {
  const db = await getDb();
  const [kayit] = await db
    .select()
    .from(randevu)
    .where(eq(randevu.id, id))
    .limit(1);
  return kayit ?? null;
}

beforeEach(async () => {
  await tablolariBosalt();
});

afterAll(async () => {
  await baglantiyiKapat();
});

describe("randevulariListele", () => {
  test("IDOR: listede yalnizca kendi isletmesinin randevulari var", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");
    await hamRandevuEkle(a, { baslangic: saat(10), bitis: saat(10, 30) });
    await hamRandevuEkle(b, { baslangic: saat(10), bitis: saat(10, 30) });

    const db = await getScopedDb(a.oturum);
    const liste = await db.randevulariListele(ALT, UST);

    expect(liste).toHaveLength(1);
    expect(liste[0].personelAd).toBe("a personeli");
  });

  test("tam ust sinirda BASLAYAN randevu listede yok", async () => {
    const a = await isletmeKur("a");
    await hamRandevuEkle(a, { baslangic: UST, bitis: saat(13) });

    const db = await getScopedDb(a.oturum);
    // baslangic < ust: esitlik disarida. Pencere ustunde baslayan randevu
    // SONRAKI pencerenin isi, yoksa iki gunde birden sayilirdi.
    expect(await db.randevulariListele(ALT, UST)).toHaveLength(0);
  });

  test("tam alt sinirda BITEN randevu listede yok - aralik [) gibi", async () => {
    const a = await isletmeKur("a");
    await hamRandevuEkle(a, { baslangic: saat(8), bitis: ALT });

    const db = await getScopedDb(a.oturum);
    // bitis > alt: esitlik disarida. Bitisik randevular cakisma degil
    // (EXCLUDE kisitinin '[)' araligiyla ayni kabul).
    expect(await db.randevulariListele(ALT, UST)).toHaveLength(0);
  });

  test("pencereyi KESEN randevu listede - once baslayip icinde bitiyor", async () => {
    const a = await isletmeKur("a");
    await hamRandevuEkle(a, { baslangic: saat(8), bitis: saat(9, 30) });

    const db = await getScopedDb(a.oturum);
    // Sorgu "icinde olma" olsaydi bu randevu hicbir pencerede gorunmezdi -
    // gece yarisini asan randevunun tam olarak dustugu tuzak.
    expect(await db.randevulariListele(ALT, UST)).toHaveLength(1);
  });

  test("personelId verilince yalnizca o personelin randevulari geliyor", async () => {
    const a = await isletmeKur("a");
    const ikinci = await hamPersonelEkle(a.isletmeId, "Ikinci kisi");
    await hamRandevuEkle(a, { baslangic: saat(10), bitis: saat(10, 30) });
    await hamRandevuEkle(a, {
      baslangic: saat(10),
      bitis: saat(10, 30),
      personelId: ikinci.id,
    });

    const db = await getScopedDb(a.oturum);
    expect(await db.randevulariListele(ALT, UST)).toHaveLength(2);

    const suzulmus = await db.randevulariListele(ALT, UST, {
      personelId: ikinci.id,
    });
    expect(suzulmus).toHaveLength(1);
    expect(suzulmus[0].personelId).toBe(ikinci.id);
  });

  test("IDOR: baska isletmenin personel id'si bos liste donuyor", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");
    await hamRandevuEkle(b, { baslangic: saat(10), bitis: saat(10, 30) });

    const db = await getScopedDb(a.oturum);
    // Personel suzgeci kiraci filtresinin YANINDA: yabanci id sorguyu
    // genisletmiyor, daraltiyor. Varligi da sizmiyor.
    expect(
      await db.randevulariListele(ALT, UST, { personelId: b.personelId }),
    ).toHaveLength(0);
  });

  test("IPTAL durumundaki randevu da listede - isletme iptali goruyor", async () => {
    const a = await isletmeKur("a");
    await hamRandevuEkle(a, {
      baslangic: saat(10),
      bitis: saat(10, 30),
      durum: "IPTAL",
    });

    const db = await getScopedDb(a.oturum);
    const liste = await db.randevulariListele(ALT, UST);

    // Filtreleme arayuzun isi; veri katmani karari kendi basina vermiyor.
    expect(liste).toHaveLength(1);
    expect(liste[0].durum).toBe("IPTAL");
  });

  test("join alanlari dolu geliyor - takvim hucresi tek sorguyla kuruluyor", async () => {
    const a = await isletmeKur("a");
    await hamRandevuEkle(a, { baslangic: saat(10), bitis: saat(10, 30) });

    const db = await getScopedDb(a.oturum);
    const [kayit] = await db.randevulariListele(ALT, UST);

    expect(kayit.hizmetAd).toBe("a hizmeti");
    expect(kayit.hizmetSureDk).toBe(30);
    expect(kayit.hizmetRenk).toBe("#aabbcc");
    expect(kayit.personelAd).toBe("a personeli");
    expect(kayit.musteriAd).toBe("a musterisi");
    expect(kayit.musteriTelefon).toBe("5551112233");
  });

  test("siralama baslangica gore artan", async () => {
    const a = await isletmeKur("a");
    // Kasten ters sirada ekleniyor: siralamayi ekleme sirasi degil orderBy
    // saglamali.
    await hamRandevuEkle(a, { baslangic: saat(11), bitis: saat(11, 30) });
    await hamRandevuEkle(a, { baslangic: saat(9), bitis: saat(9, 30) });
    await hamRandevuEkle(a, { baslangic: saat(10), bitis: saat(10, 30) });

    const db = await getScopedDb(a.oturum);
    const liste = await db.randevulariListele(ALT, UST);

    expect(liste.map((r) => r.baslangic.toISOString())).toEqual([
      saat(9).toISOString(),
      saat(10).toISOString(),
      saat(11).toISOString(),
    ]);
  });
});

describe("randevuGetir", () => {
  test("kendi randevusu join alanlariyla geliyor", async () => {
    const a = await isletmeKur("a");
    const r = await hamRandevuEkle(a, {
      baslangic: saat(10),
      bitis: saat(10, 30),
      not: "Kısa kesim",
    });

    const db = await getScopedDb(a.oturum);
    const kayit = await db.randevuGetir(r.id);

    expect(kayit?.id).toBe(r.id);
    expect(kayit?.not).toBe("Kısa kesim");
    expect(kayit?.musteriAd).toBe("a musterisi");
  });

  test("IDOR: baska isletmenin randevu id'si null donuyor", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");
    const bRandevu = await hamRandevuEkle(b, {
      baslangic: saat(10),
      bitis: saat(10, 30),
    });

    const db = await getScopedDb(a.oturum);
    // Id tek basina yeterli DEGIL - kiraci filtresi yaninda.
    expect(await db.randevuGetir(bRandevu.id)).toBeNull();
  });
});

describe("randevuDurumunuDegistir", () => {
  test("BEKLIYOR -> ONAYLI 1 donuyor ve satir gercekten degisiyor", async () => {
    const a = await isletmeKur("a");
    const r = await hamRandevuEkle(a, {
      baslangic: saat(10),
      bitis: saat(10, 30),
    });

    const db = await getScopedDb(a.oturum);
    expect(await db.randevuDurumunuDegistir(r.id, "ONAYLI")).toBe(1);
    // Donus degerine bakip yaziyi dogrulamamak, sessiz bir bozulmayi gorunmez
    // kilardi: ham okumayla teyit ediliyor.
    expect((await hamRandevuOku(r.id))?.durum).toBe("ONAYLI");
  });

  test("ayni cagri ikinci kez 0 donuyor - yarisan ikinci karar kaybediyor", async () => {
    const a = await isletmeKur("a");
    const r = await hamRandevuEkle(a, {
      baslangic: saat(10),
      bitis: saat(10, 30),
    });

    const db = await getScopedDb(a.oturum);
    expect(await db.randevuDurumunuDegistir(r.id, "ONAYLI")).toBe(1);
    // DEGISMEZ 3: beklenen durum where'de. Iki sekme ayni randevuyu
    // onaylarsa ikincisi 0 satir etkiliyor ve route 409 donuyor.
    expect(await db.randevuDurumunuDegistir(r.id, "ONAYLI")).toBe(0);
  });

  test("IPTAL -> ONAYLI 0 donuyor ve satir degismiyor - terminal durum", async () => {
    const a = await isletmeKur("a");
    const r = await hamRandevuEkle(a, {
      baslangic: saat(10),
      bitis: saat(10, 30),
      durum: "IPTAL",
    });

    const db = await getScopedDb(a.oturum);
    // Iptali geri acmak, bu arada baskasina verilmis olabilecek bir slotu
    // yeniden doldurmak demek (bkz. randevu-durum.ts).
    expect(await db.randevuDurumunuDegistir(r.id, "ONAYLI")).toBe(0);
    expect((await hamRandevuOku(r.id))?.durum).toBe("IPTAL");
  });

  test("IDOR: baska isletmenin randevusu degistirilemiyor", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");
    const bRandevu = await hamRandevuEkle(b, {
      baslangic: saat(10),
      bitis: saat(10, 30),
    });

    const db = await getScopedDb(a.oturum);
    expect(await db.randevuDurumunuDegistir(bRandevu.id, "ONAYLI")).toBe(0);
    expect((await hamRandevuOku(bRandevu.id))?.durum).toBe("BEKLIYOR");
  });

  test("BEKLIYOR -> TAMAMLANDI 1 donuyor - once onaylamak sart degil", async () => {
    const a = await isletmeKur("a");
    const r = await hamRandevuEkle(a, {
      baslangic: saat(10),
      bitis: saat(10, 30),
    });

    const db = await getScopedDb(a.oturum);
    // Gecis tablosu boyle diyor: otomatik onay kapaliyken isletme onaylamayi
    // unutuyor ama musteri yine de geliyor.
    expect(await db.randevuDurumunuDegistir(r.id, "TAMAMLANDI")).toBe(1);
    expect((await hamRandevuOku(r.id))?.durum).toBe("TAMAMLANDI");
  });

  test("hedef BEKLIYOR ise 0 donuyor - hicbir gecisin varisi degil", async () => {
    const a = await isletmeKur("a");
    const r = await hamRandevuEkle(a, {
      baslangic: saat(10),
      bitis: saat(10, 30),
      durum: "ONAYLI",
    });

    const db = await getScopedDb(a.oturum);
    // Kaynak kumesi bos: sorgu hic gonderilmiyor, satir da degismiyor.
    expect(await db.randevuDurumunuDegistir(r.id, "BEKLIYOR")).toBe(0);
    expect((await hamRandevuOku(r.id))?.durum).toBe("ONAYLI");
  });
});

// ---- Gelmedi kisiti (Faz L3) -----------------------------------------------
//
// Randevusuna gelmeyen musteri bir sure o isletmeden randevu alamiyor.
// Kaporasi olmayan isletmenin tek korumasi bu, o yuzden iki ucu da burada
// kilitli: kisitin YAZILMASI (durum degisiminin yan etkisi) ve kisitin
// OKUNMASI (halka acik randevu yazmanin kapisi).
//
// KIRACIYA OZEL OLMASI EN KRITIK OZELLIK: ayni telefon numarasi her isletmede
// ayri bir musteri satiri, yani bir salonda gelmemek digerinden randevu
// almayi engellememeli. Iki ayri IDOR testi bunu ariyor.

const GUN_MS = 86_400_000;

async function hamMusteriOku(id: string) {
  const db = await getDb();
  const [kayit] = await db
    .select()
    .from(musteri)
    .where(eq(musteri.id, id))
    .limit(1);
  return kayit ?? null;
}

/// Kisit bitisini dogrudan yaziyor. Sureyi bekleyerek sinamak mumkun degil;
/// kisitin DOLMUS hali ancak gecmise yazilmis bir bitisle gorulebiliyor.
async function hamKisitYaz(musteriId: string, bitis: Date | null) {
  const db = await getDb();
  await db
    .update(musteri)
    .set({ randevuKisitiBitis: bitis })
    .where(eq(musteri.id, musteriId));
}

async function hamKisitAyariYaz(isletmeId: string, gun: number) {
  const db = await getDb();
  await db
    .update(isletme)
    .set({ gelmediKisitiGun: gun })
    .where(eq(isletme.id, isletmeId));
}

/// Halka acik yoldan randevu yazar - kisit kapisinin bulundugu yol.
///
/// `simdi` DISARIDAN veriliyor (scoped-db bu dosyada `new Date()` okumuyor):
/// kisitin tam sinirini ancak zamani sabitleyerek sinayabiliriz.
async function halkaAcikYaz(
  slug: string,
  k: Kurulum,
  secenekler: {
    simdi: Date;
    telefon?: string;
    baslangicSaati?: number;
    acik?: number;
    gunluk?: number;
    yeniMusteri?: number;
  },
) {
  const db = await getHalkaAcikDb(slug);
  if (!db) throw new Error("isletme bulunamadi");

  const bas = saat(secenekler.baslangicSaati ?? 15);
  return db.randevuOlustur({
    personelId: k.personelId,
    hizmetId: k.hizmetId,
    baslangic: bas,
    bitis: new Date(bas.getTime() + 30 * 60_000),
    musteriAd: "Ayşe Yılmaz",
    telefon: secenekler.telefon ?? "5551112233",
    eposta: null,
    not: null,
    iptalToken: token(),
    simdi: secenekler.simdi,
    enCokAcikRandevu: secenekler.acik ?? 3,
    // Faz Q tavanlari varsayilan olarak ULASILMAZ: bu dosyadaki diger
    // testlerin konusu degiller ve bir gun o testleri sebebi gorunmeyen bir
    // "gunluk-sinir" ile kirmiziya dusurmemeliler.
    enCokGunlukRandevu: secenekler.gunluk ?? 100,
    enCokGunlukYeniMusteri: secenekler.yeniMusteri ?? 100,
    otomatikOnay: true,
  });
}

describe("gelmedi kisitinin YAZILMASI", () => {
  test("GELMEDI isaretlemek musterinin kisitini ayar kadar ileri atiyor", async () => {
    const a = await isletmeKur("a");
    const r = await hamRandevuEkle(a, {
      baslangic: saat(10),
      bitis: saat(10, 30),
      durum: "ONAYLI",
    });

    const db = await getScopedDb(a.oturum);
    expect(await db.randevuDurumunuDegistir(r.id, "GELMEDI")).toBe(1);

    // Varsayilan 30 gun. Kesin esitlik aranmiyor: bitis DB saatinden
    // hesaplaniyor ve test saati ile arasinda milisaniyeler var.
    const kisit = (await hamMusteriOku(a.musteriId))?.randevuKisitiBitis;
    const fark = (kisit!.getTime() - Date.now()) / GUN_MS;
    expect(fark).toBeGreaterThan(29.9);
    expect(fark).toBeLessThan(30.1);
  });

  test("gelmediKisitiGun 0 iken kisit YAZILMIYOR", async () => {
    const a = await isletmeKur("a");
    await hamKisitAyariYaz(a.isletmeId, 0);
    const r = await hamRandevuEkle(a, {
      baslangic: saat(10),
      bitis: saat(10, 30),
      durum: "ONAYLI",
    });

    const db = await getScopedDb(a.oturum);
    // Durum yine de degisiyor: 0 "kaydi tutma" degil "musteriyi kapiya koyma".
    expect(await db.randevuDurumunuDegistir(r.id, "GELMEDI")).toBe(1);
    expect((await hamRandevuOku(r.id))?.durum).toBe("GELMEDI");
    expect((await hamMusteriOku(a.musteriId))?.randevuKisitiBitis).toBeNull();
  });

  test("TAMAMLANDI kisit yazmiyor - kisit yalnizca GELMEDI'nin sonucu", async () => {
    const a = await isletmeKur("a");
    const r = await hamRandevuEkle(a, {
      baslangic: saat(10),
      bitis: saat(10, 30),
      durum: "ONAYLI",
    });

    const db = await getScopedDb(a.oturum);
    expect(await db.randevuDurumunuDegistir(r.id, "TAMAMLANDI")).toBe(1);
    expect((await hamMusteriOku(a.musteriId))?.randevuKisitiBitis).toBeNull();
  });

  test("yarisi kaybeden ikinci karar kisiti UZATMIYOR", async () => {
    const a = await isletmeKur("a");
    const r = await hamRandevuEkle(a, {
      baslangic: saat(10),
      bitis: saat(10, 30),
      durum: "GELMEDI",
    });
    // Ilk karar zaten verilmis gibi: kisit duruyor.
    const oncekiKisit = new Date(Date.now() + 5 * GUN_MS);
    await hamKisitYaz(a.musteriId, oncekiKisit);

    const db = await getScopedDb(a.oturum);
    // DEGISMEZ 3: kosullu UPDATE 0 satir etkiliyor, yani yan etki de yok.
    // Ayni transaction'da olmasalardi ikinci sekme kisiti bir kez daha
    // uzatirdi ve musteri iki kat ceza yerdi.
    expect(await db.randevuDurumunuDegistir(r.id, "GELMEDI")).toBe(0);
    expect(
      (await hamMusteriOku(a.musteriId))?.randevuKisitiBitis?.getTime(),
    ).toBe(oncekiKisit.getTime());
  });

  test("var olan DAHA UZUN kisit kisaltilmiyor", async () => {
    const a = await isletmeKur("a");
    // Isletme ayari 30 gune inmis ama musterinin 100 gunluk kisiti duruyor.
    const uzunKisit = new Date(Date.now() + 100 * GUN_MS);
    await hamKisitYaz(a.musteriId, uzunKisit);
    const r = await hamRandevuEkle(a, {
      baslangic: saat(10),
      bitis: saat(10, 30),
      durum: "ONAYLI",
    });

    const db = await getScopedDb(a.oturum);
    expect(await db.randevuDurumunuDegistir(r.id, "GELMEDI")).toBe(1);

    // GREATEST: yeni kisit eskisinden kisaysa eski ayakta kaliyor. Aksi halde
    // ikinci bir gelmedi, cezayi KISALTMIS olurdu.
    expect(
      (await hamMusteriOku(a.musteriId))?.randevuKisitiBitis?.getTime(),
    ).toBe(uzunKisit.getTime());
  });

  test("IDOR: baska isletmenin randevusu GELMEDI yapilamiyor, musterisi kisitlanmiyor", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");
    const bRandevu = await hamRandevuEkle(b, {
      baslangic: saat(10),
      bitis: saat(10, 30),
      durum: "ONAYLI",
    });

    const db = await getScopedDb(a.oturum);
    expect(await db.randevuDurumunuDegistir(bRandevu.id, "GELMEDI")).toBe(0);
    expect((await hamRandevuOku(bRandevu.id))?.durum).toBe("ONAYLI");
    // Asil sizinti riski burada: yan etki randevudan BASKA bir tabloya
    // yaziyor ve o yazmanin kiraci filtresi kaybolsaydi kimse gormezdi.
    expect((await hamMusteriOku(b.musteriId))?.randevuKisitiBitis).toBeNull();
  });
});

describe("gelmedi kisitinin OKUNMASI", () => {
  /// Kisit bitisi ve "su an" testin sabitledigi degerler; gercek saate
  /// bagli bir sinir testi makinenin hizina gore kirmizi olurdu.
  const KISIT_BITISI = new Date(Date.UTC(2026, 2, 1, 12, 0, 0));

  test("kisit sururken randevu yazilmiyor", async () => {
    const a = await isletmeKur("a");
    await hamKisitYaz(a.musteriId, KISIT_BITISI);

    const sonuc = await halkaAcikYaz("a", a, {
      simdi: new Date(KISIT_BITISI.getTime() - 60_000),
    });

    expect(sonuc.durum).toBe("kisitli");
    // Bitis cagirana geri veriliyor: route mesaja tarihi yazacak.
    expect(sonuc.durum === "kisitli" && sonuc.bitis.getTime()).toBe(
      KISIT_BITISI.getTime(),
    );
  });

  test("tam bitis aninda kisit BITMIS sayiliyor", async () => {
    const a = await isletmeKur("a");
    await hamKisitYaz(a.musteriId, KISIT_BITISI);

    // Sinir `>`: bitis anini kisitli saymak, "3 Mart'a kadar" denen kisiti
    // 3 Mart'in tamamina yaymak olurdu.
    const sonuc = await halkaAcikYaz("a", a, { simdi: KISIT_BITISI });

    expect(sonuc.durum).toBe("tamam");
  });

  test("kisit dolmussa randevu yaziliyor", async () => {
    const a = await isletmeKur("a");
    await hamKisitYaz(a.musteriId, KISIT_BITISI);

    const sonuc = await halkaAcikYaz("a", a, {
      simdi: new Date(KISIT_BITISI.getTime() + GUN_MS),
    });

    expect(sonuc.durum).toBe("tamam");
  });

  test("kisiti olmayan musteri etkilenmiyor", async () => {
    const a = await isletmeKur("a");

    const sonuc = await halkaAcikYaz("a", a, {
      simdi: new Date(KISIT_BITISI.getTime() - GUN_MS),
    });

    expect(sonuc.durum).toBe("tamam");
  });

  test("ayar 0 iken kayitli kisit YOK SAYILIYOR", async () => {
    const a = await isletmeKur("a");
    await hamKisitYaz(a.musteriId, KISIT_BITISI);
    await hamKisitAyariYaz(a.isletmeId, 0);

    // Isletme ayari kapattiginda mevcut kisitlarin da kalkmasini bekliyor.
    // Alanlari temizlemek yerine okumada yok sayiliyor: ayar geri acilirsa
    // gecmis de geri geliyor.
    const sonuc = await halkaAcikYaz("a", a, {
      simdi: new Date(KISIT_BITISI.getTime() - 60_000),
    });

    expect(sonuc.durum).toBe("tamam");
  });

  test("IDOR: bir isletmedeki kisit digerine SIZMIYOR", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");
    // Iki isletmede de ayni numara - ayri musteri satirlari
    // (musteri_isletme_telefon_idx).
    await hamKisitYaz(a.musteriId, KISIT_BITISI);

    const simdi = new Date(KISIT_BITISI.getTime() - 60_000);

    expect((await halkaAcikYaz("a", a, { simdi })).durum).toBe("kisitli");
    // Ayni numara, baska salon: kisit kiraciya ozel, gecmis ve notlar gibi.
    expect((await halkaAcikYaz("b", b, { simdi })).durum).toBe("tamam");
  });
});

// ---- Son 24 saatin tavanlari (Faz Q) --------------------------------------
//
// Oturumsuz yolun numara degistiren betige karsi iki kapisi. Iki tavan da
// `olusturma_tarihi` uzerinden VERITABANI SAATIYLE sayiliyor; pencerenin
// disini sinamak icin satirlarin olusturma ani geriye yaziliyor - 24 saat
// beklemek mumkun degil.
//
// Tavanlar testte kucuk (1-2) veriliyor: gercek degerler (5 ve 20)
// `randevu-kotasi.ts`'te ve route testi onlari uctan uca ariyor.

/// Randevularin acik sayilmasi icin "su an" randevu gununden once.
const ONCESI = new Date(Date.UTC(2026, 2, 1, 12, 0, 0));

async function hamOlusturmayiGeriAl(tablo: "randevu" | "musteri", id: string) {
  const db = await getDb();
  const geri = sql`now() - interval '25 hours'`;
  if (tablo === "randevu") {
    await db.update(randevu).set({ olusturmaTarihi: geri }).where(eq(randevu.id, id));
  } else {
    await db.update(musteri).set({ olusturmaTarihi: geri }).where(eq(musteri.id, id));
  }
}

async function hamDurumYaz(id: string, durum: RandevuDurumu) {
  const db = await getDb();
  await db.update(randevu).set({ durum }).where(eq(randevu.id, id));
}

/// Isletmenin panelden ekledigi musteri ve randevusu (`kaynak: ISLETME`).
async function hamIsletmeRandevusu(
  k: Kurulum,
  veri: { musteriId?: string; telefon?: string; baslangicSaati: number },
) {
  const db = await getDb();
  let musteriId = veri.musteriId;
  if (!musteriId) {
    const [m] = await db
      .insert(musteri)
      .values({ isletmeId: k.isletmeId, ad: "Telefonla arayan", telefon: veri.telefon! })
      .returning();
    musteriId = m.id;
  }
  const bas = saat(veri.baslangicSaati);
  await db.insert(randevu).values({
    isletmeId: k.isletmeId,
    personelId: k.personelId,
    hizmetId: k.hizmetId,
    musteriId,
    baslangic: bas,
    bitis: new Date(bas.getTime() + 30 * 60_000),
    durum: "ONAYLI",
    kaynak: "ISLETME",
    iptalToken: token(),
  });
}

async function hamMusteriTelefonla(isletmeId: string, telefon: string) {
  const db = await getDb();
  const [kayit] = await db
    .select()
    .from(musteri)
    .where(and(eq(musteri.isletmeId, isletmeId), eq(musteri.telefon, telefon)))
    .limit(1);
  return kayit ?? null;
}

async function hamRandevuSay(musteriId: string) {
  const db = await getDb();
  return (await db.select().from(randevu).where(eq(randevu.musteriId, musteriId)))
    .length;
}

/// Basarili yazmanin randevusu - testin sonraki adimi ona dokunacak.
function yazilan(sonuc: Awaited<ReturnType<typeof halkaAcikYaz>>) {
  if (sonuc.durum !== "tamam") throw new Error(`beklenmeyen sonuc: ${sonuc.durum}`);
  return sonuc.randevu;
}

describe("numara basina gunluk tavan", () => {
  test("tavan dolunca ayni numara 'gunluk-sinir' aliyor, randevu yazilmiyor", async () => {
    const a = await isletmeKur("a");
    const kota = { simdi: ONCESI, gunluk: 2 };

    yazilan(await halkaAcikYaz("a", a, { ...kota, baslangicSaati: 13 }));
    yazilan(await halkaAcikYaz("a", a, { ...kota, baslangicSaati: 14 }));
    const ucuncu = await halkaAcikYaz("a", a, { ...kota, baslangicSaati: 15 });

    expect(ucuncu.durum).toBe("gunluk-sinir");
    expect(await hamRandevuSay(a.musteriId)).toBe(2);
  });

  test("IPTAL edilen randevular da sayiliyor - al/iptal et dongusu kapali", async () => {
    const a = await isletmeKur("a");
    const kota = { simdi: ONCESI, gunluk: 2 };

    // Acik randevu sayisi burada SIFIR: acik sinir bu donguyu hic gormezdi.
    for (const baslangicSaati of [13, 14]) {
      const r = yazilan(await halkaAcikYaz("a", a, { ...kota, baslangicSaati }));
      await hamDurumYaz(r.id, "IPTAL");
    }

    expect((await halkaAcikYaz("a", a, { ...kota, baslangicSaati: 15 })).durum).toBe(
      "gunluk-sinir",
    );
  });

  test("24 saatten eski randevular sayilmiyor - pencere kayiyor", async () => {
    const a = await isletmeKur("a");
    const kota = { simdi: ONCESI, gunluk: 2 };

    for (const baslangicSaati of [13, 14]) {
      const r = yazilan(await halkaAcikYaz("a", a, { ...kota, baslangicSaati }));
      await hamOlusturmayiGeriAl("randevu", r.id);
    }

    expect((await halkaAcikYaz("a", a, { ...kota, baslangicSaati: 15 })).durum).toBe(
      "tamam",
    );
  });

  test("isletmenin elle ekledigi randevu musterinin kotasini yemiyor", async () => {
    const a = await isletmeKur("a");
    await hamIsletmeRandevusu(a, { musteriId: a.musteriId, baslangicSaati: 9 });
    await hamIsletmeRandevusu(a, { musteriId: a.musteriId, baslangicSaati: 10 });

    const sonuc = await halkaAcikYaz("a", a, { simdi: ONCESI, gunluk: 2, acik: 10 });

    expect(sonuc.durum).toBe("tamam");
  });

  test("ikisi birden doluysa gunluk sinir aciktan ONCE donuyor", async () => {
    const a = await isletmeKur("a");
    const kota = { simdi: ONCESI, gunluk: 2, acik: 2 };

    yazilan(await halkaAcikYaz("a", a, { ...kota, baslangicSaati: 13 }));
    yazilan(await halkaAcikYaz("a", a, { ...kota, baslangicSaati: 14 }));

    // "Once birini iptal edin" (acik sinirin mesaji) burada yanlis yol olurdu:
    // iptal edilen randevu da gunluk sayimda kaliyor.
    expect((await halkaAcikYaz("a", a, { ...kota, baslangicSaati: 15 })).durum).toBe(
      "gunluk-sinir",
    );
  });

  test("IDOR: bir isletmedeki gunluk sayim digerine SIZMIYOR", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");
    const kota = { simdi: ONCESI, gunluk: 1 };

    yazilan(await halkaAcikYaz("a", a, { ...kota, baslangicSaati: 13 }));

    expect((await halkaAcikYaz("a", a, { ...kota, baslangicSaati: 14 })).durum).toBe(
      "gunluk-sinir",
    );
    // Ayni numara, baska salon: ayri musteri satiri, ayri sayim.
    expect((await halkaAcikYaz("b", b, { ...kota, baslangicSaati: 14 })).durum).toBe(
      "tamam",
    );
  });
});

/// Yeni bir numarayla, verilen saatte, tavani 2 olan kapidan randevu ister.
/// Yeni musteri testlerinde degisen yalnizca numara ve saat.
function yeniNumarayla(slug: string, k: Kurulum, telefon: string, baslangicSaati: number) {
  return halkaAcikYaz(slug, k, { simdi: ONCESI, yeniMusteri: 2, telefon, baslangicSaati });
}

describe("isletme basina gunluk yeni musteri tavani", () => {
  test("tavan dolunca YENI numara reddediliyor ve musteri satiri YAZILMIYOR", async () => {
    const a = await isletmeKur("a");

    yazilan(await yeniNumarayla("a", a, "5550000001", 13));
    yazilan(await yeniNumarayla("a", a, "5550000002", 14));
    const sonuc = await yeniNumarayla("a", a, "5550000003", 15);

    expect(sonuc.durum).toBe("yeni-musteri-siniri");
    // Reddedilen istek transaction'i hatasiz bitiriyor. Musteri kaydi kapidan
    // SONRA yazilsaydi burada randevusu olmayan bir satir kalirdi.
    expect(await hamMusteriTelefonla(a.isletmeId, "5550000003")).toBeNull();
  });

  test("kayitli musteri tavan doluyken randevu alabiliyor", async () => {
    const a = await isletmeKur("a");
    yazilan(await yeniNumarayla("a", a, "5550000001", 13));
    yazilan(await yeniNumarayla("a", a, "5550000002", 14));

    // Kurulumun musterisi (5551112233) zaten kayitli: tavan yalnizca yeni
    // numaraya, salonun tanidigi musteriye degil.
    expect((await yeniNumarayla("a", a, "5551112233", 15)).durum).toBe("tamam");
  });

  test("24 saatten eski musteriler sayilmiyor", async () => {
    const a = await isletmeKur("a");
    for (const [telefon, baslangicSaati] of [
      ["5550000001", 13],
      ["5550000002", 14],
    ] as const) {
      yazilan(await yeniNumarayla("a", a, telefon, baslangicSaati));
      const m = await hamMusteriTelefonla(a.isletmeId, telefon);
      await hamOlusturmayiGeriAl("musteri", m!.id);
    }

    expect((await yeniNumarayla("a", a, "5550000003", 15)).durum).toBe("tamam");
  });

  test("panelden eklenen musteriler cevrim ici tavani doldurmuyor", async () => {
    const a = await isletmeKur("a");
    // Telefonla arayanlari deftere geciren isletme kendi kapisini kapatmamali.
    await hamIsletmeRandevusu(a, { telefon: "5550000001", baslangicSaati: 9 });
    await hamIsletmeRandevusu(a, { telefon: "5550000002", baslangicSaati: 10 });

    expect((await yeniNumarayla("a", a, "5550000003", 15)).durum).toBe("tamam");
  });

  test("IDOR: baska isletmenin yeni musterileri tavani doldurmuyor", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");
    yazilan(await yeniNumarayla("b", b, "5550000001", 13));
    yazilan(await yeniNumarayla("b", b, "5550000002", 14));

    expect((await yeniNumarayla("b", b, "5550000003", 15)).durum).toBe(
      "yeni-musteri-siniri",
    );
    // Ayni numara A'da yepyeni bir musteri ve A'nin tavani bos.
    expect((await yeniNumarayla("a", a, "5550000003", 15)).durum).toBe("tamam");
  });
});

describe("cevrimIciYeniMusteriSayisi", () => {
  test("panel kapinin saydigini sayiyor: eski ve panelden eklenenler disarida", async () => {
    const a = await isletmeKur("a");
    const yaz = (telefon: string, baslangicSaati: number) =>
      halkaAcikYaz("a", a, { simdi: ONCESI, telefon, baslangicSaati });

    yazilan(await yaz("5550000001", 13));
    yazilan(await yaz("5550000002", 14));
    // Ayni musterinin ikinci randevusu sayiyi artirmiyor: sayilan musteri.
    yazilan(await yaz("5550000002", 16));

    yazilan(await yaz("5550000003", 15));
    const eski = await hamMusteriTelefonla(a.isletmeId, "5550000003");
    await hamOlusturmayiGeriAl("musteri", eski!.id);

    await hamIsletmeRandevusu(a, { telefon: "5550000004", baslangicSaati: 9 });

    const db = await getScopedDb(a.oturum);
    expect(await db.cevrimIciYeniMusteriSayisi()).toBe(2);
  });

  test("IDOR: yalnizca oturumun isletmesini sayiyor", async () => {
    const a = await isletmeKur("a");
    const b = await isletmeKur("b");
    for (const [telefon, baslangicSaati] of [
      ["5550000001", 13],
      ["5550000002", 14],
      ["5550000003", 15],
    ] as const) {
      yazilan(await halkaAcikYaz("b", b, { simdi: ONCESI, telefon, baslangicSaati }));
    }

    expect(await (await getScopedDb(a.oturum)).cevrimIciYeniMusteriSayisi()).toBe(0);
    expect(await (await getScopedDb(b.oturum)).cevrimIciYeniMusteriSayisi()).toBe(3);
  });
});
