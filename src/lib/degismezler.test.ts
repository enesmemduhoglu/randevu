import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

// DEPO DEGISMEZLERININ OTOMATIK KAPISI.
//
// Neden var: Faz E'de mutasyon route'larinin ortak girisi `panelKapisi`ye
// tasindi ve `checkOrigin` cagrisi route dosyalarindan KAYBOLDU. Kod dogru -
// kapi hala ilk satirda, sadece bir dosya oteye tasindi - ama warden'in
// PreToolUse kapisi metinde `checkOrigin` ariyor ve artik goremiyor.
//
// Ayni sey Faz B'de bir kez yasandi: Prisma'dan Drizzle'a gecince kiraci
// kapisi sessizce zorlanamaz hale geldi ve iki faz boyunca yalnizca incelemeye
// bagli kaldi. Bu dosya o hatanin tekrarini engelliyor: dogrulama artik
// `npm test` icinde kosuyor ve dizinde ne oldugunu okuyarak karar veriyor,
// yani yeni bir route eklendiginde kimsenin hatirlamasi gerekmiyor.

const APP = join(process.cwd(), "src", "app");

/// Mutasyon sayilan HTTP metotlari. GET/HEAD/OPTIONS durum degistirmedigi icin
/// CSRF'in hedefi degil.
const MUTASYONLAR = ["POST", "PUT", "PATCH", "DELETE"];

/// Kapiyi saglayan cagrilardan EN AZ BIRI dosyada gorunmeli. panelKapisi ve
/// panelKapisiGovdesiz ilk satirinda checkOrigin cagiriyor - bunu asagidaki
/// ayri bir test dogruluyor, yani zincir kopuk kalmiyor.
const KAPI_ISARETLERI = ["checkOrigin(", "panelKapisi(", "panelKapisiGovdesiz("];

function routeDosyalari(dizin: string): string[] {
  const bulunan: string[] = [];
  for (const ad of readdirSync(dizin)) {
    const tam = join(dizin, ad);
    if (statSync(tam).isDirectory()) {
      bulunan.push(...routeDosyalari(tam));
    } else if (ad === "route.ts" || ad === "route.tsx") {
      bulunan.push(tam);
    }
  }
  return bulunan;
}

const dosyalar = routeDosyalari(APP);

describe("DEGISMEZ 2 - mutasyon route'unda CSRF kapisi", () => {
  test("taranacak route bulundu", () => {
    // Tarama bos donerse butun testler sessizce "gecer". Bu satir o sessiz
    // basarisizligi gurultuye ceviriyor.
    expect(dosyalar.length).toBeGreaterThan(0);
  });

  test.each(dosyalar.map((d) => [d.replace(process.cwd(), "").replace(/\\/g, "/"), d]))(
    "%s",
    (_ad, yol) => {
      const metin = readFileSync(yol, "utf-8");

      const mutasyonVar = MUTASYONLAR.some((metot) =>
        new RegExp(`export\\s+async\\s+function\\s+${metot}\\b`).test(metin),
      );
      if (!mutasyonVar) return;

      const kapiVar = KAPI_ISARETLERI.some((isaret) => metin.includes(isaret));
      expect(kapiVar).toBe(true);
    },
  );
});

describe("DEGISMEZ 2 - kapi yardimcisinin kendisi", () => {
  test("panelKapisi checkOrigin cagiriyor", () => {
    // Route'lar artik dogrudan checkOrigin cagirmiyor, bu yardimciya
    // guveniyorlar. Zincirin bu halkasi kopagsa yukaridaki tarama yanlis
    // guven verirdi.
    const metin = readFileSync(
      join(process.cwd(), "src", "lib", "panel-kapisi.ts"),
      "utf-8",
    );
    expect(metin).toContain("checkOrigin(istek)");
  });
});

describe("DEGISMEZ 1 - src/app altinda ham veritabani yok", () => {
  // Bunu eslint `no-restricted-imports` da zorluyor. Burada tekrar edilmesinin
  // sebebi: eslint yapilandirmasi bir gun degisirse (ornegin kural adi ya da
  // kapsam yanlislikla daraltilirsa) test kosumu bunu yakalar.
  function tsDosyalari(dizin: string): string[] {
    const bulunan: string[] = [];
    for (const ad of readdirSync(dizin)) {
      const tam = join(dizin, ad);
      if (statSync(tam).isDirectory()) bulunan.push(...tsDosyalari(tam));
      else if (ad.endsWith(".ts") || ad.endsWith(".tsx")) bulunan.push(tam);
    }
    return bulunan;
  }

  test("hicbir dosya @/lib/db import etmiyor", () => {
    const ihlaller = tsDosyalari(APP).filter((yol) =>
      /from\s+["']@\/lib\/db["']/.test(readFileSync(yol, "utf-8")),
    );

    expect(ihlaller.map((y) => y.replace(process.cwd(), ""))).toEqual([]);
  });
});
