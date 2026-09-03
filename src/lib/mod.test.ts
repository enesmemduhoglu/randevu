import { afterEach, expect, test } from "vitest";

import { modCoz } from "@/lib/mod";

// Bu dosyanin sinadigi sey bir DAVRANIS DEGIL, bir hatanin tekrarlanmamasi.
//
// Faz L'de `wrangler.jsonc > vars` icine `TURNSTILE_MODU: "gercek"` yazildi.
// `next.config.ts`teki `initOpenNextCloudflareForDev()` o degiskeni `next dev`e
// de tasidigi icin bot kapisi YERELDE de gercek modda kosmaya basladi; uretim
// site anahtari localhost icin kayitli olmadigindan her yerel randevu denemesi
// 403 aliyordu. `.env`in "sahte" demesi hicbir sey degistirmiyordu, cunku cf
// degeri `??` zincirinde once geliyordu.
//
// Asagidaki dort satir o zinciri kilitliyor.

const ILK = process.env.NODE_ENV;

function ortam(deger: "production" | "development" | "test") {
  // Cast tek satirda: NODE_ENV tipi salt okunur gibi davraniyor ama testin
  // taklit ettigi ortam gercek.
  (process.env as Record<string, string>).NODE_ENV = deger;
}

afterEach(() => {
  ortam(ILK as "production" | "development" | "test");
});

test("uretimde Cloudflare degeri karar veriyor", () => {
  ortam("production");
  expect(modCoz("gercek", undefined)).toBe("gercek");
});

test("uretimde cf tanimsizsa .env yedege dusuyor", () => {
  // Faz L oncesi durum: `vars` blogu yoktu. O gun kapinin sessizce acilmasinin
  // sebebi ikisinin de tanimsiz olmasiydi - yedek zincirinin kendisi degil.
  ortam("production");
  expect(modCoz(undefined, "gercek")).toBe("gercek");
  expect(modCoz(undefined, undefined)).toBe("sahte");
});

test("YERELDE Cloudflare degeri YOK SAYILIYOR", () => {
  // Hatanin ta kendisi: cf "gercek" diyor ama karar yerelin.
  ortam("development");
  expect(modCoz("gercek", undefined)).toBe("sahte");
  expect(modCoz("gercek", "sahte")).toBe("sahte");
});

test("yerelde gercek mod acikca istenebiliyor", () => {
  // Gelistirici bilerek denemek isterse yolu kapali degil.
  ortam("development");
  expect(modCoz(undefined, "gercek")).toBe("gercek");
});

test("yalnizca tam olarak 'gercek' gercek sayiliyor", () => {
  // "acik", "true", "1" gibi degerler sahte kaliyor: yanlis yazilmis bir
  // degiskenin gonderimi ya da bot kapisini acmasi istenmiyor.
  ortam("production");
  expect(modCoz("acik", undefined)).toBe("sahte");
  expect(modCoz("Gercek", undefined)).toBe("sahte");
});
