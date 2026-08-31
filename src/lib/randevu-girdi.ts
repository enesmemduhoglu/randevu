// Halka acik randevu govdesinin dogrulamasi. Saf fonksiyon: veritabanina ve
// aga dokunmuyor, testleri Postgres'siz kosuyor.
//
// Bu dosyanin girdisi OTURUMSUZ bir kaynaktan geliyor - internetteki herhangi
// biri. Panel formlarinin aksine burada "kullanici zaten bizim tarafta"
// varsayimi YOK: her alan tipiyle birlikte sinaniyor ve kimlik alanlari
// veritabanina ulasmadan once bicim kontrolunden geciyor.

import { telefonDogrula } from "@/lib/ayar-girdi";
import { adDogrula, type Dogrulama } from "@/lib/girdi";

export type RandevuAlanlari = {
  hizmetId: string;
  /// Verilmezse "farketmez": hizmeti verebilen ilk musait personel seciliyor.
  personelId: string | null;
  baslangic: Date;
  musteriAd: string;
  /// Yalnizca rakam (bkz. telefonDogrula). Musteri kimligi bu.
  telefon: string;
  eposta: string | null;
  not: string | null;
};

const UUID_BICIMI =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/// Kimlik alanlari veritabanina gitmeden ONCE bicim kontrolunden geciyor.
///
/// Sebep somut: `uuid` kolonuna "abc" gonderilirse Postgres 22P02 firlatir ve
/// bu, ele alinmadigi icin 500'e doner. Oysa bozuk bir id istemcinin hatasi -
/// dogru cevap 400. Ayrica kotu bicimli id'yi erken elemek, her istegin
/// veritabanina en az bir sorgu acmasini da onluyor.
function kimlikDogrula(ham: unknown, alan: string): Dogrulama<string> {
  if (typeof ham !== "string" || !UUID_BICIMI.test(ham.trim())) {
    return { tamam: false, hata: `${alan} seçilmedi` };
  }
  return { tamam: true, deger: ham.trim() };
}

/// E-posta BURADA istege bagli: musterilerin bir kismi e-posta vermiyor ve
/// hatirlatma zaten telefonla gidiyor (sema yorumu, `musteri.telefon`).
/// Bos birakilabilir ama yazildiysa bicimi tutmali - yoksa Faz I'de kuyruga
/// gonderilemez bir adres yazilmis olur ve hata cok sonra gorunur.
const EPOSTA_BICIMI = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function istegeBagliEposta(ham: unknown): Dogrulama<string | null> {
  if (ham === undefined || ham === null || ham === "") {
    return { tamam: true, deger: null };
  }
  if (typeof ham !== "string") return { tamam: false, hata: "E-posta okunamadı" };

  const deger = ham.trim().toLowerCase();
  if (!deger) return { tamam: true, deger: null };
  if (deger.length > 254 || !EPOSTA_BICIMI.test(deger)) {
    return { tamam: false, hata: "E-posta adresi geçerli görünmüyor" };
  }

  return { tamam: true, deger };
}

/// Musterinin randevuya yazdigi not. Uzunluk sinirli: sinirsiz metin, halka
/// acik bir yoldan veritabanina istenen kadar veri yazmak demek.
function notDogrula(ham: unknown): Dogrulama<string | null> {
  if (ham === undefined || ham === null) return { tamam: true, deger: null };
  if (typeof ham !== "string") return { tamam: false, hata: "Not okunamadı" };

  const deger = ham.trim();
  if (deger.length > 500) {
    return { tamam: false, hata: "Not en fazla 500 karakter olabilir" };
  }
  return { tamam: true, deger: deger || null };
}

/// Baslangic ISO 8601 metni olarak geliyor (`/api/musaitlik` de oyle veriyor).
///
/// Yerel saat metni DEGIL: "2026-09-01 14:00" gibi dilimsiz bir deger,
/// sunucunun dilimine gore yorumlanirdi ve DEGISMEZ 7 tam da bunu yasakliyor.
/// Slotun gercekten alinabilir olup olmadigi burada degil, isletmenin
/// saatDilimi'yle calisan musaitlik motorunda sinaniyor.
function baslangicDogrula(ham: unknown): Dogrulama<Date> {
  if (typeof ham !== "string" || !ham.trim()) {
    return { tamam: false, hata: "Randevu saati seçilmedi" };
  }

  const an = new Date(ham.trim());
  if (Number.isNaN(an.getTime())) {
    return { tamam: false, hata: "Randevu saati okunamadı" };
  }

  return { tamam: true, deger: an };
}

export function randevuAlanlariniDogrula(
  govde: Record<string, unknown>,
): Dogrulama<RandevuAlanlari> {
  const hizmetId = kimlikDogrula(govde.hizmetId, "Hizmet");
  if (!hizmetId.tamam) return hizmetId;

  // Personel istege bagli: tek kisilik isletmede arayuz bu adimi hic
  // gostermiyor (bkz. sema, `personel` yorumu).
  let personelId: string | null = null;
  if (govde.personelId !== undefined && govde.personelId !== null && govde.personelId !== "") {
    const cozulen = kimlikDogrula(govde.personelId, "Personel");
    if (!cozulen.tamam) return cozulen;
    personelId = cozulen.deger;
  }

  const baslangic = baslangicDogrula(govde.baslangic);
  if (!baslangic.tamam) return baslangic;

  const musteriAd = adDogrula(govde.ad, "Ad soyad");
  if (!musteriAd.tamam) return musteriAd;

  const telefon = telefonDogrula(govde.telefon);
  if (!telefon.tamam) return telefon;
  // telefonDogrula bos degeri gecerli sayiyor (ayarlarda telefon istege
  // bagli). Randevuda ise ZORUNLU: musteri kimligi o numara ve isletmenin
  // musteriye ulasabilecegi tek kanal.
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
      personelId,
      baslangic: baslangic.deger,
      musteriAd: musteriAd.deger,
      telefon: telefon.deger,
      eposta: eposta.deger,
      not: not.deger,
    },
  };
}
