// Turkce metnin ASCII karsiligini uretir. SAF fonksiyon - veritabani, oturum
// ya da istek baglami yok.
//
// NEDEN KENDI DOSYASI: iki ayri yerde gerekiyor ve o iki yer birbirini import
// EDEMEZ. `kayit.ts` slug'i uretiyor ama kapi disi bir dosya (ham `db`
// kullaniyor, cunku kayit aninda henuz bir kiraci yok); `dizin.ts` ise aramada
// ayni katlamayi tekrarliyor ve orasi kiraci-ustu, yani import ettigi her sey
// dar tutulmak zorunda (DEGISMEZ 12). Fonksiyonu kayit.ts'te birakip oradan
// almak, dizine bir veritabani modulunu bagimlilik yapardi.

/// Katlama tablosu IKI DIZE olarak duruyor, `Record` olarak degil - cunku ayni
/// esleme Postgres'in `translate(metin, kaynak, hedef)` fonksiyonuna da
/// veriliyor (`dizin.ts`, hizmet adi aramasi). Iki yerde iki ayri tablo
/// tutmak, birine eklenen harfin otekinde unutulmasi demekti ve sonucu sessiz
/// olurdu: arama bir yazimda calisir, otekinde calismazdi.
///
/// `I` DE LISTEDE. JS tarafinda gereksiz - `.toLowerCase()` zaten `I -> i`
/// yapiyor - ama SQL tarafinda sart: Postgres'te `lower('I')` collation'a bagli
/// ve Turkce collation'da noktasiz `ı` uretebiliyor. Tabloya almak JS
/// davranisini degistirmiyor, SQL tarafini deterministik yapiyor.
export const TR_KAYNAK = "çÇğĞıİöÖşŞüÜI";
export const TR_HEDEF = "ccggiioossuui";

const TURKCE_HARFLER: Record<string, string> = Object.fromEntries(
  [...TR_KAYNAK].map((harf, i) => [harf, TR_HEDEF[i]]),
);

/// Turkce metni ASCII'ye katlar - ama noktalama ve bosluklari KORUR.
///
/// `slugUret`ten ayrildi cunku iki ayri isi var: slug bir ADRES uretiyor
/// (bosluk tireye donuyor), bu ise bir ARAMA metni uretiyor ve orada bosluk
/// anlamli - "sac kesimi" ile "sac-kesimi" ayni sey degil, cunku karsi taraf
/// veritabanindaki ham `hizmet.ad` kolonu.
export function asciiKatla(metin: string): string {
  return metin
    .split("")
    .map((h) => TURKCE_HARFLER[h] ?? h)
    .join("")
    .toLowerCase()
    .normalize("NFD")
    // U+0300-U+036F: birlesik aksan isaretleri. Acik kacis dizisiyle
    // yaziliyor cunku gorunmez karakterler kaynakta kirilgan.
    .replace(/[̀-ͯ]/g, "");
}

/// Metinden URL'de kullanilabilir slug uretir.
///
/// Turkce harfleri ELLE esliyoruz: normalize("NFD") ile aksan ayirma yontemi
/// i-noktasiz ve I-noktali harfleri dogru cozmuyor - noktasiz i tek kod
/// noktasi, ayrilabilir bir aksani yok. Kutuphanesiz ve dogru olan yol bu tablo.
///
/// NFD adimi yine de duruyor: Turkce olmayan aksanli adlar icin (ornegin
/// "Cafe Nero" yazilisi "Café Nero" ise) harfin kendisi korunuyor, yoksa
/// tamamen dusup slug'i bozardi.
export function slugUret(ad: string): string {
  return asciiKatla(ad)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
