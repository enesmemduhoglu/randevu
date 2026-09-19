// Makine yollarinin kapisi: `Authorization: Bearer <CRON_SIRRI>`.
//
// DEGISMEZ 2 bu yollari `checkOrigin`den muaf tutuyor - cagiran bir tarayici
// degil, yani Origin yok ve CSRF'in hedefi olacak bir cerez oturumu da yok.
// Muafiyetin KARSILIGI bu kapi: `degismezler.test.ts` her mutasyon route'unda
// `checkOrigin(`, `panelKapisi(` ya da `cronKapisi(` ariyor. Muaf dosya listesi
// tutmak yerine kapiyi aramak bilincli - listeye eklenen bir route hicbir
// kontrol olmadan gecerdi, burada ise bir kapi cagrisi olmak ZORUNDA.
//
// Cagiran bugun tek: `worker-girisi.ts > scheduled`, Worker'in ICINDEN
// (`openNext.fetch`). Yine de route internete acik bir adres ve siri bilmeyen
// herkes 401 aliyor. Sir elde olunca elle tetiklemek de mumkun (docs/yayin.md).

/// Sir tanimsizken 503: yapilandirma eksik, istek yanlis degil. 401 donseydi
/// zamanlayicinin kapiya yazdigi kod "sir yanlis" ile "sir hic girilmemis"i
/// ayirt edemezdi.
async function sir(): Promise<string | undefined> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const cf = (env as unknown as { CRON_SIRRI?: unknown }).CRON_SIRRI;
    if (typeof cf === "string" && cf !== "") return cf;
  } catch {
    // Cloudflare baglami yok: vitest ya da `next dev`.
  }
  const yerel = process.env.CRON_SIRRI;
  return yerel ? yerel : undefined;
}

async function ozet(metin: string): Promise<Uint8Array> {
  const veri = new TextEncoder().encode(metin);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", veri));
}

/// Sabit sureli karsilastirma. Iki taraf once ozetleniyor: boylece uzunluk
/// farki erken donusle sizmiyor ve dongu her zaman 32 bayt suruyor.
async function esitMi(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([ozet(a), ozet(b)]);
  let fark = 0;
  for (let i = 0; i < x.length; i++) fark |= x[i] ^ y[i];
  return fark === 0;
}

/// `null` = gecti. Aksi halde cagiranin OLDUGU GIBI donmesi gereken yanit.
///
/// Yanit govdesi siri ya da gelen basligi TASIMIYOR (DEGISMEZ 5).
export async function cronKapisi(istek: Request): Promise<Response | null> {
  const beklenen = await sir();
  if (!beklenen) {
    return Response.json({ hata: "yapilandirma eksik" }, { status: 503 });
  }

  const baslik = istek.headers.get("authorization") ?? "";
  const verilen = baslik.startsWith("Bearer ") ? baslik.slice(7) : "";

  if (!verilen || !(await esitMi(verilen, beklenen))) {
    return Response.json({ hata: "yetkisiz" }, { status: 401 });
  }

  return null;
}
