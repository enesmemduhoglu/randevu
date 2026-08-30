// Gosterim bicimleri. Kurallarin kaynagi docs/marka.md ve orasi baglayici.
//
// Tek yerde durmalarinin sebebi tutarlilik: para ve sure arayuzun her
// kosesinde geciyor ve iki ekranda iki farkli yazim, urunu ozensiz gosterir.
// Ayrica bunlar saf fonksiyon oldugu icin sinanabiliyorlar - "1.250,50 ₺"
// bicimini gozle dogrulamak yerine test kilitliyor.

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
