import { eq } from "drizzle-orm";
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
  secenekler: { simdi: Date; telefon?: string; baslangicSaati?: number },
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
    enCokAcikRandevu: 3,
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
