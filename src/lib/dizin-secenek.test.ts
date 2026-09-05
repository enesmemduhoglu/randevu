import { expect, test } from "vitest";

import { etkinFiltreler, secenekleriBirlestir } from "@/lib/dizin-secenek";

// Bu iki fonksiyon tek bir kullanici sikayetini kapatiyor: ana sayfadaki
// "Veteriner" kutucuguna basan kisi bos bir liste goruyor ve Kategori kutusu
// "Tüm kategoriler" diyordu - yani secimi kayboluyordu. Gerekcenin tamami
// `dizin-secenek.ts` icinde.

test("secili deger listede yoksa EKLENIYOR", () => {
  // Dizinde Veteriner isletmesi yok, yani `filtreSecenekleri` onu dondurmuyor.
  const sonuc = secenekleriBirlestir(["Berber", "Kuaför"], "Veteriner");
  expect(sonuc).toContain("Veteriner");
});

test("eklenen deger ALFABETIK yerine giriyor, sona degil", () => {
  // Sona yapistirilsaydi listedeki duzen bozulur ve goz onu bir hata gibi
  // okurdu.
  expect(secenekleriBirlestir(["Berber", "Kuaför"], "Diş Kliniği")).toEqual([
    "Berber",
    "Diş Kliniği",
    "Kuaför",
  ]);
});

test("siralama TURKCE - localeCompare degil", () => {
  // `trKarsilastir` hem sunucuda hem tarayicida ayni sirayi uretmek zorunda;
  // workerd'in ICU derlemesi tam degil. Ayrisirlarsa React hidrasyonda
  // uyusmazlik gorur ve listeyi bastan cizer.
  expect(secenekleriBirlestir(["Ankara", "Bursa"], "İstanbul")).toEqual([
    "Ankara",
    "Bursa",
    "İstanbul",
  ]);
});

test("zaten listedeyse ikinci kez eklenmiyor", () => {
  const sonuc = secenekleriBirlestir(["Berber", "Kuaför"], "Berber");
  expect(sonuc).toEqual(["Berber", "Kuaför"]);
});

test("bos secim listeyi degistirmiyor", () => {
  expect(secenekleriBirlestir(["Berber"], "")).toEqual(["Berber"]);
});

test("cagirilan diziyi DEGISTIRMIYOR", () => {
  // `filtreSecenekleri` ciktisi ayni istekte baska bir yere de gidebilir;
  // yerinde siralamak orayi sessizce etkilerdi.
  const kaynak = ["Kuaför", "Berber"];
  secenekleriBirlestir(kaynak, "Veteriner");
  expect(kaynak).toEqual(["Kuaför", "Berber"]);
});

test("etkin filtreler kullanicinin okudugu sirada birlesiyor", () => {
  expect(
    etkinFiltreler({ arama: "saç kesimi", kategori: "Kuaför", il: "Bursa" }),
  ).toBe("saç kesimi · Kuaför · Bursa");
});

test("bos ve null parcalar atlaniyor", () => {
  expect(etkinFiltreler({ arama: "", kategori: "Veteriner", il: null })).toBe(
    "Veteriner",
  );
});

test("hicbir filtre yoksa null donuyor", () => {
  // Cagiran taraf o zaman satiri hic cizmiyor - bos bir ayirac gostermektense.
  expect(etkinFiltreler({ arama: "", kategori: null, il: null })).toBeNull();
  expect(etkinFiltreler({})).toBeNull();
});
