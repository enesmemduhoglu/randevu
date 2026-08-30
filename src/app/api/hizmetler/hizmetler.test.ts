import { expect, test } from "vitest";

import { hataMetni, sahteIstek } from "@/lib/test-istek";

import { POST } from "./route";

// SINANAN DILIM: kapinin CSRF adimi ve govde ayristirma.
//
// Oturum cozumu `cookies()` uzerinden Next'in istek baglamina giriyor;
// vitest'in node ortaminda o baglam yok. Yani "oturumsuz 401" ve mutlu yol
// burada degil, scoped-db katmaninda ve elle sinaniyor:
//   - IDOR ve kapsam: src/lib/scoped-db-hizmet.test.ts (17 test)
//   - alan dogrulama: src/lib/girdi.test.ts (sure ve para bicimi)
//   - kapinin her route'ta bulunmasi: src/lib/degismezler.test.ts
//
// ELLE DOGRULANACAKLAR (`npm run dev`, oturum acikken):
//   - gecerli govde -> 201 ve hizmet listede gorunuyor
//   - oturumsuz -> 401
//   - baska isletmenin hizmet id'siyle PATCH -> 404 (kayit degismiyor)

const istek = (secenekler?: Parameters<typeof sahteIstek>[1]) =>
  sahteIstek("/api/hizmetler", secenekler);

const GECERLI = { ad: "Saç kesimi", sureDk: 45, fiyat: "350" };

test("Origin basligi olmayan istek 403", async () => {
  const yanit = await POST(istek({ origin: null, govde: GECERLI }));
  expect(yanit.status).toBe(403);
});

test("yabanci Origin 403", async () => {
  const yanit = await POST(
    istek({ origin: "https://kotu-site.example", govde: GECERLI }),
  );
  expect(yanit.status).toBe(403);
});

test("403 kapisi oturum sorgusundan ONCE calisiyor", async () => {
  // Sira tersine donseydi bu test `cookies()` firlatarak duserdi. Yani sira
  // bozulmasi sessiz kalmiyor - ve yabanci origin bosuna veritabani sorgusu
  // uretmiyor.
  const yanit = await POST(istek({ origin: "https://kotu-site.example" }));
  expect(yanit.status).toBe(403);
  expect(await hataMetni(yanit)).toBeTruthy();
});
