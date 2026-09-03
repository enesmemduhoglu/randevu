// Sitenin kanonik adresi. `robots.ts`, `sitemap.ts` ve `metadataBase` buradan
// okuyor.
//
// Cagri aninda okunuyor, modul yuklenirken degil: modul seviyesinde yakalanan
// bir env degeri Workers'ta ILK ISTEGIN baglaminda donar ve testlerde de
// degistirilemez hale gelir. Ayni gerekce `origin.ts > beklenenOriginler`
// icinde de yazili.
//
// NEDEN YEDEK DEGER VAR: `robots.txt` ve `sitemap.xml` MUTLAK adres istiyor -
// goreli bir URL protokole aykiri ve arama motoru dosyayi tumden yok sayiyor.
// Degisken tanimsizken uretilecek en dogru sey, uretimde kullanilan adres;
// yerelde bu dosyalari acan gelistirici de bozuk degil, yalnizca uzak adresi
// isaret eden bir cikti goruyor.
const YEDEK = "https://randevu.enesmemduhoglu.tech";

export function siteKoku(): string {
  const ham = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!ham) return YEDEK;
  // Sondaki egik cizgi kirpiliyor: `${kok}/dizin` iki cizgi uretmesin.
  return ham.replace(/\/+$/, "");
}
