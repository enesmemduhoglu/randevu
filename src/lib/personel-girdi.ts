// Personel formunun dogrulama kurallari. Ekleme ve guncelleme route'lari
// paylasiyor.

import { adDogrula, tamsayiDogrula, type Dogrulama } from "@/lib/girdi";

export type PersonelAlanlari = {
  ad: string;
  unvan: string | null;
  sira: number;
};

export function personelAlanlariniDogrula(
  govde: Record<string, unknown>,
): Dogrulama<PersonelAlanlari> {
  const ad = adDogrula(govde.ad, "Ad soyad");
  if (!ad.tamam) return ad;

  // Unvan istege bagli ("Kuaför", "Uzman"). Bos metin null'a cevriliyor ki
  // veritabaninda "yok"un tek gosterimi olsun.
  const hamUnvan = typeof govde.unvan === "string" ? govde.unvan.trim() : "";
  if (hamUnvan.length > 60) {
    return { tamam: false, hata: "Ünvan en fazla 60 karakter olabilir" };
  }

  // Sira istege bagli: gonderilmezse 0. Listeleme sira sonra ada gore
  // yapiliyor, yani hepsi 0 kalirsa alfabetik siralaniyor - makul varsayilan.
  const hamSira = govde.sira;
  const sira =
    hamSira === undefined || hamSira === null || hamSira === ""
      ? { tamam: true as const, deger: 0 }
      : tamsayiDogrula(hamSira, "Sıra", { enAz: 0, enCok: 999 });
  if (!sira.tamam) return sira;

  return {
    tamam: true,
    deger: { ad: ad.deger, unvan: hamUnvan || null, sira: sira.deger },
  };
}

/// Personelin verdigi hizmetlerin id listesi.
///
/// BOS LISTE gecerli ve "hicbiri" degil "hepsi" demek (bkz. sema yorumu).
export function hizmetIdListesiDogrula(ham: unknown): Dogrulama<string[]> {
  if (ham === undefined || ham === null) return { tamam: true, deger: [] };
  if (!Array.isArray(ham)) {
    return { tamam: false, hata: "Hizmet seçimi okunamadı" };
  }
  if (ham.length > 200) {
    return { tamam: false, hata: "Çok fazla hizmet seçildi" };
  }
  if (!ham.every((d) => typeof d === "string" && d.length > 0)) {
    return { tamam: false, hata: "Hizmet seçimi okunamadı" };
  }

  // Tekrar edenler eleniyor: ayni id iki kez gelirse toplu yazma birincil
  // anahtar ihlaline carpardi ve kullanici sebebini anlamazdi.
  return { tamam: true, deger: [...new Set(ham as string[])] };
}
