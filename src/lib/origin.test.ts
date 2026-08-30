import { afterEach, expect, test } from "vitest";

import { checkOrigin } from "@/lib/origin";

// checkOrigin saf bir fonksiyon: DB'ye, cookie'ye ve global duruma dokunmuyor.
// Bu yuzden burada ne fixture ne de veritabani var - istekler `new Request` ile
// elde kuruluyor ve kontrol edilen sey yalnizca baslik kombinasyonlari.

const KENDI_HOST = "randevu.enesmemduhoglu.tech";
const KENDI_ORIGIN = `https://${KENDI_HOST}`;
const YABANCI_ORIGIN = "https://kotu-site.example";

type Secenekler = {
  metot?: string;
  basliklar?: Record<string, string>;
};

/// Gercekci bir tarayici istegi: Host daima var, geri kalani teste kaliyor.
function istek({ metot = "POST", basliklar = {} }: Secenekler = {}): Request {
  return new Request(`${KENDI_ORIGIN}/api/randevu`, {
    method: metot,
    headers: { host: KENDI_HOST, ...basliklar },
  });
}

const ILK_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  // Env geri sariliyor: vitest ayni surecte birden cok dosya kosuyor ve
  // sizan bir degisken baska bir dosyayi sessizce etkiler.
  if (ILK_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ILK_SITE_URL;
});

test("GET istegi origin olmadan gecer", () => {
  // Guvenli metotlar durum degistirmiyor; CSRF kontrolunun konusu degiller.
  expect(checkOrigin(istek({ metot: "GET" }))).toBeNull();
});

test("HEAD ve OPTIONS de guvenli metot sayilir", () => {
  expect(checkOrigin(istek({ metot: "HEAD" }))).toBeNull();
  // OPTIONS'i reddetmek tarayicinin on kontrolunu kirardi.
  expect(checkOrigin(istek({ metot: "OPTIONS" }))).toBeNull();
});

test("POST, Origin host ile ayniysa gecer", () => {
  const sonuc = checkOrigin(
    istek({ basliklar: { origin: KENDI_ORIGIN } }),
  );
  expect(sonuc).toBeNull();
});

test("POST, Origin baska bir siteyse 403", async () => {
  const sonuc = checkOrigin(
    istek({ basliklar: { origin: YABANCI_ORIGIN } }),
  );

  expect(sonuc).not.toBeNull();
  expect(sonuc?.status).toBe(403);
  const govde = (await sonuc?.json()) as { hata: string };
  expect(govde.hata).toBeTruthy();
});

test("POST, Origin yok ama Referer ayni siteyse gecer", () => {
  // Bazi tarayici ve eklentiler Origin'i kirpip Referer'i birakiyor; tam yol
  // geliyor, origin'ine indirgenmesi gerekiyor.
  const sonuc = checkOrigin(
    istek({ basliklar: { referer: `${KENDI_ORIGIN}/panel/randevular` } }),
  );
  expect(sonuc).toBeNull();
});

test("POST, Referer yabanci bir siteden geliyorsa 403", () => {
  const sonuc = checkOrigin(
    istek({ basliklar: { referer: `${YABANCI_ORIGIN}/tuzak` } }),
  );
  expect(sonuc?.status).toBe(403);
});

test("POST, ne Origin ne Referer varsa 403", () => {
  // Eksik bilgide "gecir" degil "durdur": mesru tarayici mutasyonu en az
  // birini tasir.
  expect(checkOrigin(istek())?.status).toBe(403);
});

test("POST, Authorization basligi varsa yabanci Origin'e ragmen gecer", () => {
  // Makine yolu (Cron) muafiyeti. Tarayici cross-site bir istege bu basligi
  // kendiliginden eklemedigi icin burada CSRF riski yok.
  const sonuc = checkOrigin(
    istek({
      basliklar: {
        origin: YABANCI_ORIGIN,
        authorization: "Bearer sahte-cron-sirri",
      },
    }),
  );
  expect(sonuc).toBeNull();
});

test("Origin bicimsizse 403", () => {
  // Sandbox'li iframe opak "null" origin gonderiyor; URL olarak cozulemedigi
  // icin kabul listesine giremez ve firlatma degil 403 uretmeli.
  expect(checkOrigin(istek({ basliklar: { origin: "null" } }))?.status).toBe(
    403,
  );
});

test("NEXT_PUBLIC_SITE_URL tanimliysa o origin de kabul edilir", () => {
  // Cloudflare'de custom domain ile workers.dev onizlemesi ayrisabiliyor.
  process.env.NEXT_PUBLIC_SITE_URL = "https://randevu.workers.dev";

  const sonuc = checkOrigin(
    istek({ basliklar: { origin: "https://randevu.workers.dev" } }),
  );
  expect(sonuc).toBeNull();
});

test("403 govdesi beklenen origin degerini sizdirmaz", async () => {
  // DEGISMEZ 5. Hata metni ne kendi host'umuzu ne de onizleme adresini
  // yazmali: ikisi de altyapi bilgisi ve saldirganin taklit etmesi gereken
  // degerin ta kendisi.
  process.env.NEXT_PUBLIC_SITE_URL = "https://gizli-onizleme.workers.dev";

  const sonuc = checkOrigin(
    istek({ basliklar: { origin: YABANCI_ORIGIN } }),
  );
  const metin = await sonuc!.text();

  expect(metin).not.toContain(KENDI_HOST);
  expect(metin).not.toContain("gizli-onizleme.workers.dev");
  expect(metin).not.toContain(YABANCI_ORIGIN);
  // Yine de kullaniciya bir sey soylemeli - sessiz bos govde degil.
  expect(metin.length).toBeGreaterThan(20);
});
