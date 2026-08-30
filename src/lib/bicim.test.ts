import { describe, expect, test } from "vitest";

import {
  gunAdi,
  HAFTA_SIRASI,
  paraBicimle,
  saatBicimle,
  saatiDakikayaCevir,
  sureBicimle,
} from "@/lib/bicim";

// Kurallarin kaynagi docs/marka.md. Bu testler o belgeyi kod haline getiriyor:
// bicim degisirse once burasi kirilir ve degisikligin bilincli olup olmadigi
// sorulur.

describe("paraBicimle", () => {
  test("kurus sifirsa yazilmiyor", () => {
    expect(paraBicimle(35000)).toBe("350 ₺");
    expect(paraBicimle(0)).toBe("0 ₺");
  });

  test("kurus varsa iki basamak", () => {
    expect(paraBicimle(35050)).toBe("350,50 ₺");
    expect(paraBicimle(35005)).toBe("350,05 ₺");
  });

  test("binlik ayraci nokta", () => {
    expect(paraBicimle(125050)).toBe("1.250,50 ₺");
    expect(paraBicimle(100000000)).toBe("1.000.000 ₺");
  });

  test("negatif deger isareti onde", () => {
    // Iade ve indirim Faz E'de yok ama bicim burada tanimli kalsin.
    expect(paraBicimle(-35050)).toBe("-350,50 ₺");
  });

  test("girdi-cikti dongusu paraKurusDogrula ile kapaniyor", async () => {
    const { paraKurusDogrula } = await import("@/lib/girdi");
    for (const kurus of [0, 5, 99, 100, 35050, 125050]) {
      const metin = paraBicimle(kurus).replace(" ₺", "");
      const geri = paraKurusDogrula(metin, "Ücret");
      expect(geri.tamam && geri.deger).toBe(kurus);
    }
  });
});

describe("sureBicimle", () => {
  test("marka belgesindeki ornekler", () => {
    expect(sureBicimle(45)).toBe("45 dk");
    expect(sureBicimle(90)).toBe("1 sa 30 dk");
  });

  test("tam saatte dakika yazilmiyor", () => {
    expect(sureBicimle(60)).toBe("1 sa");
    expect(sureBicimle(120)).toBe("2 sa");
  });

  test("sifir ve negatif", () => {
    expect(sureBicimle(0)).toBe("0 dk");
    expect(sureBicimle(-10)).toBe("0 dk");
  });
});

describe("saatBicimle", () => {
  test("saat iki haneli", () => {
    expect(saatBicimle(540)).toBe("09:00");
    expect(saatBicimle(0)).toBe("00:00");
    expect(saatBicimle(1110)).toBe("18:30");
  });

  test("gece yarisi kapanis", () => {
    expect(saatBicimle(1440)).toBe("24:00");
  });
});

describe("saatiDakikayaCevir", () => {
  test("gecerli degerler", () => {
    expect(saatiDakikayaCevir("09:00")).toBe(540);
    expect(saatiDakikayaCevir("9:00")).toBe(540);
    expect(saatiDakikayaCevir(" 18:30 ")).toBe(1110);
    expect(saatiDakikayaCevir("24:00")).toBe(1440);
  });

  test("gecersiz degerler null", () => {
    expect(saatiDakikayaCevir("24:30")).toBeNull();
    expect(saatiDakikayaCevir("25:00")).toBeNull();
    expect(saatiDakikayaCevir("09:60")).toBeNull();
    expect(saatiDakikayaCevir("dokuz")).toBeNull();
    expect(saatiDakikayaCevir("0900")).toBeNull();
  });

  test("bicimlemenin tersi", () => {
    for (const dk of [0, 540, 1110, 1440]) {
      expect(saatiDakikayaCevir(saatBicimle(dk))).toBe(dk);
    }
  });
});

describe("gun adlari", () => {
  test("0 Pazar - JS Date.getDay() ile ayni", () => {
    // Sema bu esleme uzerine kurulu; kayarsa musaitlik motoru yanlis gun
    // hesaplar.
    const pazar = new Date("2026-08-30T12:00:00Z");
    expect(pazar.getUTCDay()).toBe(0);
    expect(gunAdi(0)).toBe("Pazar");
    expect(gunAdi(1)).toBe("Pazartesi");
    expect(gunAdi(6)).toBe("Cumartesi");
  });

  test("hafta arayuzde pazartesiden basliyor", () => {
    expect(HAFTA_SIRASI.map(gunAdi)).toEqual([
      "Pazartesi",
      "Salı",
      "Çarşamba",
      "Perşembe",
      "Cuma",
      "Cumartesi",
      "Pazar",
    ]);
  });
});
