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
/// degil.
type Mod = "sahte" | "gercek";

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

  const ham = cfMod ?? process.env.TURNSTILE_MODU;

  // VARSAYILAN `sahte` DEGIL, yazildigi gibi okunuyor: yalnizca acikca
  // "gercek" yazilmissa gercek. Tersini yapmak - tanimsizken gercege
  // dusmek - yeni gelistiricinin ilk gununde her randevuyu 403'e cevirirdi.
  const mod: Mod = ham === "gercek" ? "gercek" : "sahte";

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

  // `error-codes` OKUNMUYOR ve donmuyor. Kullaniciya "invalid-input-secret"
  // demek ise yaramaz, log'a yazmak ise yapilandirmamizi sizdirir; ikisi de
  // "jeton tutmadi" bilgisinden fazlasini vermiyor.
  return basarili ? { gecti: true } : { gecti: false, sebep: "gecersiz" };
}

/// Ziyaretcinin IP'si. Cloudflare her istege `CF-Connecting-IP` koyuyor ve bu
/// basligi kendi kenarinda EZIYOR - istemcinin gonderdigi deger gecmiyor.
///
/// `X-Forwarded-For` bilerek okunmuyor: onu istemci serbestce yazabiliyor,
/// yani IP'ye baglama guvencesini sahte bir degerle yok ederdi.
export function istekIpsi(istek: Request): string | null {
  return istek.headers.get("cf-connecting-ip");
}
