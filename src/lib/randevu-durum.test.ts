import { describe, expect, test } from "vitest";

import {
  AKTIF_DURUMLAR,
  CIKILAMAZ_ACIKLAMASI,
  DURUM_ETIKETLERI,
  EYLEM_ETIKETLERI,
  GECISLER,
  RANDEVU_DURUMLARI,
  gecisMumkunMu,
  hedefDurumDogrula,
  kaynakDurumlar,
  type RandevuDurumu,
} from "@/lib/randevu-durum";

// Gecis tablosunun testleri.
//
// Bu dosya bir davranisi degil, IKI YERIN AYNI KALMASINI kilitliyor: arayuz
// hangi dugmeleri gosterecegini `GECISLER`'den, veritabani kosullu UPDATE'in
// where'ini `kaynakDurumlar`'dan aliyor. Ikisi ayrisirsa arayuz her basista
// 409 donduren bir dugme gosterir ve sebebi hicbir yerde gorunmez.
//
// Saf modul, Postgres'e dokunmuyor.

describe("gecis tablosu", () => {
  test("kaynakDurumlar GECISLER'in tam tersi", () => {
    // Iki liste elle yazilsaydi birine eklenen gecis digerinde unutulabilirdi.
    // Turetmenin dogru turettigini burada kilitliyoruz.
    for (const hedef of RANDEVU_DURUMLARI) {
      for (const kaynak of kaynakDurumlar(hedef)) {
        expect(GECISLER[kaynak]).toContain(hedef);
      }
      const disaridaKalan = RANDEVU_DURUMLARI.filter(
        (k) => !kaynakDurumlar(hedef).includes(k),
      );
      for (const kaynak of disaridaKalan) {
        expect(GECISLER[kaynak]).not.toContain(hedef);
      }
    }
  });

  test("uc durum terminal: iptal, tamamlandi, gelmedi", () => {
    // Terminal olmalari bir urun tercihi degil kisit: geri acmak slotu tekrar
    // doldurmak demek ve o slot bu arada baskasina verilmis olabilir.
    expect(GECISLER.IPTAL).toEqual([]);
    expect(GECISLER.TAMAMLANDI).toEqual([]);
    expect(GECISLER.GELMEDI).toEqual([]);
  });

  test("BEKLIYOR hicbir gecisin varis noktasi degil", () => {
    // Randevu yalnizca olusturulurken BEKLIYOR olur; hicbir durumdan oraya
    // donulmez. hedefDurumDogrula bunu 400 ile eliyor.
    expect(kaynakDurumlar("BEKLIYOR")).toEqual([]);
  });

  test("onay bekleyen randevu dogrudan tamamlandi olabiliyor", () => {
    // Otomatik onay kapaliyken isletme onaylamayi unutuyor ama musteri yine
    // geliyor. Once "onayla" demeye zorlamak gecmisi olmamis gibi kaydettirir.
    expect(gecisMumkunMu("BEKLIYOR", "TAMAMLANDI")).toBe(true);
    expect(gecisMumkunMu("BEKLIYOR", "GELMEDI")).toBe(true);
  });

  test("onayli randevu tekrar onaylanamiyor", () => {
    // Kosullu UPDATE'in yarisi kaybedene 0 satir dondurmesinin sebebi bu.
    expect(gecisMumkunMu("ONAYLI", "ONAYLI")).toBe(false);
    expect(kaynakDurumlar("ONAYLI")).toEqual(["BEKLIYOR"]);
  });

  test("iptal her aktif durumdan mumkun", () => {
    expect(kaynakDurumlar("IPTAL").sort()).toEqual(["BEKLIYOR", "ONAYLI"]);
  });
});

describe("aktif durumlar", () => {
  test("kume veritabanindaki EXCLUDE kisitiyla ayni", () => {
    // drizzle/0002_*.sql: WHERE durum IN ('BEKLIYOR','ONAYLI'). Ayrisirsa
    // uygulama bos gordugu bir sloti yazmaya calisir ve kullanici sebepsiz
    // 409 alir.
    expect([...AKTIF_DURUMLAR]).toEqual(["BEKLIYOR", "ONAYLI"]);
  });

  test("terminal durumlarin hicbiri aktif degil", () => {
    for (const durum of ["IPTAL", "TAMAMLANDI", "GELMEDI"] as const) {
      expect(AKTIF_DURUMLAR as readonly RandevuDurumu[]).not.toContain(durum);
    }
  });
});

describe("etiketler", () => {
  test("her durum icin uc metnin hepsi tanimli", () => {
    // Eksik bir etiket arayuzde bos rozet demek; tip sistemi Record'u zorluyor
    // ama bos dizeyi yakalamiyor.
    for (const durum of RANDEVU_DURUMLARI) {
      expect(DURUM_ETIKETLERI[durum]).toBeTruthy();
      expect(EYLEM_ETIKETLERI[durum]).toBeTruthy();
      expect(CIKILAMAZ_ACIKLAMASI[durum]).toBeTruthy();
    }
  });

  test("rozet ve dugme metni ayri", () => {
    // Rozette "İptal edildi", dugmede "İptal et" dogru. Tek liste tutulsaydi
    // ikisinden biri yanlis okunurdu.
    expect(DURUM_ETIKETLERI.IPTAL).not.toBe(EYLEM_ETIKETLERI.IPTAL);
  });
});

describe("hedefDurumDogrula", () => {
  test("gecerli hedef kabul ediliyor", () => {
    const sonuc = hedefDurumDogrula("ONAYLI");
    expect(sonuc).toEqual({ tamam: true, deger: "ONAYLI" });
  });

  test("BEKLIYOR reddediliyor", () => {
    // Veritabanina hicbir zaman kazanamayacak bir UPDATE gonderilmiyor:
    // istemcinin hatasi 400, sunucuda sessizce 0 satir degil.
    const sonuc = hedefDurumDogrula("BEKLIYOR");
    expect(sonuc.tamam).toBe(false);
  });

  test("bilinmeyen durum reddediliyor", () => {
    for (const ham of ["ONAYLANDI", "", null, undefined, 3, {}, ["ONAYLI"]]) {
      expect(hedefDurumDogrula(ham).tamam).toBe(false);
    }
  });

  test("kucuk harfli deger reddediliyor", () => {
    // Enum degeri veritabaninda buyuk harfli; sessizce duzeltmek, istemcinin
    // baska bir sozlesme kullandigini gizlerdi.
    expect(hedefDurumDogrula("onayli").tamam).toBe(false);
  });
});
