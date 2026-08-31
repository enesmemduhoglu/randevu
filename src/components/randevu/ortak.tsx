"use client";

import { useEffect, useRef } from "react";

import { gunAdi, paraBicimle, saatBicimle, sureBicimle } from "@/lib/bicim";
import { yerelParcalar, type YerelTarih } from "@/lib/zaman";

// Randevu akisinin ortak sozlugu: adimlarin paylastigi tipler, gosterim
// bicimleri ve adim basligi.
//
// ZAMAN BICIMLEME BURADA TOPLANIYOR. DEGISMEZ 7 istemcide de gecerli:
// musterinin tarayicisi isletmeyle ayni saat diliminde olmak zorunda degil -
// baska sehirde, tatilde ya da telefonun dilimi elle degistirilmis olabilir.
// Bu yuzden akisin hicbir yerinde `Date#getHours` ya da dilimsiz
// `toLocaleString` yok; her donusum isletmenin `saatDilimi` alaniyla
// @/lib/zaman uzerinden gidiyor.
//
// Ay adlari elle yazildi, `Intl` ile "tr-TR" uzerinden uretilmedi: bu
// bilesenler SUNUCUDA da render ediliyor ve Workers'ta tam ICU verisi her
// zaman yok (ayni gerekce src/lib/bicim.ts'te de yazili). Sunucunun ve
// tarayicinin farkli ay adi uretmesi hydration uyusmazligi demekti.
//
// Dosya `.tsx`: akisin bilesenleri tek klasorde toplandigi icin adim basligi
// da burada duruyor ve JSX iceriyor.

/// Sunucudan gelen hizmet. `personelIdler` bu hizmeti VEREBILEN aktif
/// personellerin listesi; "bos esleme = hepsi" kurali sunucuda cozuluyor,
/// arayuz o kurali bilmiyor.
export type HizmetOzeti = {
  id: string;
  ad: string;
  aciklama: string | null;
  sureDk: number;
  fiyatKurus: number;
  personelIdler: string[];
};

export type PersonelOzeti = {
  id: string;
  ad: string;
  unvan: string | null;
};

export type IsletmeOzeti = {
  slug: string;
  ad: string;
  saatDilimi: string;
  /// Takvimin ne kadar ilerisi acik. Gun seridi bunu asamiyor - asarsa
  /// musaitlik motoru bos liste donuyor ve musteri sebebini anlamiyor.
  maksIleriGun: number;
};

/// `/api/musaitlik` yanitindaki tek slot. `baslangic` ve `bitis` ISO/UTC.
export type Slot = {
  baslangic: string;
  bitis: string;
  personelId: string;
  personelAd: string;
};

/// "45 dk · 350 ₺" — hizmetin sure ve ucret satiri.
///
/// Iki yerde geciyor (liste ve ozet) ve ayni yazimda olmalari gerekiyor;
/// ikisini ayri yazmak, birinde fiyat kuralinin degisip digerinde kalmasi
/// demekti.
///
/// FIYAT 0 ISE HIC YAZILMIYOR. Semada varsayilan 0 ve bu "ucretsiz" degil,
/// "isletme fiyat girmemis" demek; "0 ₺" musteriye tutamayacagimiz bir soz
/// verirdi.
export function hizmetBilgisi(hizmet: HizmetOzeti): string {
  const sure = sureBicimle(hizmet.sureDk);
  return hizmet.fiyatKurus > 0
    ? `${sure} · ${paraBicimle(hizmet.fiyatKurus)}`
    : sure;
}

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

/// 0 = Pazar ... 6 = Cumartesi (bicim.ts > gunAdi ile ayni sira).
const GUN_KISALTMALARI = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

/// Takvim gununun haftanin hangi gunune denk geldigi. Saat diliminden BAGIMSIZ:
/// "1 Eylül 2026" her dilimde salidir. Musaitlik motoru da ayni hesabi yapiyor.
export function haftaninGunu(tarih: YerelTarih): number {
  return new Date(Date.UTC(tarih.yil, tarih.ay - 1, tarih.gun)).getUTCDay();
}

/// "Sal" — gun seridindeki rozet icin.
export function gunKisaAdi(tarih: YerelTarih): string {
  return GUN_KISALTMALARI[haftaninGunu(tarih)] ?? "";
}

/// "Eylül 2026" — gun seridinin ustundeki baslik.
export function ayVeYil(tarih: YerelTarih): string {
  return `${AY_ADLARI[tarih.ay - 1] ?? ""} ${tarih.yil}`;
}

/// "1 Eylül 2026, Salı" — secilen gunun tam yazimi.
export function tarihUzun(tarih: YerelTarih): string {
  const ay = AY_ADLARI[tarih.ay - 1] ?? "";
  return `${tarih.gun} ${ay} ${tarih.yil}, ${gunAdi(haftaninGunu(tarih))}`;
}

/// ISO an -> isletmenin dilimindeki "14:30".
export function saatiGoster(iso: string, saatDilimi: string): string {
  const p = yerelParcalar(new Date(iso), saatDilimi);
  return saatBicimle(p.saat * 60 + p.dakika);
}

/// ISO an -> isletmenin takvimindeki gun.
export function anTarihi(iso: string, saatDilimi: string): YerelTarih {
  const p = yerelParcalar(new Date(iso), saatDilimi);
  return { yil: p.yil, ay: p.ay, gun: p.gun };
}

/// Adim basligi.
///
/// `tabIndex={-1}` ve odaklanma: adim degistiginde ekran gorsel olarak
/// tamamen degisiyor ama odak eski dugmede kaliyor - ekran okuyucu kullanan
/// biri hicbir sey olmamis gibi kaliyordu. Odagi basliga tasimak yeni adimin
/// adini okutuyor.
///
/// `odakla` ilk adimda kapali: sayfa acilir acilmaz odak calmak, sayfayi
/// kaydiriyor ve klavye kullanicisini basliktan asagi firlatiyor.
export function AdimBasligi({
  baslik,
  aciklama,
  odakla = true,
}: {
  baslik: string;
  aciklama?: string;
  odakla?: boolean;
}) {
  const basvuru = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (odakla) basvuru.current?.focus();
  }, [odakla]);

  return (
    <div className="space-y-1">
      <h2
        ref={basvuru}
        tabIndex={-1}
        className="font-heading text-xl font-semibold tracking-tight outline-none"
      >
        {baslik}
      </h2>
      {aciklama ? (
        <p className="text-sm text-muted-foreground">{aciklama}</p>
      ) : null}
    </div>
  );
}
