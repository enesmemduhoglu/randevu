import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { tablolariBosalt } from "@/db/test-temizlik";
import { isletmeKaydiOlustur } from "@/lib/kayit";
import { getHalkaAcikDb, getScopedDb, type ScopedDb } from "@/lib/scoped-db";
import { hataMetni, sahteIstek } from "@/lib/test-istek";
import { gunBasi, gunEkle, yerelDenUtc, yerelGun } from "@/lib/zaman";

import { POST } from "./route";

// UCTAN UCA entegrasyon testi: gercek Postgres'e yaziyor, mock yok.
//
// Panel route'lari vitest'te ancak kapinin CSRF adimina kadar kosabiliyor -
// oturum `cookies()` uzerinden Next'in istek baglamina giriyor ve node
// ortaminda o baglam yok. BU route oturumsuz, yani mutlu yol da, IDOR da,
// yaris da burada gercekten kosuyor.
//
// KURULUM HAM `db` KULLANMIYOR (DEGISMEZ 1). src/app altindaki her dosya - test
// dosyalari dahil - `@/lib/db`'yi import edemiyor; hem eslint hem
// degismezler.test.ts bunu tariyor. Bu yuzden kurulum uygulamanin kendi
// kapilarindan geciyor: kayit `isletmeKaydiOlustur` ile, isletme verisi
// `getScopedDb` ile, dogrulama `getHalkaAcikDb` ile. Yan faydasi, testin
// uretimin gordugu yollari kullanmasi.

const ISTANBUL = "Europe/Istanbul";

/// Randevu gunu: bugunden yedi gun sonrasi, isletmenin takviminde.
///
/// Route `simdi` degerini KENDISI okuyor (`new Date()`), yani testte zamani
/// sabitleyemiyoruz. Sabit bir takvim gunu yazsaydik test o tarih gecince
/// sessizce kirmiziya donerdi. Yedi gun, hem minOnceBildirimDk (120 dk) hem
/// maksIleriGun (60 gun) penceresinin rahatca icinde.
const GUN = gunEkle(yerelGun(new Date(), ISTANBUL), 7);

/// Slot izgarasi calisma araliginin BASINDAN adimliyor; kurulum gunu 00:00'da
/// actigi icin 15'in katlari izgaraya oturuyor.
const saat = (dakika: number) => yerelDenUtc(ISTANBUL, GUN, dakika).toISOString();

const SAAT_10 = saat(600);
const SAAT_11 = saat(660);
const SAAT_12 = saat(720);
const SAAT_14 = saat(840);
const SAAT_16 = saat(960);

const GUN_BASI = gunBasi(ISTANBUL, GUN);
const ERTESI_GUN = gunBasi(ISTANBUL, gunEkle(GUN, 1));

const MUSTERI_ADI = "Ayşe Yılmaz";
const TELEFON = "5321234567";

type Kurulum = {
  isletmeId: string;
  slug: string;
  personelId: string;
  personelAd: string;
  hizmetId: string;
  db: ScopedDb;
};

/// Ismi verilen bir isletmeyi randevu alinabilir hale getirir.
///
/// Slug'i `isletmeKaydiOlustur` uretiyor (ada gore); testler onu kayittan
/// donen degerden okuyor, elle tahmin etmiyor.
let sayac = 0;

async function isletmeKur(
  ad: string,
  { otomatikOnay = true }: { otomatikOnay?: boolean } = {},
): Promise<Kurulum> {
  sayac += 1;
  const kayit = await isletmeKaydiOlustur({
    // DEGISMEZ 9: authUserId duz bir string, auth.users'a foreign key yok -
    // test kendi kimligini uydurabiliyor.
    authUserId: `test-auth-${sayac}`,
    eposta: `sahip${sayac}@ornek.com`,
    adSoyad: "Zeynep Kaya",
    isletmeAdi: ad,
  });
  if (kayit.durum !== "tamam") {
    throw new Error(`kurulum basarisiz: ${kayit.durum}`);
  }

  const db = await getScopedDb({
    kullaniciId: kayit.kullaniciId,
    authUserId: `test-auth-${sayac}`,
    isletmeId: kayit.isletmeId,
    rol: "SAHIP",
  });

  await db.ayarlariGuncelle({ saatDilimi: ISTANBUL, otomatikOnay });

  const hizmet = await db.hizmetEkle({ ad: "Saç kesimi", sureDk: 60 });

  // Kayit varsayilan personeli kendisi olusturuyor (bkz. kayit.ts).
  const [personel] = await db.personelleriListele();

  // Haftanin YEDI gunu 00:00-24:00 acik. Gun sabit degil - "bugunden yedi gun
  // sonrasi" haftanin herhangi bir gunune dusuyor - ve tek bir gunu acmak
  // testi haftanin gunune bagli hale getirirdi.
  await db.calismaSaatleriniYaz(
    personel.id,
    [0, 1, 2, 3, 4, 5, 6].map((haftaninGunu) => ({
      haftaninGunu,
      baslangicDk: 0,
      bitisDk: 1440,
    })),
  );

  return {
    isletmeId: kayit.isletmeId,
    slug: kayit.slug,
    personelId: personel.id,
    personelAd: personel.ad,
    hizmetId: hizmet.id,
    db,
  };
}

/// Gecerli bir istek govdesi; `ek` ile tek tek alan bozulabiliyor.
function govde(k: Kurulum, ek: Record<string, unknown> = {}) {
  return {
    isletme: k.slug,
    hizmetId: k.hizmetId,
    baslangic: SAAT_10,
    ad: MUSTERI_ADI,
    telefon: TELEFON,
    ...ek,
  };
}

const istek = (
  govdeDegeri: unknown,
  secenekler: Omit<NonNullable<Parameters<typeof sahteIstek>[1]>, "govde"> = {},
) => sahteIstek("/api/randevu", { govde: govdeDegeri, ...secenekler });

type BasariliYanit = {
  randevu: {
    id: string;
    baslangic: string;
    bitis: string;
    durum: string;
    personelAd: string;
    hizmetAd: string;
  };
  iptalYolu: string;
};

async function basari(yanit: Response): Promise<BasariliYanit> {
  expect(yanit.status).toBe(201);
  return (await yanit.json()) as BasariliYanit;
}

/// Iptal yolunun sonundaki token. Token yanitin BASKA hicbir yerinde
/// gorunmuyor (DEGISMEZ 5), bu yuzden testler onu buradan cikariyor.
function tokenAl(iptalYolu: string): string {
  return iptalYolu.split("/").at(-1) ?? "";
}

async function halkaAcik(slug: string) {
  const db = await getHalkaAcikDb(slug);
  if (!db) throw new Error("isletme bulunamadi");
  return db;
}

/// O isletmenin o gundeki AKTIF randevulari. "Yazildi mi" sorusunun cevabi:
/// route'un yanitina degil veritabanina bakiyor.
async function doluSaatler(k: Kurulum) {
  const db = await halkaAcik(k.slug);
  return db.doluRandevulariListele(k.personelId, GUN_BASI, ERTESI_GUN);
}

beforeEach(async () => {
  await tablolariBosalt();
});

// Havuz burada KAPATILMIYOR: `baglantiyiKapat` @/lib/db'den geliyor ve bu dosya
// src/app altinda oldugu icin o import degismez kapisina takiliyor. Havuz
// globalThis uzerinde tekil, yani sonraki test dosyalari onu yeniden kullaniyor
// ve kosum sonunda vitest sureci kapatiyor.
afterEach(async () => {
  await tablolariBosalt();
});

// ---- Mutlu yol -------------------------------------------------------------

test("gecerli istek 201 donuyor ve randevu veritabanina yaziliyor", async () => {
  const a = await isletmeKur("A Salonu");

  const yanit = await POST(istek(govde(a)));
  const cevap = await basari(yanit);

  expect(yanit.headers.get("cache-control")).toBe("no-store");
  expect(cevap.randevu.baslangic).toBe(SAAT_10);
  // Bitisi route hesaplamiyor, motordan aliyor: 60 dakikalik hizmet 11:00.
  expect(cevap.randevu.bitis).toBe(SAAT_11);
  expect(cevap.randevu.durum).toBe("ONAYLI");
  expect(cevap.randevu.hizmetAd).toBe("Saç kesimi");
  expect(cevap.randevu.personelAd).toBe(a.personelAd);
  expect(cevap.iptalYolu).toMatch(
    new RegExp(`^/r/${a.slug}/randevu/[a-z2-9]{32}$`),
  );

  const db = await halkaAcik(a.slug);
  const kayit = await db.randevuTokenIleGetir(tokenAl(cevap.iptalYolu));
  expect(kayit?.durum).toBe("ONAYLI");
  expect(kayit?.musteriAd).toBe(MUSTERI_ADI);
  expect(kayit?.baslangic.toISOString()).toBe(SAAT_10);
});

test("otomatikOnay kapali isletmede randevu BEKLIYOR basliyor", async () => {
  const a = await isletmeKur("A Salonu", { otomatikOnay: false });

  const cevap = await basari(await POST(istek(govde(a))));

  expect(cevap.randevu.durum).toBe("BEKLIYOR");

  // BEKLIYOR da saati DOLU sayiyor - kisitin WHERE kosuluyla ayni kume.
  expect(await doluSaatler(a)).toHaveLength(1);
});

test("personel acikca secilebiliyor", async () => {
  const a = await isletmeKur("A Salonu");

  const cevap = await basari(
    await POST(istek(govde(a, { personelId: a.personelId }))),
  );

  expect(cevap.randevu.personelAd).toBe(a.personelAd);
});

test("istege bagli alanlar bos birakilabiliyor", async () => {
  // E-posta ve not opsiyonel: musterilerin bir kismi e-posta vermiyor.
  const a = await isletmeKur("A Salonu");

  const yanit = await POST(
    istek(govde(a, { eposta: "", not: undefined, personelId: "" })),
  );

  expect(yanit.status).toBe(201);
});

// ---- DEGISMEZ 2: CSRF ------------------------------------------------------

test("Origin basligi olmayan istek 403", async () => {
  const a = await isletmeKur("A Salonu");

  const yanit = await POST(istek(govde(a), { origin: null }));

  expect(yanit.status).toBe(403);
  expect(await doluSaatler(a)).toEqual([]);
});

test("yabanci Origin 403", async () => {
  const a = await isletmeKur("A Salonu");

  const yanit = await POST(
    istek(govde(a), { origin: "https://kotu-site.example" }),
  );

  expect(yanit.status).toBe(403);
  expect(await doluSaatler(a)).toEqual([]);
});

test("403 kapisi slug cozumunden ONCE calisiyor", async () => {
  // Yabanci origin + olmayan slug: cevap 404 degil 403 olmali. Sira tersine
  // donseydi yabanci bir sayfa bosuna veritabani sorgusu urettirebilirdi.
  const yanit = await POST(
    istek(
      { isletme: "hic-boyle-bir-salon-yok" },
      { origin: "https://kotu-site.example" },
    ),
  );

  expect(yanit.status).toBe(403);
});

// ---- Govde ve alan dogrulama ----------------------------------------------

test("bozuk JSON 400", async () => {
  const yanit = await POST(sahteIstek("/api/randevu", { hamGovde: "{bozuk" }));

  expect(yanit.status).toBe(400);
  expect(await hataMetni(yanit)).toBeTruthy();
});

test("telefonsuz istek 400", async () => {
  const a = await isletmeKur("A Salonu");

  const yanit = await POST(istek(govde(a, { telefon: undefined })));

  expect(yanit.status).toBe(400);
  expect(await hataMetni(yanit)).toContain("Telefon");
  expect(await doluSaatler(a)).toEqual([]);
});

test("on hane olmayan telefon 400", async () => {
  const a = await isletmeKur("A Salonu");

  const yanit = await POST(istek(govde(a, { telefon: "532 12" })));

  expect(yanit.status).toBe(400);
});

test("uuid olmayan hizmet id'si 400", async () => {
  // Veritabanina hic gitmiyor: `uuid` kolonuna "abc" gonderilseydi Postgres
  // 22P02 firlatir ve istemcinin hatasi 500'e donerdi.
  const a = await isletmeKur("A Salonu");

  const yanit = await POST(istek(govde(a, { hizmetId: "abc" })));

  expect(yanit.status).toBe(400);
  expect(await hataMetni(yanit)).toContain("Hizmet");
});

test("uuid olmayan personel id'si 400", async () => {
  const a = await isletmeKur("A Salonu");

  const yanit = await POST(istek(govde(a, { personelId: "12345" })));

  expect(yanit.status).toBe(400);
});

test("okunamayan baslangic metni 400", async () => {
  const a = await isletmeKur("A Salonu");

  const yanit = await POST(istek(govde(a, { baslangic: "yarın öğlen" })));

  expect(yanit.status).toBe(400);
});

test("adsiz istek 400", async () => {
  const a = await isletmeKur("A Salonu");

  const yanit = await POST(istek(govde(a, { ad: "" })));

  expect(yanit.status).toBe(400);
});

test("bozuk e-posta 400", async () => {
  const a = await isletmeKur("A Salonu");

  const yanit = await POST(istek(govde(a, { eposta: "ayse-at-ornek" })));

  expect(yanit.status).toBe(400);
});

test("gecmis tarih 400 DEGIL 409", async () => {
  // Gecmis bir an BICIM olarak gecerli; onu eleyen sey dogrulama degil
  // musaitlik motorunun takvim penceresi (`fark < 0`). Sozlesme bu yuzden
  // "slotSec null -> 409" diyor - ayrimin kaymadigini burada tutuyoruz.
  const a = await isletmeKur("A Salonu");
  const gecmis = yerelDenUtc(
    ISTANBUL,
    gunEkle(yerelGun(new Date(), ISTANBUL), -7),
    600,
  ).toISOString();

  const yanit = await POST(istek(govde(a, { baslangic: gecmis })));

  expect(yanit.status).toBe(409);
  expect(await doluSaatler(a)).toEqual([]);
});

test("izgaraya oturmayan saat 409", async () => {
  const a = await isletmeKur("A Salonu");

  const yanit = await POST(istek(govde(a, { baslangic: saat(607) })));

  expect(yanit.status).toBe(409);
});

// ---- Bulunamayanlar --------------------------------------------------------

test("olmayan slug 404", async () => {
  const a = await isletmeKur("A Salonu");

  const yanit = await POST(istek(govde(a, { isletme: "hic-boyle-salon-yok" })));

  expect(yanit.status).toBe(404);
  expect(await hataMetni(yanit)).toBe("Randevu sayfası bulunamadı");
});

test("metin olmayan slug 404", async () => {
  // Sayi dogrudan `eq(isletme.slug, ...)` icine girseydi Postgres tip hatasi
  // verir ve 500'e donerdi.
  const a = await isletmeKur("A Salonu");

  const yanit = await POST(istek(govde(a, { isletme: 42 })));

  expect(yanit.status).toBe(404);
});

test("pasif hizmet 404", async () => {
  const a = await isletmeKur("A Salonu");
  await a.db.hizmetPasifleStir(a.hizmetId);

  const yanit = await POST(istek(govde(a)));

  expect(yanit.status).toBe(404);
  expect(await hataMetni(yanit)).toBe("Hizmet bulunamadı");
});

// ---- IDOR ------------------------------------------------------------------

test("IDOR: A'nin slug'i + B'nin hizmet id'si 404, B'ye randevu yazilmiyor", async () => {
  const a = await isletmeKur("A Salonu");
  const b = await isletmeKur("B Salonu");

  const yanit = await POST(istek(govde(a, { hizmetId: b.hizmetId })));

  // Baskasinin kaydi ile hic olmayan kayit AYNI gorunuyor: aksi halde bir
  // salonun hizmet id'sinin gecerli oldugu sizardi.
  expect(yanit.status).toBe(404);
  expect(await hataMetni(yanit)).toBe("Hizmet bulunamadı");

  expect(await doluSaatler(b)).toEqual([]);
  expect(await doluSaatler(a)).toEqual([]);
});

test("IDOR: A'nin slug'i + B'nin personel id'si 409, kimseye yazilmiyor", async () => {
  const a = await isletmeKur("A Salonu");
  const b = await isletmeKur("B Salonu");

  const yanit = await POST(istek(govde(a, { personelId: b.personelId })));

  // B'nin personeli A'nin aday listesinde yok, yani hicbir slot uretilmiyor.
  expect(yanit.status).toBe(409);
  expect(await doluSaatler(b)).toEqual([]);
  expect(await doluSaatler(a)).toEqual([]);
});

test("IDOR: B'nin dolu sayfasi A'nin saatlerini kapatmiyor", async () => {
  const a = await isletmeKur("A Salonu");
  const b = await isletmeKur("B Salonu");

  await basari(await POST(istek(govde(b))));

  // Ayni saat, baska isletme: cakisma kisiti personel bazli, kiraciyi
  // karistirmiyor.
  const yanit = await POST(istek(govde(a)));

  expect(yanit.status).toBe(201);
  expect(await doluSaatler(a)).toHaveLength(1);
  expect(await doluSaatler(b)).toHaveLength(1);
});

// ---- Musteri tekilleme -----------------------------------------------------

test("ayni telefonla ikinci randevu tek musteri kaydi uretiyor", async () => {
  const a = await isletmeKur("A Salonu");

  const ilk = await basari(await POST(istek(govde(a))));
  const ikinci = await basari(
    await POST(istek(govde(a, { baslangic: SAAT_12, ad: "Ayse Y." }))),
  );

  const db = await halkaAcik(a.slug);

  // Ikinci randevu ILK kaydin adiyla donuyor. Iki ayri musteri satiri olsaydi
  // "Ayse Y." geri gelirdi; tek satir oldugu icin donen ad ilkiyle ayni -
  // scoped-db mevcut musterinin adini BILEREK guncellemiyor (oturumsuz yol,
  // numarayi bilen bir yabanci baskasinin adini degistirebilirdi).
  expect((await db.randevuTokenIleGetir(tokenAl(ilk.iptalYolu)))?.musteriAd).toBe(
    MUSTERI_ADI,
  );
  expect(
    (await db.randevuTokenIleGetir(tokenAl(ikinci.iptalYolu)))?.musteriAd,
  ).toBe(MUSTERI_ADI);
});

test("ayni telefon BASKA isletmede ayri musteri", async () => {
  const a = await isletmeKur("A Salonu");
  const b = await isletmeKur("B Salonu");

  await basari(await POST(istek(govde(a))));
  const bDeki = await basari(await POST(istek(govde(b, { ad: "Ayse Y." }))));

  // Numara ayni ama kiraci farkli: b'de yeni bir musteri acildi, yani gonderilen
  // ad aynen yazildi. Notlar ve gecmis kiraciya ait (sema: musteri).
  const db = await halkaAcik(b.slug);
  expect(
    (await db.randevuTokenIleGetir(tokenAl(bDeki.iptalYolu)))?.musteriAd,
  ).toBe("Ayse Y.");
});

// ---- DEGISMEZ 8: yaris -----------------------------------------------------

test("ayni slota yarisan iki istek: biri 201 digeri 409", async () => {
  // Garanti uygulama katmaninda DEGIL veritabaninda: iki istek de musaitlik
  // motorunda sloti "bos" gorebiliyor, ikincisini EXCLUDE kisiti durduruyor.
  //
  // UC TUR aynen kosuluyor cunku kaybedenin gordugu hata zamanlamaya bagli:
  // ikinci istek digeri COMMIT ettikten sonra gelirse 23P01, ikisi ayni anda
  // yaziyorsa Postgres birini kurban secip 40P01 (kilitlenme) firlatiyor.
  // Ikisi de 409 olmali - tek tur kosan bir test 40P01 dalini aylarca
  // gormeyebilirdi.
  const a = await isletmeKur("A Salonu");
  const turlar: [string, string, string][] = [
    [SAAT_10, "5320000001", "5320000002"],
    [SAAT_12, "5320000003", "5320000004"],
    [SAAT_14, "5320000005", "5320000006"],
  ];

  for (const [baslangic, telefonBir, telefonIki] of turlar) {
    const yanitlar = await Promise.all([
      POST(istek(govde(a, { baslangic, telefon: telefonBir }))),
      POST(
        istek(
          govde(a, {
            baslangic,
            telefon: telefonIki,
            ad: "Fatma Demir",
          }),
        ),
      ),
    ]);

    // 500 ozellikle disarida: yarisi kaybeden musteriye "sunucu bozuldu"
    // demek, "o saat doldu" demekten baska bir sey.
    expect(yanitlar.map((y) => y.status).sort()).toEqual([201, 409]);
  }

  expect(await doluSaatler(a)).toHaveLength(turlar.length);
});

test("dolu slota gelen ikinci istek 409 ve baskasinin verisini sizdirmiyor", async () => {
  const a = await isletmeKur("A Salonu");
  const ilk = await basari(await POST(istek(govde(a))));

  const yanit = await POST(
    istek(govde(a, { ad: "Fatma Demir", telefon: "5329998877" })),
  );

  expect(yanit.status).toBe(409);

  // DEGISMEZ 5: hata govdesi ne o saatteki randevunun iptal token'ini ne de
  // musterisinin adini tasiyor. Token tek basina iptal yetkisi veriyor.
  const metin = await yanit.text();
  expect(metin).not.toContain(tokenAl(ilk.iptalYolu));
  expect(metin).not.toContain("Ayşe");
});

test("bitisik randevu cakisma sayilmiyor", async () => {
  // Kisitin araligi '[)': 10:00-11:00 ile 11:00-12:00 yan yana durabiliyor.
  const a = await isletmeKur("A Salonu");

  await basari(await POST(istek(govde(a))));
  const yanit = await POST(istek(govde(a, { baslangic: SAAT_11 })));

  expect(yanit.status).toBe(201);
  expect(await doluSaatler(a)).toHaveLength(2);
});

// ---- Acik randevu siniri ---------------------------------------------------

test("acik randevu siniri asilinca 429", async () => {
  const a = await isletmeKur("A Salonu");

  // Ucu de ayni numarayla: sinir musteri basina sayiliyor, yani bu test ayni
  // zamanda tekillemenin calistigini gosteriyor - her istek yeni bir musteri
  // acsaydi sinir hic tetiklenmezdi.
  for (const baslangic of [SAAT_10, SAAT_12, SAAT_14]) {
    expect((await POST(istek(govde(a, { baslangic })))).status).toBe(201);
  }

  const dorduncu = await POST(istek(govde(a, { baslangic: SAAT_16 })));

  expect(dorduncu.status).toBe(429);
  expect(await hataMetni(dorduncu)).toContain("3");
  expect(await doluSaatler(a)).toHaveLength(3);
});

test("sinir BASKA numarayi engellemiyor", async () => {
  const a = await isletmeKur("A Salonu");

  for (const baslangic of [SAAT_10, SAAT_12, SAAT_14]) {
    await basari(await POST(istek(govde(a, { baslangic }))));
  }

  const yanit = await POST(
    istek(
      govde(a, {
        baslangic: SAAT_16,
        ad: "Fatma Demir",
        telefon: "5329998877",
      }),
    ),
  );

  expect(yanit.status).toBe(201);
  expect(await doluSaatler(a)).toHaveLength(4);
});

// ---- Turnstile kapisi (Faz G2) ---------------------------------------------
//
// Butun dosyanin geri kalani `sahte` modda kosuyor: .env'de TURNSTILE_MODU yok
// ve kapi geciriyor. Buradaki testler modu TEK TEST icin gercege alip geri
// sariyor - kapinin acikken de kapaliyken de dogru davrandigini gormek icin.

const ILK_TURNSTILE_MODU = process.env.TURNSTILE_MODU;
const ILK_TURNSTILE_SIR = process.env.TURNSTILE_SECRET;

/// Turnstile'i gercek moda alir ve siteverify'i taklit eder.
function turnstileAc(gecerli: boolean) {
  process.env.TURNSTILE_MODU = "gercek";
  process.env.TURNSTILE_SECRET = "test-sirri";

  // YALNIZCA siteverify yakalaniyor. Global fetch'i tumden degistirmek, ayni
  // surecte kosan baska bir seyin agi sessizce kaybetmesine yol acardi.
  vi.stubGlobal("fetch", async (url: string) => {
    if (String(url).includes("siteverify")) {
      return new Response(JSON.stringify({ success: gecerli }), {
        status: 200,
      });
    }
    throw new Error(`beklenmeyen fetch: ${String(url)}`);
  });
}

function turnstileKapat() {
  if (ILK_TURNSTILE_MODU === undefined) delete process.env.TURNSTILE_MODU;
  else process.env.TURNSTILE_MODU = ILK_TURNSTILE_MODU;
  if (ILK_TURNSTILE_SIR === undefined) delete process.env.TURNSTILE_SECRET;
  else process.env.TURNSTILE_SECRET = ILK_TURNSTILE_SIR;
  vi.unstubAllGlobals();
}

test("gercek modda jetonsuz istek 403 ve randevu YAZILMIYOR", async () => {
  const a = await isletmeKur("A Salonu");
  turnstileAc(true);

  try {
    const yanit = await POST(istek(govde(a)));

    expect(yanit.status).toBe(403);
    // Kapinin gercekten kapali olmasi, yalnizca durum kodunun degismesi
    // degil: veritabaninda hicbir sey olmamali.
    expect(await doluSaatler(a)).toHaveLength(0);
  } finally {
    turnstileKapat();
  }
});

test("gercek modda gecerli jeton 201 aliyor", async () => {
  const a = await isletmeKur("A Salonu");
  turnstileAc(true);

  try {
    const yanit = await POST(istek({ ...govde(a), turnstile: "gecerli" }));

    expect(yanit.status).toBe(201);
  } finally {
    turnstileKapat();
  }
});

test("Cloudflare jetonu reddederse 403", async () => {
  const a = await isletmeKur("A Salonu");
  turnstileAc(false);

  try {
    const yanit = await POST(istek({ ...govde(a), turnstile: "tekrar" }));

    expect(yanit.status).toBe(403);
    expect(await doluSaatler(a)).toHaveLength(0);
  } finally {
    turnstileKapat();
  }
});

test("Turnstile kapisi SLUG COZUMUNDEN once calisiyor", async () => {
  // Olmayan bir slug + jetonsuz istek 404 degil 403 almali: bot kapisindan
  // gecemeyen istek veritabanina tek sorgu bile actirmamali.
  await isletmeKur("A Salonu");
  turnstileAc(true);

  try {
    const yanit = await POST(
      istek({ ...govde(await isletmeKur("B Salonu")), isletme: "yok-boyle" }),
    );

    expect(yanit.status).toBe(403);
  } finally {
    turnstileKapat();
  }
});

test("403 govdesi Cloudflare'in sebebini SIZDIRMIYOR", async () => {
  const a = await isletmeKur("A Salonu");
  turnstileAc(false);

  try {
    const yanit = await POST(istek({ ...govde(a), turnstile: "kotu" }));
    const metin = await hataMetni(yanit);

    // Ne sir, ne Cloudflare'in hata kodlari, ne de hangi dalda kaldigi.
    expect(metin).not.toContain("test-sirri");
    expect(metin).not.toContain("turnstile");
    expect(metin).not.toContain("Turnstile");
    expect(metin).toContain("Doğrulama tamamlanamadı");
  } finally {
    turnstileKapat();
  }
});
