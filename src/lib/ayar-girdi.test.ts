import { describe, expect, test } from "vitest";

import { ayarAlanlariniDogrula, telefonDogrula } from "@/lib/ayar-girdi";
import { ILLER, ILLER_ALFABETIK, trKarsilastir } from "@/lib/dizin-girdi";

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

  test("dizin alanlari bos gecilebiliyor", () => {
    // Isletme profilini kademeli dolduruyor; bu alanlarin zorunlu oldugu tek
    // an dizine cikma ani ve o kontrol `yayindaAyarla`da.
    const sonuc = ayarAlanlariniDogrula(GECERLI);
    expect(sonuc.tamam && sonuc.deger.il).toBeNull();
    expect(sonuc.tamam && sonuc.deger.ilce).toBeNull();
    expect(sonuc.tamam && sonuc.deger.kategori).toBeNull();
  });

  test("dizin alanlari kapali listeye karsi dogrulaniyor", () => {
    const sonuc = ayarAlanlariniDogrula({
      ...GECERLI,
      il: "İstanbul",
      ilce: "  Kadıköy  ",
      kategori: "Kuaför",
    });
    expect(sonuc.tamam && sonuc.deger.il).toBe("İstanbul");
    // Ilce serbest metin ama kirpiliyor.
    expect(sonuc.tamam && sonuc.deger.ilce).toBe("Kadıköy");
    expect(sonuc.tamam && sonuc.deger.kategori).toBe("Kuaför");

    expect(ayarAlanlariniDogrula({ ...GECERLI, il: "Paris" }).tamam).toBe(false);
    expect(
      ayarAlanlariniDogrula({ ...GECERLI, kategori: "Uzay İstasyonu" }).tamam,
    ).toBe(false);
    expect(
      ayarAlanlariniDogrula({ ...GECERLI, ilce: "a".repeat(61) }).tamam,
    ).toBe(false);
  });
});

describe("ILLER_ALFABETIK", () => {
  test("81 ilin tamami duruyor", () => {
    // Siralama bir filtre degil; bir il dusseydi panelde secilemez olurdu.
    expect(ILLER_ALFABETIK).toHaveLength(ILLER.length);
    expect([...ILLER_ALFABETIK].sort()).toEqual([...ILLER].sort());
  });

  test("Turkce harf sirasi Intl'e degil kendi tablomuza dayaniyor", () => {
    // `localeCompare(…, "tr")` kullanilsaydi workerd'in eksik ICU'su sunucuda
    // baska, tarayicida baska sira uretip hidrasyonu bozabilirdi.
    expect(trKarsilastir("Isparta", "İstanbul")).toBeLessThan(0);
    expect(trKarsilastir("Çanakkale", "Denizli")).toBeLessThan(0);
    expect(trKarsilastir("Şanlıurfa", "Tekirdağ")).toBeLessThan(0);
    expect(trKarsilastir("Ordu", "Osmaniye")).toBeLessThan(0);

    // Dorduncu harf ayirt ediyor: a, s'den once.
    expect(trKarsilastir("Karabük", "Kars")).toBeLessThan(0);

    // Biri digerinin oneki ise kisa olan once.
    expect(trKarsilastir("Kar", "Kars")).toBeLessThan(0);
  });

  test("ilk ve son il beklenen yerde", () => {
    expect(ILLER_ALFABETIK[0]).toBe("Adana");
    expect(ILLER_ALFABETIK.at(-1)).toBe("Zonguldak");
  });
});
