// Randevu durumunun gecis kurallari. Saf modul: veritabani, ag ve saat yok.
//
// NEDEN AYRI DOSYA: gecis kurali iki yerde birden gerekiyor ve ikisinin AYNI
// olmasi sart. Panel arayuzu hangi dugmeleri gosterecegini buradan soruyor,
// scoped-db ise kosullu UPDATE'in `where`'ine koyacagi kaynak durum kumesini
// buradan aliyor. Ikisi ayrisirsa arayuz gosterdigi dugmenin her zaman 409
// donduru bir uygulama uretir - ve sebebi hicbir yerde yazili olmaz.
//
// DEGISMEZ 3'un bu fazdaki karsiligi: hedef duruma gecebilen kaynak durumlar
// `where`'e giriyor, once-oku-sonra-yaz yok. Iki sekme ayni randevuyu ayni
// anda onaylarsa ikincisi 0 satir etkiliyor ve 409 aliyor.

import type { Dogrulama } from "@/lib/girdi";

export type RandevuDurumu =
  | "BEKLIYOR"
  | "ONAYLI"
  | "IPTAL"
  | "TAMAMLANDI"
  | "GELMEDI";

export const RANDEVU_DURUMLARI = [
  "BEKLIYOR",
  "ONAYLI",
  "IPTAL",
  "TAMAMLANDI",
  "GELMEDI",
] as const satisfies readonly RandevuDurumu[];

/// Slotu DOLU sayan durumlar. Bu kume veritabanindaki EXCLUDE kisitinin
/// `WHERE durum IN (...)` yan tumcesiyle birebir ayni olmak zorunda
/// (drizzle/0002_*.sql, DEGISMEZ 8); ayrisirsa uygulama bos gordugu bir sloti
/// yazmaya calisir ve kullanici sebepsiz 409 alir.
export const AKTIF_DURUMLAR = [
  "BEKLIYOR",
  "ONAYLI",
] as const satisfies readonly RandevuDurumu[];

/// Hangi durumdan hangilerine gecilebilir.
///
/// UC DURUM TERMINAL: iptal, tamamlandi ve gelmedi hicbir yere gitmiyor.
/// Bunun sebebi urun tercihi degil, kisit: IPTAL bir randevuyu yeniden
/// ONAYLI yapmak slotu tekrar doldurmak demek ve o slot bu arada baskasina
/// verilmis olabilir. Geri acmak, once musaitlik motoruna sormayi ve gerekirse
/// yeni bir saat onermeyi gerektiriyor - yani "elle randevu ekleme" isi.
/// O yuzden Faz H2'ye birakildi; simdilik geri alma yolu "yeni randevu ac".
///
/// BEKLIYOR'dan dogrudan TAMAMLANDI/GELMEDI'ye gecilebiliyor: otomatik onay
/// kapaliyken isletme randevuyu onaylamayi unutabiliyor ve musteri yine de
/// geliyor. Once "onayla" demeye zorlamak, gecmisi olmamis gibi
/// kaydettirirdi.
export const GECISLER: Record<RandevuDurumu, readonly RandevuDurumu[]> = {
  BEKLIYOR: ["ONAYLI", "TAMAMLANDI", "GELMEDI", "IPTAL"],
  ONAYLI: ["TAMAMLANDI", "GELMEDI", "IPTAL"],
  IPTAL: [],
  TAMAMLANDI: [],
  GELMEDI: [],
};

/// Hedef duruma gecebilen kaynak durumlar - kosullu UPDATE'in `where`'i.
///
/// GECISLER'in tersi olarak TURETILIYOR, elle yazilmiyor: iki listeyi ayri
/// tutmak, birine eklenen gecisin digerinde unutulmasi demekti ve o hata
/// "dugme gorunuyor ama basinca calismiyor" seklinde ortaya cikardi.
export function kaynakDurumlar(hedef: RandevuDurumu): RandevuDurumu[] {
  return RANDEVU_DURUMLARI.filter((kaynak) => GECISLER[kaynak].includes(hedef));
}

export function gecisMumkunMu(
  kaynak: RandevuDurumu,
  hedef: RandevuDurumu,
): boolean {
  return GECISLER[kaynak].includes(hedef);
}

/// Durumun kendisinin adi - rozette ve detayda gorunen.
export const DURUM_ETIKETLERI: Record<RandevuDurumu, string> = {
  BEKLIYOR: "Onay bekliyor",
  ONAYLI: "Onaylı",
  IPTAL: "İptal edildi",
  TAMAMLANDI: "Tamamlandı",
  GELMEDI: "Gelmedi",
};

/// Duruma GECIREN eylemin adi - dugme yazisi.
///
/// Etiketten ayri: rozette "İptal edildi" dogru, dugmede "İptal et" dogru.
/// Tek liste tutulsaydi ikisinden biri yanlis okunurdu.
export const EYLEM_ETIKETLERI: Record<RandevuDurumu, string> = {
  BEKLIYOR: "Onay bekliyor",
  ONAYLI: "Onayla",
  IPTAL: "İptal et",
  TAMAMLANDI: "Geldi, tamamlandı",
  GELMEDI: "Gelmedi",
};

/// Gecis reddedildiginde kullaniciya donen aciklama.
///
/// Randevunun MEVCUT durumunu soyluyor, istenen hedefi degil: kullanici
/// "neden olmadi" sorusunun cevabini ariyor ve cevap her zaman "kayit artik
/// baska bir durumda" - cogunlukla baska bir sekmede ya da musteri iptal
/// linkiyle degistirdigi icin.
export const CIKILAMAZ_ACIKLAMASI: Record<RandevuDurumu, string> = {
  BEKLIYOR: "Bu randevu onay bekliyor.",
  ONAYLI: "Bu randevu zaten onaylı.",
  IPTAL: "Bu randevu iptal edilmiş; durumu artık değiştirilemiyor.",
  TAMAMLANDI: "Bu randevu tamamlandı olarak işaretlenmiş.",
  GELMEDI: "Bu randevu gelmedi olarak işaretlenmiş.",
};

export function durumMu(ham: unknown): ham is RandevuDurumu {
  return (
    typeof ham === "string" &&
    (RANDEVU_DURUMLARI as readonly string[]).includes(ham)
  );
}

/// Govdeden gelen hedef durumu dogrular.
///
/// BEKLIYOR hedef olarak KABUL EDILMIYOR: hicbir gecisin varis noktasi degil
/// (bkz. GECISLER). Dogrulamada elenmesi, veritabanina hicbir zaman
/// kazanamayacak bir UPDATE gondermemek icin - istemcinin hatasi 400, sunucuda
/// sessizce 0 satir degil.
export function hedefDurumDogrula(ham: unknown): Dogrulama<RandevuDurumu> {
  if (!durumMu(ham)) {
    return { tamam: false, hata: "Randevu durumu seçilmedi" };
  }
  if (kaynakDurumlar(ham).length === 0) {
    return { tamam: false, hata: "Randevu bu duruma alınamıyor" };
  }
  return { tamam: true, deger: ham };
}
