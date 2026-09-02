import { describe, expect, test } from "vitest";

import { ayarAlanlariniDogrula, telefonDogrula } from "@/lib/ayar-girdi";

const GECERLI = {
  ad: "Işıl Güzellik",
  telefon: "0532 123 45 67",
  adres: "Bağdat Cad. No 1",
  hakkinda: "",
  saatDilimi: "Europe/Istanbul",
  slotAraligiDk: 15,
  minOnceBildirimDk: 120,
  maksIleriGun: 60,
  otomatikOnay: true,
  gelmediKisitiGun: 30,
};

describe("telefonDogrula", () => {
  test("uc yazim bicimi de ayni degeri veriyor", () => {
    // Musteri tablosunda telefon benzersiz; iki bicim iki ayri musteri kaydi
    // uretirdi ve gecmis ikiye bolunurdu.
    for (const yazim of [
      "0532 123 45 67",
      "05321234567",
      "532 123 45 67",
      "+90 532 123 45 67",
      "905321234567",
    ]) {
      expect(telefonDogrula(yazim)).toEqual({ tamam: true, deger: "5321234567" });
    }
  });

  test("bos deger null", () => {
    expect(telefonDogrula("")).toEqual({ tamam: true, deger: null });
    expect(telefonDogrula(null)).toEqual({ tamam: true, deger: null });
    // Yalnizca ayrac karakter iceren giris de bos sayiliyor.
    expect(telefonDogrula("---")).toEqual({ tamam: true, deger: null });
  });

  test("eksik ve fazla haneli numaralar reddediliyor", () => {
    const eksik = telefonDogrula("532 123 45");
    expect(eksik.tamam).toBe(false);
    if (!eksik.tamam) expect(eksik.hata).toContain("10 haneli");

    expect(telefonDogrula("5321234567890").tamam).toBe(false);
  });
});

describe("ayarAlanlariniDogrula", () => {
  test("gecerli govde", () => {
    const sonuc = ayarAlanlariniDogrula(GECERLI);
    expect(sonuc.tamam).toBe(true);
    if (!sonuc.tamam) return;
    expect(sonuc.deger.telefon).toBe("5321234567");
    // Bos metin null'a cevriliyor: veritabaninda "yok"un tek gosterimi olsun.
    expect(sonuc.deger.hakkinda).toBeNull();
  });

  test("liste disi saat dilimi reddediliyor", () => {
    // Kapali liste, cunku workerd'in ICU derlemesi tam degil ve
    // Intl.supportedValuesOf orada eksik donebiliyor.
    expect(
      ayarAlanlariniDogrula({ ...GECERLI, saatDilimi: "Mars/Olympus" }).tamam,
    ).toBe(false);
  });

  test("liste disi randevu araligi reddediliyor", () => {
    // 7 dakika araliktaki sinirlarin icinde ama secenek listesinde yok.
    expect(ayarAlanlariniDogrula({ ...GECERLI, slotAraligiDk: 7 }).tamam).toBe(false);
  });

  test("en erken randevu sifir olabilir", () => {
    const sonuc = ayarAlanlariniDogrula({ ...GECERLI, minOnceBildirimDk: 0 });
    expect(sonuc.tamam).toBe(true);
  });

  test("takvim penceresi sifir olamaz", () => {
    // 0 gun "hic randevu alinamaz" demek olurdu.
    expect(ayarAlanlariniDogrula({ ...GECERLI, maksIleriGun: 0 }).tamam).toBe(false);
    expect(ayarAlanlariniDogrula({ ...GECERLI, maksIleriGun: 366 }).tamam).toBe(false);
  });

  test("gelmedi kisiti sifir olabilir - kisit kapali demek", () => {
    const sonuc = ayarAlanlariniDogrula({ ...GECERLI, gelmediKisitiGun: 0 });
    expect(sonuc.tamam && sonuc.deger.gelmediKisitiGun).toBe(0);
  });

  test("gelmedi kisiti bir yildan uzun olamaz", () => {
    // Daha uzunu pratikte omurluk yasak; o karar telefonda verilmeli.
    expect(
      ayarAlanlariniDogrula({ ...GECERLI, gelmediKisitiGun: 366 }).tamam,
    ).toBe(false);
    expect(
      ayarAlanlariniDogrula({ ...GECERLI, gelmediKisitiGun: -1 }).tamam,
    ).toBe(false);
    expect(
      ayarAlanlariniDogrula({ ...GECERLI, gelmediKisitiGun: "otuz" }).tamam,
    ).toBe(false);
  });

  test("otomatik onay yoksa kapali sayiliyor", () => {
    // Isaretsiz kutucuk alani hic gondermiyor.
    const sonuc = ayarAlanlariniDogrula({ ...GECERLI, otomatikOnay: undefined });
    expect(sonuc.tamam && sonuc.deger.otomatikOnay).toBe(false);
  });

  test("cok uzun metinler reddediliyor", () => {
    expect(
      ayarAlanlariniDogrula({ ...GECERLI, hakkinda: "a".repeat(1001) }).tamam,
    ).toBe(false);
    expect(ayarAlanlariniDogrula({ ...GECERLI, adres: "a".repeat(301) }).tamam).toBe(
      false,
    );
  });
});
