// Gosterim bicimleri. Kurallarin kaynagi docs/marka.md ve orasi baglayici.
//
// Tek yerde durmalarinin sebebi tutarlilik: para ve sure arayuzun her
// kosesinde geciyor ve iki ekranda iki farkli yazim, urunu ozensiz gosterir.
// Ayrica bunlar saf fonksiyon oldugu icin sinanabiliyorlar - "1.250,50 ₺"
// bicimini gozle dogrulamak yerine test kilitliyor.

import type { YerelTarih } from "@/lib/zaman";

/// Kurus -> "350 ₺" / "1.250,50 ₺".
///
/// Kurus sifirsa YAZILMIYOR (marka kurali): fiyat listesinde "350,00 ₺"
/// gereksiz gurultu.
export function paraBicimle(kurus: number): string {
  const negatif = kurus < 0;
  const mutlak = Math.abs(Math.trunc(kurus));

  const lira = Math.floor(mutlak / 100);
  const kalan = mutlak % 100;

  // Binlik ayraci nokta. Intl yerine elle: Node'un ICU derlemesine gore
  // "tr-TR" bicimi degisebiliyor ve Workers'ta tam ICU her zaman yok.
  const liraMetni = lira.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  const govde =
    kalan === 0 ? liraMetni : `${liraMetni},${kalan.toString().padStart(2, "0")}`;

  return `${negatif ? "-" : ""}${govde} ₺`;
}

/// Dakika -> "45 dk" / "1 sa" / "1 sa 30 dk". "dakika" acik yazilmiyor.
export function sureBicimle(dakika: number): string {
  const toplam = Math.max(0, Math.trunc(dakika));
  const saat = Math.floor(toplam / 60);
  const dk = toplam % 60;

  if (saat === 0) return `${dk} dk`;
  if (dk === 0) return `${saat} sa`;
  return `${saat} sa ${dk} dk`;
}

/// Rakam dizisi -> "0532 123 45 67".
///
/// Veritabaninda telefon YALNIZCA RAKAM duruyor (10 hane, bastaki 0 ve 90
/// kirpilmis) cunku `musteri` tablosunda benzersiz ve iki yazim iki ayri
/// musteri kaydi uretirdi. Gosterim bicimi bu yuzden okuma aninda uretiliyor.
///
/// Tanimadigi bicimdeki deger OLDUGU GIBI donuyor: eski ya da yurt disi bir
/// numarayi bozup gostermektense ham haliyle gostermek daha durust.
export function telefonBicimle(rakamlar: string | null | undefined): string {
  if (!rakamlar) return "";
  if (!/^\d{10}$/.test(rakamlar)) return rakamlar;

  return `0${rakamlar.slice(0, 3)} ${rakamlar.slice(3, 6)} ${rakamlar.slice(6, 8)} ${rakamlar.slice(8)}`;
}

/// Gece yarisindan itibaren dakika -> "09:00". Saat iki haneli (marka kurali).
export function saatBicimle(dakika: number): string {
  const toplam = Math.max(0, Math.min(1440, Math.trunc(dakika)));
  const saat = Math.floor(toplam / 60);
  const dk = toplam % 60;
  return `${saat.toString().padStart(2, "0")}:${dk.toString().padStart(2, "0")}`;
}

/// "09:00" -> 540. Ayristiramazsa null - cagiran taraf hata mesajini kendisi
/// yaziyor, cunku alan adi buradan bilinmiyor.
export function saatiDakikayaCevir(metin: string): number | null {
  const eslesme = /^(\d{1,2}):(\d{2})$/.exec(metin.trim());
  if (!eslesme) return null;

  const saat = Number(eslesme[1]);
  const dk = Number(eslesme[2]);
  if (saat > 24 || dk > 59) return null;

  const toplam = saat * 60 + dk;
  // 24:00 gecerli (gece yarisinda kapanis), 24:30 degil.
  if (toplam > 1440) return null;

  return toplam;
}

/// 0 = Pazar ... 6 = Cumartesi (JS Date.getDay() ile ayni).
const GUN_ADLARI = [
  "Pazar",
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
];

export function gunAdi(haftaninGunu: number): string {
  return GUN_ADLARI[haftaninGunu] ?? "";
}

/// Arayuzde hafta PAZARTESIDEN baslar; veritabaninda 0 = Pazar. Sirayi burada
/// veriyoruz ki her ekran kendi dizisini yazmasin.
export const HAFTA_SIRASI = [1, 2, 3, 4, 5, 6, 0] as const;

// TAKVIM GUNU YAZIMLARI.
//
// Faz H'de buraya tasindilar. Onceden randevu akisinin `ortak.tsx` dosyasinda
// duruyorlardi ama o dosya "use client" - panel takviminin SUNUCU bileseni
// ayni ay adini yazmak icin oradan import edemezdi. Iki yere kopyalamak,
// bir gun birinde "Agustos" digerinde "Ağustos" yazmasi demekti.
//
// Ay adlari elle yazildi, `Intl` ile "tr-TR" uzerinden uretilmedi: ayni
// gerekce bu dosyanin basinda para bicimi icin de yazili - Workers'ta tam ICU
// verisi her zaman yok ve sunucunun tarayicidan farkli ay adi uretmesi
// hydration uyusmazligi demek.
const AY_ADLARI = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

/// 0 = Pazar ... 6 = Cumartesi (GUN_ADLARI ile ayni sira).
const GUN_KISALTMALARI = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

export function ayAdi(ay: number): string {
  return AY_ADLARI[ay - 1] ?? "";
}

export function gunKisaltmasi(haftaninGunu: number): string {
  return GUN_KISALTMALARI[haftaninGunu] ?? "";
}

/// Takvim gununun haftanin hangi gunune denk geldigi. Saat diliminden BAGIMSIZ:
/// "1 Eylül 2026" her dilimde salidir. Musaitlik motoru da ayni hesabi yapiyor.
export function haftaninGunu(tarih: YerelTarih): number {
  return new Date(Date.UTC(tarih.yil, tarih.ay - 1, tarih.gun)).getUTCDay();
}

/// "Sal" — gun seridindeki ve takvim basligindaki rozet.
export function gunKisaAdi(tarih: YerelTarih): string {
  return gunKisaltmasi(haftaninGunu(tarih));
}

/// "Eylül 2026" — ay basligi.
export function ayVeYil(tarih: YerelTarih): string {
  return `${ayAdi(tarih.ay)} ${tarih.yil}`;
}

/// "1 Eylül 2026, Salı" — tek gunun tam yazimi.
export function tarihUzun(tarih: YerelTarih): string {
  return `${tarih.gun} ${ayAdi(tarih.ay)} ${tarih.yil}, ${gunAdi(haftaninGunu(tarih))}`;
}

/// "1 Eylül" — hafta basliginda ve gun hucrelerinde, yil tekrar etmesin diye.
export function gunVeAy(tarih: YerelTarih): string {
  return `${tarih.gun} ${ayAdi(tarih.ay)}`;
}

/// "5 – 11 Eylül 2026" — bir gun araliginin basligi.
///
/// TEKRAR ETMEYEN parcalar atiliyor: iki tarih ayni aydaysa ay bir kez, ayni
/// yildaysa yil bir kez yaziliyor. "5 Eylül 2026 – 11 Eylül 2026" teknik
/// olarak dogru ama okunmuyor ve dar ekranda satiri ikiye cikariyor.
///
/// Panelin takviminden (Faz H) buraya TASINDI: ayni yazim Faz P'de randevu
/// akisinin gun seridinde de gerekti. Iki yerde iki kopya durdugu surece
/// birinde duzeltilen bir sinir durumu (yil sinirini asan hafta) otekinde
/// yanlis kalabilirdi.
export function tarihAraligi(ilk: YerelTarih, son: YerelTarih): string {
  if (ilk.yil !== son.yil) {
    return `${gunVeAy(ilk)} ${ilk.yil} – ${gunVeAy(son)} ${son.yil}`;
  }
  if (ilk.ay === son.ay) {
    return `${ilk.gun} – ${gunVeAy(son)} ${son.yil}`;
  }
  return `${gunVeAy(ilk)} – ${gunVeAy(son)} ${son.yil}`;
}
