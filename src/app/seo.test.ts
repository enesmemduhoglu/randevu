import { afterEach, beforeEach, expect, test } from "vitest";

import { tablolariBosalt } from "@/db/test-temizlik";
import { isletmeKaydiOlustur } from "@/lib/kayit";
import { getScopedDb } from "@/lib/scoped-db";

import robots from "./robots";
import sitemap from "./sitemap";
import { generateMetadata as dizinMetadata } from "./dizin/page";

// ROBOTS VE SITEMAP ENTEGRASYON TESTI (Faz O).
//
// Neden test edilmesi gerekiyor: bu iki dosya kullanicinin hic gormedigi bir
// yuzey. Bozulduklarinda ekranda hicbir sey degismiyor - yalnizca arama motoru
// yanlis seyi yapiyor ve bunu aylar sonra trafikten anliyoruz. Faz L'deki
// "uretimde sessizce kapali kalan Turnstile" ile ayni sinif.
//
// Kurulum uygulamanin kendi kapilarindan geciyor (DEGISMEZ 1): ham `db` yok.

const ISTANBUL = "Europe/Istanbul";

let sayac = 0;

/// Dizinde GORUNEN bir isletme kurar. Gorunurluk iki kosula bagli:
/// `aktif` ve `yayinda` (bkz. dizin.ts).
async function yayindaIsletme(ad: string, il: string, kategori: string) {
  sayac += 1;
  const kayit = await isletmeKaydiOlustur({
    authUserId: `seo-auth-${sayac}`,
    eposta: `seo${sayac}@ornek.com`,
    adSoyad: "Zeynep Kaya",
    isletmeAdi: ad,
  });
  if (kayit.durum !== "tamam") throw new Error(`kurulum: ${kayit.durum}`);

  const db = await getScopedDb({
    kullaniciId: kayit.kullaniciId,
    authUserId: `seo-auth-${sayac}`,
    isletmeId: kayit.isletmeId,
    rol: "SAHIP",
  });

  await db.ayarlariGuncelle({ saatDilimi: ISTANBUL, il, ilce: "Kadıköy", kategori });
  await db.hizmetEkle({ ad: "Saç kesimi", sureDk: 30, fiyatKurus: 25000 });

  // Yayina cikis on kosullu: hizmet, personel ve calisma saati sart
  // (bkz. scoped-db > yayindaAyarla). Kayit varsayilan personeli kendisi
  // aciyor; calisma saatini burada yaziyoruz.
  const [personel] = await db.personelleriListele();
  await db.calismaSaatleriniYaz(personel.id, [
    { haftaninGunu: 2, baslangicDk: 540, bitisDk: 1080 },
  ]);

  const sonuc = await db.yayindaAyarla(true);
  if (sonuc.durum !== "tamam") {
    throw new Error(`yayina cikmadi: ${JSON.stringify(sonuc)}`);
  }

  return { slug: kayit.slug };
}

beforeEach(async () => {
  await tablolariBosalt();
});

afterEach(async () => {
  await tablolariBosalt();
});

// ---- robots.txt ------------------------------------------------------------

test("robots kisisel ve makine yollarini kapatiyor", () => {
  const kural = robots().rules;
  const ilk = Array.isArray(kural) ? kural[0] : kural;
  const kapali = ilk.disallow as string[];

  for (const yol of ["/api/", "/panel/", "/randevularim"]) {
    expect(kapali).toContain(yol);
  }
});

test("iptal token'i tasiyan adresler taranmiyor", () => {
  // Bu satir DEGISMEZ 5'in disari bakan yuzu: URL tek basina iptal yetkisi
  // tasiyor. Sayfada ayrica `noindex` var - iki kapi ust uste, cunku robots.txt
  // bir rica ve meta etiketi ancak sayfa TARANIRSA goruluyor.
  const kural = robots().rules;
  const ilk = Array.isArray(kural) ? kural[0] : kural;
  expect(ilk.disallow as string[]).toContain("/r/*/randevu/");
});

test("robots dizinin sorgu parametrelerini KAPATMIYOR", () => {
  // Bilincli. Taranmasi engellenen bir sayfanin `canonical` etiketi de
  // okunamaz; o zaman motor icerigin aslinin nerede oldugunu hic ogrenemez.
  const kural = robots().rules;
  const ilk = Array.isArray(kural) ? kural[0] : kural;
  const kapali = (ilk.disallow as string[]).join(" ");
  expect(kapali).not.toContain("/dizin");
});

test("robots sitemap adresini mutlak veriyor", () => {
  // Goreli bir sitemap adresi protokole aykiri; motor dosyayi yok sayiyor.
  expect(robots().sitemap).toMatch(/^https?:\/\/.+\/sitemap\.xml$/);
});

// ---- sitemap.xml -----------------------------------------------------------

test("sitemap yayindaki isletmeyi ve inis sayfalarini tasiyor", async () => {
  const { slug } = await yayindaIsletme("Işıl Kuaför", "İstanbul", "Kuaför");

  const girdiler = await sitemap();
  const adresler = girdiler.map((g) => g.url);

  expect(adresler.some((a) => a.endsWith("/dizin"))).toBe(true);
  expect(adresler.some((a) => a.endsWith("/dizin/istanbul"))).toBe(true);
  expect(adresler.some((a) => a.endsWith("/dizin/istanbul/kuafor"))).toBe(true);
  expect(adresler.some((a) => a.endsWith(`/r/${slug}`))).toBe(true);

  // Butun adresler MUTLAK olmali.
  for (const adres of adresler) expect(adres).toMatch(/^https?:\/\//);
});

test("sitemap BOS inis sayfalarini one surmuyor", async () => {
  // 81 il x 9 kategori = 729 adres. Icerigi olmayanlari sitemap'e koymak,
  // arama motoruna "bunlar onemli" deyip bos sayfalara goturmek olurdu.
  await yayindaIsletme("Işıl Kuaför", "İstanbul", "Kuaför");

  const adresler = (await sitemap()).map((g) => g.url);

  expect(adresler.some((a) => a.endsWith("/dizin/bursa"))).toBe(false);
  expect(adresler.some((a) => a.endsWith("/dizin/istanbul/berber"))).toBe(false);
});

test("yayinda olmayan isletme sitemap'e girmiyor", async () => {
  // Dizin gorunurlugunun tek kaynagi `yayinda` + `aktif` (dizin.ts). Sitemap
  // ayrisirsa, dizinden kendini cekmis bir isletme arama sonucunda kalirdi.
  sayac += 1;
  const kayit = await isletmeKaydiOlustur({
    authUserId: `seo-auth-${sayac}`,
    eposta: `seo${sayac}@ornek.com`,
    adSoyad: "Zeynep Kaya",
    isletmeAdi: "Gizli Salon",
  });
  if (kayit.durum !== "tamam") throw new Error("kurulum");

  const adresler = (await sitemap()).map((g) => g.url);
  expect(adresler.some((a) => a.endsWith(`/r/${kayit.slug}`))).toBe(false);
});

// ---- faceted navigation ----------------------------------------------------

async function dizinMeta(arananlar: Record<string, string>) {
  return dizinMetadata(
    {
      params: Promise.resolve({}),
      searchParams: Promise.resolve(arananlar),
    } as unknown as Parameters<typeof dizinMetadata>[0],
  );
}

test("filtresiz dizin kendini gosteriyor", async () => {
  const meta = await dizinMeta({});
  expect(meta.alternates?.canonical).toBe("/dizin");
  expect(meta.robots).toBeUndefined();
});

test("il filtresi inis sayfasini canonical gosteriyor", async () => {
  const meta = await dizinMeta({ il: "İstanbul" });
  expect(meta.alternates?.canonical).toBe("/dizin/istanbul");
});

test("il + kategori filtresi iki parcali inis sayfasini gosteriyor", async () => {
  const meta = await dizinMeta({ il: "İstanbul", kategori: "Kuaför" });
  expect(meta.alternates?.canonical).toBe("/dizin/istanbul/kuafor");
});

test("arama ve ileri sayfalar noindex", async () => {
  // Karsiligi olan bir inis sayfasi yok; dizine girmeleri yinelenen icerik
  // demek. `follow` acik kaliyor - isletme sayfalarina giden baglantilar
  // izlensin.
  const durumlar: Record<string, string>[] = [
    { arama: "isil" },
    { il: "İstanbul", sayfa: "2" },
    { kategori: "Kuaför" },
  ];
  for (const arananlar of durumlar) {
    const meta = await dizinMeta(arananlar);
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates?.canonical).toBeUndefined();
  }
});

test("gecersiz il degeri canonical uretmiyor", async () => {
  // Uydurulmus bir parametre inis sayfasi adresi uretemez; yoksa sitemap'te
  // olmayan, 404 veren bir canonical hedefi gosterirdik.
  const meta = await dizinMeta({ il: "Atlantis" });
  expect(meta.alternates?.canonical).toBe("/dizin");
});
