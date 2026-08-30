// Isletme ayarlarinin dogrulama kurallari.

import { adDogrula, tamsayiDogrula, type Dogrulama } from "@/lib/girdi";

/// Desteklenen saat dilimleri.
///
/// Kapali liste, `Intl.supportedValuesOf` DEGIL: workerd'in ICU derlemesi tam
/// degil ve orada liste bos ya da eksik donebiliyor - kullanicinin kayitli
/// saat dilimi bir gun "gecersiz" sayilirdi. Ayrica bu urunun kitlesi belli;
/// yuzlerce secenek gostermek secimi zorlastirmaktan baska ise yaramaz.
/// Yeni bir bolgeye acilinca buraya bir satir ekleniyor.
export const SAAT_DILIMLERI = [
  { deger: "Europe/Istanbul", ad: "İstanbul (TSİ)" },
  { deger: "Europe/Berlin", ad: "Berlin" },
  { deger: "Europe/Amsterdam", ad: "Amsterdam" },
  { deger: "Europe/London", ad: "Londra" },
  { deger: "Europe/Paris", ad: "Paris" },
  { deger: "UTC", ad: "UTC" },
] as const;

/// Musaitlik izgarasinin adimi. Hizmet suresinden bagimsiz: 45 dakikalik bir
/// hizmet 15 dakikalik izgarada 09:00, 09:15, 09:30 noktalarinda baslayabilir.
export const SLOT_ARALIKLARI = [5, 10, 15, 20, 30, 60] as const;

export type AyarAlanlari = {
  ad: string;
  telefon: string | null;
  adres: string | null;
  hakkinda: string | null;
  saatDilimi: string;
  slotAraligiDk: number;
  minOnceBildirimDk: number;
  maksIleriGun: number;
  otomatikOnay: boolean;
};

export function ayarAlanlariniDogrula(
  govde: Record<string, unknown>,
): Dogrulama<AyarAlanlari> {
  const ad = adDogrula(govde.ad, "İşletme adı");
  if (!ad.tamam) return ad;

  const telefon = telefonDogrula(govde.telefon);
  if (!telefon.tamam) return telefon;

  const adres = metinDogrula(govde.adres, "Adres", 300);
  if (!adres.tamam) return adres;

  const hakkinda = metinDogrula(govde.hakkinda, "Hakkında", 1000);
  if (!hakkinda.tamam) return hakkinda;

  const saatDilimi = govde.saatDilimi;
  if (
    typeof saatDilimi !== "string" ||
    !SAAT_DILIMLERI.some((s) => s.deger === saatDilimi)
  ) {
    return { tamam: false, hata: "Saat dilimi seçimi geçersiz" };
  }

  const slot = tamsayiDogrula(govde.slotAraligiDk, "Randevu aralığı", {
    enAz: 5,
    enCok: 60,
  });
  if (!slot.tamam) return slot;
  if (!SLOT_ARALIKLARI.includes(slot.deger as (typeof SLOT_ARALIKLARI)[number])) {
    return { tamam: false, hata: "Randevu aralığı seçimi geçersiz" };
  }

  // 0 gecerli: "her an randevu alinabilir". Ust sinir 7 gun - daha uzunu
  // pratikte "randevu alinamiyor" demek ve kullanici sebebini aramaya baslar.
  const minOnce = tamsayiDogrula(govde.minOnceBildirimDk, "En erken randevu", {
    enAz: 0,
    enCok: 10080,
  });
  if (!minOnce.tamam) return minOnce;

  const maksIleri = tamsayiDogrula(govde.maksIleriGun, "Takvim penceresi", {
    enAz: 1,
    enCok: 365,
  });
  if (!maksIleri.tamam) return maksIleri;

  return {
    tamam: true,
    deger: {
      ad: ad.deger,
      telefon: telefon.deger,
      adres: adres.deger,
      hakkinda: hakkinda.deger,
      saatDilimi,
      slotAraligiDk: slot.deger,
      minOnceBildirimDk: minOnce.deger,
      maksIleriGun: maksIleri.deger,
      // Kutucuk isaretli degilse tarayici alani hic gondermiyor; yoklugu
      // "kapali" demek.
      otomatikOnay: govde.otomatikOnay === true || govde.otomatikOnay === "true",
    },
  };
}

/// Telefon: veritabaninda YALNIZCA RAKAM (docs/marka.md). Gosterim katmani
/// "0532 123 45 67" olarak biciimlendiriyor.
export function telefonDogrula(ham: unknown): Dogrulama<string | null> {
  if (ham === undefined || ham === null || ham === "") {
    return { tamam: true, deger: null };
  }
  if (typeof ham !== "string") return { tamam: false, hata: "Telefon okunamadı" };

  const rakamlar = ham.replace(/\D/g, "");
  if (rakamlar === "") return { tamam: true, deger: null };

  // Bastaki 0 ve 90 kirpiliyor: kullanici uc bicimde de yazabiliyor ve
  // veritabaninda tek bicim durmali, yoksa ayni numara iki musteri kaydi
  // uretir (musteri tablosunda telefon benzersiz).
  let temiz = rakamlar;
  if (temiz.startsWith("90") && temiz.length === 12) temiz = temiz.slice(2);
  if (temiz.startsWith("0") && temiz.length === 11) temiz = temiz.slice(1);

  if (temiz.length !== 10) {
    return { tamam: false, hata: "Telefon numarası 10 haneli olmalı — 5xx xxx xx xx" };
  }

  return { tamam: true, deger: temiz };
}

function metinDogrula(
  ham: unknown,
  alan: string,
  enCok: number,
): Dogrulama<string | null> {
  if (ham === undefined || ham === null) return { tamam: true, deger: null };
  if (typeof ham !== "string") return { tamam: false, hata: `${alan} okunamadı` };

  const deger = ham.trim();
  if (deger.length > enCok) {
    return { tamam: false, hata: `${alan} en fazla ${enCok} karakter olabilir` };
  }

  return { tamam: true, deger: deger || null };
}
