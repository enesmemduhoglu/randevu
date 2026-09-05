// Panelden elle girilen randevu govdesinin dogrulamasi (Faz H2). Saf
// fonksiyon: veritabanina ve aga dokunmuyor.
//
// Halka acik girdiden (randevu-girdi.ts) ayri bir dosya cunku girdinin
// KAYNAGI farkli ve bu iki karara yansiyor: personel burada ZORUNLU, saat ise
// motorun disina cikabiliyor. Ortak olan alan dogrulamalari - ad, telefon,
// e-posta, not, baslangic - oteki dosyadan aliniyor, kopyalanmiyor.

import { telefonDogrula } from "@/lib/ayar-girdi";
import { adDogrula, type Dogrulama } from "@/lib/girdi";
import {
  baslangicDogrula,
  istegeBagliEposta,
  kimlikDogrula,
  notDogrula,
} from "@/lib/randevu-girdi";

export type PanelRandevuAlanlari = {
  hizmetId: string;
  /// ZORUNLU, halka acik akistaki gibi "farketmez" YOK.
  ///
  /// Musteri kimin yapacagini bilmiyor ve motor onun yerine seciyor; isletme
  /// biliyor. Ayrica serbest saatte secilecek bir sey de kalmiyor - motor
  /// calismadigi icin "musait olan ilk personel" diye bir cevap uretilemez ve
  /// sessizce ilk personeli secmek, randevuyu yanlis kisinin takvimine yazmak
  /// olurdu.
  personelId: string;
  baslangic: Date;
  musteriAd: string;
  /// Yalnizca rakam (bkz. telefonDogrula). Musteri kimligi bu.
  telefon: string;
  eposta: string | null;
  not: string | null;
  /// Musaitlik motorunun uygun bulmadigi bir saate RAGMEN yazilsin mi.
  ///
  /// Iki adimli bilerek: istemci once bayraksiz gonderiyor, saat motorun
  /// disindaysa 409 aliyor ve kullaniciya "calisma saati disinda, yine de
  /// eklensin mi" diye soruluyor. Tek adimda yazsaydik yanlis saate dokunan
  /// bir tik sessizce takvime islerdi; bayrak, istisnanin BILINCLI olmasini
  /// zorunlu kiliyor.
  zorla: boolean;
};

export function panelRandevuAlanlariniDogrula(
  govde: Record<string, unknown>,
): Dogrulama<PanelRandevuAlanlari> {
  const hizmetId = kimlikDogrula(govde.hizmetId, "Hizmet");
  if (!hizmetId.tamam) return hizmetId;

  const personelId = kimlikDogrula(govde.personelId, "Personel");
  if (!personelId.tamam) return personelId;

  const baslangic = baslangicDogrula(govde.baslangic);
  if (!baslangic.tamam) return baslangic;

  const musteriAd = adDogrula(govde.ad, "Ad soyad");
  if (!musteriAd.tamam) return musteriAd;

  const telefon = telefonDogrula(govde.telefon);
  if (!telefon.tamam) return telefon;
  // telefonDogrula bos degeri gecerli sayiyor (ayarlarda telefon istege
  // bagli). Randevuda ise ZORUNLU: musteri kaydi `(isletmeId, telefon)` ile
  // tekilleniyor, yani numarasiz bir musteri hicbir zaman ikinci kez
  // bulunamazdi.
  if (!telefon.deger) {
    return { tamam: false, hata: "Telefon numarası gerekli" };
  }

  const eposta = istegeBagliEposta(govde.eposta);
  if (!eposta.tamam) return eposta;

  const not = notDogrula(govde.not);
  if (!not.tamam) return not;

  return {
    tamam: true,
    deger: {
      hizmetId: hizmetId.deger,
      personelId: personelId.deger,
      baslangic: baslangic.deger,
      musteriAd: musteriAd.deger,
      telefon: telefon.deger,
      eposta: eposta.deger,
      not: not.deger,
      // Yalnizca `true` zorluyor: eksik ya da bozuk bir deger, istisnayi
      // ISTEMEMEK anlamina geliyor.
      zorla: govde.zorla === true,
    },
  };
}
