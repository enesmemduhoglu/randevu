// Halka acik yollarin hiz siniri - Workers'in yerel Rate Limiting binding'i.
//
// NEDEN TURNSTILE YETMIYOR: Turnstile bir jetonu dogruluyor, jeton BASINA
// maliyet uretmiyor. Gecerli bir jeton alip onu bir dongude yeniden kullanan
// ya da her seferinde tarayici otomasyonuyla yeni jeton ureten bir betik
// kapidan gecer. Hiz siniri o betigi jetonun gecerliliginden bagimsiz olarak
// yavaslatiyor. Ikisi ayri sorunu cozuyor, biri digerinin yerine gecmiyor.
//
// NEDEN OKUMA YOLU DA SINIRLI: `/api/musaitlik` oturumsuz ve bir isletmenin
// butun bos saatlerini donuyor. Sinirsiz birakmak, rakibin ya da bir kaziyicinin
// takvimin tamamini surekli cekmesini bedava kiliyor.

/// Binding adlari wrangler.jsonc'deki `ratelimits[].name` ile birebir ayni
/// olmak zorunda. Union tipi olmasi, cagiranin var olmayan bir sinirlayici
/// adi yazmasini derleme aninda durduruyor.
export type SinirAdi = "RANDEVU_SINIRI" | "MUSAITLIK_SINIRI";

type Sinirlayici = { limit(secenekler: { key: string }): Promise<{ success: boolean }> };

/// Binding'i Cloudflare baglamindan cozer. Baglam yoksa (vitest, duz node
/// betigi, `next dev`) `null` doner.
///
/// `turnstile.ts > ayar()` ile ayni sirayi izliyor - tek bir yerden okunan
/// yapilandirma, dagilmis `if (prod)` kontrolleri degil.
async function sinirlayici(ad: SinirAdi): Promise<Sinirlayici | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const aday = (env as unknown as Record<string, unknown>)[ad];

    // Binding'in varligina degil KULLANILABILIRLIGINE bakiliyor: yanlis
    // yapilandirilmis bir isim, tipi tutmayan bir nesne birakabilir ve
    // `limit` cagrisi calisma aninda patlardi.
    if (aday && typeof (aday as Sinirlayici).limit === "function") {
      return aday as Sinirlayici;
    }
    return null;
  } catch {
    // Cloudflare baglami yok.
    return null;
  }
}

/// `true` donerse istek REDDEDILMELI.
///
/// GECIREN TEK DURUM: binding'in hic olmamasi. Turnstile'daki `sahte`
/// varsayilaniyla ayni gerekce - yerelde ve testte binding yok ve olmayan bir
/// binding yuzunden her randevunun 429 almasi, korumadan cok gelistirmeyi
/// engellerdi.
///
/// Bu gevsekligin Turnstile'da uretime sizmis olmasi tam da bu fazin sebebi -
/// ama oradaki hata varsayilanda degil, uretimin o varsayilanla KALMASININ
/// fark edilmemesindeydi. Karsiligi `degismezler.test.ts`: wrangler.jsonc'de
/// iki sinirlayicinin da tanimli oldugunu test kosumu dogruluyor.
export async function hizSiniriAsildiMi(
  ad: SinirAdi,
  anahtar: string | null,
): Promise<boolean> {
  const kapi = await sinirlayici(ad);
  if (!kapi) return false;

  // BINDING VAR AMA ANAHTAR YOK. Uretimde olmamasi gereken bir durum:
  // Cloudflare her istege CF-Connecting-IP koyuyor ve o basligi kendi kenarinda
  // eziyor. Yine de bu dal bos gecilmiyor.
  //
  // Neden: `cf:onizle` ile OLCULDU ve baslik yerel workerd'de YOKTU - anahtar
  // null gelince sinir hicbir uyari vermeden devre disi kaldi. Uretimde
  // baslik var, yani kod "calisiyordu"; ama bu tam olarak Turnstile'in aylarca
  // sessizce acik kalmasini saglayan sekil, yalnizca baska bir degiskende.
  //
  // Cozum: gecirmek yerine kimligi belirsiz butun istekleri TEK kovaya
  // topluyoruz. Mesru trafik her zaman IP tasidigi icin bu kova yalnizca
  // anomaliyi yakaliyor; yakaladiginda da sinirsiz degil, dakikada bes.
  const kovaAnahtari = anahtar ?? "anahtarsiz";

  try {
    const { success } = await kapi.limit({ key: kovaAnahtari });
    return !success;
  } catch {
    // Sinirlayici patlarsa istek GECIYOR. Ters karar - hata halinde reddetmek -
    // Cloudflare tarafindaki gecici bir arizayi tam bir kesintiye cevirirdi;
    // burada korunan sey randevu alabilmek, sinirin kendisi degil.
    //
    // Hata NESNESI loglanmiyor: icerigi anahtari (ziyaretci IP'si) tasiyabilir.
    return false;
  }
}
