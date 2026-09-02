import { ayarAlanlariniDogrula } from "@/lib/ayar-girdi";
import { bulunamadi, gecersiz, panelKapisi } from "@/lib/panel-kapisi";
import { kontrolIhlaliMi } from "@/lib/pg-hata";

// Isletme ayarlari. CSRF kapisi ve oturum panelKapisi'nda (DEGISMEZ 2).
//
// Hedef isletme govdeden GELMIYOR: scoped-db oturumun isletmesine kapsamli ve
// `ayarlariGuncelle` bir id parametresi almiyor. Yani baska bir isletmenin
// ayarlarini degistirmek icin once scoped-db'yi degistirmek gerekiyor.

export async function PATCH(istek: Request) {
  const kapi = await panelKapisi(istek);
  if ("engel" in kapi) return kapi.engel;

  const alanlar = ayarAlanlariniDogrula(kapi.govde);
  if (!alanlar.tamam) return gecersiz(alanlar.hata);

  let etkilenen: number;
  try {
    etkilenen = await kapi.db.ayarlariGuncelle(alanlar.deger);
  } catch (hata) {
    // Dizinde yayindaki bir isletmenin il ya da kategorisini bosaltmak
    // `isletme_yayin_alanlari_tam` kisitini ihlal ediyor. Burada da elle
    // kontrol edebilirdik ama o kontrol "once oku sonra yaz" olurdu ve ayni
    // anda gelen bir "yayina cik" istegiyle yarisirdi. Tek gerceklik kaynagi
    // kisit; bize dusen onu kullanicinin duzeltebilecegi bir cumleye cevirmek.
    if (kontrolIhlaliMi(hata, "isletme_yayin_alanlari_tam")) {
      return gecersiz(
        "Dizinde yayındayken il ve kategori boş bırakılamaz. Önce dizinden çıkın ya da bu alanları doldurun.",
      );
    }
    throw hata;
  }

  // 0 yalnizca isletme silinmisse olur; oturum hala acikken bu tuhaf bir
  // durum ama 500 vermek yerine durustce "yok" diyoruz.
  if (etkilenen === 0) return bulunamadi("İşletme");

  return Response.json({ tamam: true });
}
