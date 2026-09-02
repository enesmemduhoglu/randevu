import { expect, test } from "vitest";

import { hizSiniriAsildiMi } from "@/lib/hiz-siniri";

// SINANAN DILIM: sinirlayicinin YOKLUGUNDAKI davranisi.
//
// Gercek sayma mantigi Cloudflare'de, bizim kodumuzda degil - onu burada
// sinamak Cloudflare'i taklit etmek olurdu ve taklit, yanlis yazildiginda
// gercekten test edilmemis bir kodu yesil gosterir.
//
// Burada sinanan sey SOZLESME: GECIREN TEK DURUM binding'in olmamasi.
// Bu onemli cunku vitest ve `next dev` ortamlarinda binding hic yok; ters
// karar butun yerel gelistirmeyi 429'a bogardi.
//
// ELLE OLCULDU (`cf:onizle`, workerd, Faz L):
//   - CF-Connecting-IP ile 8 POST -> 1-5 arasi 403 (Turnstile), 6-8 arasi 429
//   - basliksiz 8 POST -> hepsi 403, sinir HIC ATESLEMEDI
// Ikinci olcum "anahtar yoksa gecir" davranisini kaldirtti: uretimde baslik
// her zaman var, ama "sessizce devre disi kalabilen kapi" tam olarak bu fazin
// ortadan kaldirmak icin var oldugu sekil.
//
// Sinirin uretimde GERCEKTEN bagli oldugunu ise degismezler.test.ts
// dogruluyor (wrangler.jsonc'de binding tanimli mi) - burasi degil.

test("binding yoksa gecer", async () => {
  expect(await hizSiniriAsildiMi("RANDEVU_SINIRI", "203.0.113.7")).toBe(false);
});

test("binding yoksa anahtarsiz istek de gecer", async () => {
  // Binding VARKEN anahtarsiz istek gecmiyor (tek kovaya dusuyor) - ama o dal
  // yalnizca Cloudflare baglaminda kosuyor ve burada taklit edilmiyor.
  expect(await hizSiniriAsildiMi("RANDEVU_SINIRI", null)).toBe(false);
});

test("musaitlik sinirlayicisi da ayni sozlesmeyi tutuyor", async () => {
  expect(await hizSiniriAsildiMi("MUSAITLIK_SINIRI", "203.0.113.7")).toBe(false);
});
