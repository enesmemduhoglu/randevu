import { describe, expect, test } from "vitest";

import { musteriAlanlariniDogrula } from "@/lib/musteri-girdi";

// Musteri duzenleme govdesinin dogrulamasi. Saf fonksiyon, Postgres'e
// dokunmuyor.

function govde(ek: Record<string, unknown> = {}) {
  return { ad: "Ayşe Yılmaz", ...ek };
}

describe("musteriAlanlariniDogrula", () => {
  test("ad zorunlu", () => {
    const sonuc = musteriAlanlariniDogrula({});
    expect(sonuc.tamam).toBe(false);
    if (!sonuc.tamam) expect(sonuc.hata).toContain("Ad soyad");
  });

  test("ic bosluklar tekilleniyor", () => {
    const sonuc = musteriAlanlariniDogrula({ ad: "  Ayşe    Yılmaz  " });
    expect(sonuc.tamam).toBe(true);
    if (sonuc.tamam) expect(sonuc.deger.ad).toBe("Ayşe Yılmaz");
  });

  test("e-posta istege bagli, bos deger null oluyor", () => {
    const sonuc = musteriAlanlariniDogrula(govde({ eposta: "" }));
    expect(sonuc.tamam).toBe(true);
    if (sonuc.tamam) expect(sonuc.deger.eposta).toBeNull();
  });

  test("e-posta kucuk harfe cevriliyor", () => {
    const sonuc = musteriAlanlariniDogrula(govde({ eposta: "AYSE@Ornek.Com" }));
    expect(sonuc.tamam).toBe(true);
    if (sonuc.tamam) expect(sonuc.deger.eposta).toBe("ayse@ornek.com");
  });

  test("bozuk e-posta reddediliyor", () => {
    const sonuc = musteriAlanlariniDogrula(govde({ eposta: "ayse-at-ornek" }));
    expect(sonuc.tamam).toBe(false);
  });

  test("not istege bagli ve bos deger null oluyor", () => {
    const sonuc = musteriAlanlariniDogrula(govde({ not: "   " }));
    expect(sonuc.tamam).toBe(true);
    if (sonuc.tamam) expect(sonuc.deger.not).toBeNull();
  });

  test("500 karakteri asan not reddediliyor", () => {
    const sonuc = musteriAlanlariniDogrula(govde({ not: "a".repeat(501) }));
    expect(sonuc.tamam).toBe(false);
  });

  // TELEFON BU DOSYADA YOK ve olmamasi kasitli: numara musterinin kimligi
  // (`(isletmeId, telefon)` benzersiz). Govdeye telefon yazilsa bile
  // dogrulama onu OKUMUYOR, yani kapiya hicbir zaman ulasmiyor.
  test("govdedeki telefon yok sayiliyor", () => {
    const sonuc = musteriAlanlariniDogrula(govde({ telefon: "5321112233" }));
    expect(sonuc.tamam).toBe(true);
    if (sonuc.tamam) {
      expect(Object.keys(sonuc.deger).sort()).toEqual(["ad", "eposta", "not"]);
    }
  });

  test("cozulememis karakter reddediliyor", () => {
    const sonuc = musteriAlanlariniDogrula({ ad: `Ay${"�"}e Yılmaz` });
    expect(sonuc.tamam).toBe(false);
  });
});
