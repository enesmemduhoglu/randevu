import { describe, expect, test } from "vitest";

import {
  hataKodu,
  hizSiniriMi,
  kayitHatasi,
  zatenKayitliMi,
} from "@/lib/supabase/hata";

// Bu eslemenin testi elle denemeden dogdu: Supabase `.test` uzantili adresi
// reddetti ve ekranda "bağlantıda bir sorun oldu" yazdi - kullaniciya
// duzeltebilecegi bir sey oldugunu soylemeyen bir mesaj. Asagidaki testler o
// eslemeyi yerinde tutuyor.
//
// Kodlar Supabase'in dokumanindan; hata NESNESI taklit ediliyor cunku gercegini
// almak icin gercek bir hesap acmak ya da hiz sinirini doldurmak gerekirdi.

describe("hataKodu", () => {
  test("kod alanini okuyor", () => {
    expect(hataKodu({ code: "weak_password" })).toBe("weak_password");
  });

  test("kod yoksa ya da string degilse undefined", () => {
    expect(hataKodu({})).toBeUndefined();
    expect(hataKodu({ code: 400 })).toBeUndefined();
    expect(hataKodu(null)).toBeUndefined();
    expect(hataKodu("bir sey")).toBeUndefined();
  });
});

describe("hizSiniriMi", () => {
  test("iki hiz siniri kodunu da taniyor", () => {
    expect(hizSiniriMi({ code: "over_request_rate_limit" })).toBe(true);
    expect(hizSiniriMi({ code: "over_email_send_rate_limit" })).toBe(true);
  });

  test("baska hatalar hiz siniri degil", () => {
    expect(hizSiniriMi({ code: "invalid_credentials" })).toBe(false);
    expect(hizSiniriMi(null)).toBe(false);
  });
});

describe("kayitHatasi", () => {
  test("gecersiz adres 400 ve ne yapilacagini soyluyor", () => {
    const cevap = kayitHatasi({ code: "email_address_invalid" });
    expect(cevap.durum).toBe(400);
    expect(cevap.hata).toContain("adres");
  });

  test("zayif sifre 400", () => {
    expect(kayitHatasi({ code: "weak_password" }).durum).toBe(400);
  });

  test("hiz siniri 429 - 502 DEGIL", () => {
    // 502 "sunucular arasinda bir sorun var" demek; oysa yapilacak sey belli:
    // beklemek. Yanlis durum kodu kullaniciyi tekrar denemeye iter.
    expect(kayitHatasi({ code: "over_email_send_rate_limit" }).durum).toBe(429);
  });

  test("tanimadigimiz kod genel mesaja dusuyor", () => {
    const cevap = kayitHatasi({ code: "hic_bilinmeyen_kod" });
    expect(cevap.durum).toBe(502);
  });

  test("saglayicinin metni hicbir cevaba sizmiyor", () => {
    // DEGISMEZ 5. Supabase mesajlari zaman zaman ic ayrinti tasiyor.
    const gizli = "smtp relay host 10.0.0.4 rejected sender";
    for (const kod of [
      "email_address_invalid",
      "weak_password",
      "over_email_send_rate_limit",
      "bilinmeyen",
    ]) {
      const cevap = kayitHatasi({ code: kod, message: gizli });
      expect(cevap.hata).not.toContain(gizli);
      expect(cevap.hata).not.toContain("10.0.0.4");
    }
  });
});

describe("zatenKayitliMi", () => {
  test("kod alanindan taniyor", () => {
    expect(zatenKayitliMi({ code: "user_already_exists" })).toBe(true);
  });

  test("eski SDK'nin mesaj metninden de taniyor", () => {
    expect(zatenKayitliMi({ message: "User already registered" })).toBe(true);
  });

  test("baska hata degil", () => {
    expect(zatenKayitliMi({ code: "weak_password" })).toBe(false);
    expect(zatenKayitliMi({ message: "invalid credentials" })).toBe(false);
  });
});
