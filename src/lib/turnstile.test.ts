import { afterEach, expect, test, vi } from "vitest";

import { ortamiSil } from "@/lib/test-ortam";
import { istekIpsi, turnstileDogrula } from "@/lib/turnstile";

// Veritabani yok: bu katman yalnizca env okuyup Cloudflare'e HTTP acıyor.
// `fetch` stub'laniyor cunku gercek siteverify'a cikan bir test hem ag
// baglantisina bagimli olurdu hem de gecerli bir jeton uretemezdi - Turnstile
// jetonu yalnizca gercek bir widget'tan cikiyor.

const ILK_MOD = process.env.TURNSTILE_MODU;
const ILK_SIR = process.env.TURNSTILE_SECRET;

afterEach(() => {
  // Env geri sariliyor: vitest ayni surecte birden cok dosya kosuyor ve sizan
  // bir degisken baska bir dosyayi sessizce etkiler (bkz. origin.test.ts).
  if (ILK_MOD === undefined) ortamiSil("TURNSTILE_MODU");
  else process.env.TURNSTILE_MODU = ILK_MOD;
  if (ILK_SIR === undefined) delete process.env.TURNSTILE_SECRET;
  else process.env.TURNSTILE_SECRET = ILK_SIR;
  vi.unstubAllGlobals();
});

/// siteverify'in yerine gecen fetch. Cagri kaydini da doner ki govdenin ne
/// tasidigini sinayabilelim.
function fetchTakli(yanit: Response | Error) {
  const cagrilar: Array<{ url: string; govde: string }> = [];

  vi.stubGlobal("fetch", async (url: string, secenek: RequestInit) => {
    cagrilar.push({ url: String(url), govde: String(secenek.body) });
    if (yanit instanceof Error) throw yanit;
    return yanit;
  });

  return cagrilar;
}

function basarili(deger: boolean): Response {
  return new Response(JSON.stringify({ success: deger }), { status: 200 });
}

test("sahte modda kapi hep geciriyor ve aga hic cikmiyor", async () => {
  process.env.TURNSTILE_MODU = "sahte";
  const cagrilar = fetchTakli(basarili(false));

  expect(await turnstileDogrula("herhangi-bir-sey", null)).toEqual({
    gecti: true,
  });
  // Yerelde ve testte Cloudflare'e HIC istek gitmemeli.
  expect(cagrilar).toHaveLength(0);
});

test("mod tanimsizsa sahte kabul ediliyor", async () => {
  // Yeni gelistiricinin ilk gunu: .env'de anahtar yokken randevu alinabilmeli.
  ortamiSil("TURNSTILE_MODU");
  const cagrilar = fetchTakli(basarili(false));

  expect(await turnstileDogrula(null, null)).toEqual({ gecti: true });
  expect(cagrilar).toHaveLength(0);
});

test("taninmayan mod degeri gercege DUSMUYOR", async () => {
  // "true", "acik", "1" gibi degerler gercek sayilsaydi, yazim hatasi olan bir
  // env sessizce butun randevulari 403'e cevirirdi.
  process.env.TURNSTILE_MODU = "acik";
  fetchTakli(basarili(false));

  expect(await turnstileDogrula(null, null)).toEqual({ gecti: true });
});

test("gercek modda sir yoksa kapi KAPALI", async () => {
  // Yanlis yapilandirilmis uretim, korumasiz calisan uretimden iyidir.
  process.env.TURNSTILE_MODU = "gercek";
  delete process.env.TURNSTILE_SECRET;

  expect(await turnstileDogrula("jeton", null)).toEqual({
    gecti: false,
    sebep: "ulasilamadi",
  });
});

test("gercek modda jeton yoksa aga cikmadan reddediyor", async () => {
  process.env.TURNSTILE_MODU = "gercek";
  process.env.TURNSTILE_SECRET = "sir";
  const cagrilar = fetchTakli(basarili(true));

  expect(await turnstileDogrula(undefined, null)).toEqual({
    gecti: false,
    sebep: "eksik",
  });
  expect(cagrilar).toHaveLength(0);
});

test("jeton metin degilse reddediyor", async () => {
  process.env.TURNSTILE_MODU = "gercek";
  process.env.TURNSTILE_SECRET = "sir";
  fetchTakli(basarili(true));

  expect(await turnstileDogrula({ jeton: "x" }, null)).toEqual({
    gecti: false,
    sebep: "eksik",
  });
});

test("gecerli jeton geciyor", async () => {
  process.env.TURNSTILE_MODU = "gercek";
  process.env.TURNSTILE_SECRET = "sir";
  const cagrilar = fetchTakli(basarili(true));

  expect(await turnstileDogrula("gecerli-jeton", null)).toEqual({
    gecti: true,
  });
  expect(cagrilar).toHaveLength(1);
  expect(cagrilar[0].url).toContain("siteverify");
});

test("success:false gecersiz sayiliyor", async () => {
  process.env.TURNSTILE_MODU = "gercek";
  process.env.TURNSTILE_SECRET = "sir";
  fetchTakli(basarili(false));

  expect(await turnstileDogrula("tekrar-kullanilmis", null)).toEqual({
    gecti: false,
    sebep: "gecersiz",
  });
});

test("IP verilirse govdeye remoteip giriyor", async () => {
  process.env.TURNSTILE_MODU = "gercek";
  process.env.TURNSTILE_SECRET = "sir";
  const cagrilar = fetchTakli(basarili(true));

  await turnstileDogrula("jeton", "203.0.113.7");

  expect(cagrilar[0].govde).toContain("remoteip=203.0.113.7");
});

test("IP yoksa remoteip HIC gonderilmiyor", async () => {
  // Bos bir remoteip gondermek, Cloudflare'in jetonu yanlis adrese
  // baglamasina ya da istegi tumden reddetmesine yol acabiliyor.
  process.env.TURNSTILE_MODU = "gercek";
  process.env.TURNSTILE_SECRET = "sir";
  const cagrilar = fetchTakli(basarili(true));

  await turnstileDogrula("jeton", null);

  expect(cagrilar[0].govde).not.toContain("remoteip");
});

test("aga cikilamazsa kapi KAPALI ve sir hataya sizmiyor", async () => {
  process.env.TURNSTILE_MODU = "gercek";
  process.env.TURNSTILE_SECRET = "cok-gizli-sir";
  fetchTakli(new Error("network down"));

  const sonuc = await turnstileDogrula("jeton", null);

  expect(sonuc).toEqual({ gecti: false, sebep: "ulasilamadi" });
  // DEGISMEZ 5: donen degerin hicbir yerinde sir gecmiyor.
  expect(JSON.stringify(sonuc)).not.toContain("cok-gizli-sir");
});

test("siteverify 500 donerse ulasilamadi", async () => {
  process.env.TURNSTILE_MODU = "gercek";
  process.env.TURNSTILE_SECRET = "sir";
  fetchTakli(new Response("bozuk", { status: 500 }));

  expect(await turnstileDogrula("jeton", null)).toEqual({
    gecti: false,
    sebep: "ulasilamadi",
  });
});

test("JSON olmayan yanit ulasilamadi", async () => {
  process.env.TURNSTILE_MODU = "gercek";
  process.env.TURNSTILE_SECRET = "sir";
  fetchTakli(new Response("<html>", { status: 200 }));

  expect(await turnstileDogrula("jeton", null)).toEqual({
    gecti: false,
    sebep: "ulasilamadi",
  });
});

test("istekIpsi CF-Connecting-IP okuyor", () => {
  const istek = new Request("https://ornek.test/api/randevu", {
    headers: { "cf-connecting-ip": "198.51.100.4" },
  });

  expect(istekIpsi(istek)).toBe("198.51.100.4");
});

test("istekIpsi X-Forwarded-For'a GUVENMIYOR", () => {
  // Bu basligi istemci serbestce yaziyor; okunsaydi IP'ye baglama guvencesi
  // sahte bir degerle yok edilebilirdi.
  const istek = new Request("https://ornek.test/api/randevu", {
    headers: { "x-forwarded-for": "198.51.100.4" },
  });

  expect(istekIpsi(istek)).toBeNull();
});
