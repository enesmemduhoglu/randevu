import { describe, expect, test } from "vitest";

import { adDogrula, epostaDogrula, guvenliYol, sifreDogrula } from "@/lib/girdi";

// Bu dosya veritabanina DOKUNMUYOR: girdi.ts saf. Postgres'e kosan diger test
// dosyalarindan bagimsiz, milisaniyeler icinde bitiyor.

describe("epostaDogrula", () => {
  test("gecerli adresi kucuk harfe cevirip kirpiyor", () => {
    const sonuc = epostaDogrula("  Ayse@Ornek.COM ");
    expect(sonuc).toEqual({ tamam: true, deger: "ayse@ornek.com" });
  });

  test("arti isaretli ve uzun uzantili adresler kabul ediliyor", () => {
    // Fazla siki bir regex bu ikisini reddeder ve sebebi kimseye anlasilmaz.
    expect(epostaDogrula("ayse+randevu@ornek.com").tamam).toBe(true);
    expect(epostaDogrula("ayse@salon.istanbul").tamam).toBe(true);
  });

  test("bicimsiz deger reddediliyor", () => {
    for (const deger of ["", "   ", "ayse", "ayse@", "@ornek.com", "ayse@ornek"]) {
      expect(epostaDogrula(deger).tamam).toBe(false);
    }
  });

  test("string olmayan deger reddediliyor", () => {
    // Govde JSON'dan geliyor: tip garantisi yok, sayı ya da nesne gelebilir.
    expect(epostaDogrula(undefined).tamam).toBe(false);
    expect(epostaDogrula(42).tamam).toBe(false);
    expect(epostaDogrula({ eposta: "ayse@ornek.com" }).tamam).toBe(false);
  });
});

describe("sifreDogrula", () => {
  test("sekiz karakter ve uzeri kabul", () => {
    expect(sifreDogrula("uzun-sifre").tamam).toBe(true);
  });

  test("yedi karakter reddediliyor", () => {
    const sonuc = sifreDogrula("kisa123");
    expect(sonuc.tamam).toBe(false);
  });

  test("bosluklar korunuyor", () => {
    // Sifre yoneticisinden yapistirilan deger sessizce degistirilmemeli.
    const sonuc = sifreDogrula("  bosluklu sifre  ");
    expect(sonuc).toEqual({ tamam: true, deger: "  bosluklu sifre  " });
  });

  test("72 BAYTI asan sifre reddediliyor", () => {
    // bcrypt 72 bayttan sonrasini sessizce atiyor. Turkce harfler UTF-8'de iki
    // bayt: 40 karakterlik bu sifre 80 bayt, yani karakter sayisina bakan bir
    // kontrol onu kacirirdi.
    const turkce = "ş".repeat(40);
    expect(new TextEncoder().encode(turkce).length).toBe(80);
    expect(sifreDogrula(turkce).tamam).toBe(false);

    expect(sifreDogrula("a".repeat(72)).tamam).toBe(true);
    expect(sifreDogrula("a".repeat(73)).tamam).toBe(false);
  });
});

describe("adDogrula", () => {
  test("ic bosluklari tekilliyor", () => {
    expect(adDogrula("Ayşe    Yılmaz", "Ad soyad")).toEqual({
      tamam: true,
      deger: "Ayşe Yılmaz",
    });
  });

  test("hata metni alan adini tasiyor", () => {
    const sonuc = adDogrula("", "İşletme adı");
    expect(sonuc.tamam).toBe(false);
    if (sonuc.tamam) return;
    expect(sonuc.hata).toContain("İşletme adı");
  });

  test("sinirlar", () => {
    expect(adDogrula("A", "Ad").tamam).toBe(false);
    expect(adDogrula("Al", "Ad").tamam).toBe(true);
    expect(adDogrula("a".repeat(81), "Ad").tamam).toBe(false);
  });
});

describe("guvenliYol", () => {
  test("bagil yol gecerli", () => {
    expect(guvenliYol("/panel")).toBe("/panel");
    expect(guvenliYol("/panel/hizmetler?yeni=1")).toBe("/panel/hizmetler?yeni=1");
  });

  test("baska bir siteye giden degerler eleniyor", () => {
    // Ucu de bagil yol gibi duruyor ama tarayicida baska host'a gidiyor.
    expect(guvenliYol("//kotu.site")).toBeNull();
    expect(guvenliYol("/\\kotu.site")).toBeNull();
    expect(guvenliYol("https://kotu.site")).toBeNull();
  });

  test("egik cizgiyle baslamayan deger eleniyor", () => {
    expect(guvenliYol("panel")).toBeNull();
    expect(guvenliYol("javascript:alert(1)")).toBeNull();
  });

  test("kontrol karakteri iceren deger eleniyor", () => {
    // Location basligina satir sonu yazilabilseydi baslik enjeksiyonu olurdu.
    const satirSonu = String.fromCharCode(10);
    const bosKarakter = String.fromCharCode(0);
    expect(guvenliYol(`/panel${satirSonu}Set-Cookie: a=b`)).toBeNull();
    expect(guvenliYol(`/panel${bosKarakter}`)).toBeNull();
  });

  test("string olmayan ve asiri uzun deger eleniyor", () => {
    expect(guvenliYol(null)).toBeNull();
    expect(guvenliYol(undefined)).toBeNull();
    expect(guvenliYol(`/${"a".repeat(512)}`)).toBeNull();
  });
});
