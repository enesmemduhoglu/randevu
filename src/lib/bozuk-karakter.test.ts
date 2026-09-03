import { expect, test } from "vitest";

import { ayarAlanlariniDogrula } from "@/lib/ayar-girdi";
import { ilceDogrula } from "@/lib/dizin-girdi";
import { adDogrula, cozulememisKarakterVar } from "@/lib/girdi";

// U+FFFD (REPLACEMENT CHARACTER) KAPISI.
//
// Faz O'da yerel veritabaninda gercek bir ornek bulundu: "Cagdas Berber" diye
// kurulmus bir isletmenin adindaki C-cedilla kaybolmus, yerine bu karakter
// yazilmisti. Uygulama kodunda hata yoktu - kayit UTF-8 olmayan bir kod
// sayfasindan gecen bir betikle olusturulmustu. Ama dogrulama katmani o degeri
// KABUL EDIYORDU ve kaydedildikten sonra duzeltmenin yolu yok: hangi harf
// oldugunu artik kimse bilmiyor.
//
// KARAKTER KAYNAKTA HARF OLARAK YAZILMIYOR, kod noktasindan uretiliyor. Ayni
// gerekce `girdi.ts > kontrolKarakteriVar` icin de yazili: kacis dizileri bu
// depoda birkac kez arac zincirinde gercek karaktere donusup kaynagi bozdu.
// Bu dosya icin bedeli daha da yuksek olurdu - test tam da o karakterin
// tasinmasindan sikayet ediyor.
const BOZUK = String.fromCodePoint(0xfffd);

test("saglam Turkce metin geciyor", () => {
  // Once kapinin YANLIS POZITIF uretmedigini gosteriyoruz: Turkce harflerin
  // hicbiri bu karakter degil ve hepsi gecmeli.
  for (const ad of ["Çağdaş Berber", "Işıl Güzellik", "Öz Şükrü Kuaför"]) {
    expect(cozulememisKarakterVar(ad)).toBe(false);
    expect(adDogrula(ad, "İşletme adı").tamam).toBe(true);
  }
});

test("cozulememis karakter tespit ediliyor", () => {
  expect(cozulememisKarakterVar(`${BOZUK}agdas Berber`)).toBe(true);
  expect(cozulememisKarakterVar(`Berber${BOZUK}`)).toBe(true);
  expect(cozulememisKarakterVar("Berber")).toBe(false);
});

test("isletme adi reddediliyor", () => {
  const sonuc = adDogrula(`${BOZUK}agdas Berber`, "İşletme adı");

  expect(sonuc.tamam).toBe(false);
  if (!sonuc.tamam) {
    // Mesaj kullaniciya NE YAPACAGINI soyluyor. "Geçersiz ad" deseydi kullanici
    // ekranda dogru gorunen bir metne bakip ne oldugunu anlamazdi - bozukluk
    // cogu fontta tek bir kucuk isaret.
    expect(sonuc.hata).toContain("okunamayan");
    expect(sonuc.hata).toContain("İşletme adı");
  }
});

test("hakkinda ve adres alanlari da reddediliyor", () => {
  // Kapi yalnizca ad alaninda dursaydi bozukluk bir alan oteye tasinirdi:
  // ikisi de dizin kartinda ve randevu sayfasinda gorunuyor.
  const sonuc = ayarAlanlariniDogrula({
    ad: "Çağdaş Berber",
    hakkinda: `Baba ${BOZUK}gul berber`,
  });

  expect(sonuc.tamam).toBe(false);
  if (!sonuc.tamam) expect(sonuc.hata).toContain("Hakkında");
});

test("ilce reddediliyor", () => {
  // Ilce serbest metin ve dogrulanmiyor (Faz M karari) - tam da bu yuzden
  // bicim kontrolu buraya gerekiyor.
  const sonuc = ilceDogrula(`Be${BOZUK}iktas`);

  expect(sonuc.tamam).toBe(false);
  if (!sonuc.tamam) expect(sonuc.hata).toContain("İlçe");
});

test("saglam ilce geciyor", () => {
  const sonuc = ilceDogrula("Beşiktaş");
  expect(sonuc.tamam).toBe(true);
  if (sonuc.tamam) expect(sonuc.deger).toBe("Beşiktaş");
});
