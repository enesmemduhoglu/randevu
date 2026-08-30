import { describe, expect, test } from "vitest";

import { calismaAraliklariniDogrula } from "@/lib/calisma-girdi";

// Bu kurallarin isi, Faz F'deki musaitlik motorunun girdisini korumak. Motor
// "gun icinde cakisan iki aralik" gibi bir duzeni cozmeye calisirken ayni
// sloti iki kez uretir ya da sessizce dusurur - ikisi de sessiz hata.

const AC = (g: number, b: number, s: number) => ({
  haftaninGunu: g,
  baslangicDk: b,
  bitisDk: s,
});

describe("gecerli duzenler", () => {
  test("bos liste kabul - o personel hic calismiyor demek", () => {
    expect(calismaAraliklariniDogrula([])).toEqual({ tamam: true, deger: [] });
    expect(calismaAraliklariniDogrula(undefined)).toEqual({ tamam: true, deger: [] });
  });

  test("ogle arasi: ayni gune iki aralik", () => {
    const sonuc = calismaAraliklariniDogrula([AC(1, 540, 720), AC(1, 780, 1080)]);
    expect(sonuc.tamam).toBe(true);
  });

  test("bitisik araliklar kabul", () => {
    // 09:00-13:00 ve 13:00-18:00: cakisma degil. Anlamsiz gorunuyor ama
    // kullanicinin ogleden once/sonra ayrimini gormek istemesi mesru.
    const sonuc = calismaAraliklariniDogrula([AC(1, 540, 780), AC(1, 780, 1080)]);
    expect(sonuc.tamam).toBe(true);
  });

  test("gece yarisinda kapanis", () => {
    expect(calismaAraliklariniDogrula([AC(5, 1080, 1440)]).tamam).toBe(true);
  });

  test("farkli gunlerdeki ayni saatler cakisma degil", () => {
    const sonuc = calismaAraliklariniDogrula([AC(1, 540, 1080), AC(2, 540, 1080)]);
    expect(sonuc.tamam).toBe(true);
  });
});

describe("reddedilen duzenler", () => {
  test("gun icinde cakisan araliklar", () => {
    const sonuc = calismaAraliklariniDogrula([AC(1, 540, 780), AC(1, 720, 1080)]);
    expect(sonuc.tamam).toBe(false);
    if (sonuc.tamam) return;
    // Hata hangi gunu kastettigini soylemeli; kullanici yedi gunu tek tek
    // aramamali.
    expect(sonuc.hata).toContain("Pazartesi");
  });

  test("sirasiz gonderilse de cakisma yakalaniyor", () => {
    // Istemci siralamaya guvenilmiyor: dogrulama kendi siralamasini yapiyor.
    const sonuc = calismaAraliklariniDogrula([AC(1, 720, 1080), AC(1, 540, 780)]);
    expect(sonuc.tamam).toBe(false);
  });

  test("bitis baslangictan once ya da esit", () => {
    expect(calismaAraliklariniDogrula([AC(1, 1080, 540)]).tamam).toBe(false);
    expect(calismaAraliklariniDogrula([AC(1, 540, 540)]).tamam).toBe(false);
  });

  test("gun araligi disinda", () => {
    expect(calismaAraliklariniDogrula([AC(7, 540, 1080)]).tamam).toBe(false);
    expect(calismaAraliklariniDogrula([AC(-1, 540, 1080)]).tamam).toBe(false);
  });

  test("gun sinirlarinin disinda saat", () => {
    expect(calismaAraliklariniDogrula([AC(1, -30, 540)]).tamam).toBe(false);
    expect(calismaAraliklariniDogrula([AC(1, 540, 1500)]).tamam).toBe(false);
  });

  test("tam sayi olmayan degerler", () => {
    expect(calismaAraliklariniDogrula([AC(1, 540.5, 1080)]).tamam).toBe(false);
    expect(
      calismaAraliklariniDogrula([{ haftaninGunu: 1, baslangicDk: "540", bitisDk: 1080 }])
        .tamam,
    ).toBe(false);
  });

  test("gunde dortten fazla aralik", () => {
    const cok = [
      AC(1, 0, 100),
      AC(1, 120, 200),
      AC(1, 220, 300),
      AC(1, 320, 400),
      AC(1, 420, 500),
    ];
    expect(calismaAraliklariniDogrula(cok).tamam).toBe(false);
  });

  test("dizi olmayan govde", () => {
    expect(calismaAraliklariniDogrula("pazartesi").tamam).toBe(false);
    expect(calismaAraliklariniDogrula({ haftaninGunu: 1 }).tamam).toBe(false);
  });

  test("cok buyuk gonderim", () => {
    const cok = Array.from({ length: 100 }, (_, i) => AC(1, i * 10, i * 10 + 5));
    expect(calismaAraliklariniDogrula(cok).tamam).toBe(false);
  });
});
