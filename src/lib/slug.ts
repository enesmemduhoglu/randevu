// Turkce metnin ASCII karsiligini uretir. SAF fonksiyon - veritabani, oturum
// ya da istek baglami yok.
//
// NEDEN KENDI DOSYASI: iki ayri yerde gerekiyor ve o iki yer birbirini import
// EDEMEZ. `kayit.ts` slug'i uretiyor ama kapi disi bir dosya (ham `db`
// kullaniyor, cunku kayit aninda henuz bir kiraci yok); `dizin.ts` ise aramada
// ayni katlamayi tekrarliyor ve orasi kiraci-ustu, yani import ettigi her sey
// dar tutulmak zorunda (DEGISMEZ 12). Fonksiyonu kayit.ts'te birakip oradan
// almak, dizine bir veritabani modulunu bagimlilik yapardi.

const TURKCE_HARFLER: Record<string, string> = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i",
  ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
};

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
  return ad
    .split("")
    .map((h) => TURKCE_HARFLER[h] ?? h)
    .join("")
    .toLowerCase()
    .normalize("NFD")
    // U+0300-U+036F: birlesik aksan isaretleri. Acik kacis dizisiyle
    // yaziliyor cunku gorunmez karakterler kaynakta kirilgan.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
