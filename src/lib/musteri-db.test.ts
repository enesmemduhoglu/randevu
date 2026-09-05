import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { randevu as randevuTablosu } from "@/db/sema";
import { tablolariBosalt } from "@/db/test-temizlik";
import { baglantiyiKapat, getDb } from "@/lib/db";
import { isletmeKaydiOlustur, musteriKaydiOlustur } from "@/lib/kayit";
import { getMusteriDb } from "@/lib/musteri-db";
import { getHalkaAcikDb, getScopedDb, type IsletmeOturumu } from "@/lib/scoped-db";
import { slugUret } from "@/lib/slug";
import { yerelDenUtc } from "@/lib/zaman";

// MUSTERI KAPISININ ENTEGRASYON TESTLERI - gercek Postgres'e kosuyor.
//
// BU DOSYA FAZ J'NIN IDOR TESTIDIR. `/api/randevularim/*` route'larinin
// sizdirmama guvencesi tamamen buradaki `where` kosullarina dayaniyor: route
// oturumdan kullanici kimligini aliyor ve baska hicbir sey yapmiyor. Route
// seviyesinde ayni seyi sinamak `cookies()` gerektiriyor ve vitest'in node
// ortaminda o baglam yok (ayni gerekce giris.test.ts ve tamamla.test.ts'te de
// yazili) - ustelik oradaki test filtrenin KENDISINI degil, yalnizca cagrilip
// cagrilmadigini gosterirdi.
//
// Iki AYRI musteri hesabi ve iki AYRI isletme kuruluyor; her testte birinin
// kaydi digerinin kimligiyle isteniyor ve sizmadigi goruluyor.
//
// Dogrulamalar yer yer ham `getDb` ile yapiliyor: test, test ettigi katmana
// guvenmemeli - `randevulariListele` bos donuyorsa bunun sebebi "kayit yok"
// mu yoksa "filtre yanlis" mi, ancak disaridan bakarak ayrilir.

const ISTANBUL = "Europe/Istanbul";
/// 1 Eylul 2026 Sali - kurulumdaki calisma saati bu gune yaziliyor.
const SALI = { yil: 2026, ay: 9, gun: 1 };
/// Randevular hep bu anin gelecegine yaziliyor.
const SIMDI = new Date("2026-08-25T06:00:00Z");

/// Bicimi tutan ama uretilmemis token'lar: testte hangi degerin gittigini
/// gormek, rastgele bir dizeyi izlemekten kolay. Harfler `iptal-token.ts`
/// alfabesinde ve uzunluk tam 32.
const TOKEN_1 = "a".repeat(32);
const TOKEN_2 = "b".repeat(32);
const TOKEN_3 = "c".repeat(32);
const TOKEN_YOK = "d".repeat(32);

type Salon = {
  slug: string;
  personelId: string;
  hizmetId: string;
};

async function salonKur(isletmeAdi: string): Promise<Salon> {
  const authUserId = `auth-${slugUret(isletmeAdi)}`;

  const kayit = await isletmeKaydiOlustur({
    authUserId,
    eposta: `${slugUret(isletmeAdi)}@ornek.com`,
    adSoyad: "Ayşe Yılmaz",
    isletmeAdi,
  });
  if (kayit.durum !== "tamam") {
    throw new Error(`kurulum basarisiz: ${kayit.durum}`);
  }

  const oturum: IsletmeOturumu = {
    kullaniciId: kayit.kullaniciId,
    authUserId,
    isletmeId: kayit.isletmeId,
    rol: "SAHIP",
  };
  const db = await getScopedDb(oturum);

  // Kayit varsayilan personeli zaten aciyor (bkz. kayit.ts).
  const [personel] = await db.personelleriListele();
  const hizmet = await db.hizmetEkle({ ad: "Saç kesimi", sureDk: 60 });

  await db.calismaSaatleriniYaz(personel.id, [
    { haftaninGunu: 2, baslangicDk: 540, bitisDk: 1080 },
  ]);

  return { slug: kayit.slug, personelId: personel.id, hizmetId: hizmet.id };
}

/// Musteri hesabi. Kimlik `kullanici` satirinin id'si - kapinin aldigi tek sey.
async function musteriKur(ad: string): Promise<string> {
  const sonuc = await musteriKaydiOlustur({
    authUserId: `auth-musteri-${slugUret(ad)}`,
    eposta: `${slugUret(ad)}@ornek.com`,
    adSoyad: ad,
  });
  if (sonuc.durum !== "tamam") {
    throw new Error(`musteri kaydi basarisiz: ${sonuc.durum}`);
  }
  return sonuc.kullaniciId;
}

/// Misafir randevusu: `kullanici_id` NULL olarak yaziliyor - gercek akista da
/// oyle olusuyor ve hesaba baglama ayri bir adim.
async function randevuKur(
  salon: Salon,
  token: string,
  baslangicDk: number,
): Promise<string> {
  const db = await getHalkaAcikDb(salon.slug);
  if (!db) throw new Error(`isletme bulunamadi: ${salon.slug}`);

  const sonuc = await db.randevuOlustur({
    personelId: salon.personelId,
    hizmetId: salon.hizmetId,
    baslangic: yerelDenUtc(ISTANBUL, SALI, baslangicDk),
    bitis: yerelDenUtc(ISTANBUL, SALI, baslangicDk + 60),
    musteriAd: "Mehmet Demir",
    telefon: "5321234567",
    eposta: null,
    not: null,
    iptalToken: token,
    simdi: SIMDI,
    enCokAcikRandevu: 5,
    otomatikOnay: true,
  });

  if (sonuc.durum !== "tamam") {
    throw new Error(`randevu yazilamadi: ${sonuc.durum}`);
  }
  return sonuc.randevu.id;
}

/// Sahipligi HAM sorguyla okur - kapinin kendi cevabina guvenmeden.
async function sahibiniOku(randevuId: string): Promise<string | null> {
  const db = await getDb();
  const [kayit] = await db
    .select({ kullaniciId: randevuTablosu.kullaniciId })
    .from(randevuTablosu)
    .where(eq(randevuTablosu.id, randevuId))
    .limit(1);
  return kayit?.kullaniciId ?? null;
}

async function durumuOku(randevuId: string): Promise<string | null> {
  const db = await getDb();
  const [kayit] = await db
    .select({ durum: randevuTablosu.durum })
    .from(randevuTablosu)
    .where(eq(randevuTablosu.id, randevuId))
    .limit(1);
  return kayit?.durum ?? null;
}

beforeEach(async () => {
  await tablolariBosalt();
});

afterAll(async () => {
  await tablolariBosalt();
  await baglantiyiKapat();
});

describe("randevulariListele", () => {
  test("yalnizca hesabin KENDI randevulari donuyor (IDOR)", async () => {
    const salon = await salonKur("A Salonu");
    const ali = await musteriKur("Ali Veli");
    const veli = await musteriKur("Veli Ali");

    const aliRandevusu = await randevuKur(salon, TOKEN_1, 600);
    const veliRandevusu = await randevuKur(salon, TOKEN_2, 720);

    await (await getMusteriDb(ali)).randevuyuHesabaEkle(TOKEN_1);
    await (await getMusteriDb(veli)).randevuyuHesabaEkle(TOKEN_2);

    const aliListesi = await (await getMusteriDb(ali)).randevulariListele();
    const veliListesi = await (await getMusteriDb(veli)).randevulariListele();

    expect(aliListesi.map((r) => r.id)).toEqual([aliRandevusu]);
    expect(veliListesi.map((r) => r.id)).toEqual([veliRandevusu]);
  });

  test("baglanmamis randevu HICBIR hesapta gorunmuyor", async () => {
    // Misafir randevusu (`kullanici_id` NULL). Filtre `eq(kullaniciId, sahip)`
    // oldugu icin NULL hicbir kimlige esit degil - ama bunu yazili olarak
    // sinamak onemli: filtre bir gun `or(isNull(...))` ile gevsetilirse butun
    // misafir randevulari ilk giren hesaba gorunurdu.
    const salon = await salonKur("A Salonu");
    const ali = await musteriKur("Ali Veli");
    await randevuKur(salon, TOKEN_1, 600);

    const liste = await (await getMusteriDb(ali)).randevulariListele();
    expect(liste).toEqual([]);
  });

  test("iki AYRI isletmeden randevu tek listede birlesiyor", async () => {
    // Kapinin varlik sebebi. `scoped-db` ile bu sorgu yazilamazdi: onun
    // sozlesmesi tek kiraci ve musterinin randevulari tanimi geregi cok
    // kiracili.
    const a = await salonKur("A Salonu");
    const b = await salonKur("B Kuaför");
    const ali = await musteriKur("Ali Veli");

    await randevuKur(a, TOKEN_1, 600);
    await randevuKur(b, TOKEN_2, 600);

    const db = await getMusteriDb(ali);
    await db.randevuyuHesabaEkle(TOKEN_1);
    await db.randevuyuHesabaEkle(TOKEN_2);

    const liste = await db.randevulariListele();
    expect(liste.map((r) => r.isletmeAd).sort()).toEqual([
      "A Salonu",
      "B Kuaför",
    ]);
  });

  test("siralama yeniden eskiye", async () => {
    const salon = await salonKur("A Salonu");
    const ali = await musteriKur("Ali Veli");

    await randevuKur(salon, TOKEN_1, 600); // 10:00
    await randevuKur(salon, TOKEN_2, 780); // 13:00

    const db = await getMusteriDb(ali);
    await db.randevuyuHesabaEkle(TOKEN_1);
    await db.randevuyuHesabaEkle(TOKEN_2);

    const liste = await db.randevulariListele();
    expect(liste).toHaveLength(2);
    expect(liste[0].baslangic.getTime()).toBeGreaterThan(
      liste[1].baslangic.getTime(),
    );
  });

  test("isletmenin kendi musteri kaydi DONMUYOR - yuzey dar", async () => {
    // `musteri.not` isletmenin ic notu ("kirmizi boyaya alerjik") ve musteriye
    // gosterilmesi hic istenmiyor; telefon da kapinin isi degil. Ikisi de
    // donen tipte YOK ve bu testin isi, birinin bir gun "kolaylik olsun" diye
    // eklemesini kirmiziya cevirmek.
    const salon = await salonKur("A Salonu");
    const ali = await musteriKur("Ali Veli");
    await randevuKur(salon, TOKEN_1, 600);
    const db = await getMusteriDb(ali);
    await db.randevuyuHesabaEkle(TOKEN_1);

    const [kayit] = await db.randevulariListele();
    const alanlar = Object.keys(kayit).sort();

    expect(alanlar).toEqual([
      "baslangic",
      "bitis",
      "durum",
      "hizmetAd",
      "hizmetFiyatKurus",
      "hizmetSureDk",
      "id",
      "isletmeAd",
      "isletmeSaatDilimi",
      "isletmeSlug",
      "isletmeTelefon",
      "not",
      "personelAd",
    ]);
    // Iptal token'i da donmuyor: iptal artik sahiplige bagli ve token tek
    // basina yetki tasiyor (DEGISMEZ 5).
    expect(alanlar).not.toContain("iptalToken");
  });
});

describe("randevuyuHesabaEkle", () => {
  test("sahipsiz randevu hesaba baglaniyor", async () => {
    const salon = await salonKur("A Salonu");
    const ali = await musteriKur("Ali Veli");
    const randevuId = await randevuKur(salon, TOKEN_1, 600);

    const sonuc = await (await getMusteriDb(ali)).randevuyuHesabaEkle(TOKEN_1);

    expect(sonuc).toEqual({ durum: "eklendi", randevuId });
    expect(await sahibiniOku(randevuId)).toBe(ali);
  });

  test("ayni token ikinci kez: zaten-benim, hata DEGIL", async () => {
    // DEGISMEZ 3'un bu yoldaki karsiligi. Yarisan ikinci istek 0 satir
    // etkiliyor ve kendi kimligini gorup "zaten-benim" donuyor. Kullanici
    // acisindan is bitmis durumda - ayni linke iki kez basmak hata degil.
    const salon = await salonKur("A Salonu");
    const ali = await musteriKur("Ali Veli");
    const randevuId = await randevuKur(salon, TOKEN_1, 600);

    const db = await getMusteriDb(ali);
    await db.randevuyuHesabaEkle(TOKEN_1);
    const ikinci = await db.randevuyuHesabaEkle(TOKEN_1);

    expect(ikinci).toEqual({ durum: "zaten-benim", randevuId });
  });

  test("baskasinin randevusu CALINAMIYOR", async () => {
    // Kapinin en kritik kosulu: `isNull(randevu.kullaniciId)`. O silinirse
    // token'i ele geciren biri randevuyu sahibinden alabilirdi - ustelik
    // eski sahip bunu listesinden kaybolarak ogrenirdi.
    const salon = await salonKur("A Salonu");
    const ali = await musteriKur("Ali Veli");
    const veli = await musteriKur("Veli Ali");
    const randevuId = await randevuKur(salon, TOKEN_1, 600);

    await (await getMusteriDb(ali)).randevuyuHesabaEkle(TOKEN_1);
    const hirsizlik = await (await getMusteriDb(veli)).randevuyuHesabaEkle(
      TOKEN_1,
    );

    expect(hirsizlik).toEqual({ durum: "baskasinin" });
    expect(await sahibiniOku(randevuId)).toBe(ali);

    // Ve randevu Veli'nin listesine de girmiyor - reddedilen bir ekleme
    // hicbir iz birakmamali.
    const veliListesi = await (await getMusteriDb(veli)).randevulariListele();
    expect(veliListesi).toEqual([]);
  });

  test("olmayan token: yok", async () => {
    const ali = await musteriKur("Ali Veli");
    const sonuc = await (await getMusteriDb(ali)).randevuyuHesabaEkle(TOKEN_YOK);
    expect(sonuc).toEqual({ durum: "yok" });
  });
});

describe("randevuIptalEt", () => {
  test("kendi randevusunu iptal ediyor ve isletme slug'ini donuyor", async () => {
    const salon = await salonKur("A Salonu");
    const ali = await musteriKur("Ali Veli");
    const randevuId = await randevuKur(salon, TOKEN_1, 600);

    const db = await getMusteriDb(ali);
    await db.randevuyuHesabaEkle(TOKEN_1);
    const sonuc = await db.randevuIptalEt(randevuId);

    // Slug donuyor cunku cagiran taraf iptal bildirimlerini planlamak icin
    // randevunun KIRACISINA ait bir kapiya ihtiyac duyuyor - ve o degeri
    // istemciden almak baska bir salonun kuyruguna yazdirmanin yolu olurdu.
    expect(sonuc).toEqual({ id: randevuId, isletmeSlug: salon.slug });
    expect(await durumuOku(randevuId)).toBe("IPTAL");
  });

  test("BASKA hesabin randevusu iptal EDILEMIYOR (IDOR)", async () => {
    const salon = await salonKur("A Salonu");
    const ali = await musteriKur("Ali Veli");
    const veli = await musteriKur("Veli Ali");
    const randevuId = await randevuKur(salon, TOKEN_1, 600);
    await (await getMusteriDb(ali)).randevuyuHesabaEkle(TOKEN_1);

    const sonuc = await (await getMusteriDb(veli)).randevuIptalEt(randevuId);

    // null: cagiran taraf bunu 404 olarak gosteriyor. Var olmayan bir id ile
    // baskasinin id'si disaridan AYNI gorunmeli.
    expect(sonuc).toBeNull();
    // Ve randevu gercekten duruyor - "iptal edilemedi" demek yetmez, iptal
    // EDILMEMIS olmali.
    expect(await durumuOku(randevuId)).toBe("ONAYLI");
  });

  test("baglanmamis (misafir) randevu hesaptan iptal EDILEMIYOR", async () => {
    const salon = await salonKur("A Salonu");
    const ali = await musteriKur("Ali Veli");
    const randevuId = await randevuKur(salon, TOKEN_1, 600);

    const sonuc = await (await getMusteriDb(ali)).randevuIptalEt(randevuId);

    expect(sonuc).toBeNull();
    expect(await durumuOku(randevuId)).toBe("ONAYLI");
  });

  test("yarisan ikinci iptal KAYBEDIYOR", async () => {
    // DEGISMEZ 3: beklenen durum `where`'de. Once-oku-sonra-yaz yapilsaydi
    // iki istek de kaydi aktif gorup ikisi de basarili donerdi.
    const salon = await salonKur("A Salonu");
    const ali = await musteriKur("Ali Veli");
    const randevuId = await randevuKur(salon, TOKEN_1, 600);

    const db = await getMusteriDb(ali);
    await db.randevuyuHesabaEkle(TOKEN_1);

    const [birinci, ikinci] = await Promise.all([
      db.randevuIptalEt(randevuId),
      db.randevuIptalEt(randevuId),
    ]);

    // Tam olarak BIRI kazaniyor.
    expect([birinci, ikinci].filter(Boolean)).toHaveLength(1);
    expect(await durumuOku(randevuId)).toBe("IPTAL");
  });
});

describe("randevuDurumunuGetir", () => {
  test("kendi randevusunun durumunu veriyor", async () => {
    const salon = await salonKur("A Salonu");
    const ali = await musteriKur("Ali Veli");
    const randevuId = await randevuKur(salon, TOKEN_1, 600);
    const db = await getMusteriDb(ali);
    await db.randevuyuHesabaEkle(TOKEN_1);

    expect(await db.randevuDurumunuGetir(randevuId)).toBe("ONAYLI");
  });

  test("baskasinin randevusunda null - 404 ile 409 ayrimi sizdirmiyor", async () => {
    // Bu metot iptalin 0 satir etkilemesinin IKI sebebini ayirmak icin var.
    // Sahiplik kosulunu tasimasaydi, baskasinin randevusunda 409 doner ve
    // cagiran taraf "boyle bir randevu var ama seninki degil" demis olurdu.
    const salon = await salonKur("A Salonu");
    const ali = await musteriKur("Ali Veli");
    const veli = await musteriKur("Veli Ali");
    const randevuId = await randevuKur(salon, TOKEN_1, 600);
    await (await getMusteriDb(ali)).randevuyuHesabaEkle(TOKEN_1);

    expect(
      await (await getMusteriDb(veli)).randevuDurumunuGetir(randevuId),
    ).toBeNull();
  });

  test("iptal edilmis kendi randevusu 409 dalini besliyor", async () => {
    const salon = await salonKur("A Salonu");
    const ali = await musteriKur("Ali Veli");
    const randevuId = await randevuKur(salon, TOKEN_3, 600);
    const db = await getMusteriDb(ali);
    await db.randevuyuHesabaEkle(TOKEN_3);
    await db.randevuIptalEt(randevuId);

    // Randevu duruyor ve durumu okunabiliyor: route bunu 409 +
    // "Bu randevu iptal edilmis" olarak gosteriyor, 404 degil.
    expect(await db.randevuDurumunuGetir(randevuId)).toBe("IPTAL");
  });
});

// Faz P: token sayfasi randevunun bir hesaba bagli OLUP OLMADIGINI bilmek
// zorunda - "Hesabıma ekle" dugmesini kime cizecegine ona gore karar veriyor.
// Deger `getHalkaAcikDb > randevuTokenIleGetir` uzerinden geliyor, yani
// oturumsuz halka acik kapidan; bu testler o alanin dogru dondugunu ve
// sayfanin uc dalini besledigini kilitliyor.
describe("token ile getirilen randevu hesap bagini tasiyor", () => {
  test("baglanmamis randevuda kullaniciId NULL", async () => {
    const salon = await salonKur("A Salonu");
    await randevuKur(salon, TOKEN_1, 600);

    const acik = await getHalkaAcikDb(salon.slug);
    const kayit = await acik!.randevuTokenIleGetir(TOKEN_1);

    // Sayfa bu dalda "üye olun" davetini ya da girisli kullaniciya
    // "Hesabıma ekle" dugmesini gosteriyor.
    expect(kayit?.kullaniciId).toBeNull();
  });

  test("baglandiktan sonra SAHIBININ kimligi donuyor", async () => {
    const salon = await salonKur("A Salonu");
    const ali = await musteriKur("Ali Veli");
    await randevuKur(salon, TOKEN_1, 600);
    await (await getMusteriDb(ali)).randevuyuHesabaEkle(TOKEN_1);

    const acik = await getHalkaAcikDb(salon.slug);
    const kayit = await acik!.randevuTokenIleGetir(TOKEN_1);

    // Sayfa bunu oturumdakiyle KARSILASTIRIYOR; esitse "hesabınıza ekli"
    // diyor, degilse hicbir dugme cizmiyor - uc o durumda 409 donuyor ve
    // basildiginda calismayacak bir dugme gostermek yanlis olurdu.
    expect(kayit?.kullaniciId).toBe(ali);
  });

  test("baskasinin hesabina bagli randevu da AYNI kapidan okunuyor", async () => {
    // Token'i elinde tutan herkes sayfayi acabiliyor - degisen tek sey
    // gosterilen kutu. Yetki modeli degismedi: baglama ucu sahipligi kendi
    // dogruluyor ve baskasinin randevusuna 409 donuyor.
    const salon = await salonKur("A Salonu");
    const ali = await musteriKur("Ali Veli");
    const veli = await musteriKur("Veli Ali");
    await randevuKur(salon, TOKEN_1, 600);
    await (await getMusteriDb(ali)).randevuyuHesabaEkle(TOKEN_1);

    const acik = await getHalkaAcikDb(salon.slug);
    const kayit = await acik!.randevuTokenIleGetir(TOKEN_1);

    expect(kayit?.kullaniciId).not.toBe(veli);
    expect(
      (await (await getMusteriDb(veli)).randevuyuHesabaEkle(TOKEN_1)).durum,
    ).toBe("baskasinin");
  });
});
