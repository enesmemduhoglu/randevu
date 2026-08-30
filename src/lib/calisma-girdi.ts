// Haftalik calisma duzeninin dogrulama kurallari.
//
// Bu dosya musaitlik motorunun (Faz F) girdisini korumakla yukumlu: buradan
// gecen bir duzen "gun icinde cakisan iki aralik" gibi anlamsiz durumlar
// icermemeli, cunku motor onlari cozmeye calisirken ayni sloti iki kez
// uretir ya da sessizce dusurur.

import type { Dogrulama } from "@/lib/girdi";
import type { CalismaAraligi } from "@/lib/scoped-db";
import { gunAdi } from "@/lib/bicim";

/// Bir gunde en fazla kac aralik. Ogle arasi icin iki yetiyor; ucuncu ve
/// dorduncu ara da mumkun olsun diye biraz pay birakildi. Sinirsiz birakmak,
/// tek bir istekle binlerce satir yazilabilmesi demekti.
const GUNDE_EN_COK_ARALIK = 4;

export function calismaAraliklariniDogrula(
  ham: unknown,
): Dogrulama<CalismaAraligi[]> {
  if (ham === undefined || ham === null) return { tamam: true, deger: [] };
  if (!Array.isArray(ham)) {
    return { tamam: false, hata: "Çalışma saatleri okunamadı" };
  }
  if (ham.length > 7 * GUNDE_EN_COK_ARALIK) {
    return { tamam: false, hata: "Çok fazla çalışma aralığı gönderildi" };
  }

  const araliklar: CalismaAraligi[] = [];

  for (const satir of ham) {
    if (typeof satir !== "object" || satir === null) {
      return { tamam: false, hata: "Çalışma saatleri okunamadı" };
    }

    const { haftaninGunu, baslangicDk, bitisDk } = satir as Record<string, unknown>;

    if (!tamsayiMi(haftaninGunu) || haftaninGunu < 0 || haftaninGunu > 6) {
      return { tamam: false, hata: "Gün değeri geçersiz" };
    }
    if (!tamsayiMi(baslangicDk) || !tamsayiMi(bitisDk)) {
      return { tamam: false, hata: "Saat değeri geçersiz" };
    }
    if (baslangicDk < 0 || bitisDk > 1440) {
      return { tamam: false, hata: "Saat 00:00 ile 24:00 arasında olmalı" };
    }
    if (bitisDk <= baslangicDk) {
      return {
        tamam: false,
        hata: `${gunAdi(haftaninGunu)} için bitiş saati başlangıçtan sonra olmalı`,
      };
    }

    araliklar.push({ haftaninGunu, baslangicDk, bitisDk });
  }

  // Gun icinde cakisma kontrolu. Kullanici acisindan da anlamli: "09:00-13:00
  // ve 12:00-18:00" girildiginde ne demek istedigini biz tahmin etmemeliyiz.
  for (let gun = 0; gun <= 6; gun++) {
    const gunun = araliklar
      .filter((a) => a.haftaninGunu === gun)
      .sort((a, b) => a.baslangicDk - b.baslangicDk);

    if (gunun.length > GUNDE_EN_COK_ARALIK) {
      return {
        tamam: false,
        hata: `${gunAdi(gun)} için en fazla ${GUNDE_EN_COK_ARALIK} aralık tanımlanabilir`,
      };
    }

    for (let i = 1; i < gunun.length; i++) {
      // Bitisik araliklar (13:00 biten ve 13:00 baslayan) cakisma DEGIL -
      // ama anlamsiz: ikisi tek aralik. Yine de reddetmiyoruz, cunku
      // kullanicinin "ogleden once/sonra" ayrimini gormek istemesi mesru.
      if (gunun[i].baslangicDk < gunun[i - 1].bitisDk) {
        return {
          tamam: false,
          hata: `${gunAdi(gun)} için saatler çakışıyor`,
        };
      }
    }
  }

  return { tamam: true, deger: araliklar };
}

function tamsayiMi(deger: unknown): deger is number {
  return typeof deger === "number" && Number.isInteger(deger);
}
