import { expect, test } from "vitest";

import { hataMetni, sahteIstek, TEST_HOST } from "@/lib/test-istek";

import { POST } from "./route";

// NEDEN BURADA MUTLU YOL TESTI YOK
//
// Route'un ilk uc adimi (checkOrigin -> govde ayristirma -> girdi dogrulama)
// hicbir dis kaynaga dokunmuyor; sinanan sey tam olarak bu dilim. Dorduncu
// adim Supabase'e HTTP istegi atiyor ve `cookies()` uzerinden Next'in istek
// baglamina giriyor - ikisi de vitest'in node ortaminda yok. Sahte bir
// Supabase istemcisi koyup "mutlu yol"u test etseydik, test yalnizca kendi
// mock'umuzu dogrulamis olurdu.
//
// Bu dosyanin dayanagi ADIM SIRASI: dogrulama Supabase'den ONCE bittigi icin
// asagidaki durumlarin hicbiri aga cikmiyor. Sira degisirse testler
// `cookies()` firlatarak duser - yani bozulma sessiz kalmaz.
//
// ELLE DOGRULANACAKLAR (ag gerektiriyor, `npm run dev` ile):
//   - dogru e-posta + sifre -> 200 `{ yon: "/panel" }` ve `sb-*` cookie'leri
//     yanitta geliyor
//   - yanlis sifre -> 401 `{ hata: "E-posta ya da sifre hatali" }`, govdede
//     Supabase'in kendi metni YOK
//   - Supabase'de hesabi olup bizde `kullanici` satiri olmayan kisi ->
//     `{ yon: "/kayit/tamamla" }`
//   - `devam=/panel/randevular` -> o yola donuyor; `devam=//kotu.site` ->
//     `/panel`e dusuyor (guvenliYol kapisi)
//   - sekiz karakterden KISA bir sifreyle var olan bir hesaba giris CALISIYOR
//     (giriste sifre uzunluk kurali uygulanmiyor - bkz. route.ts'teki gerekce)

const istek = (secenekler?: Parameters<typeof sahteIstek>[1]) =>
  sahteIstek("/api/giris", secenekler);

test("Origin basligi olmayan istek 403", async () => {
  // Eksik bilgide "gecir" degil "durdur". Govde Supabase'e hic ulasmiyor -
  // ulassaydi bu test `cookies()` firlatarak duserdi.
  const yanit = await POST(istek({ origin: null }));

  expect(yanit.status).toBe(403);
  expect(await hataMetni(yanit)).toBeTruthy();
});

test("yabanci Origin 403", async () => {
  const yanit = await POST(
    istek({
      origin: "https://kotu-site.example",
      govde: { eposta: "ayse@ornek.com", sifre: "cok-gizli-1" },
    }),
  );

  expect(yanit.status).toBe(403);
});

test("403 govdesi gecerli kimlik bilgisi olsa bile sizinti yapmiyor", async () => {
  // DEGISMEZ 5: reddedilen istegin govdesinde ne beklenen origin ne de
  // istegin tasidigi e-posta geri yansitiliyor.
  const yanit = await POST(
    istek({ origin: "https://kotu-site.example", govde: { eposta: "ayse@ornek.com" } }),
  );

  const metin = await yanit.text();
  expect(metin).not.toContain("ayse@ornek.com");
  expect(metin).not.toContain(TEST_HOST);
});

test("bozuk JSON govdesi 400, firlatmiyor", async () => {
  // Ayristirma firlatsaydi kullanici 500 gorurdu: "sunucu bozuk" mesaji, oysa
  // bozuk olan istek.
  const yanit = await POST(istek({ hamGovde: "{ bozuk" }));

  expect(yanit.status).toBe(400);
  expect(await hataMetni(yanit)).toContain("İstek okunamadı");
});

test("govde JSON dizisi ise 400", async () => {
  // Gecerli JSON ama nesne degil; alan okumaya calismadan once elenmeli.
  const yanit = await POST(istek({ hamGovde: "[1,2,3]" }));

  expect(yanit.status).toBe(400);
});

test("e-posta yoksa 400 ve Turkce hata", async () => {
  const yanit = await POST(istek({ govde: { sifre: "cok-gizli-1" } }));

  expect(yanit.status).toBe(400);
  expect(await hataMetni(yanit)).toBe("E-posta gerekli");
});

test("e-posta bicimsizse 400", async () => {
  const yanit = await POST(
    istek({ govde: { eposta: "ayse-ornek-nokta-com", sifre: "cok-gizli-1" } }),
  );

  expect(yanit.status).toBe(400);
  expect(await hataMetni(yanit)).toContain("E-posta adresi eksik görünüyor");
});

test("sifre yoksa 400 ve mesaj uzunluk kurali ANLATMIYOR", async () => {
  // Giriste "en az 8 karakter" demek yaniltici olurdu: var olan bir hesabin
  // sifresi kisa olabilir ve sorun uzunluk degil, alanin bos olmasi.
  const yanit = await POST(istek({ govde: { eposta: "ayse@ornek.com" } }));

  expect(yanit.status).toBe(400);
  const metin = await hataMetni(yanit);
  expect(metin).toBe("Şifre gerekli");
  expect(metin).not.toContain("8");
});

test("sifre bos dize ise 400", async () => {
  const yanit = await POST(
    istek({ govde: { eposta: "ayse@ornek.com", sifre: "" } }),
  );

  expect(yanit.status).toBe(400);
  expect(await hataMetni(yanit)).toBe("Şifre gerekli");
});

test("e-posta hatasi sifre hatasindan once bildiriliyor", async () => {
  // Ikisi de eksikken kullaniciya ustteki alanin hatasi gosteriliyor; form
  // odagi yukaridan asagi ilerliyor.
  const yanit = await POST(istek({ govde: {} }));

  expect(await hataMetni(yanit)).toBe("E-posta gerekli");
});
