import { ayarAlanlariniDogrula } from "@/lib/ayar-girdi";
import { bulunamadi, gecersiz, panelKapisi } from "@/lib/panel-kapisi";

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

  const etkilenen = await kapi.db.ayarlariGuncelle(alanlar.deger);
  // 0 yalnizca isletme silinmisse olur; oturum hala acikken bu tuhaf bir
  // durum ama 500 vermek yerine durustce "yok" diyoruz.
  if (etkilenen === 0) return bulunamadi("İşletme");

  return Response.json({ tamam: true });
}
