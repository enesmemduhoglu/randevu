import { describe, expect, test } from "vitest";

import {
  cakisiyorMu,
  slotUygunMu,
  uygunSaatler,
  type MusaitlikGirdisi,
} from "@/lib/musaitlik";
import { yerelDenUtc } from "@/lib/zaman";

// Urunun kalbi. Bir slotun yanlis "bos" gorunmesi musterinin kapida
// beklemesi, yanlis "dolu" gorunmesi ise kaybedilen bir randevu demek.
//
// Testlerin hepsi ACIK UTC anlariyla yaziliyor ve `simdi` disaridan veriliyor;
// hicbiri makinenin saatine ya da diliminie bagli degil.

const ISTANBUL = "Europe/Istanbul";
const BERLIN = "Europe/Berlin";

/// 2026-09-01 Sali. Haftanin gunu 2.
const SALI = { yil: 2026, ay: 9, gun: 1 };

/// Sali gunu 09:00-18:00, ogle arasi yok.
const TAM_GUN = [{ haftaninGunu: 2, baslangicDk: 540, bitisDk: 1080 }];

/// Sali 09:00-12:00 ve 13:00-18:00 (ogle arasi 12:00-13:00).
const OGLE_ARALI = [
  { haftaninGunu: 2, baslangicDk: 540, bitisDk: 720 },
  { haftaninGunu: 2, baslangicDk: 780, bitisDk: 1080 },
];

function girdi(ustune: Partial<MusaitlikGirdisi> = {}): MusaitlikGirdisi {
  return {
    saatDilimi: ISTANBUL,
    tarih: SALI,
    // Bir gun once, yani "bugun" degil - minimum bildirim suresi kurallarini
    // ayri ayri sinamak icin varsayilan olarak yolu acik birakiyoruz.
    simdi: new Date("2026-08-31T06:00:00Z"),
    hizmetSuresiDk: 60,
    slotAraligiDk: 60,
    minOnceBildirimDk: 0,
    maksIleriGun: 60,
    calismaAraliklari: TAM_GUN,
    kapaliAraliklar: [],
    doluRandevular: [],
    ...ustune,
  };
}

/// Yerel duvar saatinden UTC anina - testleri okunur tutmak icin.
function yerel(dakika: number, tarih = SALI, dilim = ISTANBUL): Date {
  return yerelDenUtc(dilim, tarih, dakika);
}

/// Slot listesini "09:00" gibi yerel saatlere cevirir.
function saatler(sonuc: { baslangic: Date }[], dilim = ISTANBUL): string[] {
  return sonuc.map((s) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: dilim,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(s.baslangic),
  );
}

describe("cakisiyorMu", () => {
  const a = { baslangic: new Date("2026-09-01T10:00:00Z"), bitis: new Date("2026-09-01T11:00:00Z") };

  test("bitisik araliklar cakismiyor", () => {
    // Veritabanindaki EXCLUDE kisiti da '[)' kullaniyor; ikisi ayrisirsa motor
    // "bos" dedigi bir sloti kisit reddeder.
    const b = { baslangic: new Date("2026-09-01T11:00:00Z"), bitis: new Date("2026-09-01T12:00:00Z") };
    expect(cakisiyorMu(a, b)).toBe(false);
    expect(cakisiyorMu(b, a)).toBe(false);
  });

  test("ic ice ve kismi cakismalar", () => {
    const icice = { baslangic: new Date("2026-09-01T10:15:00Z"), bitis: new Date("2026-09-01T10:45:00Z") };
    const kismi = { baslangic: new Date("2026-09-01T10:30:00Z"), bitis: new Date("2026-09-01T11:30:00Z") };
    const saran = { baslangic: new Date("2026-09-01T09:00:00Z"), bitis: new Date("2026-09-01T12:00:00Z") };

    for (const b of [icice, kismi, saran]) {
      expect(cakisiyorMu(a, b)).toBe(true);
      expect(cakisiyorMu(b, a)).toBe(true);
    }
  });
});

describe("temel izgara", () => {
  test("60 dakikalik hizmet, 60 dakikalik izgara", () => {
    expect(saatler(uygunSaatler(girdi()))).toEqual([
      "09:00",
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
    ]);
  });

  test("izgara hizmet suresinden BAGIMSIZ", () => {
    // 45 dakikalik hizmet 15 dakikalik izgarada 09:00, 09:15, 09:30...
    // noktalarinda baslayabiliyor. Izgara hizmet suresine esitlenseydi gunun
    // ortasindaki bosluklar doldurulamazdi.
    const sonuc = uygunSaatler(girdi({ hizmetSuresiDk: 45, slotAraligiDk: 15 }));
    expect(saatler(sonuc).slice(0, 4)).toEqual(["09:00", "09:15", "09:30", "09:45"]);
    // Son slot 17:15'te basliyor: 45 dakika sonra tam 18:00.
    expect(saatler(sonuc).at(-1)).toBe("17:15");
  });

  test("hizmet araliga SIGMIYORSA slot uretilmiyor", () => {
    // 18:00'de kapanan bir aralikta 17:45'te baslayan 30 dakikalik hizmet
    // yer bulamaz.
    const sonuc = uygunSaatler(girdi({ hizmetSuresiDk: 30, slotAraligiDk: 15 }));
    expect(saatler(sonuc).at(-1)).toBe("17:30");
  });

  test("gun boyu suren hizmet tek slot uretiyor", () => {
    const sonuc = uygunSaatler(girdi({ hizmetSuresiDk: 540 }));
    expect(saatler(sonuc)).toEqual(["09:00"]);
  });

  test("araliktan uzun hizmet hic slot uretmiyor", () => {
    expect(uygunSaatler(girdi({ hizmetSuresiDk: 541 }))).toEqual([]);
  });

  test("calisma saati tanimsiz gun bos", () => {
    // Sali icin kayit yok.
    const sonuc = uygunSaatler(
      girdi({ calismaAraliklari: [{ haftaninGunu: 3, baslangicDk: 540, bitisDk: 1080 }] }),
    );
    expect(sonuc).toEqual([]);
  });

  test("anlamsiz girdi sonsuz donguye girmiyor", () => {
    // slotAraligi kullanici ayarindan geliyor; 0 gelirse dongu asla bitmezdi.
    expect(uygunSaatler(girdi({ slotAraligiDk: 0 }))).toEqual([]);
    expect(uygunSaatler(girdi({ hizmetSuresiDk: 0 }))).toEqual([]);
    expect(uygunSaatler(girdi({ hizmetSuresiDk: -30 }))).toEqual([]);
  });
});

describe("ogle arasi", () => {
  test("araya tasan randevu uretilmiyor", () => {
    // 11:30'da baslayan 60 dakikalik randevu 12:30'da biterdi - ogle arasinin
    // ortasi. Iki aralik ayri ayri denendigi icin bu slot hic uretilmiyor.
    const sonuc = uygunSaatler(
      girdi({ calismaAraliklari: OGLE_ARALI, hizmetSuresiDk: 60, slotAraligiDk: 30 }),
    );
    const liste = saatler(sonuc);

    expect(liste).toContain("11:00");
    expect(liste).not.toContain("11:30");
    expect(liste).not.toContain("12:00");
    expect(liste).toContain("13:00");
  });

  test("izgara her aralikta kendi basindan basliyor", () => {
    // Ogleden sonraki aralik 13:00'te basliyor; izgara gun basindan sayilsaydi
    // 12:50 gibi noktalara duserdi.
    const sonuc = uygunSaatler(
      girdi({
        calismaAraliklari: [{ haftaninGunu: 2, baslangicDk: 790, bitisDk: 1080 }], // 13:10
        hizmetSuresiDk: 30,
        slotAraligiDk: 20,
      }),
    );
    expect(saatler(sonuc).slice(0, 3)).toEqual(["13:10", "13:30", "13:50"]);
  });

  test("uc araliklı gun", () => {
    const sonuc = uygunSaatler(
      girdi({
        calismaAraliklari: [
          { haftaninGunu: 2, baslangicDk: 540, bitisDk: 660 },
          { haftaninGunu: 2, baslangicDk: 720, bitisDk: 840 },
          { haftaninGunu: 2, baslangicDk: 900, bitisDk: 1020 },
        ],
        hizmetSuresiDk: 60,
        slotAraligiDk: 60,
      }),
    );
    expect(saatler(sonuc)).toEqual(["09:00", "10:00", "12:00", "13:00", "15:00", "16:00"]);
  });
});

describe("takvim penceresi", () => {
  test("gecmis gun bos", () => {
    const sonuc = uygunSaatler(girdi({ simdi: new Date("2026-09-02T06:00:00Z") }));
    expect(sonuc).toEqual([]);
  });

  test("pencerenin otesi bos", () => {
    const sonuc = uygunSaatler(
      girdi({ simdi: new Date("2026-06-01T06:00:00Z"), maksIleriGun: 30 }),
    );
    expect(sonuc).toEqual([]);
  });

  test("pencerenin tam sinirindaki gun aciik", () => {
    // 2026-08-02 + 30 gun = 2026-09-01.
    const sonuc = uygunSaatler(
      girdi({ simdi: new Date("2026-08-02T06:00:00Z"), maksIleriGun: 30 }),
    );
    expect(sonuc.length).toBeGreaterThan(0);
  });

  test("BUGUN isletmenin takviminde hesaplaniyor", () => {
    // UTC'de hala 31 Agustos 22:00 ama Istanbul'da 1 Eylul 01:00. Sunucu
    // dilimine bakilsaydi bu gun "gelecek" sayilir ve saatler gosterilirdi;
    // isletme takviminde ise BUGUN.
    const sonuc = uygunSaatler(
      girdi({ simdi: new Date("2026-08-31T22:00:00Z"), minOnceBildirimDk: 0 }),
    );
    expect(saatler(sonuc)[0]).toBe("09:00");

    // Ayni an, gecmis sayilmasi gereken bir onceki gun icin bos donmeli.
    const oncekiGun = uygunSaatler(
      girdi({
        simdi: new Date("2026-08-31T22:00:00Z"),
        tarih: { yil: 2026, ay: 8, gun: 31 },
        calismaAraliklari: [{ haftaninGunu: 1, baslangicDk: 540, bitisDk: 1080 }],
      }),
    );
    expect(oncekiGun).toEqual([]);
  });
});

describe("minimum bildirim suresi", () => {
  test("cok yakin saatler eleniyor", () => {
    // Istanbul'da 1 Eylul 10:30 (07:30Z), min bildirim 120 dakika:
    // 12:30'dan once baslayan hicbir randevu alinamaz.
    const sonuc = uygunSaatler(
      girdi({ simdi: new Date("2026-09-01T07:30:00Z"), minOnceBildirimDk: 120 }),
    );
    expect(saatler(sonuc)).toEqual(["13:00", "14:00", "15:00", "16:00", "17:00"]);
  });

  test("sinira tam denk gelen slot ALINABILIYOR", () => {
    // 09:00Z + 120 dk = 11:00Z = 14:00 Istanbul. O saat tam sinirda ve
    // kabul ediliyor; disarida birakmak keyfi bir bir dakika kaybi olurdu.
    const sonuc = uygunSaatler(
      girdi({ simdi: new Date("2026-09-01T09:00:00Z"), minOnceBildirimDk: 120 }),
    );
    expect(saatler(sonuc)[0]).toBe("14:00");
  });

  test("sifir bildirim suresinde gecmis saatler yine de eleniyor", () => {
    // 14:30 Istanbul (11:30Z). Gecmis saatler listede olmamali.
    const sonuc = uygunSaatler(
      girdi({ simdi: new Date("2026-09-01T11:30:00Z"), minOnceBildirimDk: 0 }),
    );
    expect(saatler(sonuc)).toEqual(["15:00", "16:00", "17:00"]);
  });

  test("gun bittiyse bos", () => {
    const sonuc = uygunSaatler(
      girdi({ simdi: new Date("2026-09-01T15:30:00Z"), minOnceBildirimDk: 0 }),
    );
    expect(sonuc).toEqual([]);
  });
});

describe("dolu randevular", () => {
  test("dolu saat listede yok", () => {
    const sonuc = uygunSaatler(
      girdi({
        doluRandevular: [{ baslangic: yerel(660), bitis: yerel(720) }], // 11:00-12:00
      }),
    );
    const liste = saatler(sonuc);
    expect(liste).not.toContain("11:00");
    expect(liste).toContain("10:00");
    expect(liste).toContain("12:00");
  });

  test("kismi cakisma da eliyor", () => {
    // 11:30-12:30 dolu: hem 11:00 hem 12:00 slotlari (60 dk) cakisiyor.
    const sonuc = uygunSaatler(
      girdi({ doluRandevular: [{ baslangic: yerel(690), bitis: yerel(750) }] }),
    );
    const liste = saatler(sonuc);
    expect(liste).not.toContain("11:00");
    expect(liste).not.toContain("12:00");
    expect(liste).toContain("10:00");
    expect(liste).toContain("13:00");
  });

  test("bitisik randevu sloti ENGELLEMIYOR", () => {
    // 10:00-11:00 dolu; 11:00 sloti bitisik, cakisma degil.
    const sonuc = uygunSaatler(
      girdi({ doluRandevular: [{ baslangic: yerel(600), bitis: yerel(660) }] }),
    );
    expect(saatler(sonuc)).toContain("11:00");
  });

  test("gunun tamami doluysa bos", () => {
    const sonuc = uygunSaatler(
      girdi({ doluRandevular: [{ baslangic: yerel(540), bitis: yerel(1080) }] }),
    );
    expect(sonuc).toEqual([]);
  });
});

describe("kapali araliklar", () => {
  test("izin saatleri eleniyor", () => {
    const sonuc = uygunSaatler(
      girdi({
        kapaliAraliklar: [{ baslangic: yerel(540), bitis: yerel(720) }], // sabah izinli
      }),
    );
    expect(saatler(sonuc)).toEqual(["12:00", "13:00", "14:00", "15:00", "16:00", "17:00"]);
  });

  test("tum gun kapali", () => {
    const sonuc = uygunSaatler(
      girdi({
        kapaliAraliklar: [
          {
            baslangic: new Date("2026-08-31T21:00:00Z"),
            bitis: new Date("2026-09-01T21:00:00Z"),
          },
        ],
      }),
    );
    expect(sonuc).toEqual([]);
  });

  test("kapali ve dolu birlikte", () => {
    const sonuc = uygunSaatler(
      girdi({
        kapaliAraliklar: [{ baslangic: yerel(540), bitis: yerel(660) }], // 09-11
        doluRandevular: [{ baslangic: yerel(840), bitis: yerel(900) }], // 14-15
      }),
    );
    expect(saatler(sonuc)).toEqual(["11:00", "12:00", "13:00", "15:00", "16:00", "17:00"]);
  });
});

describe("yaz saati gecisi", () => {
  // Berlin 2026-03-29 (Pazar, haftanin gunu 0): saat 02:00'den 03:00'e atliyor.
  const PAZAR_ILERI = { yil: 2026, ay: 3, gun: 29 };
  // Berlin 2026-10-25 (Pazar): 03:00'ten 02:00'ye donuluyor.
  const PAZAR_GERI = { yil: 2026, ay: 10, gun: 25 };

  test("saat ILERI alinan gunde slotlar dogru anlara denk geliyor", () => {
    const sonuc = uygunSaatler(
      girdi({
        saatDilimi: BERLIN,
        tarih: PAZAR_ILERI,
        simdi: new Date("2026-03-01T06:00:00Z"),
        calismaAraliklari: [{ haftaninGunu: 0, baslangicDk: 540, bitisDk: 720 }],
        hizmetSuresiDk: 60,
        slotAraligiDk: 60,
      }),
    );

    expect(saatler(sonuc, BERLIN)).toEqual(["09:00", "10:00", "11:00"]);
    // Gecis sonrasi ofset +2, yani 09:00 yerel = 07:00Z.
    expect(sonuc[0].baslangic.toISOString()).toBe("2026-03-29T07:00:00.000Z");
  });

  test("saat GERI alinan gunde slotlar dogru anlara denk geliyor", () => {
    const sonuc = uygunSaatler(
      girdi({
        saatDilimi: BERLIN,
        tarih: PAZAR_GERI,
        simdi: new Date("2026-10-01T06:00:00Z"),
        calismaAraliklari: [{ haftaninGunu: 0, baslangicDk: 540, bitisDk: 720 }],
        hizmetSuresiDk: 60,
        slotAraligiDk: 60,
      }),
    );

    expect(saatler(sonuc, BERLIN)).toEqual(["09:00", "10:00", "11:00"]);
    // Gecis sonrasi ofset +1, yani 09:00 yerel = 08:00Z.
    expect(sonuc[0].baslangic.toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });

  test("gecis saatini KAPSAYAN calisma araliginda randevu suresi bozulmuyor", () => {
    // Berlin, ileri alinan gun, calisma 01:00-06:00. 01:00 yerel = 00:00Z.
    // 02:00-03:00 arasi hic yasanmiyor, yani duvar saatinde 5 saatlik aralik
    // gercekte 4 saat suruyor.
    const sonuc = uygunSaatler(
      girdi({
        saatDilimi: BERLIN,
        tarih: PAZAR_ILERI,
        simdi: new Date("2026-03-01T06:00:00Z"),
        calismaAraliklari: [{ haftaninGunu: 0, baslangicDk: 60, bitisDk: 360 }],
        hizmetSuresiDk: 60,
        slotAraligiDk: 60,
      }),
    );

    // HER randevu tam 60 dakika: duvar saatinden hesaplansaydi gecisi kapsayan
    // randevu 120 dakika surer ve bir sonrakiyle cakisirdi.
    for (const slot of sonuc) {
      expect(slot.bitis.getTime() - slot.baslangic.getTime()).toBe(60 * 60000);
    }

    // Ardisik slotlar birbiriyle cakismiyor.
    for (let i = 1; i < sonuc.length; i++) {
      expect(cakisiyorMu(sonuc[i - 1], sonuc[i])).toBe(false);
    }
  });

  test("GERI alinan gunde ayni duvar saati iki kez uretilmiyor", () => {
    // 02:00-03:00 iki kez yasaniyor. Motor duvar saati izgarasi kullandigi
    // icin her duvar saati BIR kez uretiliyor; ikinci gecis sessizce
    // atlanıyor. Bu bilincli: musteriye "02:30" diye iki ayri secenek
    // gostermek anlasilmaz olurdu.
    const sonuc = uygunSaatler(
      girdi({
        saatDilimi: BERLIN,
        tarih: PAZAR_GERI,
        simdi: new Date("2026-10-01T06:00:00Z"),
        calismaAraliklari: [{ haftaninGunu: 0, baslangicDk: 60, bitisDk: 300 }],
        hizmetSuresiDk: 30,
        slotAraligiDk: 30,
      }),
    );

    const liste = saatler(sonuc, BERLIN);
    expect(new Set(liste).size).toBe(liste.length);
  });
});

describe("slotUygunMu", () => {
  test("listedeki slot icin true, disindaki icin false", () => {
    const g = girdi();
    expect(slotUygunMu(g, yerel(600))).toBe(true); // 10:00
    expect(slotUygunMu(g, yerel(630))).toBe(false); // 10:30 - izgarada yok
    expect(slotUygunMu(g, yerel(1080))).toBe(false); // 18:00 - kapanis
  });

  test("dolu slot false", () => {
    const g = girdi({ doluRandevular: [{ baslangic: yerel(600), bitis: yerel(660) }] });
    expect(slotUygunMu(g, yerel(600))).toBe(false);
  });
});
