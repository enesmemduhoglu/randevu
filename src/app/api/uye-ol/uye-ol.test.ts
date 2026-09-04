import { expect, test } from "vitest";

import { hataMetni, sahteIstek } from "@/lib/test-istek";

import { POST } from "./route";

// NEDEN BURADA MUTLU YOL TESTI YOK
//
// Route'un ilk uc adimi (checkOrigin -> govde ayristirma -> girdi dogrulama)
// hicbir dis kaynaga dokunmuyor; sinanan sey tam olarak bu dilim. Dorduncu
// adim Supabase'e HTTP istegi atiyor ve `cookies()` uzerinden Next'in istek
// baglamina giriyor - ikisi de vitest'in node ortaminda yok. Ayni gerekce
// kayit.test.ts ve giris.test.ts'te de yazili; sahte bir Supabase istemcisi
// koysaydik test yalnizca kendi mock'umuzu dogrulardi.
//
// Bu dosyanin dayanagi ADIM SIRASI: dogrulama Supabase'den ONCE bittigi icin
// asagidaki durumlarin hicbiri aga cikmiyor. Sira degisirse testler
// `cookies()` firlatarak duser - yani bozulma sessiz kalmaz.
//
// Musteri kaydinin VERITABANI tarafi ayri sinaniyor: `src/lib/kayit.test.ts`
// icinde `musteriKaydiOlustur` gercek Postgres'e yaziyor.
//
// ELLE DOGRULANACAKLAR (ag gerektiriyor, `npm run dev` ile):
//   - gecerli form -> 200 `{ yon: "/randevularim" }`, `kullanici` satiri
//     rol=MUSTERI ve isletme_id=NULL olarak olusmus
//   - ayni e-posta ikinci kez -> 409 "Bu e-posta ile bir hesap zaten var."
//     (isletme hesabi olan bir adresle denendiginde de AYNI metin - rol
//     sizdirilmiyor)
//   - Supabase'de "Confirm email" acikken -> `{ yon: "/giris", mesaj: ... }`

const istek = (secenekler?: Parameters<typeof sahteIstek>[1]) =>
  sahteIstek("/api/uye-ol", secenekler);

const GECERLI = {
  adSoyad: "Ali Demir",
  eposta: "ali@ornek.com",
  sifre: "cokGizliSifre1",
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

test("bozuk JSON 400", async () => {
  const yanit = await POST(istek({ hamGovde: "{bu json degil" }));
  expect(yanit.status).toBe(400);
});

test("ad soyad bos 400", async () => {
  const yanit = await POST(istek({ govde: { ...GECERLI, adSoyad: "   " } }));
  expect(yanit.status).toBe(400);
  expect(await hataMetni(yanit)).toContain("Ad soyad");
});

test("gecersiz e-posta 400", async () => {
  const yanit = await POST(istek({ govde: { ...GECERLI, eposta: "aliornek" } }));
  expect(yanit.status).toBe(400);
});

test("kisa sifre 400", async () => {
  // Uye olurken TAM sifre kurali gecerli - yeni bir sifre belirleniyor, yani
  // uzunluk sinirini simdi koymanin bedeli yok. (Giriste ayni kontrol
  // yapilmiyor; gerekcesi /api/giris/route.ts'te.)
  const yanit = await POST(istek({ govde: { ...GECERLI, sifre: "kisa" } }));
  expect(yanit.status).toBe(400);
});

test("isletme adi ISTENMIYOR - govde dogrulamayi geciyor", async () => {
  // Bu route musteri aciyor. `/api/kayit`in govdesiyle karistirilip buraya bir
  // isletme adi sarti eklenirse, uye olmak isteyen herkes 400 alirdi.
  //
  // `supabaseSunucu()` cagrildigi icin firlatiyor - ve firlatmasi TESTIN
  // KANITI: uc dogrulama adimi da gecildi, akis Supabase'e ulasti. Bu ayni
  // zamanda ADIM SIRASINI da zorluyor: dogrulama bir gun Supabase'den sonraya
  // kayarsa yukaridaki 400 testleri de burayla birlikte firlatmaya baslar,
  // yani bozulma sessiz kalmaz.
  await expect(POST(istek({ govde: GECERLI }))).rejects.toThrow();
});
