// Kimlik akislarinin girdi dogrulamasi. Saf fonksiyonlar: veritabani, cookie
// ve ag yok - bu yuzden testleri Postgres'e hic dokunmadan kosuyor.
//
// Zod eklenmedi. Dogrulanan alan sayisi az ve mesajlarin tamami Turkce, yani
// kutuphanenin urettigi metnin hepsini yine elle yazacaktik: kazanc yalnizca
// birkac satir olurdu. Form katmani (react-hook-form + zod) Faz E'de hizmet ve
// personel formlariyla birlikte geliyor; o bagimlilik gelince bu dosyanin
// kurallari sema olarak oraya tasinabilir.

export type Dogrulama<T> =
  | { tamam: true; deger: T }
  | { tamam: false; hata: string };

/// Cok kaba bir bicim kontrolu, kasitli olarak. E-postanin GERCEKTEN var olup
/// olmadigini yalnizca oraya bir posta gondererek anlayabiliriz; buradaki
/// kontrol "kullanici alani bos ya da @ isaretini unutmus" durumunu erken
/// yakalamak icin. Fazla siki bir regex mesru adresleri (arti isaretli, yeni
/// uzantili) reddeder ve kimse sebebini anlamaz.
const EPOSTA_BICIMI = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function epostaDogrula(ham: unknown): Dogrulama<string> {
  if (typeof ham !== "string") return { tamam: false, hata: "E-posta gerekli" };

  // Kucuk harfe cevriliyor: Supabase adresi zaten kucuk harfte sakliyor, biz
  // farkli yazsak `kullanici` tablosundaki eposta ile Supabase'deki ayrisirdi.
  const deger = ham.trim().toLowerCase();

  if (!deger) return { tamam: false, hata: "E-posta gerekli" };
  if (deger.length > 254) {
    // RFC 5321'in adres siniri. Uzun deger burada kesilmiyor, reddediliyor:
    // sessizce kirpilmis bir adres sahibinin ulasamadigi bir hesap uretir.
    return { tamam: false, hata: "E-posta adresi çok uzun" };
  }
  if (!EPOSTA_BICIMI.test(deger)) {
    return {
      tamam: false,
      hata: "E-posta adresi eksik görünüyor — ayse@ornek.com gibi olmalı",
    };
  }

  return { tamam: true, deger };
}

/// Alt sinir 8. Supabase'in varsayilani 6; burada bir basamak yukari cikiyoruz
/// cunku bu sifre bir isletmenin butun randevu gecmisini aciyor.
const SIFRE_EN_AZ = 8;

/// Ust sinir 72 BAYT. Supabase parolalari bcrypt ile sakliyor ve bcrypt 72
/// bayttan sonrasini sessizce atiyor: uzun bir sifre girildiginde kullanici
/// sonraki girisinde kuyrugun hic sayilmadigini fark edemez. Sinira burada
/// acikca carpmasi, sessiz kirpilmadan iyi.
const SIFRE_EN_COK_BAYT = 72;

export function sifreDogrula(ham: unknown): Dogrulama<string> {
  if (typeof ham !== "string") return { tamam: false, hata: "Şifre gerekli" };

  // Sifre trim EDILMIYOR: bosluk mesru bir karakter ve kirpmak, kullanicinin
  // sifre yoneticisinden yapistirdigi degeri sessizce degistirmek olurdu.
  if (ham.length < SIFRE_EN_AZ) {
    return { tamam: false, hata: `Şifre en az ${SIFRE_EN_AZ} karakter olmalı` };
  }
  if (new TextEncoder().encode(ham).length > SIFRE_EN_COK_BAYT) {
    return {
      tamam: false,
      hata: "Şifre çok uzun — en fazla 72 karakter kullanılabilir",
    };
  }

  return { tamam: true, deger: ham };
}

/// Kisi ve isletme adlari icin ortak kural. `alan` hata metnine giriyor ki
/// mesaj hangi kutuya ait oldugunu soylesin.
export function adDogrula(
  ham: unknown,
  alan: string,
  { enAz = 2, enCok = 80 }: { enAz?: number; enCok?: number } = {},
): Dogrulama<string> {
  if (typeof ham !== "string") return { tamam: false, hata: `${alan} gerekli` };

  // Ic bosluklar tekilleniyor: "Ayşe    Yılmaz" ile "Ayşe Yılmaz" ayni kisi.
  const deger = ham.trim().replace(/\s+/g, " ");

  if (!deger) return { tamam: false, hata: `${alan} gerekli` };
  if (deger.length < enAz) {
    return { tamam: false, hata: `${alan} en az ${enAz} karakter olmalı` };
  }
  if (deger.length > enCok) {
    return { tamam: false, hata: `${alan} en fazla ${enCok} karakter olabilir` };
  }

  return { tamam: true, deger };
}

/// Tam sayi alanlari (sure, sira, gun sayisi...).
///
/// JSON'dan gelen deger sayi ya da metin olabilir; ikisini de kabul ediyoruz
/// cunku HTML form alanlari her zaman metin gonderiyor ve donusumu tek yerde
/// yapmak, her cagri yerinde `Number(...)` yazmaktan guvenli.
export function tamsayiDogrula(
  ham: unknown,
  alan: string,
  { enAz, enCok }: { enAz: number; enCok: number },
): Dogrulama<number> {
  const sayi =
    typeof ham === "number"
      ? ham
      : typeof ham === "string" && ham.trim() !== ""
        ? Number(ham.trim())
        : NaN;

  if (!Number.isFinite(sayi)) {
    return { tamam: false, hata: `${alan} sayı olmalı` };
  }
  if (!Number.isInteger(sayi)) {
    return { tamam: false, hata: `${alan} tam sayı olmalı` };
  }
  if (sayi < enAz || sayi > enCok) {
    return { tamam: false, hata: `${alan} ${enAz} ile ${enCok} arasında olmalı` };
  }

  return { tamam: true, deger: sayi };
}

/// Turkce yazilmis para tutarini KURUSA cevirir.
///
/// Neden sunucuda ayristiriliyor: istemci "350,50" yazip 35050 hesaplasaydi
/// donusum kayan noktali sayidan gecerdi (350.5 * 100 = 35050.000000000004
/// gibi) ve kurus kaybi/fazlasi olusurdu. Metin uzerinde tam sayi aritmetigi
/// bu sinifi tamamen kapatiyor.
///
/// Bicim (docs/marka.md): binlik ayraci ".", ondalik ",". "1.250,50" = 125050.
/// Virgul yokken tek bir nokta ve ardindan bir-iki basamak varsa ondalik
/// sayiliyor - "350.50" yazan kullaniciyi 35000 ile sasirtmamak icin.
export function paraKurusDogrula(ham: unknown, alan: string): Dogrulama<number> {
  if (typeof ham === "number") {
    return tamsayiDogrula(ham, alan, { enAz: 0, enCok: 100_000_000 });
  }
  if (typeof ham !== "string") return { tamam: false, hata: `${alan} gerekli` };

  const temiz = ham.replace(/[\s₺]/g, "");
  if (temiz === "") return { tamam: true, deger: 0 };
  if (!/^[0-9.,]+$/.test(temiz)) {
    return { tamam: false, hata: `${alan} yalnızca rakam içermeli` };
  }

  let tamKisim = temiz;
  let ondalik = "0";

  const sonVirgul = temiz.lastIndexOf(",");
  if (sonVirgul !== -1) {
    tamKisim = temiz.slice(0, sonVirgul).replace(/\./g, "");
    ondalik = temiz.slice(sonVirgul + 1);
  } else {
    const noktalar = temiz.split(".").length - 1;
    const sonNokta = temiz.lastIndexOf(".");
    const kuyruk = sonNokta === -1 ? "" : temiz.slice(sonNokta + 1);
    if (noktalar === 1 && kuyruk.length > 0 && kuyruk.length <= 2) {
      tamKisim = temiz.slice(0, sonNokta);
      ondalik = kuyruk;
    } else {
      tamKisim = temiz.replace(/\./g, "");
    }
  }

  if (!/^\d*$/.test(tamKisim) || !/^\d*$/.test(ondalik)) {
    return { tamam: false, hata: `${alan} geçerli bir tutar olmalı` };
  }
  if (ondalik.length > 2) {
    return { tamam: false, hata: `${alan} en fazla iki ondalık basamak alır` };
  }

  const lira = Number(tamKisim || "0");
  const kurus = Number(ondalik.padEnd(2, "0") || "0");
  const toplam = lira * 100 + kurus;

  if (!Number.isSafeInteger(toplam) || toplam > 100_000_000) {
    return { tamam: false, hata: `${alan} çok büyük` };
  }

  return { tamam: true, deger: toplam };
}

/// Kontrol karakteri taramasi. Regex yerine kod noktasi karsilastirmasi
/// kullaniliyor: kacis dizileri bu depoda birkac kez arac zincirinde gercek
/// (gorunmez) karaktere donusup kaynagi bozdu.
function kontrolKarakteriVar(metin: string): boolean {
  for (const harf of metin) {
    const kod = harf.codePointAt(0) ?? 0;
    if (kod < 32 || kod === 127) return true;
  }
  return false;
}

/// Giristen sonra donulecek yolu temizler. Acik yonlendirme (open redirect)
/// kapisi: `?devam=` degeri kullanicinin URL'inden geliyor, yani saldirganin
/// hazirladigi bir giris baglantisi kurbani kendi sitesine dusurebilir -
/// ustelik bizim alan adimizdan gecerek, yani guvenilir gorunerek.
///
/// Kabul edilen tek bicim: TEK egik cizgiyle baslayan, ters egik cizgi ve
/// kontrol karakteri icermeyen bagil yol. Suphede birakilan deger `null`
/// donuyor ve cagiran taraf varsayilan hedefe dusuyor.
export function guvenliYol(ham: unknown): string | null {
  if (typeof ham !== "string") return null;
  if (ham.length > 512) return null;
  if (!ham.startsWith("/")) return null;

  // "//kotu.site" tarayicida sema-bagil MUTLAK adres: bagil yol gibi duruyor
  // ama baska bir host'a gidiyor.
  if (ham.startsWith("//")) return null;

  // Ters egik cizgi: bazi tarayicilar onu egik cizgiyle esdeger sayiyor,
  // yani "/\kotu.site" pratikte "//kotu.site" gibi cozulebiliyor.
  if (ham.includes("\\")) return null;

  // Satir sonu ve diger kontrol karakterleri: Location basligina yazilacak
  // deger baslik enjeksiyonuna acilmamali.
  if (kontrolKarakteriVar(ham)) return null;

  return ham;
}
