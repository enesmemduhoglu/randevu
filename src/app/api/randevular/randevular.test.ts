import { expect, test } from "vitest";

import { hataMetni, sahteIstek } from "@/lib/test-istek";

import { POST } from "./route";

// SINANAN DILIM: kapinin CSRF adimi (Faz H2).
//
// Ayni gerekce `durum.test.ts`te yazili - oturum cozumu `cookies()` uzerinden
// Next'in istek baglamina giriyor ve vitest'in node ortaminda o baglam yok.
// Yani "oturumsuz 401", mutlu yol, IDOR ve 409 burada degil, veri katmaninda
// sinaniyor:
//   - IDOR, cakisma, kisitlarin uygulanmadigi: src/lib/scoped-db-elle-randevu.test.ts
//   - govde dogrulamasi: src/lib/panel-randevu-girdi.test.ts
//   - bildirim satirlari: src/lib/bildirim.test.ts
//   - kapinin her route'ta bulunmasi: src/lib/degismezler.test.ts
//
// ELLE DOGRULANACAKLAR (`npm run dev`, oturum acikken):
//   - uygun bir saat secip ekle -> 201, takvimde ISLETME kaynakli randevu
//   - "Başka saat" ile calisma saati disi -> once 409 + onay, sonra 201
//   - dolu bir saate serbest yazma -> 409, "başka bir randevusu var"
//   - baska isletmenin personel id'siyle POST -> 404

const istek = (secenekler?: Parameters<typeof sahteIstek>[1]) =>
  sahteIstek("/api/randevular", secenekler);

test("Origin basligi olmayan istek 403", async () => {
  const yanit = await POST(istek({ origin: null, govde: { hizmetId: "x" } }));
  expect(yanit.status).toBe(403);
});

test("yabanci Origin 403", async () => {
  const yanit = await POST(
    istek({ origin: "https://kotu-site.example", govde: { hizmetId: "x" } }),
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
