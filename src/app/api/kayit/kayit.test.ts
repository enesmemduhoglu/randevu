import { expect, test } from "vitest";

import { hataMetni, sahteIstek, TEST_HOST } from "@/lib/test-istek";

import { POST } from "./route";

// NEDEN BURADA MUTLU YOL TESTI YOK
//
// Route'un ilk uc adimi (checkOrigin -> govde ayristirma -> girdi dogrulama)
// hicbir dis kaynaga dokunmuyor; sinanan sey tam olarak bu dilim. Dorduncu
// adim Supabase'de HESAP ACIYOR - test kosumunda gercekten hesap acmak, hem
// aga bagimli hem de temizlenmesi imkansiz bir yan etki olurdu.
//
// Dogrulamanin hesap acmadan ONCE bitmesi ayrica bir urun karari: gecersiz bir
// isletme adiyla acilmis Supabase hesabi geri alinamaz, sahipsiz kalirdi.
// Asagidaki testler o sirayi kilitliyor - sira bozulursa `cookies()` firlatir.
//
// ELLE DOGRULANACAKLAR (ag gerektiriyor, `npm run dev` ile):
//   - yeni e-posta -> 200 `{ yon: "/panel" }`, isletme + kullanici + personel
//     uclusu olusmus, slug isletme adindan uretilmis
//   - ayni e-posta ikinci kez -> 409 "Bu e-posta ile bir hesap zaten var"
//   - Supabase'de Confirm email ACIKKEN -> 200 `{ yon: "/giris", mesaj: ... }`

const istek = (secenekler?: Parameters<typeof sahteIstek>[1]) =>
  sahteIstek("/api/kayit", secenekler);

const GECERLI = {
  isletmeAdi: "Işıl Güzellik",
  adSoyad: "Ayşe Yılmaz",
  eposta: "ayse@ornek.com",
  sifre: "cok-gizli-1",
};

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

test("403 govdesi girilen bilgileri geri yansitmiyor", async () => {
  // DEGISMEZ 5. Reddedilen istegin govdesi sifre tasiyor; yaniti olustururken
  // istegin hicbir parcasi kopyalanmamali.
  const yanit = await POST(
    istek({ origin: "https://kotu-site.example", govde: GECERLI }),
  );

  const metin = await yanit.text();
  expect(metin).not.toContain(GECERLI.sifre);
  expect(metin).not.toContain(GECERLI.eposta);
  expect(metin).not.toContain(TEST_HOST);
});

test("bozuk JSON govdesi 400, firlatmiyor", async () => {
  const yanit = await POST(istek({ hamGovde: "{ bozuk" }));
  expect(yanit.status).toBe(400);
  expect(await hataMetni(yanit)).toContain("İstek okunamadı");
});

test("isletme adi yoksa 400 ve hata alan adini soyluyor", async () => {
  // undefined veren alan JSON.stringify'da HIC yazilmiyor: sunucu tam da
  // sinamak istedigimiz sekilde eksik alan goruyor.
  const yanit = await POST(
    istek({ govde: { ...GECERLI, isletmeAdi: undefined } }),
  );

  expect(yanit.status).toBe(400);
  expect(await hataMetni(yanit)).toContain("İşletme adı");
});

test("ad soyad yoksa 400", async () => {
  const yanit = await POST(istek({ govde: { ...GECERLI, adSoyad: undefined } }));

  expect(yanit.status).toBe(400);
  expect(await hataMetni(yanit)).toContain("Ad soyad");
});

test("bicimsiz e-posta 400", async () => {
  const yanit = await POST(
    istek({ govde: { ...GECERLI, eposta: "ayse-at-ornek" } }),
  );

  expect(yanit.status).toBe(400);
  expect(await hataMetni(yanit)).toContain("E-posta adresi eksik görünüyor");
});

test("kisa sifre 400 ve kural ACIKCA yaziliyor", async () => {
  // Giristen farkli olarak burada uzunluk kuralini soylemek dogru: kullanici
  // YENI bir sifre belirliyor, yani kurali simdi ogrenmesi gerekiyor.
  const yanit = await POST(istek({ govde: { ...GECERLI, sifre: "kisa12" } }));

  expect(yanit.status).toBe(400);
  expect(await hataMetni(yanit)).toContain("8");
});

test("72 bayti asan sifre 400 - hesap acilmadan once eleniyor", async () => {
  // bcrypt 72 bayttan sonrasini sessizce atiyor. Buraya kadar gelirse hesap
  // kullanicinin yazdigindan farkli bir sifreyle acilmis olurdu.
  const yanit = await POST(
    istek({ govde: { ...GECERLI, sifre: "ş".repeat(40) } }),
  );

  expect(yanit.status).toBe(400);
});

test("dogrulama sirasi yukaridan asagi", async () => {
  // Butun alanlar eksikken formdaki ILK alanin hatasi donuyor; kullanicinin
  // gozu formda yukaridan asagi ilerliyor.
  const yanit = await POST(istek({ govde: {} }));
  expect(await hataMetni(yanit)).toContain("İşletme adı");
});
