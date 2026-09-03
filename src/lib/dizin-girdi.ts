// Dizin (pazaryeri) alanlarinin kapali listeleri ve dogrulamasi.
//
// NEDEN DB'DE DEGIL KODDA: `ayar-girdi.ts > SAAT_DILIMLERI` ile ayni desen.
// Bunlar bir durum makinesi degil referans listesi; kapali ama zamanla
// buyuyebilir. pgEnum olsalardi her yeni kategori bir `ALTER TYPE ... ADD
// VALUE` gocu (ve o degerin ayni transaction'da kullanilamamasi tuzagi)
// isterdi. Ayri bir tablo olsalardi her dizin sorgusuna bir join eklerdi ve
// kazandirdigindan fazlasini karmasiklastirirdi.
//
// Bedeli: DB gecersiz bir degeri engellemiyor. Kabul edildi, cunku bu alanlar
// yalnizca TEK bir yoldan yaziliyor (panel ayarlari) ve o yol buradan geciyor.

import {
  cozulememisKarakterHatasi,
  cozulememisKarakterVar,
  type Dogrulama,
} from "@/lib/girdi";
import { slugUret } from "@/lib/slug";

/// Turkiye'nin 81 ili, plaka sirasinda.
///
/// Plaka sirasi alfabetik siralamadan bilerek tercih edildi: listeyi
/// gosterirken alfabetik siralamak tek satirlik bir is, ama plaka sirasi
/// kanonik ve iki gelistirici ayni sirayi uretiyor.
export const ILLER = [
  "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya",
  "Artvin", "Aydın", "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu",
  "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır",
  "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep",
  "Giresun", "Gümüşhane", "Hakkâri", "Hatay", "Isparta", "Mersin", "İstanbul",
  "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir", "Kocaeli",
  "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla",
  "Muş", "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt",
  "Sinop", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa",
  "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman",
  "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova",
  "Karabük", "Kilis", "Osmaniye", "Düzce",
] as const;

export type Il = (typeof ILLER)[number];

/// Isletme kategorileri. Kucuk baslanildi: bir dizin, doldurulamayacak kadar
/// cok bos kategoriyle acilirsa bos gorunur. Talep geldikce buyur.
export const KATEGORILER = [
  "Kuaför",
  "Berber",
  "Güzellik Salonu",
  "Tırnak Stüdyosu",
  "Cilt Bakımı",
  "Masaj & Spa",
  "Diş Kliniği",
  "Veteriner",
  "Diğer",
] as const;

export type Kategori = (typeof KATEGORILER)[number];

/// Ana sayfada kendi bolumu olan iller.
///
/// Neden 81 il degil de iki: pazaryeri yerel bir urun, kullanicinin isine
/// yarayan tek sey kendi sehrindeki isletme. 81 baslikli bir ana sayfa
/// Turkiye'nin tamamini kapsadigimizi soylerdi - bugun dogru degil. Ikiye
/// odaklanma karari `TODOS.md > Urun kimligi` maddesinde: arz once bu iki
/// sehirde toplanacak.
///
/// Buyumesi ucuz: listeye bir il eklemek yeter, goc gerekmiyor.
export const VITRIN_ILLERI = ["Bursa", "İstanbul"] as const satisfies readonly Il[];

/// Turk alfabesindeki harf sirasi. Kucuk ve buyuk harfler ayni sirayi
/// paylasiyor, yani "İstanbul" ile "istanbul" ayni yere dusuyor.
const TR_ALFABE = "aAbBcCçÇdDeEfFgGğĞhHıIiİjJkKlLmMnNoOöÖpPrRsSşŞtTuUüÜvVyYzZ";

/// Turkce siralama - `localeCompare(…, "tr")` DEGIL.
///
/// Neden elle: bu liste hem sunucuda (workerd) hem tarayicida ayni sirayi
/// uretmek zorunda. workerd'in ICU derlemesi tam degil (bkz. `ayar-girdi.ts >
/// SAAT_DILIMLERI` ve `bicim.ts > paraBicimle`); iki taraf farkli siralarsa
/// React hidrasyonda uyusmazlik goruyor ve listeyi bastan ciziyor.
///
/// Alfabede olmayan karakter (bosluk, tire) harflerin ONUNE dusuyor, yani
/// "Afyon Karahisar" ile "Afyonkarahisar" arasindaki sira da kararli.
export function trKarsilastir(a: string, b: string): number {
  const enKisa = Math.min(a.length, b.length);
  for (let i = 0; i < enKisa; i++) {
    const fark = TR_ALFABE.indexOf(a[i]) - TR_ALFABE.indexOf(b[i]);
    if (fark !== 0) return fark;
  }
  return a.length - b.length;
}

/// Illerin alfabetik hali. `ILLER` plaka sirasinda duruyor cunku o kanonik;
/// kullaniciya gosterilen liste ise alfabetik olmali - 81 secenek arasinda
/// plaka numarasindan arama yapan kimse yok.
export const ILLER_ALFABETIK = [...ILLER].sort(trKarsilastir);

/// Ilce SERBEST METIN ve dogrulanmiyor - yalnizca uzunlugu kirpiliyor.
///
/// Neden: Turkiye'de yaklasik bin ilce var ve il -> ilce eslemesini dogru
/// tutmak ayri bir veri yatirimi. Ilce dizinde FILTRE DEGIL, yalnizca kartta
/// gorunen bir etiket; yanlis yazilmis bir ilce hicbir sorgunun sonucunu
/// bozmuyor. Filtre olsaydi normalize etmek zorunlu olurdu.
const ILCE_EN_COK = 60;

export function ilDogrula(ham: unknown): Dogrulama<Il | null> {
  if (ham === null || ham === undefined || ham === "") {
    // Bos gecilebilir: isletme profilini kademeli dolduruyor. Yayina cikarken
    // zorunlu olmasi `yayindaAyarla` ve DB kisitiyla saglaniyor.
    return { tamam: true, deger: null };
  }
  if (typeof ham !== "string" || !(ILLER as readonly string[]).includes(ham)) {
    return { tamam: false, hata: "Geçerli bir il seçin" };
  }
  return { tamam: true, deger: ham as Il };
}

export function kategoriDogrula(ham: unknown): Dogrulama<Kategori | null> {
  if (ham === null || ham === undefined || ham === "") {
    return { tamam: true, deger: null };
  }
  if (
    typeof ham !== "string" ||
    !(KATEGORILER as readonly string[]).includes(ham)
  ) {
    return { tamam: false, hata: "Geçerli bir kategori seçin" };
  }
  return { tamam: true, deger: ham as Kategori };
}

export function ilceDogrula(ham: unknown): Dogrulama<string | null> {
  if (ham === null || ham === undefined) return { tamam: true, deger: null };
  if (typeof ham !== "string") {
    return { tamam: false, hata: "İlçe metin olmalı" };
  }
  const kirpilmis = ham.trim();
  if (kirpilmis === "") return { tamam: true, deger: null };
  if (kirpilmis.length > ILCE_EN_COK) {
    return { tamam: false, hata: `İlçe en fazla ${ILCE_EN_COK} karakter olabilir` };
  }
  // Ilce serbest metin ve dizin kartinda gorunuyor - "Beikta" diye yazilmis
  // bir ilce, arayanin bulamayacagi bir kayit demek.
  if (cozulememisKarakterVar(kirpilmis)) {
    return { tamam: false, hata: cozulememisKarakterHatasi("İlçe") };
  }
  return { tamam: true, deger: kirpilmis };
}

// ---- URL slug'lari (Faz O) --------------------------------------------------
//
// Inis sayfalari `/dizin/istanbul/kuafor` bicimindeki adreslerde duruyor ve
// oradaki parcalarin il/kategori degerine geri cevrilmesi gerekiyor.
//
// NEDEN YENI BIR TABLO DEGIL, `slugUret`: bu deponun slug uretimi zaten tek
// yerde (`slug.ts`) ve Turkce harfleri elle esliyor - noktasiz i ve noktali I
// dahil. Ikinci bir esleme tablosu yazmak, ayni kurali iki yerde tutmak ve bir
// gun ayrismalarina izin vermek demekti. Karsiligi: `slugUret`in davranisi
// degisirse buradaki adresler de degisir, yani o fonksiyon artik bir URL
// sozlesmesi tasiyor. `dizin-girdi.test.ts` bunu sabitliyor.
//
// Esleme MODUL YUKLENIRKEN bir kez kuruluyor: her istekte 81 il uzerinden
// donmek gereksiz, ve carpisma olup olmadigi testte kontrol ediliyor (iki ilin
// ayni slug'a dusmesi, birinin sayfasini erisilemez kilardi).

const IL_SLUGLARI = new Map<string, Il>(
  ILLER.map((il) => [slugUret(il), il]),
);

const KATEGORI_SLUGLARI = new Map<string, Kategori>(
  KATEGORILER.map((k) => [slugUret(k), k]),
);

export function ilSlugu(il: Il): string {
  return slugUret(il);
}

export function kategoriSlugu(kategori: Kategori): string {
  return slugUret(kategori);
}

/// Slug'dan ile. Taninmayan deger `null` - cagiran taraf 404 donuyor.
///
/// Neden 404 ve neden "yok say": dizin sorgusunda gecersiz bir il PARAMETRESI
/// yok sayiliyor (bkz. dizin.ts), cunku orada kullanicinin gordugu sey bir
/// liste ve bos sayfa ona bir sey anlatmiyor. Burada ise il ADRESIN KENDISI:
/// `/dizin/istanbull` diye bir sayfa YOK ve arama motoruna "var ama bos" demek,
/// dizine binlerce anlamsiz URL sokmak olurdu.
export function slugdanIl(slug: string): Il | null {
  return IL_SLUGLARI.get(slug) ?? null;
}

export function slugdanKategori(slug: string): Kategori | null {
  return KATEGORI_SLUGLARI.get(slug) ?? null;
}

/// Kategorilerin cogul yazimi - ELLE, dokuz satir.
///
/// "İstanbul kuaförleri" demek istiyoruz ama Turkce'de cogul eki unlu uyumuna
/// gore degisiyor ("kuaförleri" ama "salonları") ve bazi kategoriler duz cogul
/// almiyor ("Cilt Bakımı" -> "cilt bakımı merkezleri"). Uretmeye calisan bir
/// fonksiyon dokuz durumdan en az ucunu yanlis yazardi; liste kapali ve dokuz
/// satirlik oldugu icin elle yazmak hem dogru hem ucuz. Ayni gerekce `bicim.ts`
/// icindeki ay ve gun adlarinda da yazili.
///
/// Il adina EK GELMIYOR: ek kategori kelimesinin sonunda duruyor, yani 81 ilin
/// hicbiri icin ayri bir yazim gerekmiyor. Faz N'de sehir basliklarinda ayni
/// tuzaktan bilerek kacinilmisti.
export const KATEGORI_COGUL: Record<Kategori, string> = {
  "Kuaför": "kuaförleri",
  "Berber": "berberleri",
  "Güzellik Salonu": "güzellik salonları",
  "Tırnak Stüdyosu": "tırnak stüdyoları",
  "Cilt Bakımı": "cilt bakımı merkezleri",
  "Masaj & Spa": "masaj ve spa merkezleri",
  "Diş Kliniği": "diş klinikleri",
  "Veteriner": "veteriner klinikleri",
  "Diğer": "diğer işletmeleri",
};
