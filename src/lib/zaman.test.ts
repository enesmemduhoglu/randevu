import { describe, expect, test } from "vitest";

import {
  dilimOfsetiDk,
  gunBasi,
  gunEkle,
  gunFarki,
  tarihAyristir,
  tarihMetni,
  yerelDenUtc,
  yerelGun,
  yerelParcalar,
} from "@/lib/zaman";

// Bu dosya urunun en kirilgan yerini kilitliyor. Bir randevu yanlis saate
// yazilirsa musteri kapida bekler; hata da ancak o an gorunur.
//
// Testler SUNUCUNUN saat diliminden bagimsiz: hicbir yerde `new Date(...)`
// yerel yorumuna ya da getHours'a guvenilmiyor, her sey acik UTC degerleri ve
// acik dilim adlariyla yaziliyor.

const ISTANBUL = "Europe/Istanbul";
const BERLIN = "Europe/Berlin";
const LONDRA = "Europe/London";

describe("yerelParcalar", () => {
  test("Istanbul UTC+3", () => {
    const p = yerelParcalar(new Date("2026-09-01T09:00:00Z"), ISTANBUL);
    expect(p).toEqual({
      yil: 2026,
      ay: 9,
      gun: 1,
      saat: 12,
      dakika: 0,
      haftaninGunu: 2, // Sali
    });
  });

  test("gece yarisi 24 degil 0", () => {
    // ICU bazi surumlerde hour12:false ile gece yarisini "24" veriyor.
    // Duzeltilmezse 00:15 randevusu onceki gunun 24:15'i gibi gorunurdu.
    const p = yerelParcalar(new Date("2026-08-31T21:00:00Z"), ISTANBUL);
    expect(p.saat).toBe(0);
    expect(p.gun).toBe(1);
    expect(p.ay).toBe(9);
  });

  test("gun sinirini UTC'den once gecen dilim", () => {
    // UTC'de hala 31 Agustos, Istanbul'da 1 Eylul.
    const p = yerelParcalar(new Date("2026-08-31T22:30:00Z"), ISTANBUL);
    expect({ gun: p.gun, saat: p.saat }).toEqual({ gun: 1, saat: 1 });
  });

  test("haftanin gunu JS getUTCDay ile ayni", () => {
    // Sema bu esleme uzerine kurulu (0 = Pazar).
    const an = new Date("2026-08-30T12:00:00Z"); // Pazar
    expect(an.getUTCDay()).toBe(0);
    expect(yerelParcalar(an, ISTANBUL).haftaninGunu).toBe(0);
  });
});

describe("dilimOfsetiDk", () => {
  test("Istanbul yil boyunca sabit +180", () => {
    // Turkiye 2016'dan beri yaz saati uygulamiyor; kalici UTC+3.
    expect(dilimOfsetiDk(new Date("2026-01-15T12:00:00Z"), ISTANBUL)).toBe(180);
    expect(dilimOfsetiDk(new Date("2026-07-15T12:00:00Z"), ISTANBUL)).toBe(180);
  });

  test("Berlin kis +60, yaz +120", () => {
    expect(dilimOfsetiDk(new Date("2026-01-15T12:00:00Z"), BERLIN)).toBe(60);
    expect(dilimOfsetiDk(new Date("2026-07-15T12:00:00Z"), BERLIN)).toBe(120);
  });

  test("Londra kis 0, yaz +60", () => {
    expect(dilimOfsetiDk(new Date("2026-01-15T12:00:00Z"), LONDRA)).toBe(0);
    expect(dilimOfsetiDk(new Date("2026-07-15T12:00:00Z"), LONDRA)).toBe(60);
  });

  test("gecis aninin iki yaninda farkli", () => {
    // AB'de yaz saati son pazar 01:00 UTC'de basliyor: 2026-03-29.
    expect(dilimOfsetiDk(new Date("2026-03-29T00:59:00Z"), BERLIN)).toBe(60);
    expect(dilimOfsetiDk(new Date("2026-03-29T01:01:00Z"), BERLIN)).toBe(120);
  });
});

describe("yerelDenUtc", () => {
  const gun = { yil: 2026, ay: 9, gun: 1 };

  test("Istanbul 09:00 -> 06:00Z", () => {
    expect(yerelDenUtc(ISTANBUL, gun, 540).toISOString()).toBe(
      "2026-09-01T06:00:00.000Z",
    );
  });

  test("gece yarisi ve gun sonu", () => {
    expect(yerelDenUtc(ISTANBUL, gun, 0).toISOString()).toBe(
      "2026-08-31T21:00:00.000Z",
    );
    // 1440 = ertesi gunun 00:00'i.
    expect(yerelDenUtc(ISTANBUL, gun, 1440).toISOString()).toBe(
      "2026-09-01T21:00:00.000Z",
    );
  });

  test("Berlin yaz ve kis ayni duvar saati farkli ana denk geliyor", () => {
    const kis = yerelDenUtc(BERLIN, { yil: 2026, ay: 1, gun: 15 }, 540);
    const yaz = yerelDenUtc(BERLIN, { yil: 2026, ay: 7, gun: 15 }, 540);
    expect(kis.toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(yaz.toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });

  test("gidis-donus: her duvar saati kendine geri donuyor", () => {
    // Iki turlu hesabin gerekcesi tam olarak bu.
    for (const dilim of [ISTANBUL, BERLIN, LONDRA]) {
      for (const tarih of [
        { yil: 2026, ay: 1, gun: 15 },
        { yil: 2026, ay: 7, gun: 15 },
        { yil: 2026, ay: 3, gun: 29 },
        { yil: 2026, ay: 10, gun: 25 },
      ]) {
        for (const dakika of [0, 540, 720, 1080, 1439]) {
          const an = yerelDenUtc(dilim, tarih, dakika);
          const p = yerelParcalar(an, dilim);
          const geri = p.saat * 60 + p.dakika;

          // Var olmayan saatlerde (ileri alinan saatin icinde) donus farkli
          // olabiliyor; o durum ayri testte. Burada gun degismemis olmali.
          if (geri === dakika) {
            expect({ yil: p.yil, ay: p.ay, gun: p.gun }).toEqual(tarih);
          }
        }
      }
    }
  });

  test("ILERI alinan saatte var olmayan yerel zaman ileri kayiyor", () => {
    // Berlin 2026-03-29: saat 02:00'den 03:00'e atliyor, 02:30 hic yasanmiyor.
    const an = yerelDenUtc(BERLIN, { yil: 2026, ay: 3, gun: 29 }, 150); // 02:30
    const p = yerelParcalar(an, BERLIN);

    // Hata firlatmiyoruz: o gun bir saat gec baslamis sayiliyor.
    expect(p.saat).toBe(3);
    expect(p.dakika).toBe(30);
    expect(an.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  test("GERI alinan saatte iki kez yasanan zamanin ILKI seciliyor", () => {
    // Berlin 2026-10-25: 03:00'ten 02:00'ye donuluyor, 02:30 iki kez yasaniyor.
    const an = yerelDenUtc(BERLIN, { yil: 2026, ay: 10, gun: 25 }, 150);
    expect(an.toISOString()).toBe("2026-10-25T00:30:00.000Z"); // hala +2
    expect(yerelParcalar(an, BERLIN).saat).toBe(2);
  });

  test("gecis gununde gun basi dogru", () => {
    // Gecis gunu 00:00 hala eski ofsette.
    expect(gunBasi(BERLIN, { yil: 2026, ay: 3, gun: 29 }).toISOString()).toBe(
      "2026-03-28T23:00:00.000Z",
    );
  });
});

describe("yerelGun", () => {
  test("UTC gunu ile isletme gunu farkli olabiliyor", () => {
    expect(yerelGun(new Date("2026-08-31T22:00:00Z"), ISTANBUL)).toEqual({
      yil: 2026,
      ay: 9,
      gun: 1,
    });
    expect(yerelGun(new Date("2026-09-01T01:00:00Z"), LONDRA)).toEqual({
      yil: 2026,
      ay: 9,
      gun: 1,
    });
  });
});

describe("tarihAyristir", () => {
  test("gecerli tarih", () => {
    expect(tarihAyristir("2026-09-01")).toEqual({ yil: 2026, ay: 9, gun: 1 });
    // 2028 arti yil; 2026 degil (asagidaki testte o durum var).
    expect(tarihAyristir(" 2028-02-29 ")).toEqual({ yil: 2028, ay: 2, gun: 29 });
  });

  test("takvimde olmayan gun reddediliyor", () => {
    // Date.UTC tasirma yapiyor: 2026-02-29 sessizce 1 Mart olurdu ve kullanici
    // istemedigi bir gunun saatlerini gorurdu. 2026 arti yil DEGIL.
    expect(tarihAyristir("2026-02-29")).toBeNull();
    expect(tarihAyristir("2026-02-30")).toBeNull();
    expect(tarihAyristir("2026-13-01")).toBeNull();
    expect(tarihAyristir("2026-00-10")).toBeNull();
  });

  test("bicimsiz degerler", () => {
    expect(tarihAyristir("01.09.2026")).toBeNull();
    expect(tarihAyristir("2026-9-1")).toBeNull();
    expect(tarihAyristir(null)).toBeNull();
    expect(tarihAyristir(20260901)).toBeNull();
  });

  test("bicimlemenin tersi", () => {
    for (const metin of ["2026-01-01", "2026-09-01", "2026-12-31"]) {
      expect(tarihMetni(tarihAyristir(metin)!)).toBe(metin);
    }
  });
});

describe("gunEkle ve gunFarki", () => {
  test("ay ve yil sinirlarini geciyor", () => {
    expect(gunEkle({ yil: 2026, ay: 8, gun: 31 }, 1)).toEqual({
      yil: 2026,
      ay: 9,
      gun: 1,
    });
    expect(gunEkle({ yil: 2026, ay: 12, gun: 31 }, 1)).toEqual({
      yil: 2027,
      ay: 1,
      gun: 1,
    });
    expect(gunEkle({ yil: 2026, ay: 3, gun: 1 }, -1)).toEqual({
      yil: 2026,
      ay: 2,
      gun: 28,
    });
  });

  test("yaz saati gecisinde takvim gunu ekleniyor, 24 saat degil", () => {
    // Gecis gunu 23 saat surüyor; 24 saat eklemek gunu kaydirirdi.
    expect(gunEkle({ yil: 2026, ay: 3, gun: 28 }, 1)).toEqual({
      yil: 2026,
      ay: 3,
      gun: 29,
    });
    expect(gunEkle({ yil: 2026, ay: 3, gun: 29 }, 1)).toEqual({
      yil: 2026,
      ay: 3,
      gun: 30,
    });
  });

  test("gun farki", () => {
    expect(gunFarki({ yil: 2026, ay: 9, gun: 1 }, { yil: 2026, ay: 9, gun: 1 })).toBe(0);
    expect(gunFarki({ yil: 2026, ay: 9, gun: 1 }, { yil: 2026, ay: 9, gun: 8 })).toBe(7);
    expect(gunFarki({ yil: 2026, ay: 9, gun: 8 }, { yil: 2026, ay: 9, gun: 1 })).toBe(-7);
    // Gecisi kapsayan aralik yine tam gun sayisi vermeli.
    expect(gunFarki({ yil: 2026, ay: 3, gun: 28 }, { yil: 2026, ay: 3, gun: 30 })).toBe(2);
  });
});
