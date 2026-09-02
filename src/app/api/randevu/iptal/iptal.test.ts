import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { tablolariBosalt } from "@/db/test-temizlik";
import { isletmeKaydiOlustur } from "@/lib/kayit";
import { slugUret } from "@/lib/slug";
import {
  getHalkaAcikDb,
  getScopedDb,
  type IsletmeOturumu,
} from "@/lib/scoped-db";
import { hataMetni, sahteIstek } from "@/lib/test-istek";
import { gunBasi, gunEkle, yerelDenUtc } from "@/lib/zaman";

import { POST } from "./route";

// Bu route UCTAN UCA sinaniyor: `cookies()` kullanmiyor, yani Next'in istek
// baglami olmadan da kosuyor ve gercek Postgres'e yaziyor. Panel route'larinin
// testleri (ornegin hizmetler.test.ts) yalnizca kapinin ilk dilimini
// sinayabiliyordu; burada mutlu yol da, yarisan ikinci karar da gercek.
//
// KURULUM NEDEN HAM `db` ILE DEGIL: bu dosya `src/app` altinda ve DEGISMEZ 1
// oradan `@/lib/db` import edilmesini yasakliyor - kural hem eslint'te
// (no-restricted-imports) hem `degismezler.test.ts`'te dosya okuyarak
// zorlaniyor ve ikisi de test dosyalarini ayirt etmiyor. Bu yuzden kurulum
// kapi disi ve kapsamli yardimcilarla yapiliyor: kayit icin `isletmeKaydiOlustur`,
// isletmenin kendi verisi icin `getScopedDb`, randevu icin `getHalkaAcikDb >
// randevuOlustur` (kendi token'imizi o metot zaten disaridan aliyor).

const ISTANBUL = "Europe/Istanbul";
/// 1 Eylul 2026 Sali. Kurulumdaki calisma saati bu gune yaziliyor.
const SALI = { yil: 2026, ay: 9, gun: 1 };
/// Randevu yazilirken motora verilen "su an" - randevu hep gelecekte kaliyor.
const SIMDI = new Date("2026-08-25T06:00:00Z");

const BASLANGIC = yerelDenUtc(ISTANBUL, SALI, 600); // yerel 10:00
const BITIS = yerelDenUtc(ISTANBUL, SALI, 660); // yerel 11:00
const GUN_BASI = gunBasi(ISTANBUL, SALI);
const GUN_SONU = gunBasi(ISTANBUL, gunEkle(SALI, 1));

/// Bicimi tutan ama uretilmemis token'lar: testte hangi degerin gittigini
/// gormek, rastgele bir dizeyi izlemekten kolay. Harfler `iptal-token.ts`
/// alfabesinde ve uzunluk tam 32 - yani `iptalTokenGecerliMi` kabul ediyor.
const TOKEN_A = "a".repeat(32);
const TOKEN_B = "b".repeat(32);
/// Bicimi tutmayanlar: biri kisa, digeri alfabede olmayan karakter tasiyor
/// (0 ve 1 karisan karakterler oldugu icin alfabeye hic alinmadi).
const KISA_TOKEN = "abc";
const YABANCI_KARAKTERLI_TOKEN = "0".repeat(32);

type Kurulum = {
  slug: string;
  personelId: string;
  hizmetId: string;
};

async function isletmeKur(isletmeAdi: string): Promise<Kurulum> {
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

  // Kayit varsayilan personeli zaten aciyor (bkz. kayit.ts); ikinci bir tane
  // eklemek gercek kurulumdan uzaklasmak olurdu.
  const [personel] = await db.personelleriListele();
  const hizmet = await db.hizmetEkle({ ad: "Saç kesimi", sureDk: 60 });

  // Sali 09:00-18:00: iptalden sonra saatin gercekten bosaldigini
  // gorebilmek icin gun acik olmali.
  await db.calismaSaatleriniYaz(personel.id, [
    { haftaninGunu: 2, baslangicDk: 540, bitisDk: 1080 },
  ]);

  return { slug: kayit.slug, personelId: personel.id, hizmetId: hizmet.id };
}

async function halkaAcik(slug: string) {
  const db = await getHalkaAcikDb(slug);
  if (!db) throw new Error(`isletme bulunamadi: ${slug}`);
  return db;
}

/// Randevuyu KENDI token'imizla yazar. `randevuOlustur` token'i disaridan
/// aliyor, yani ham insert'e gerek kalmiyor.
async function randevuKur(k: Kurulum, token: string) {
  const db = await halkaAcik(k.slug);

  const sonuc = await db.randevuOlustur({
    personelId: k.personelId,
    hizmetId: k.hizmetId,
    baslangic: BASLANGIC,
    bitis: BITIS,
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
  return sonuc.randevu;
}

async function durumOku(slug: string, token: string): Promise<string | null> {
  const db = await halkaAcik(slug);
  return (await db.randevuTokenIleGetir(token))?.durum ?? null;
}

/// O gun personelin saatini DOLU sayan randevular. `doluRandevulariListele`
/// yalnizca BEKLIYOR ve ONAYLI'yi getiriyor, yani bos donmesi "saat serbest"
/// demek (EXCLUDE kisitiyla ayni kume - bkz. DEGISMEZ 8).
async function doluAralikSayisi(k: Kurulum): Promise<number> {
  const db = await halkaAcik(k.slug);
  const dolular = await db.doluRandevulariListele(
    k.personelId,
    GUN_BASI,
    GUN_SONU,
  );
  return dolular.length;
}

const istek = (secenekler?: Parameters<typeof sahteIstek>[1]) =>
  sahteIstek("/api/randevu/iptal", secenekler);

beforeEach(async () => {
  await tablolariBosalt();
});

afterAll(async () => {
  // Havuz burada KAPATILMIYOR: `baglantiyiKapat` @/lib/db'de ve bu dosya
  // src/app altinda (DEGISMEZ 1). Havuz `globalThis` uzerinde yasiyor ve
  // src/lib altindaki entegrasyon testleri kendi afterAll'larinda kapatiyor;
  // `fileParallelism: false` oldugu icin ikisi ayni anda kosmuyor.
  await tablolariBosalt();
});

describe("mutlu yol", () => {
  test("gecerli token randevuyu IPTAL ediyor", async () => {
    const a = await isletmeKur("A Salonu");
    await randevuKur(a, TOKEN_A);

    const yanit = await POST(istek({ govde: { isletme: a.slug, token: TOKEN_A } }));

    expect(yanit.status).toBe(200);
    expect(await yanit.json()).toEqual({ iptal: true });
    expect(await durumOku(a.slug, TOKEN_A)).toBe("IPTAL");
  });

  test("yanit onbelleklenmiyor", async () => {
    // Bayat bir "iptal edildi" cevabi, iptal edilmemis bir randevuyu iptal
    // edilmis gostermek demek olurdu.
    const a = await isletmeKur("A Salonu");
    await randevuKur(a, TOKEN_A);

    const yanit = await POST(istek({ govde: { isletme: a.slug, token: TOKEN_A } }));
    expect(yanit.headers.get("cache-control")).toBe("no-store");
  });

  test("iptal edilen randevu SAATI BOSALTIYOR", async () => {
    const a = await isletmeKur("A Salonu");
    await randevuKur(a, TOKEN_A);

    expect(await doluAralikSayisi(a)).toBe(1);

    await POST(istek({ govde: { isletme: a.slug, token: TOKEN_A } }));

    // Randevu silinmiyor - isletme iptali gormek istiyor - ama saat yeniden
    // satilabilir olmali.
    expect(await doluAralikSayisi(a)).toBe(0);
    expect(await durumOku(a.slug, TOKEN_A)).toBe("IPTAL");
  });
});

describe("DEGISMEZ 2 - CSRF kapisi", () => {
  test("Origin basligi olmayan istek 403", async () => {
    const a = await isletmeKur("A Salonu");
    await randevuKur(a, TOKEN_A);

    const yanit = await POST(
      istek({ origin: null, govde: { isletme: a.slug, token: TOKEN_A } }),
    );

    expect(yanit.status).toBe(403);
    // Kapi gecilseydi randevu iptal olurdu; durum bunu kilitliyor.
    expect(await durumOku(a.slug, TOKEN_A)).toBe("ONAYLI");
  });

  test("yabanci Origin 403 ve randevuya dokunmuyor", async () => {
    const a = await isletmeKur("A Salonu");
    await randevuKur(a, TOKEN_A);

    const yanit = await POST(
      istek({
        origin: "https://kotu-site.example",
        govde: { isletme: a.slug, token: TOKEN_A },
      }),
    );

    expect(yanit.status).toBe(403);
    expect(await durumOku(a.slug, TOKEN_A)).toBe("ONAYLI");
  });

  test("403 govdesi token'i geri yansitmiyor", async () => {
    // DEGISMEZ 5: token tek basina yetki tasiyor; reddedilen bir istegin
    // yanitina kopyalanmasi onu log'lara ve hata izleme araclarina tasir.
    const yanit = await POST(
      istek({
        origin: "https://kotu-site.example",
        govde: { isletme: "a-salonu", token: TOKEN_A },
      }),
    );

    expect(await yanit.text()).not.toContain(TOKEN_A);
  });
});

describe("bozuk girdi", () => {
  test("bozuk JSON 400", async () => {
    const yanit = await POST(istek({ hamGovde: "{ bozuk" }));

    expect(yanit.status).toBe(400);
    expect(await hataMetni(yanit)).toContain("İstek okunamadı");
  });

  test("kisa token 400", async () => {
    const a = await isletmeKur("A Salonu");

    const yanit = await POST(
      istek({ govde: { isletme: a.slug, token: KISA_TOKEN } }),
    );

    expect(yanit.status).toBe(400);
  });

  test("alfabede olmayan karakter tasiyan token 400", async () => {
    const a = await isletmeKur("A Salonu");

    const yanit = await POST(
      istek({ govde: { isletme: a.slug, token: YABANCI_KARAKTERLI_TOKEN } }),
    );

    expect(yanit.status).toBe(400);
  });

  test("token metin degilse 400 - Postgres'e hic gitmiyor", async () => {
    // Sayi gonderilseydi ve bicim kontrolu olmasaydi sorgu tip hatasiyla
    // duser, istemcinin hatasi 500'e donerdi.
    const a = await isletmeKur("A Salonu");

    const yanit = await POST(istek({ govde: { isletme: a.slug, token: 42 } }));
    expect(yanit.status).toBe(400);
  });

  test("400 govdesi token'i geri yansitmiyor", async () => {
    const a = await isletmeKur("A Salonu");

    const yanit = await POST(
      istek({ govde: { isletme: a.slug, token: YABANCI_KARAKTERLI_TOKEN } }),
    );

    expect(await yanit.text()).not.toContain(YABANCI_KARAKTERLI_TOKEN);
  });
});

describe("bulunamayan kayitlar", () => {
  test("olmayan slug 404", async () => {
    await isletmeKur("A Salonu");

    const yanit = await POST(
      istek({ govde: { isletme: "boyle-bir-salon-yok", token: TOKEN_A } }),
    );

    expect(yanit.status).toBe(404);
  });

  test("isletme alani eksikse 404", async () => {
    const yanit = await POST(istek({ govde: { token: TOKEN_A } }));
    expect(yanit.status).toBe(404);
  });

  test("olmayan token 404", async () => {
    const a = await isletmeKur("A Salonu");
    await randevuKur(a, TOKEN_A);

    // Bicimi tutuyor ama karsiligi yok.
    const yanit = await POST(istek({ govde: { isletme: a.slug, token: TOKEN_B } }));

    expect(yanit.status).toBe(404);
    // Yanlis token baska bir randevuyu iptal etmemeli.
    expect(await durumOku(a.slug, TOKEN_A)).toBe("ONAYLI");
  });

  test("404 govdesi token'i geri yansitmiyor", async () => {
    const a = await isletmeKur("A Salonu");

    const yanit = await POST(istek({ govde: { isletme: a.slug, token: TOKEN_B } }));
    expect(await yanit.text()).not.toContain(TOKEN_B);
  });
});

describe("IDOR - halka acik yol", () => {
  test("A'nin token'i B'nin slug'iyla 404, randevu HALA aktif", async () => {
    const a = await isletmeKur("A Salonu");
    const b = await isletmeKur("B Salonu");
    await randevuKur(a, TOKEN_A);

    // Token dogru, slug yabanci. `randevuIptalEt`'in where'i isletmeId'yi de
    // tasidigi icin B'nin kapisindan A'nin randevusuna ulasilamiyor.
    const yanit = await POST(istek({ govde: { isletme: b.slug, token: TOKEN_A } }));

    expect(yanit.status).toBe(404);
    expect(await durumOku(a.slug, TOKEN_A)).toBe("ONAYLI");
    // Saat de dolu kalmali: iptal olmadigina gore takvim degismedi.
    expect(await doluAralikSayisi(a)).toBe(1);
  });

  test("B'nin sayfasi A'nin randevusunu OKUYAMIYOR da", async () => {
    const a = await isletmeKur("A Salonu");
    const b = await isletmeKur("B Salonu");
    await randevuKur(a, TOKEN_A);

    const bDb = await halkaAcik(b.slug);
    expect(await bDb.randevuTokenIleGetir(TOKEN_A)).toBeNull();
  });
});

describe("DEGISMEZ 3 - yarisan ikinci karar", () => {
  test("ayni token iki kez: ikincisi 409", async () => {
    const a = await isletmeKur("A Salonu");
    await randevuKur(a, TOKEN_A);

    const ilk = await POST(istek({ govde: { isletme: a.slug, token: TOKEN_A } }));
    const ikinci = await POST(istek({ govde: { isletme: a.slug, token: TOKEN_A } }));

    expect(ilk.status).toBe(200);
    expect(ikinci.status).toBe(409);
    // Mesaj NE OLDUGUNU soyluyor; "olmadi" demek kullaniciyi ayni dugmeye
    // tekrar bastirirdi.
    expect(await hataMetni(ikinci)).toContain("zaten iptal");
  });

  test("ayni anda gelen iki iptal: biri 200, digeri 409", async () => {
    const a = await isletmeKur("A Salonu");
    await randevuKur(a, TOKEN_A);

    // Kosullu UPDATE'in where'i beklenen durumu tasidigi icin ikinci istek
    // 0 satir etkiliyor. Once-oku-sonra-yaz olsaydi ikisi de "aktif" gorup
    // ikisi de basarili donerdi.
    const yanitlar = await Promise.all([
      POST(istek({ govde: { isletme: a.slug, token: TOKEN_A } })),
      POST(istek({ govde: { isletme: a.slug, token: TOKEN_A } })),
    ]);

    expect(yanitlar.map((y) => y.status).sort()).toEqual([200, 409]);
    expect(await durumOku(a.slug, TOKEN_A)).toBe("IPTAL");
    expect(await doluAralikSayisi(a)).toBe(0);
  });
});
