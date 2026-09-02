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

import type { Dogrulama } from "@/lib/girdi";

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
  return { tamam: true, deger: kirpilmis };
}
