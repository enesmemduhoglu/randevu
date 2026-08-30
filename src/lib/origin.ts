// KAPI DISI DOSYA (bkz. CLAUDE.md degismez 2): CSRF'in ikinci katmani burada.
//
// Neden ikinci katman gerekiyor: oturum cookie'si `SameSite=Lax` olsa bile bu
// tek basina yetmiyor. `Lax` yalnizca ust seviye GET gezinmelerinde cookie
// yolluyor gibi gorunse de, `multipart/form-data` (ve `application/x-www-form-
// urlencoded`, `text/plain`) kabul eden yollar CORS'un "basit istek" sinifina
// giriyor: tarayici bu istekleri on kontrol (preflight) yapmadan gonderiyor ve
// yabanci bir sayfadaki <form> dogrudan POST atabiliyor. Sunucunun tek net
// isareti istegin `Origin` basligi.
//
// Bu dosya saf tutuluyor: DB'ye, cookie'ye ve global duruma dokunmuyor. Tek
// dis kaynagi `process.env` ve o da cagri aninda okunuyor (asagida gerekcesi).

const GUVENLI_METOTLAR = new Set(["GET", "HEAD", "OPTIONS"]);

/// Mutasyon route'larinin ilk satiri. Istek guvenliyse `null`, degilse dosen
/// 403 `Response` doner - cagiran taraf `null` degilse hemen return eder.
export function checkOrigin(req: Request): Response | null {
  // Guvenli metotlar durum degistirmiyor; CSRF'in hedefi degiller. Bir GET
  // yaninlisligi varsa cozumu burasi degil, o route'un durum degistirmemesi.
  if (GUVENLI_METOTLAR.has(req.method.toUpperCase())) return null;

  // MAKINE YOLU MUAFIYETI (Cron, paylasilan sirla gelen cagrilar).
  // Neden guvenli: tarayicilar cross-site bir istege `Authorization` basligini
  // KENDILIGINDEN eklemiyor. Cookie'nin aksine bu baslik ancak cagiran kodun
  // acikca yazmasiyla olusuyor, yani yabanci bir sayfa kurbanin sirrini
  // ekleyemez. Boyle bir istekte CSRF'in tanimi geregi risk yok; oradaki
  // yetkilendirmeyi sirrin kendisi yapiyor.
  if (req.headers.get("authorization")) return null;

  const gelen = gelenOrigin(req);
  // Origin de Referer de yoksa reddediyoruz. Bu, eksik bilgide "gecir" degil
  // "durdur" tercihi: mesru tarayici mutasyonlari her zaman en az birini
  // tasiyor, tasimayan cagri ya makine yolu (yukarida muaf) ya da suphelidir.
  if (!gelen) return reddet();

  if (!beklenenOriginler(req).includes(gelen)) return reddet();

  return null;
}

/// Istegin iddia ettigi kaynak. `Origin` varsa o esas alinir; yoksa
/// `Referer`'in origin'ine dusuluyor cunku bazi eski tarayicilar ve gizlilik
/// eklentileri `Origin`'i kirpip `Referer`'i birakabiliyor.
function gelenOrigin(req: Request): string | null {
  // Ham deger dogrudan karsilastirilmiyor, URL'den gecirilip normalize
  // ediliyor: "https://a.example:443" ile "https://a.example" ayni origin ama
  // dizi olarak farkli. Ayrica gecersiz ya da opak ("null") deger burada
  // eleniyor - `new URL` onlari cozemiyor.
  const origin = originAyikla(req.headers.get("origin"));
  if (origin) return origin;

  return originAyikla(req.headers.get("referer"));
}

/// Kabul edilen origin listesi.
function beklenenOriginler(req: Request): string[] {
  const liste: string[] = [];

  const kendi = kendiOrigini(req);
  if (kendi) liste.push(kendi);

  // Cloudflare'de ayni dagitima iki isimden ulasilabiliyor: custom domain ve
  // *.workers.dev onizlemesi. Onizlemede acilan panelden gelen istegin Host'u
  // workers.dev, Origin'i de workers.dev oluyor - o durumu ustteki kendi
  // origin'i zaten karsiliyor. Bu ek giris ters yon icin: ara katman ya da
  // proxy Host'u degistirdiginde kanonik adresin yine de kabul edilmesi.
  // Tanimsizsa liste kisaliyor, yani varsayilan davranis daha dar.
  const ilan = originAyikla(process.env.NEXT_PUBLIC_SITE_URL);
  // Cagri aninda okunuyor, modul yuklenirken degil: modul seviyesinde
  // yakalanan bir env degeri Workers'ta ilk istegin baglaminda donar ve
  // testlerde de degistirilemez hale gelir.
  if (ilan && !liste.includes(ilan)) liste.push(ilan);

  return liste;
}

/// Istegin kendi adresinden uretilen origin.
///
/// `Host` basligi saldirgan tarafindan uydurulabilir; buna ragmen guvenli,
/// cunku CSRF senaryosunda istegi tarayici kuruyor ve tarayici `Host`'u
/// gittigi adresten yaziyor - yabanci sayfa onu degistiremiyor. Elle kurulan
/// bir istekte hem Host hem Origin uydurulabilir ama o istek zaten kurbanin
/// cookie'sini tasimaz, yani CSRF olmaz.
function kendiOrigini(req: Request): string | null {
  const istekUrl = urlAyikla(req.url);

  // Host basligi once geliyor: Workers/proxy arkasinda `req.url` dahili
  // adresi tasiyabiliyor, tarayicinin gercekte konustugu isim Host'ta.
  const host = req.headers.get("host") ?? istekUrl?.host ?? null;
  if (!host) return null;

  // TLS proxy'de sonlaniyorsa uygulamaya istek duz http olarak geliyor;
  // tarayicinin gonderdigi Origin ise https. Sema bu yuzden once iletilen
  // basliktan okunuyor. Baslik virgulle ayrilmis zincir tasiyabiliyor, en
  // sagdaki degil en soldaki (istemciye en yakin) deger gecerli.
  const iletilenSema = req.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const sema =
    iletilenSema || istekUrl?.protocol.replace(/:$/, "") || "https";

  return originAyikla(`${sema}://${host}`);
}

function originAyikla(deger: string | null | undefined): string | null {
  return urlAyikla(deger)?.origin ?? null;
}

function urlAyikla(deger: string | null | undefined): URL | null {
  if (!deger) return null;
  try {
    return new URL(deger);
  } catch {
    // Gecersiz URL sessizce eleniyor: burada firlatmak bir baslik
    // bicimsizligini 500'e cevirirdi, oysa dogru cevap 403.
    return null;
  }
}

function reddet(): Response {
  // DEGISMEZ 5: govde beklenen ya da gelen origin degerini TASIMAZ. Bunlar
  // altyapi bilgisi - dahili host adlarini ve onizleme adreslerini
  // sizdirirlar, ustelik saldirgana "hangi origin'i taklit etmeliyim"
  // sorusunun cevabini verirler. Kullaniciya donen metin bu yuzden kaynagi
  // degil yapilacak seyi anlatiyor.
  return Response.json(
    {
      hata:
        "Istek dogrulanamadi. Sayfayi yenileyip yeniden deneyin; " +
        "sorun surerse oturumu kapatip yeniden acin.",
    },
    { status: 403 },
  );
}
