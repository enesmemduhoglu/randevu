// Rolun ARAYUZDEKI karsiligi. Saf modul: veritabani, ag ve saat yok.
//
// NEDEN AYRI DOSYA (Faz J): ayni etiket artik iki yerde birden gerekiyor -
// panelin kenar cubugundaki hesap menusu ve halka acik ust bardaki hesap
// menusu. Ikisi de `src/components` altinda ama farkli agaclarda; halka acik
// barin panel bilesenini import etmesi katmanlari ters cevirirdi.
//
// `randevu-durum.ts > DURUM_ETIKETLERI` ile ayni desen: teknik deger kodda,
// insanin okudugu karsiligi tek bir haritada.

import type { Rol } from "@/lib/scoped-db";

/// Rol arayuzde teknik degeriyle GORUNMEZ. "kullanici" kelimesi de hic
/// gecmiyor (docs/marka.md terim sozlugu).
export const ROL_ETIKETLERI: Record<Rol, string> = {
  SAHIP: "İşletme sahibi",
  PERSONEL: "Personel",
  MUSTERI: "Müşteri",
};

/// Avatar dairesindeki harf. YALNIZCA SUSLEME - okunacak bilgi zaten yaninda
/// yaziyor, o yuzden bas harf cikarilamadiginda "?" gostermek yeterli.
///
/// `toLocaleUpperCase("tr")` sart: "i" harfinin buyugu Turkce'de "İ", ve
/// varsayilan yerelde "I" cikiyor - yani "İrem" adinin bas harfi yanlis
/// yaziliyordu.
export function basHarf(ad: string): string {
  return ad.trim().charAt(0).toLocaleUpperCase("tr") || "?";
}
