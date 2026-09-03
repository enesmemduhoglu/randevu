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

describe("Faz L - kalkanin uretimde acik oldugu", () => {
  // NEDEN YAPILANDIRMA DA SINANIYOR: bu dosyanin geri kalani kodu tariyor,
  // ama Faz L'yi doguran hata KODDA DEGILDI. `turnstile.ts` dogru yazilmisti;
  // `wrangler.jsonc`'de `vars` blogu hic olmadigi icin TURNSTILE_MODU uretimde
  // tanimsiz kaldi, mod `sahte`ye dustu ve bot kapisi aylarca kosulsuz gecirdi.
  //
  // Kod incelemesi bunu yakalamaz: eksik olan sey bir satir degil, bir satirin
  // YOKLUGU. Yokluk ancak arayan bir test tarafindan goruluyor.
  const wrangler = readFileSync(
    join(process.cwd(), "wrangler.jsonc"),
    "utf-8",
  );

  test("Turnstile uretimde gercek modda", () => {
    // turnstile.ts YALNIZCA "gercek" yazan degeri gercek sayiyor; baska her
    // deger - ve tanimsizlik - kapiyi aciyor.
    expect(wrangler).toMatch(/"TURNSTILE_MODU"\s*:\s*"gercek"/);
  });

  test("hiz sinirlayici binding'leri wrangler.jsonc'de tanimli", () => {
    // Binding tanimli degilse `hiz-siniri.ts` sessizce geciriyor - bilerek,
    // cunku yerelde binding yok. Tam da bu gevseklik yuzunden yoklugun
    // uretimde fark edilmeden kalmasi mumkun; bu test o yolu kapatiyor.
    const siniriMetni = readFileSync(
      join(process.cwd(), "src", "lib", "hiz-siniri.ts"),
      "utf-8",
    );

    for (const ad of ["RANDEVU_SINIRI", "MUSAITLIK_SINIRI"]) {
      expect(wrangler).toContain(`"name": "${ad}"`);
      // Iki dosya AYRISMASIN: wrangler'daki binding adiyla koddaki union
      // uyesi ayni olmak zorunda, yoksa `env[ad]` undefined doner ve sinir
      // hicbir uyari vermeden yok olur.
      expect(siniriMetni).toContain(ad);
    }
  });
});

describe("Faz I - bildirim uretimde gercek modda", () => {
  // AYNI DERS, IKINCI KEZ. Faz L'de `TURNSTILE_MODU` wrangler.jsonc'de
  // tanimsiz kaldi ve bot kapisi aylarca sessizce kosulsuz gecirdi. `email.ts`
  // de yalnizca "gercek" yazan degeri gercek sayiyor: bu satir silinirse
  // uretimde hicbir mail gitmez ve kuyruk yine "GONDERILDI" der - yani
  // hatanin hicbir gorunur izi olmaz.
  test("BILDIRIM_MODU wrangler.jsonc'de gercek", () => {
    const wrangler = readFileSync(
      join(process.cwd(), "wrangler.jsonc"),
      "utf-8",
    );
    expect(wrangler).toMatch(/"BILDIRIM_MODU"\s*:\s*"gercek"/);
  });
});

describe("DEGISMEZ 4 - e-posta tek kapidan cikiyor", () => {
  // warden'in PreToolUse kapisi `resend.emails.send` metnini bloklamak icin
  // yazildi; bu depo SDK yerine duz `fetch` kullaniyor, yani o metin hic
  // olusmuyor ve kapi bir sey gormuyor. Zorlama bu yuzden burada: Resend'in
  // ucuna giden cagri YALNIZCA email.ts'te olabilir.
  function tsDosyalari(dizin: string): string[] {
    const bulunan: string[] = [];
    for (const ad of readdirSync(dizin)) {
      const tam = join(dizin, ad);
      if (statSync(tam).isDirectory()) bulunan.push(...tsDosyalari(tam));
      else if (ad.endsWith(".ts") || ad.endsWith(".tsx")) bulunan.push(tam);
    }
    return bulunan;
  }

  const IZINLI = join(process.cwd(), "src", "lib", "email.ts");

  /// BU DOSYANIN KENDISI MUAF. Aradigi metinleri kaciniz gerekmeden yaziyor -
  /// tam da kurali ifade etmek icin. Muaf olmasaydi test kendi varligindan
  /// dolayi kirmizi olurdu ve caresi kurali yazmamak olurdu. Ayni gerekce
  /// asagida dizin.ts taramasinda yorumlarin soyulmasinda da yazili.
  const KENDISI = join(process.cwd(), "src", "lib", "degismezler.test.ts");

  /// YORUMLAR SOYULUYOR - dizin.ts taramasindaki gerekcenin aynisi. `email.ts`
  /// kendi basliginda `resend.emails.send`i ADIYLA aniyor, cunku o cagrinin
  /// neden yasak oldugunu anlatiyor. Ham metin taransaydi test, dogru yazilmis
  /// bir aciklamayi cezalandirirdi.
  function kod(yol: string): string {
    return readFileSync(yol, "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
  }

  function tarananlar(): string[] {
    return tsDosyalari(join(process.cwd(), "src")).filter(
      (yol) => yol !== KENDISI,
    );
  }

  test("api.resend.com yalnizca email.ts'te geciyor", () => {
    const ihlaller = tarananlar().filter(
      (yol) => yol !== IZINLI && kod(yol).includes("api.resend.com"),
    );

    expect(ihlaller.map((y) => y.replace(process.cwd(), ""))).toEqual([]);
  });

  test("SDK bicimindeki dogrudan cagri hicbir yerde yok", () => {
    // Bir gun `resend` paketi eklenirse kapinin metin arayan hali yine ise
    // yarasin diye burada da araniyor.
    const ihlaller = tarananlar().filter((yol) =>
      kod(yol).includes("resend.emails.send"),
    );

    expect(ihlaller.map((y) => y.replace(process.cwd(), ""))).toEqual([]);
  });
});

describe("DEGISMEZ 12 - dizin kapsamsiz okuyor, karsiligi dar olmasi", () => {
  // `src/lib/dizin.ts` bu deponun tek KIRACI-USTU sorgusu: pazaryeri dizini
  // tanimi geregi butun isletmeleri listeliyor, yani DEGISMEZ 1'in kapsama
  // guvencesi orada yok.
  //
  // Karsiligi, sizabilecek yuzeyin dar TUTULMASI. "Dar tutuldu" bir niyet
  // beyani olarak kalirsa alti ay sonra biri karta "son randevu tarihi" ekler
  // ve dizin sessizce musteri verisi donmeye baslar. Bu test o adimi kirmizi
  // yapiyor.
  const dizin = readFileSync(
    join(process.cwd(), "src", "lib", "dizin.ts"),
    "utf-8",
  );

  /// YORUMLAR SOYULUYOR. Dosyanin kendi basligi yasakli tablolari ADIYLA
  /// aniyor - kuralin ne oldugunu anlatmak icin, tam da bu testin korudugu
  /// seyi. Ham metni tarasaydik dogru yazilmis bir aciklama testi kirmiziya
  /// dusururdu ve caresi aciklamayi silmek olurdu; yani test, kendi
  /// gerekcesinin yazilmasini cezalandirirdi.
  const kod = dizin
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  test("yalnizca izinli tablolari import ediyor", () => {
    const eslesme = /import\s*\{([^}]*)\}\s*from\s*["']@\/db\/sema["']/.exec(kod);
    const importlar = (eslesme?.[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // `hizmet` yalnizca TOPLAMA icin (adet, en dusuk fiyat) - tek tek hizmet
    // satiri donmuyor. Bu listeye ekleme yapmak bilincli bir karar olmali.
    expect(importlar.sort()).toEqual(["hizmet", "isletme"]);
  });

  test("kisisel veri tasiyan tablolara hic dokunmuyor", () => {
    // Import listesi degil, DOSYA METNI taraniyor: biri `@/db/sema`yi yildizla
    // import edip `sema.musteri` yazsa yukaridaki test gecerdi.
    for (const yasak of ["musteri", "randevu", "kullanici", "bildirimKuyrugu"]) {
      expect(kod.includes(yasak)).toBe(false);
    }
  });

  test("yalnizca yayindaki ve aktif isletmeleri donuyor", () => {
    // Bu iki kosul dizinin gorunurluk kapisi. Biri silinirse yayina hic
    // cikmamis ya da kapatilmis isletmeler listede belirir.
    expect(kod).toContain("eq(isletme.yayinda, true)");
    expect(kod).toContain("eq(isletme.aktif, true)");
  });

  test("yazma metodu yok - salt okunur", () => {
    // Kapsamsiz bir yazma yolu, yanlis kiraciya yazmanin en kisa yolu olurdu.
    for (const yazma of [".insert(", ".update(", ".delete(", "transaction("]) {
      expect(kod.includes(yazma)).toBe(false);
    }
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
