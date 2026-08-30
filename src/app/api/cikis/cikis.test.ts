import { expect, test } from "vitest";

import { sahteIstek } from "@/lib/test-istek";

import { POST } from "./route";

// Cikis'in govdesi yok, yani sinanabilen tek dilim CSRF kapisi.
//
// Bu kapinin burada olmasi sadece bir bicim kurali degil: cikis durum
// degistiren bir islem ve korunmasaydi yabanci bir sayfadaki gizli form
// kullaniciyi habersiz oturumdan atardi. Zararsiz gorunen ama sinir bozucu bir
// saldiri - ve ayni kapinin oldugunu her mutasyon route'unda kanitlamak
// istiyoruz.
//
// ELLE DOGRULANACAK (ag ve istek baglami gerektiriyor):
//   - oturum acikken POST -> 200 `{ yon: "/giris" }` ve yanitta `sb-*`
//     cookie'leri silinmis (Max-Age=0) olarak geliyor
//   - cikistan sonra /panel'e gitmek /giris'e yonlendiriyor

const istek = (secenekler?: Parameters<typeof sahteIstek>[1]) =>
  sahteIstek("/api/cikis", secenekler);

test("Origin basligi olmayan istek 403", async () => {
  const yanit = await POST(istek({ origin: null }));
  expect(yanit.status).toBe(403);
});

test("yabanci Origin 403", async () => {
  const yanit = await POST(istek({ origin: "https://kotu-site.example" }));
  expect(yanit.status).toBe(403);
});

test("403 yaniti Supabase'e hic gitmeden donuyor", async () => {
  // checkOrigin ilk satirda. Sonraki satir `supabaseSunucu()` cagiriyor ve o
  // `cookies()` uzerinden Next'in istek baglamina giriyor - vitest'te olmayan
  // bir baglam. Yani bu test 403 gorebiliyorsa, kapi gercekten en onde.
  const yanit = await POST(istek({ origin: "https://kotu-site.example" }));
  expect(yanit.status).toBe(403);
});
