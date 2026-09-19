// KAPI DISI DOSYA - depodaki IKINCI kiraci-ustu okuma (ilki `dizin.ts`).
//
// Hatirlatici (Faz K) kuyrugun TAMAMINA bakmak zorunda: bir hatirlatmanin
// zamani geldiginde o randevuya dokunan bir istek yok, yani `getScopedDb` ya
// da `getHalkaAcikDb` acacak bir oturum ya da slug da yok. Faz I bu sorguyu
// bilerek ertelemisti ("kiraci-ustu okuyacagi icin ayri bir tasarim karari").
//
// KARAR: bu dosya GONDERMIYOR, yalnizca ADRES veriyor. Donen sey bir liste
// `(slug, randevuId)` ciftleri - gonderimin kendisi her cift icin
// `getHalkaAcikDb(slug)` kapisindan, Faz I'den beri calisan
// `bildirimleriBosalt` ile yapiliyor. Yani kisisel veri (musteri adi, e-posta,
// telefon, iptal token'i) bu dosyadan HIC gecmiyor; o alanlari okuyan sorgu
// hala kiraciya kapsanmis olan sorgu.
//
// Alternatif bu dosyada tek bir buyuk JOIN'le butun `BekleyenBildirim`
// satirlarini okumakti - bir sorgu, sifir ek gidis-donus. Reddedildi: o zaman
// kapsamsiz bir dosya musteri e-postasini ve ham iptal token'ini tasirdi ve
// DEGISMEZ 12'nin "yuzeyi dar tut" karsiligi burada kalmazdi.
//
// Yuzeyin sinirlari (`degismezler.test.ts` metin tarayarak zorluyor):
//   1. Yalnizca `bildirim_kuyrugu` ve `isletme` okunuyor. `randevu`,
//      `musteri`, `kullanici` bu dosyada GECMIYOR.
//   2. Donen tip elle yazilmis ve kapali: slug ve randevu kimligi, baska bir
//      sey yok.
//   3. Cagiran taraf yalnizca ZAMAN ve UST SINIR veriyor; tablo, kolon ya da
//      kiraci veremiyor.
//   4. SALT OKUNUR. Ustlenme, isaretleme, silme - hepsi kiraciya kapsanmis
//      kapida kaliyor.

import { and, asc, eq, lte, min } from "drizzle-orm";

import { bildirimKuyrugu, isletme } from "@/db/sema";
import { getDb } from "@/lib/db";

/// Zamani gelmis en az bir e-posta satiri olan randevu. KAPALI tip - bkz.
/// dosya basligi, madde 2.
export type BosaltilacakRandevu = {
  slug: string;
  randevuId: string;
};

/// Zamani gelmis, hala bekleyen e-posta satiri olan randevular; en eski
/// planlanan satir once.
///
/// `sinir` bir kosumun ne kadar is alacagini belirliyor. Siralama VERILDI ki
/// sinir dolup kalan satirlar bir sonraki kosuma ertelendiginde, bekleyen en
/// eski mesaj hep one gecsin - aksi halde ayni randevular her kosumda one
/// cikip digerlerini sonsuza dek bekletebilirdi.
///
/// `aktif = true`: pasif bir isletmenin satirlari `getHalkaAcikDb`de zaten
/// bulunamiyor. Burada suzulmeseler her kosumda listenin basini isgal eder
/// ve siniri hic bosalmayan satirlarla doldururlardi.
export async function zamaniGelenRandevular(
  simdi: Date,
  sinir: number,
): Promise<BosaltilacakRandevu[]> {
  const db = await getDb();

  const enEski = min(bildirimKuyrugu.planlananZaman);

  return db
    .select({ slug: isletme.slug, randevuId: bildirimKuyrugu.randevuId })
    .from(bildirimKuyrugu)
    .innerJoin(isletme, eq(isletme.id, bildirimKuyrugu.isletmeId))
    .where(
      and(
        eq(bildirimKuyrugu.durum, "BEKLIYOR"),
        // SMS satirlari (Faz K'nin ikinci yarisi) e-posta bosaltmasina
        // girmemeli - `bildirimKapisi > gonderilecekBildirimleriGetir` ile
        // ayni suzgec. Burada olmasa o satirlar hic bosalmadan listenin
        // basinda kalirdi.
        eq(bildirimKuyrugu.tur, "EPOSTA"),
        lte(bildirimKuyrugu.planlananZaman, simdi),
        eq(isletme.aktif, true),
      ),
    )
    .groupBy(isletme.slug, bildirimKuyrugu.randevuId)
    .orderBy(asc(enEski))
    .limit(sinir);
}
