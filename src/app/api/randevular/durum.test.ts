import { expect, test } from "vitest";

import { hataMetni, sahteIstek } from "@/lib/test-istek";

import { PATCH } from "./[id]/durum/route";

// SINANAN DILIM: kapinin CSRF adimi.
//
// Oturum cozumu `cookies()` uzerinden Next'in istek baglamina giriyor;
// vitest'in node ortaminda o baglam yok. Yani "oturumsuz 401", mutlu yol ve
// 409 burada degil, veri katmaninda ve elle sinaniyor:
//   - IDOR, kapsam ve kosullu UPDATE: src/lib/scoped-db-randevu.test.ts
//   - gecis kurallari ve hedef dogrulama: src/lib/randevu-durum.test.ts
//   - kapinin her route'ta bulunmasi: src/lib/degismezler.test.ts
//
// ELLE DOGRULANACAKLAR (`npm run dev`, oturum acikken):
//   - bekleyen randevuya "Onayla" -> 200 ve rozet degisiyor
//   - ayni dugmeye ikinci kez (bayat sekmede) -> 409 ve Turkce aciklama
//   - baska isletmenin randevu id'siyle PATCH -> 404, kayit degismiyor

const istek = (secenekler?: Parameters<typeof sahteIstek>[1]) =>
  sahteIstek("/api/randevular/00000000-0000-4000-8000-000000000000/durum", secenekler);

const baglam = {
  params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }),
} as unknown as RouteContext<"/api/randevular/[id]/durum">;

test("Origin basligi olmayan istek 403", async () => {
  const yanit = await PATCH(istek({ origin: null, govde: { durum: "ONAYLI" } }), baglam);
  expect(yanit.status).toBe(403);
});

test("yabanci Origin 403", async () => {
  const yanit = await PATCH(
    istek({ origin: "https://kotu-site.example", govde: { durum: "ONAYLI" } }),
    baglam,
  );
  expect(yanit.status).toBe(403);
});

test("403 kapisi oturum sorgusundan ONCE calisiyor", async () => {
  // Sira tersine donseydi bu test `cookies()` firlatarak duserdi. Yani sira
  // bozulmasi sessiz kalmiyor - ve yabanci origin bosuna veritabani sorgusu
  // uretmiyor.
  const yanit = await PATCH(istek({ origin: "https://kotu-site.example" }), baglam);
  expect(yanit.status).toBe(403);
  expect(await hataMetni(yanit)).toBeTruthy();
});
