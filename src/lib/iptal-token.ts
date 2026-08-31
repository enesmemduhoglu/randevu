// Hesapsiz musterinin randevusunu iptal edebilmesini saglayan sir.
//
// Bu token TEK BASINA yetki tasiyor: linke sahip olan randevuyu iptal
// edebiliyor. Bu yuzden uc kural birlikte gecerli:
//
// 1. **Id'den turetilmiyor.** Hash bile olsa, id'yi bilen token'i uretebilirdi
//    ve randevu id'leri panelde, URL'lerde, log'larda dolasiyor.
// 2. **Kriptografik rastgelelik.** `Math.random()` tahmin edilebilir bir
//    dizidir; ard arda alinan iki randevunun token'i birbirinden turetilebilir.
// 3. **128 bitten uzun.** 160 bit, kaba kuvvetle deneme yapan birinin dogru
//    token'i bulma ihtimalini pratikte sifirlıyor - ustelik token'lar tek bir
//    isletmeye degil tum tabloya benzersiz (sema: randevu_iptal_token_idx).

/// URL'de gorunecegi icin base64 degil base32'ye yakin bir alfabe: karisan
/// karakterler (0/O, 1/I/l) disarida. Musteri token'i telefondan okuyup elle
/// yazmak zorunda kalmasa da, WhatsApp'ta kirpilan bir linki duzeltmesi
/// gerekebiliyor.
const ALFABE = "23456789abcdefghjkmnpqrstuvwxyz";

/// 32 karakter x 5 bit = 160 bit entropi.
const UZUNLUK = 32;

export function iptalTokenUret(): string {
  const baytlar = new Uint8Array(UZUNLUK);
  // Web Crypto: hem workerd'de hem Node 18+'ta global. Node'a ozel
  // `crypto.randomBytes` kullanilsaydi Worker paketinde cozulemezdi.
  crypto.getRandomValues(baytlar);

  let token = "";
  for (const bayt of baytlar) {
    // Modulo sapmasi burada onemsiz: 256 % 31 esit dagilmiyor ama sapma
    // entropiyi olcülebilir sekilde dusurmuyor (en kotu durumda ~0.04 bit /
    // karakter). Reddetme ornekleme eklemek, kazanci olmayan bir dongu olurdu.
    token += ALFABE[bayt % ALFABE.length];
  }

  return token;
}

/// URL'den gelen token'i veritabanina sormadan once eleyen bicim kontrolu.
///
// Sebep: `/r/<slug>/randevu/<token>` yolu halka acik ve tarayici her bozuk
// linke bir sorgu actirir. Ayrica bicimi tutmayan degeri erken elemek,
// zamanlama farkindan token uzunlugunu cikarmayi da zorlastiriyor.
export function iptalTokenGecerliMi(ham: unknown): ham is string {
  if (typeof ham !== "string" || ham.length !== UZUNLUK) return false;
  for (const karakter of ham) {
    if (!ALFABE.includes(karakter)) return false;
  }
  return true;
}
