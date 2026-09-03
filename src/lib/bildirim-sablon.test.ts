import { expect, test } from "vitest";

import {
  SABLONLAR,
  SABLON_ADLARI,
  sablonGecerliMi,
  sablonUret,
  type SablonVerisi,
} from "@/lib/bildirim-sablon";

// Sablon dosyasi SAF: veritabani ve ag yok, yani burada gercek metin
// sinaniyor. Bu deponun iki gorunur hatasi (Faz M'de Turkce arama, Faz N'de
// mobilde ezilen `hidden`) yalnizca goze bakinca ciktigi icin, metnin
// dogrulanabilir kismini teste baglamak ucuz bir sigorta.

const ISTANBUL = "Europe/Istanbul";

/// 1 Eylul 2026, Sali - 14:30 (Istanbul). UTC'de 11:30.
const BASLANGIC = new Date("2026-09-01T11:30:00.000Z");

const VERI: SablonVerisi = {
  isletmeAd: "Çağdaş Berber",
  isletmeTelefon: "5321234567",
  saatDilimi: ISTANBUL,
  musteriAd: "Ayşe Yılmaz",
  musteriTelefon: "5339876543",
  hizmetAd: "Saç kesimi",
  personelAd: "Zeynep Kaya",
  baslangic: BASLANGIC,
  iptalAdresi: "https://randevu.ornek/r/cagdas-berber/randevu/abc123",
};

test("her sablon konu, html ve duz metin uretiyor", () => {
  for (const sablon of SABLONLAR) {
    const mesaj = sablonUret(sablon, VERI);

    expect(mesaj.konu.length).toBeGreaterThan(0);
    expect(mesaj.html).toContain("<html");
    expect(mesaj.metin.length).toBeGreaterThan(0);
    // Her sablonun panelde gorunen bir adi olmali; `Record` bunu derleme
    // aninda zorluyor ama liste ile kaydin ayrisabilecegi tek yer burasi.
    expect(SABLON_ADLARI[sablon]).toBeTruthy();
  }
});

test("konu satirinda isletme adi EK ALMIYOR", () => {
  // Turkce'de "-deki" eki unlu uyumuna gore degisiyor ve isletme adini
  // kullanici yaziyor. Tire ile ayirmak bu sinifi tumden kapatiyor; bir gun
  // biri "X'deki randevunuz" yazmaya kalkarsa bu test kirmizi olsun.
  const mesaj = sablonUret("MUSTERI_RANDEVU_ONAYLANDI", VERI);

  expect(mesaj.konu).toBe("Randevunuz onaylandı — Çağdaş Berber");
  expect(mesaj.konu).not.toContain("'de");
  expect(mesaj.konu).not.toContain("'da");
});

test("zaman ISLETMENIN saat diliminde yaziliyor", () => {
  // DEGISMEZ 7. Sunucunun dilimi neyse olsun: 11:30 UTC Istanbul'da 14:30.
  const mesaj = sablonUret("MUSTERI_RANDEVU_ONAYLANDI", VERI);

  expect(mesaj.metin).toContain("1 Eylül 2026, Salı — 14:30");
});

test("baska bir dilimde ayni an baska saat gosteriyor", () => {
  // Dilimin gercekten okundugunu gosteriyor - sabit bir bicimlendirme degil.
  const mesaj = sablonUret("MUSTERI_RANDEVU_ONAYLANDI", {
    ...VERI,
    saatDilimi: "Europe/London",
  });

  expect(mesaj.metin).toContain("1 Eylül 2026, Salı — 12:30");
});

test("musteri mesajinda iptal baglantisi var, isletme mesajinda yok", () => {
  // Baglanti tek basina iptal yetkisi tasiyor; isletmenin zaten paneli var.
  const musteriye = sablonUret("MUSTERI_RANDEVU_ONAYLANDI", VERI);
  const isletmeye = sablonUret("ISLETME_YENI_RANDEVU", VERI);

  expect(musteriye.html).toContain(VERI.iptalAdresi);
  expect(isletmeye.html).not.toContain("abc123");
});

test("iptal adresi yoksa baglanti hic konulmuyor", () => {
  // NEXT_PUBLIC_SITE_URL tanimsizken goreli bir adres yazmak, e-postada ise
  // yaramayan bir link birakmak olurdu.
  const mesaj = sablonUret("MUSTERI_RANDEVU_ONAYLANDI", {
    ...VERI,
    iptalAdresi: null,
  });

  expect(mesaj.html).not.toContain("<a href");
});

test("isletme mesaji musterinin telefonunu tasiyor", () => {
  // Isletme musteriye ulasabilmeli; numara bicimlenmis halde.
  const mesaj = sablonUret("ISLETME_YENI_RANDEVU", VERI);

  expect(mesaj.metin).toContain("0533 987 65 43");
});

test("kullanici girdisi HTML'e kacilarak giriyor", () => {
  // Isletme ve musteri adini kullanici yaziyor. Kacilmasaydi `<` iceren bir ad
  // mesajin duzenini bozardi - e-posta istemcisinde script calismadigi icin
  // XSS degil, ama duzeltmesi ayni satir.
  const mesaj = sablonUret("ISLETME_YENI_RANDEVU", {
    ...VERI,
    musteriAd: '<b>Ayşe</b> "A"',
  });

  expect(mesaj.html).not.toContain("<b>Ayşe</b>");
  expect(mesaj.html).toContain("&lt;b&gt;Ayşe&lt;/b&gt;");
});

test("bilinmeyen sablon kimligi eleniyor", () => {
  // Kuyruktaki `sablon` kolonu duz metin; bir gun silinen bir sablonun eski
  // satirlari bosaltmayi kirmasin diye gonderim katmani bu kapiyi kullaniyor.
  expect(sablonGecerliMi("MUSTERI_RANDEVU_ONAYLANDI")).toBe(true);
  expect(sablonGecerliMi("MUSTERI_DOGUM_GUNU")).toBe(false);
});
