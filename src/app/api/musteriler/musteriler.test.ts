import { expect, test } from "vitest";

import { hataMetni, sahteIstek } from "@/lib/test-istek";

import { DELETE } from "./[id]/kisit/route";
import { PATCH } from "./[id]/route";

// SINANAN DILIM: kapinin CSRF adimi (Faz H2, ikinci yari).
//
// Ayni gerekce `randevular.test.ts`te yazili - oturum cozumu `cookies()`
// uzerinden Next'in istek baglamina giriyor ve vitest'in node ortaminda o
// baglam yok. Yani "oturumsuz 401", mutlu yol, IDOR ve 409 burada degil, veri
// katmaninda sinaniyor:
//   - IDOR, kisit kaldirmanin uc sonucu: src/lib/scoped-db-musteri.test.ts
//   - govde dogrulamasi: src/lib/musteri-girdi.test.ts
//   - kapinin her route'ta bulunmasi: src/lib/degismezler.test.ts
//
// ELLE DOGRULANACAKLAR (`npm run dev`, oturum acikken):
//   - musteri listesi acilir, arama ad ve telefonla suzer
//   - "Düzenle" -> ad/e-posta/not kaydedilir, telefon alani YOK
//   - GELMEDI isaretli musteride kisit karti gorunur, "Kısıtı kaldır" calisir
//   - baska isletmenin musteri id'siyle acilan detay -> 404

const KIMLIK = "00000000-0000-4000-8000-000000000000";

const baglam = {
  params: Promise.resolve({ id: KIMLIK }),
} as unknown as RouteContext<"/api/musteriler/[id]">;

const kisitBaglami = {
  params: Promise.resolve({ id: KIMLIK }),
} as unknown as RouteContext<"/api/musteriler/[id]/kisit">;

const istek = (secenekler?: Parameters<typeof sahteIstek>[1]) =>
  sahteIstek(`/api/musteriler/${KIMLIK}`, secenekler);

test("PATCH: Origin basligi olmayan istek 403", async () => {
  const yanit = await PATCH(istek({ origin: null, govde: { ad: "x" } }), baglam);
  expect(yanit.status).toBe(403);
});

test("PATCH: yabanci Origin 403", async () => {
  const yanit = await PATCH(
    istek({ origin: "https://kotu-site.example", govde: { ad: "x" } }),
    baglam,
  );
  expect(yanit.status).toBe(403);
});

test("PATCH: 403 kapisi oturum sorgusundan ONCE calisiyor", async () => {
  // Sira tersine donseydi bu test `cookies()` firlatarak duserdi. Yani sira
  // bozulmasi sessiz kalmiyor - ve yabanci origin bosuna veritabani sorgusu
  // uretmiyor.
  const yanit = await PATCH(istek({ origin: "https://kotu-site.example" }), baglam);
  expect(yanit.status).toBe(403);
  expect(await hataMetni(yanit)).toBeTruthy();
});

test("DELETE kisit: Origin basligi olmayan istek 403", async () => {
  const yanit = await DELETE(istek({ origin: null }), kisitBaglami);
  expect(yanit.status).toBe(403);
});

test("DELETE kisit: yabanci Origin 403", async () => {
  const yanit = await DELETE(
    istek({ origin: "https://kotu-site.example" }),
    kisitBaglami,
  );
  expect(yanit.status).toBe(403);
  expect(await hataMetni(yanit)).toBeTruthy();
});
