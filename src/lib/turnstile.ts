// Cloudflare Turnstile dogrulamasi - halka acik yazma yollarinin bot kapisi.
//
// Neden gerekli: `/api/randevu` oturumsuz. Faz G'deki "ayni numarayla en cok
// 3 acik randevu" siniri bunun yerini TUTMUYOR - numarayi her istekte
// degistiren bir betik o siniri hic gormeden gecer ve takvimi doldurur.
// Sinir kotu kullanan MUSTERIYI, Turnstile ise betigi durduruyor.
//
// Neden Turnstile: hesapta zaten var, ucretsiz ve captcha cozdurmuyor -
// cogu ziyaretci hicbir sey gormeden geciyor. Randevu alan kitle telefondan
// geliyor; resim secmeye zorlayan bir kapi, engellediginden fazla mesru
// musteri kaybettirirdi.

import { modCoz, type Mod } from "@/lib/mod";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileSonucu =
  | { gecti: true }
  /// `sebep` YALNIZCA sunucu tarafi karar icin. Kullaniciya donen metin
  /// cagiran tarafta uretiliyor: Cloudflare'in hata kodlari (`invalid-input-
  /// secret` gibi) yapilandirmamiz hakkinda bilgi tasiyor ve disari cikmamali
  /// (DEGISMEZ 5).
  | { gecti: false; sebep: "eksik" | "gecersiz" | "ulasilamadi" };

/// `sahte` = kapi hep geciriyor. Yerel gelistirme ve vitest icin: ikisinde de
/// Cloudflare sirri yok ve olmayan bir sir yuzunden butun testlerin kirmizi
/// olmasi, korumadan cok gelistirmeyi engellerdi. BILDIRIM_MODU ile ayni
/// desen - tek yerden okunan bir anahtar, dagilmis `if (prod)` kontrolleri
/// degil. Modun nasil secildigi `mod.ts`te.

/// Sir once Cloudflare binding'inden, sonra `process.env`'den okunuyor.
///
/// Sebep: uretimde bu deger `wrangler secret` ile giriliyor ve workerd'de
/// `process.env`'de GORUNMUYOR; yerelde ise `.env` disinda bir yer yok.
/// `db.ts > hyperdriveDizesi` ayni sirayi izliyor.
async function ayar(): Promise<{ mod: Mod; sir: string | undefined }> {
  let cfSir: string | undefined;
  let cfMod: string | undefined;

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const cf = env as unknown as {
      TURNSTILE_SECRET?: string;
      TURNSTILE_MODU?: string;
    };
    cfSir = cf.TURNSTILE_SECRET;
    cfMod = cf.TURNSTILE_MODU;
  } catch {
    // Cloudflare baglami yok: vitest ya da duz node betigi.
  }

  // YERELDE cf degeri YOK SAYILIYOR (bkz. mod.ts). Faz L'de wrangler.jsonc'ye
  // yazilan "gercek", initOpenNextCloudflareForDev sayesinde `next dev`e de
  // sizip yerel randevu denemelerini 403'e ceviriyordu: uretim site anahtari
  // localhost icin kayitli degil, widget Turnstile 110200 veriyor ve jeton hic
  // uretilmiyor. Faz I'de tarayicidan gorulup duzeltildi.
  const mod = modCoz(cfMod, process.env.TURNSTILE_MODU);

  return { mod, sir: cfSir ?? process.env.TURNSTILE_SECRET };
}

/// Widget'in urettigi jetonu Cloudflare'e dogrulatir.
///
/// `ip` verilirse Cloudflare jetonu o adrese baglar - ayni jetonun baska bir
/// makineden tekrar kullanilmasini zorlastiriyor. Yoksa atlaniyor: eksik IP
/// yuzunden dogrulamayi tumden birakmak, korumayi bir bilgi eksikligine
/// feda etmek olurdu.
export async function turnstileDogrula(
  jeton: unknown,
  ip: string | null,
): Promise<TurnstileSonucu> {
  const { mod, sir } = await ayar();

  if (mod === "sahte") return { gecti: true };

  // GERCEK MODDA SIR YOKSA KAPI KAPALI. Bu, yanlis yapilandirilmis bir
  // uretim dagitiminin korumasiz calismasindan iyidir: sessizce acik kalan
  // bir kapiyi kimse fark etmez, kapali kapi ilk istekte goruluyor.
  if (!sir) return { gecti: false, sebep: "ulasilamadi" };

  if (typeof jeton !== "string" || jeton === "") {
    return { gecti: false, sebep: "eksik" };
  }

  // Govde `application/x-www-form-urlencoded`: siteverify JSON da kabul
  // ediyor ama form bicimi belgelenen yol ve `FormData` kullanmak istegi
  // multipart'a cevirir - CORS'un "basit istek" sinifi (bkz. DEGISMEZ 2).
  const govde = new URLSearchParams({ secret: sir, response: jeton });
  if (ip) govde.set("remoteip", ip);

  let yanit: Response;
  try {
    yanit = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: govde,
    });
  } catch {
    // Aga cikilamadi. Hata NESNESI loglanmiyor: govde `secret` tasiyor ve
    // bazi fetch hatalari istegi metne cevirip icine koyuyor (DEGISMEZ 5).
    return { gecti: false, sebep: "ulasilamadi" };
  }

  if (!yanit.ok) return { gecti: false, sebep: "ulasilamadi" };

  let cozulen: unknown;
  try {
    cozulen = await yanit.json();
  } catch {
    return { gecti: false, sebep: "ulasilamadi" };
  }

  const basarili =
    typeof cozulen === "object" &&
    cozulen !== null &&
    (cozulen as { success?: unknown }).success === true;

  if (basarili) return { gecti: true };

  // `error-codes` ARTIK OKUNUYOR ve sunucu log'una yaziliyor.
  //
  // Onceki hali okumuyordu ve gerekcesi "yapilandirmayi sizdirmayalim"di. O
  // gerekce yanlisti: bu kodlar Cloudflare'in BELGELEDIGI kapali bir liste
  // (`invalid-input-secret`, `timeout-or-duplicate`, ...) ve hicbiri sir
  // tasimiyor - DEGISMEZ 5'in konusu token, anahtar ve baglanti dizesi.
  //
  // Bedeli olculdu: uretimde widget "Basarili" derken sunucu 403 donuyordu ve
  // sebebini ogrenmenin HICBIR yolu yoktu. Kullaniciya hala tek bir genel
  // mesaj gidiyor; kod yalnizca `wrangler tail` ile gorunuyor.
  //
  // Bilinmeyen bir deger OLDUGU GIBI yazilmiyor: liste disi bir dize gelirse
  // "taninmayan" olarak geciyor, boylece saglayici bir gun govdeye baska bir
  // sey koyarsa log ona acik bir kanal olmuyor.
  console.warn("turnstile dogrulamadi:", bilinenKodlar(cozulen).join(","));

  return { gecti: false, sebep: "gecersiz" };
}

/// Cloudflare'in belgeledigi hata kodlari. Kapali liste: yanittaki taninmayan
/// bir deger log'a GECMIYOR.
const BILINEN_KODLAR = new Set([
  "missing-input-secret",
  "invalid-input-secret",
  "missing-input-response",
  "invalid-input-response",
  "bad-request",
  "timeout-or-duplicate",
  "internal-error",
  "invalid-widget-id",
  "invalid-parsed-secret",
]);

function bilinenKodlar(cozulen: unknown): string[] {
  const ham = (cozulen as { "error-codes"?: unknown })?.["error-codes"];
  if (!Array.isArray(ham)) return ["kod-yok"];

  const kodlar = ham.map((k) =>
    typeof k === "string" && BILINEN_KODLAR.has(k) ? k : "taninmayan",
  );
  return kodlar.length > 0 ? kodlar : ["kod-yok"];
}

/// Ziyaretcinin IP'si. Cloudflare her istege `CF-Connecting-IP` koyuyor ve bu
/// basligi kendi kenarinda EZIYOR - istemcinin gonderdigi deger gecmiyor.
///
/// `X-Forwarded-For` bilerek okunmuyor: onu istemci serbestce yazabiliyor,
/// yani IP'ye baglama guvencesini sahte bir degerle yok ederdi.
export function istekIpsi(istek: Request): string | null {
  return istek.headers.get("cf-connecting-ip");
}
