"use client";

import { useEffect, useRef } from "react";

import { paraBicimle, saatBicimle, sureBicimle } from "@/lib/bicim";
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

// Gun ve ay yazimlari Faz H'de @/lib/bicim'e tasindi: panel takviminin SUNUCU
// bileseni de ayni adlari yaziyor ve bu dosya "use client" oldugu icin oradan
// import edemiyordu. Akisin bilesenleri isimleri buradan almaya devam etsin
// diye yeniden disa aciliyorlar - cagri yerleri degismedi.
export { ayVeYil, gunKisaAdi, haftaninGunu, tarihUzun } from "@/lib/bicim";

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
