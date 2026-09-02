import { expect, test } from "vitest";

import { hataMetni, sahteIstek } from "@/lib/test-istek";

import { PATCH } from "./route";

// SINANAN DILIM: kapinin CSRF adimi.
//
// Oturum cozumu `cookies()` uzerinden Next'in istek baglamina giriyor;
// vitest'in node ortaminda o baglam yok. Yani "oturumsuz 401", mutlu yol ve
// eksik profil 409'u burada degil, scoped-db katmaninda sinaniyor:
//   - `yayindaAyarla`nin on kosullari ve kiraci kapsami: src/lib/dizin.test.ts
//   - kapinin her route'ta bulunmasi: src/lib/degismezler.test.ts
//
// ELLE DOGRULANACAKLAR (`npm run dev`, oturum acikken):
//   - eksik profille "Dizine ekle" -> 409 ve eksikler listesi ekranda
//   - profil tamamken -> 200, kart "Yayında" oluyor ve /dizin'de goruluyor
//   - oturumsuz -> 401
//   - `{ yayinda: "evet" }` -> 400 ("Dizin durumu okunamadı"); bu kontrol
//     oturumdan SONRA kostugu icin burada sinanamiyor

const istek = (secenekler?: Parameters<typeof sahteIstek>[1]) =>
  sahteIstek("/api/dizin", secenekler);

test("Origin basligi olmayan istek 403", async () => {
  const yanit = await PATCH(istek({ origin: null, govde: { yayinda: true } }));
  expect(yanit.status).toBe(403);
});

test("yabanci Origin 403", async () => {
  const yanit = await PATCH(
    istek({ origin: "https://kotu-site.example", govde: { yayinda: true } }),
  );
  expect(yanit.status).toBe(403);
});

test("403 kapisi oturum sorgusundan ONCE calisiyor", async () => {
  // Sira tersine donseydi bu test `cookies()` firlatarak duserdi.
  const yanit = await PATCH(istek({ origin: "https://kotu-site.example" }));
  expect(yanit.status).toBe(403);
  expect(await hataMetni(yanit)).toBeTruthy();
});
