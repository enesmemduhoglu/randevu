import { expect, test } from "vitest";

import { hataMetni, sahteIstek, TEST_HOST } from "@/lib/test-istek";

import { POST } from "./route";

// NEDEN BURADA MUTLU YOL TESTI YOK: verifyOtp/updateUser Supabase'e HTTP
// istegi atiyor ve `cookies()` uzerinden Next'in istek baglamina giriyor -
// giris.test.ts'teki gerekcenin aynisi. Ilk uc adim (checkOrigin -> govde ->
// alan dogrulama) hicbir dis kaynaga dokunmuyor.
//
// ELLE DOGRULANACAKLAR (ag gerektiriyor):
//   - kayitli link -> yeni sifreyle giris calisiyor, eski sifre 401
//   - link ikinci kez kullanilinca -> 400, ayni "gecersiz ya da suresi
//     dolmus" mesaji
//   - ikinci bir cihazdaki oturum dusuyor (scope: "others")
//   - MUSTERI hesabiyla sifirlama -> /randevularim; kullanici satiri olmayan
//     hesap -> /kayit/tamamla

const istek = (secenekler?: Parameters<typeof sahteIstek>[1]) =>
  sahteIstek("/api/sifre/yenile", secenekler);

test("Origin basligi olmayan istek 403", async () => {
  const yanit = await POST(istek({ origin: null }));
  expect(yanit.status).toBe(403);
});

test("yabanci Origin 403", async () => {
  const yanit = await POST(
    istek({
      origin: "https://kotu-site.example",
      govde: { tokenHash: "abc", sifre: "cok-gizli-1" },
    }),
  );
  expect(yanit.status).toBe(403);
});

test("403 govdesi token'i ve TEST_HOST'u yansitmiyor", async () => {
  const yanit = await POST(
    istek({
      origin: "https://kotu-site.example",
      govde: { tokenHash: "gizli-token-degeri" },
    }),
  );
  const metin = await yanit.text();
  expect(metin).not.toContain("gizli-token-degeri");
  expect(metin).not.toContain(TEST_HOST);
});

test("bozuk JSON govdesi 400, firlatmiyor", async () => {
  const yanit = await POST(istek({ hamGovde: "{ bozuk" }));
  expect(yanit.status).toBe(400);
  expect(await hataMetni(yanit)).toContain("İstek okunamadı");
});

test("govde JSON dizisi ise 400", async () => {
  const yanit = await POST(istek({ hamGovde: "[1,2,3]" }));
  expect(yanit.status).toBe(400);
});

test("token_hash yoksa 400, mesaj token'i yansitmiyor", async () => {
  const yanit = await POST(istek({ govde: { sifre: "cok-gizli-1" } }));
  expect(yanit.status).toBe(400);
  expect(await hataMetni(yanit)).toContain("geçersiz ya da süresi dolmuş");
});

test("token_hash bos dize ise 400", async () => {
  const yanit = await POST(
    istek({ govde: { tokenHash: "", sifre: "cok-gizli-1" } }),
  );
  expect(yanit.status).toBe(400);
});

test("token_hash dize degilse 400", async () => {
  const yanit = await POST(
    istek({ govde: { tokenHash: 12345, sifre: "cok-gizli-1" } }),
  );
  expect(yanit.status).toBe(400);
});

test("token_hash 512 karakterden uzunsa 400", async () => {
  const yanit = await POST(
    istek({ govde: { tokenHash: "a".repeat(513), sifre: "cok-gizli-1" } }),
  );
  expect(yanit.status).toBe(400);
});

test("yeni sifre 8 karakterden kisaysa 400 - GIRISTEN FARKLI, tam kural gecerli", async () => {
  // /api/giris'te sifre uzunlugu KONTROL EDILMIYOR (eski hesaplar icin).
  // Burada sifre YENI - tam kural gecmek zorunda. Bu sozlesme farkinin
  // kendisi sinaniyor.
  const yanit = await POST(
    istek({ govde: { tokenHash: "gecerli-gorunen-token", sifre: "kisa" } }),
  );
  expect(yanit.status).toBe(400);
  expect(await hataMetni(yanit)).toContain("en az 8 karakter");
});

test("72 bayti asan sifre 400", async () => {
  const yanit = await POST(
    istek({
      govde: {
        tokenHash: "gecerli-gorunen-token",
        sifre: "a".repeat(73),
      },
    }),
  );
  expect(yanit.status).toBe(400);
});

test("sifre yoksa 400", async () => {
  const yanit = await POST(
    istek({ govde: { tokenHash: "gecerli-gorunen-token" } }),
  );
  expect(yanit.status).toBe(400);
});

test("govdeye fazladan eposta/kullaniciId eklense de sifre dogrulamasindan once eleniyor", async () => {
  // IDOR aciligi: hangi hesabin sifresinin degistigini YALNIZCA token
  // belirliyor. Burada henuz token'a ulasmiyoruz (kisa sifre elemesi once
  // gecikiyor) ama fazladan alanlarin hicbir dala yeni bir yol acmadigini
  // gosteriyor - route govdeden eposta/kullaniciId hic OKUMUYOR.
  const yanit = await POST(
    istek({
      govde: {
        tokenHash: "gecerli-gorunen-token",
        sifre: "kisa",
        eposta: "baskasi@ornek.com",
        kullaniciId: "11111111-1111-1111-1111-111111111111",
      },
    }),
  );
  expect(yanit.status).toBe(400);
});
