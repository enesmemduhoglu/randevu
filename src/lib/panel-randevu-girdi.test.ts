import { describe, expect, test } from "vitest";

import { panelRandevuAlanlariniDogrula } from "@/lib/panel-randevu-girdi";

// Panelden gelen randevu govdesinin dogrulamasi (Faz H2).
//
// Saf fonksiyon, Postgres'siz kosuyor. Halka acik girdiden AYRILAN iki kural
// burada kilitleniyor - personelin zorunlu olmasi ve `zorla` bayraginin
// yalnizca gercek `true` ile acilmasi. Ikisi de sessizce gevserse sonucu
// somut: biri randevuyu yanlis kisinin takvimine yazar, oteki calisma saati
// disina yazmayi kazayla mumkun kilar.

const GECERLI_ID = "3f2b1a4c-0d5e-4a6b-8c7d-9e0f1a2b3c4d";
const IKINCI_ID = "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d";

function govde(ustuneYaz: Record<string, unknown> = {}) {
  return {
    hizmetId: GECERLI_ID,
    personelId: IKINCI_ID,
    baslangic: "2026-09-05T11:00:00.000Z",
    ad: "Ayşe Yılmaz",
    telefon: "0532 111 22 33",
    ...ustuneYaz,
  };
}

describe("mutlu yol", () => {
  test("gecerli govde cozuluyor", () => {
    const sonuc = panelRandevuAlanlariniDogrula(govde());

    expect(sonuc.tamam).toBe(true);
    if (!sonuc.tamam) return;

    expect(sonuc.deger.hizmetId).toBe(GECERLI_ID);
    expect(sonuc.deger.personelId).toBe(IKINCI_ID);
    // Telefon yalnizca rakam olarak saklaniyor (sema yorumu) ve bastaki
    // sifir dusuyor - `telefonDogrula`nin kurali, panelde de ayni.
    expect(sonuc.deger.telefon).toBe("5321112233");
    expect(sonuc.deger.baslangic.toISOString()).toBe("2026-09-05T11:00:00.000Z");
  });

  test("e-posta ve not istege bagli, verilmezse null", () => {
    const sonuc = panelRandevuAlanlariniDogrula(govde());
    if (!sonuc.tamam) throw new Error(sonuc.hata);

    expect(sonuc.deger.eposta).toBeNull();
    expect(sonuc.deger.not).toBeNull();
  });
});

describe("personel ZORUNLU - halka acik akistan ayrilan kural", () => {
  test("personelId verilmezse reddediliyor", () => {
    const { personelId: _, ...eksik } = govde();
    const sonuc = panelRandevuAlanlariniDogrula(eksik);

    // Halka acik akista bos personel "farketmez" demek ve motor seciyor.
    // Panelde secilecek bir sey yok - serbest saatte motor hic kosmuyor ve
    // sessizce ilk personeli secmek randevuyu yanlis takvime yazardi.
    expect(sonuc.tamam).toBe(false);
  });

  test("bos metin de reddediliyor", () => {
    const sonuc = panelRandevuAlanlariniDogrula(govde({ personelId: "" }));
    expect(sonuc.tamam).toBe(false);
  });

  test("uuid olmayan id 400'e dusuyor, veritabanina gitmiyor", () => {
    // `uuid` kolonuna "abc" gonderilseydi Postgres 22P02 firlatirdi ve
    // istemcinin hatasi 500'e donerdi.
    const sonuc = panelRandevuAlanlariniDogrula(govde({ personelId: "abc" }));
    expect(sonuc.tamam).toBe(false);
  });
});

describe("zorla bayragi", () => {
  test("verilmezse kapali", () => {
    const sonuc = panelRandevuAlanlariniDogrula(govde());
    if (!sonuc.tamam) throw new Error(sonuc.hata);

    expect(sonuc.deger.zorla).toBe(false);
  });

  test("yalnizca gercek true aciyor", () => {
    for (const deger of ["true", 1, {}, [], "evet"]) {
      const sonuc = panelRandevuAlanlariniDogrula(govde({ zorla: deger }));
      if (!sonuc.tamam) throw new Error(sonuc.hata);

      // Bozuk ya da "dogruya benzeyen" bir deger istisnayi ACMIYOR: istisna
      // BILINCLI olmali.
      expect(sonuc.deger.zorla).toBe(false);
    }
  });

  test("true ile aciliyor", () => {
    const sonuc = panelRandevuAlanlariniDogrula(govde({ zorla: true }));
    if (!sonuc.tamam) throw new Error(sonuc.hata);

    expect(sonuc.deger.zorla).toBe(true);
  });
});

describe("musteri alanlari", () => {
  test("telefon zorunlu", () => {
    const sonuc = panelRandevuAlanlariniDogrula(govde({ telefon: "" }));

    // Musteri kaydi `(isletmeId, telefon)` ile tekilleniyor: numarasiz bir
    // musteri ikinci kez hic bulunamazdi.
    expect(sonuc.tamam).toBe(false);
  });

  test("ad zorunlu", () => {
    const sonuc = panelRandevuAlanlariniDogrula(govde({ ad: "  " }));
    expect(sonuc.tamam).toBe(false);
  });

  test("bozuk e-posta reddediliyor", () => {
    const sonuc = panelRandevuAlanlariniDogrula(govde({ eposta: "ayse@" }));
    expect(sonuc.tamam).toBe(false);
  });

  test("500 karakterden uzun not reddediliyor", () => {
    const sonuc = panelRandevuAlanlariniDogrula(govde({ not: "a".repeat(501) }));
    expect(sonuc.tamam).toBe(false);
  });
});

describe("baslangic", () => {
  test("okunamayan tarih reddediliyor", () => {
    const sonuc = panelRandevuAlanlariniDogrula(govde({ baslangic: "yarin" }));
    expect(sonuc.tamam).toBe(false);
  });

  test("eksik tarih reddediliyor", () => {
    const { baslangic: _, ...eksik } = govde();
    const sonuc = panelRandevuAlanlariniDogrula(eksik);
    expect(sonuc.tamam).toBe(false);
  });
});
