// Hizmet formunun dogrulama kurallari. Iki route paylasiyor (ekleme ve
// guncelleme), o yuzden route dosyasinda degil burada.

import {
  adDogrula,
  paraKurusDogrula,
  tamsayiDogrula,
  type Dogrulama,
} from "@/lib/girdi";

/// Takvim bloklarinda kullanilabilecek renkler.
///
/// Serbest metin DEGIL, kapali liste. Iki sebep: (1) arayuz bu degerleri
/// tasarim token'larina esliyor, tanimadigi bir deger renksiz blok uretirdi;
/// (2) serbest metin, stile dogrudan yazilan bir degere donusme riski tasir.
/// DEGISMEZ 10 ile catismiyor - burada saklanan sey renk KODU degil, isletmenin
/// sectigi etiket.
export const HIZMET_RENKLERI = [
  "terracotta",
  "teal",
  "amber",
  "tas",
] as const;

export type HizmetRengi = (typeof HIZMET_RENKLERI)[number];

export type HizmetAlanlari = {
  ad: string;
  aciklama: string | null;
  sureDk: number;
  fiyatKurus: number;
  renk: HizmetRengi | null;
};

/// Sure siniri: en az 5 dakika, en fazla 8 saat. Alt sinir yazim hatalarini
/// (1 dakikalik hizmet) eliyor; ust sinir bir gunu asan bir hizmetin takvimi
/// anlamsizlastirmasini.
const SURE_EN_AZ = 5;
const SURE_EN_COK = 480;

export function hizmetAlanlariniDogrula(
  govde: Record<string, unknown>,
): Dogrulama<HizmetAlanlari> {
  const ad = adDogrula(govde.ad, "Hizmet adı");
  if (!ad.tamam) return ad;

  const sureDk = tamsayiDogrula(govde.sureDk, "Süre", {
    enAz: SURE_EN_AZ,
    enCok: SURE_EN_COK,
  });
  if (!sureDk.tamam) return sureDk;

  const fiyatKurus = paraKurusDogrula(govde.fiyat ?? govde.fiyatKurus ?? "", "Ücret");
  if (!fiyatKurus.tamam) return fiyatKurus;

  const renk = renkDogrula(govde.renk);
  if (!renk.tamam) return renk;

  // Aciklama istege bagli. Bos metin null'a cevriliyor: veritabaninda "yok"un
  // tek gosterimi olsun, bir yerde "" bir yerde null durmasin.
  const hamAciklama = typeof govde.aciklama === "string" ? govde.aciklama.trim() : "";
  if (hamAciklama.length > 500) {
    return { tamam: false, hata: "Açıklama en fazla 500 karakter olabilir" };
  }

  return {
    tamam: true,
    deger: {
      ad: ad.deger,
      aciklama: hamAciklama || null,
      sureDk: sureDk.deger,
      fiyatKurus: fiyatKurus.deger,
      renk: renk.deger,
    },
  };
}

function renkDogrula(ham: unknown): Dogrulama<HizmetRengi | null> {
  if (ham === undefined || ham === null || ham === "") {
    return { tamam: true, deger: null };
  }
  if (typeof ham !== "string" || !HIZMET_RENKLERI.includes(ham as HizmetRengi)) {
    return { tamam: false, hata: "Renk seçimi geçersiz" };
  }
  return { tamam: true, deger: ham as HizmetRengi };
}
