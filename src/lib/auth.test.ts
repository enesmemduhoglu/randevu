import { expect, test } from "vitest";

import { girisYonu } from "@/lib/auth";

// SAF FONKSIYON, ilk kez sinanabiliyor: `/api/giris`'te bu karar route'un
// icine gomulmustu ve DB/Supabase'e bagimli oldugu icin hic test edilemiyordu.
// `/api/sifre/yenile` AYNI karari verdigi icin (src/lib/auth.ts'teki
// gerekce) buraya cikarildi - tek yerde tutulmazsa bir gun ayrisip musteriyi
// panele dusururlerdi.

const ISLETME_KAYDI = {
  id: "k1",
  eposta: "sahip@ornek.com",
  ad: "Ayşe",
  rol: "SAHIP" as const,
  isletmeId: "i1",
};

const MUSTERI_KAYDI = {
  id: "k2",
  eposta: "musteri@ornek.com",
  ad: "Zeynep",
  rol: "MUSTERI" as const,
  isletmeId: null,
};

test("kayit yoksa /kayit/tamamla", () => {
  expect(girisYonu(null, "/panel/hizmetler")).toBe("/kayit/tamamla");
});

test("MUSTERI /randevularim - devam degeri YOK SAYILIYOR", () => {
  // Korunan sayfalarin hepsi panel yollari; musteriyi oraya gondermek onu
  // erisemeyecegi bir sayfaya birakip geri attirirdi.
  expect(girisYonu(MUSTERI_KAYDI, "/panel/hizmetler")).toBe("/randevularim");
  expect(girisYonu(MUSTERI_KAYDI, undefined)).toBe("/randevularim");
});

test("SAHIP devam varsa oraya gidiyor", () => {
  expect(girisYonu(ISLETME_KAYDI, "/panel/hizmetler")).toBe("/panel/hizmetler");
});

test("SAHIP devam yoksa /panel", () => {
  expect(girisYonu(ISLETME_KAYDI, undefined)).toBe("/panel");
});

test("supheli devam degeri (acik yonlendirme) /panel'e dusuyor", () => {
  expect(girisYonu(ISLETME_KAYDI, "//kotu.site")).toBe("/panel");
  expect(girisYonu(ISLETME_KAYDI, "https://kotu.site")).toBe("/panel");
});
