import { expect, test } from "vitest";

import { hataMetni, sahteIstek, TEST_HOST } from "@/lib/test-istek";

import { POST } from "./route";

// NEDEN BURADA MUTLU YOL TESTI YOK: dorduncu adim (Turnstile dogrulamasi ya
// da Supabase'e giden resetPasswordForEmail cagrisi) aga cikiyor. Ilk uc adim
// (checkOrigin -> hiz siniri -> govde -> Turnstile) hicbir dis kaynaga
// dokunmuyor - giris.test.ts'teki gerekcenin aynisi.
//
// ELLE DOGRULANACAKLAR (ag gerektiriyor, custom SMTP kurulduktan sonra):
//   - kayitli adres -> mail geliyor, link /sifre-yenile?token_hash=... bicimde
//   - kayitsiz adres -> AYNI ekran, mail yok
//   - basari yanitinda istekteki e-posta hicbir sekilde gecmiyor

const istek = (secenekler?: Parameters<typeof sahteIstek>[1]) =>
  sahteIstek("/api/sifre/sifirla", secenekler);

test("Origin basligi olmayan istek 403", async () => {
  const yanit = await POST(istek({ origin: null }));
  expect(yanit.status).toBe(403);
});

test("yabanci Origin 403", async () => {
  const yanit = await POST(
    istek({ origin: "https://kotu-site.example", govde: { eposta: "ayse@ornek.com" } }),
  );
  expect(yanit.status).toBe(403);
});

test("403 govdesi istekteki e-postayi ve TEST_HOST'u yansitmiyor", async () => {
  // DEGISMEZ 5, giris.test.ts'teki testin aynisi.
  const yanit = await POST(
    istek({ origin: "https://kotu-site.example", govde: { eposta: "ayse@ornek.com" } }),
  );
  const metin = await yanit.text();
  expect(metin).not.toContain("ayse@ornek.com");
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
