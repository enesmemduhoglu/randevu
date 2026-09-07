// Panelden musteri kaydinin duzeltilmesinin girdi dogrulamasi (Faz H2, ikinci
// yari). Saf fonksiyon: veritabanina ve aga dokunmuyor.
//
// TELEFON ALANI YOK ve bu dosyanin en onemli karari o. Musteri
// `(isletmeId, telefon)` ile tekilleniyor, yani numara kaydin KIMLIGI;
// duzenlenebilir bir alan olsaydi ya baska bir musterinin numarasiyla
// carpisirdi ya da o numaradan gelen sonraki randevu ikinci bir musteri kaydi
// acardi. Gerekcenin uzunu `scoped-db.ts > musteriGuncelle`in yaninda.

import { adDogrula, type Dogrulama } from "@/lib/girdi";
import { istegeBagliEposta, notDogrula } from "@/lib/randevu-girdi";

export type MusteriAlanlari = {
  ad: string;
  eposta: string | null;
  /// Isletmenin musteri hakkindaki IC notu - randevunun notu degil.
  /// Musteriye hicbir kapidan gosterilmiyor (bkz. `musteri-db.ts`).
  not: string | null;
};

export function musteriAlanlariniDogrula(
  govde: Record<string, unknown>,
): Dogrulama<MusteriAlanlari> {
  const ad = adDogrula(govde.ad, "Ad soyad");
  if (!ad.tamam) return ad;

  const eposta = istegeBagliEposta(govde.eposta);
  if (!eposta.tamam) return eposta;

  // Randevu notuyla AYNI dogrulayici: ikisi de isletmenin yazdigi serbest
  // metin ve ayni 500 karakter siniri. Ikinci bir kopya bir gun ayrisip
  // kullaniciya iki farkli sinir soylerdi.
  const not = notDogrula(govde.not);
  if (!not.tamam) return not;

  return {
    tamam: true,
    deger: { ad: ad.deger, eposta: eposta.deger, not: not.deger },
  };
}
