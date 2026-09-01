import { describe, expect, test } from "vitest";

import {
  ayBasi,
  ayGunSayisi,
  ayPenceresi,
  ayniGunMu,
  gorunumAyristir,
  haftaBasi,
  kaydir,
  pencere,
  pencereGunleri,
} from "@/lib/takvim-araligi";
import { haftaninGunu } from "@/lib/bicim";
import type { YerelTarih } from "@/lib/zaman";

// Takvim penceresinin testleri.
//
// Buradaki hatalar sessiz: pencere bir gun kaydiginda takvim yine dolu
// gorunur, yalnizca yanlis gunun randevularini gosterir. Isletme o gun
// bekledigi musteriyi gormez ve sebebini anlamaz - bu yuzden sinirlar tek tek
// kilitleniyor.
//
// Saf modul: saat dilimi ve `new Date()` yok, hepsi takvim aritmetigi.

const t = (yil: number, ay: number, gun: number): YerelTarih => ({ yil, ay, gun });

describe("haftaBasi", () => {
  test("hafta pazartesiden basliyor", () => {
    // 2026-09-01 sali. Haftasi 31 Agustos pazartesi - yani ay da degistiriyor.
    expect(haftaBasi(t(2026, 9, 1))).toEqual(t(2026, 8, 31));
  });

  test("pazar bir onceki pazartesiye baglaniyor", () => {
    // En kolay hata burada: 0 = Pazar oldugu icin naif bir hesap pazari
    // haftanin BASI sayar ve o hafta bir gun ileri kayar.
    const pazar = t(2026, 9, 6);
    expect(haftaninGunu(pazar)).toBe(0);
    expect(haftaBasi(pazar)).toEqual(t(2026, 8, 31));
  });

  test("pazartesi kendisi", () => {
    expect(haftaBasi(t(2026, 8, 31))).toEqual(t(2026, 8, 31));
  });

  test("yil siniri asiliyor", () => {
    // 2027-01-01 cuma; haftasi 2026-12-28 pazartesi.
    expect(haftaBasi(t(2027, 1, 1))).toEqual(t(2026, 12, 28));
  });
});

describe("ayGunSayisi", () => {
  test("artik yil subati 29 gun", () => {
    expect(ayGunSayisi(2028, 2)).toBe(29);
    expect(ayGunSayisi(2026, 2)).toBe(28);
  });

  test("yuzyil kurali: 2100 artik yil degil", () => {
    expect(ayGunSayisi(2100, 2)).toBe(28);
  });

  test("30 ve 31 gunlu aylar", () => {
    expect(ayGunSayisi(2026, 4)).toBe(30);
    expect(ayGunSayisi(2026, 12)).toBe(31);
  });
});

describe("ayPenceresi", () => {
  test("tam haftalara yuvarlaniyor", () => {
    // Eylul 2026: 1'i sali, 30'u carsamba. Pencere 31 Agustos pazartesiden
    // baslayip 4 Ekim pazara kadar - 5 tam hafta.
    const p = ayPenceresi(t(2026, 9, 15));
    expect(p.ilkGun).toEqual(t(2026, 8, 31));
    expect(p.gunSayisi % 7).toBe(0);

    const gunler = pencereGunleri(p);
    expect(gunler[gunler.length - 1]).toEqual(t(2026, 10, 4));
  });

  test("pencere ayin her gununu iceriyor", () => {
    // Izgara ayin bir gunu bile disarida kalirsa isletme o gunun randevusunu
    // hicbir gorunumde goremez.
    for (const ay of [1, 2, 4, 8, 12]) {
      const gunler = pencereGunleri(ayPenceresi(t(2026, ay, 1)));
      const ayinGunleri = gunler.filter((g) => g.ay === ay && g.yil === 2026);
      expect(ayinGunleri.length).toBe(ayGunSayisi(2026, ay));
    }
  });

  test("pencere her zaman pazartesi baslayip pazar bitiyor", () => {
    for (const ay of [1, 2, 3, 6, 9, 11, 12]) {
      const gunler = pencereGunleri(ayPenceresi(t(2026, ay, 1)));
      expect(haftaninGunu(gunler[0])).toBe(1);
      expect(haftaninGunu(gunler[gunler.length - 1])).toBe(0);
    }
  });

  test("subat pazartesi baslarsa tam dort hafta", () => {
    // 2027 subati pazartesi basliyor ve 28 gun. Fazladan hafta cizmek bos bir
    // satir demekti.
    const p = ayPenceresi(t(2027, 2, 10));
    expect(haftaninGunu(t(2027, 2, 1))).toBe(1);
    expect(p.ilkGun).toEqual(t(2027, 2, 1));
    expect(p.gunSayisi).toBe(28);
  });

  test("ayin gunu penceresi degistirmiyor", () => {
    // Ayin 1'ine de 30'una da bakilsa ayni izgara cizilmeli.
    expect(ayPenceresi(t(2026, 9, 1))).toEqual(ayPenceresi(t(2026, 9, 30)));
  });
});

describe("pencere", () => {
  test("gun gorunumu tek gun", () => {
    expect(pencere("gun", t(2026, 9, 1))).toEqual({
      ilkGun: t(2026, 9, 1),
      gunSayisi: 1,
    });
  });

  test("hafta gorunumu pazartesiden yedi gun", () => {
    expect(pencere("hafta", t(2026, 9, 3))).toEqual({
      ilkGun: t(2026, 8, 31),
      gunSayisi: 7,
    });
  });

  test("pencereGunleri sirali ve kesintisiz", () => {
    const gunler = pencereGunleri(pencere("hafta", t(2026, 9, 3)));
    expect(gunler.map((g) => g.gun)).toEqual([31, 1, 2, 3, 4, 5, 6]);
  });
});

describe("kaydir", () => {
  test("gun gorunumu bir gun kaydiriyor", () => {
    expect(kaydir("gun", t(2026, 9, 30), 1)).toEqual(t(2026, 10, 1));
    expect(kaydir("gun", t(2026, 9, 1), -1)).toEqual(t(2026, 8, 31));
  });

  test("hafta gorunumu yedi gun kaydiriyor", () => {
    expect(kaydir("hafta", t(2026, 9, 1), 1)).toEqual(t(2026, 9, 8));
  });

  test("ay gorunumu pencereyi degil AYI kaydiriyor", () => {
    // Pencere tam haftalara yuvarlandigi icin 35 ya da 42 gun olabiliyor;
    // pencere kadar kaydirmak bazi aylari atlar, bazilarini iki kez gosterirdi.
    expect(kaydir("ay", t(2026, 9, 15), 1).ay).toBe(10);
    expect(kaydir("ay", t(2026, 9, 15), -1).ay).toBe(8);
  });

  test("ay kaydirmasi yil sinirini asiyor", () => {
    expect(kaydir("ay", t(2026, 12, 10), 1)).toEqual(t(2027, 1, 10));
    expect(kaydir("ay", t(2026, 1, 10), -1)).toEqual(t(2025, 12, 10));
  });

  test("ayin gunu tasarsa son gune kirpiliyor", () => {
    // 31 Mart'tan bir ay geri gitmek 31 Subat demek.
    expect(kaydir("ay", t(2026, 3, 31), -1)).toEqual(t(2026, 2, 28));
    expect(kaydir("ay", t(2026, 1, 31), 1)).toEqual(t(2026, 2, 28));
    expect(kaydir("ay", t(2028, 1, 31), 1)).toEqual(t(2028, 2, 29));
  });

  test("ileri geri ayni yere donuyor", () => {
    const baslangic = t(2026, 9, 15);
    for (const gorunum of ["gun", "hafta", "ay"] as const) {
      expect(kaydir(gorunum, kaydir(gorunum, baslangic, 1), -1)).toEqual(
        baslangic,
      );
    }
  });
});

describe("gorunumAyristir", () => {
  test("taninan degerler gecer", () => {
    expect(gorunumAyristir("gun")).toBe("gun");
    expect(gorunumAyristir("hafta")).toBe("hafta");
    expect(gorunumAyristir("ay")).toBe("ay");
  });

  test("taninmayan deger sessizce gune dusuyor", () => {
    // Takvim adresi elle duzenlenebilir; bozuk bir parametre yuzunden hata
    // sayfasi gostermek isletmeyi gununu goremez birakirdi.
    for (const ham of ["yil", "", null, undefined, 5, {}]) {
      expect(gorunumAyristir(ham)).toBe("gun");
    }
  });
});

describe("yardimcilar", () => {
  test("ayBasi ayin ilk gunu", () => {
    expect(ayBasi(t(2026, 9, 17))).toEqual(t(2026, 9, 1));
  });

  test("ayniGunMu yalnizca uc alan da esitse", () => {
    expect(ayniGunMu(t(2026, 9, 1), t(2026, 9, 1))).toBe(true);
    expect(ayniGunMu(t(2026, 9, 1), t(2026, 10, 1))).toBe(false);
    expect(ayniGunMu(t(2026, 9, 1), t(2025, 9, 1))).toBe(false);
  });
});
