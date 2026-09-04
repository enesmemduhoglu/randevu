import { expect, test } from "vitest";

import { hataMetni, sahteIstek } from "@/lib/test-istek";

import { POST } from "./route";

// SINANAN DILIM: kimlige hic dokunmadan biten kisim - checkOrigin, govde
// ayristirma ve token BICIM kontrolu. Dorduncu adim `auth()` cagiriyor, o da
// `cookies()` uzerinden Next'in istek baglamina giriyor ve vitest'in node
// ortaminda o baglam yok (ayni gerekce giris.test.ts'te uzun uzun yazili).
//
// IDOR VE SAHIPLIK KURALLARI NEREDE SINANIYOR: `src/lib/musteri-db.test.ts`.
// Bu route'un sizdirmama guvencesi tamamen `randevuyuHesabaEkle`nin `where`
// kosullarina dayaniyor - route oturumdan kimligi aliyor ve baska bir sey
// yapmiyor. Orada iki AYRI hesap kurulup birinin randevusu digerinin
// kimligiyle sahiplenilmeye calisiliyor ve calinamadigi goruluyor; ustelik o
// test filtrenin KENDISINI kosuyor, burada yazilabilecek bir test ise yalnizca
// cagrilip cagrilmadigini gosterirdi.
//
// ELLE DOGRULANACAKLAR (`npm run dev` ile, uye olmus bir hesapla):
//   - oturumsuz istek -> 401
//   - kendi randevusunun linki -> 200 `{ eklendi: true }` ve randevu
//     /randevularim listesinde beliriyor
//   - ayni link ikinci kez -> yine 200 (hata DEGIL; kullanici acisindan is
//     zaten bitmis)
//   - baska bir hesaba bagli randevunun linki -> 409 ve mesaj randevu
//     hakkinda hicbir sey soylemiyor (isletme, saat, sahip yok)
//   - tam URL yapistirmak da calisiyor: istemci son yol parcasini ayikliyor

const istek = (secenekler?: Parameters<typeof sahteIstek>[1]) =>
  sahteIstek("/api/randevularim/ekle", secenekler);

/// Bicimi tutan ama uretilmemis token: harfler `iptal-token.ts` alfabesinde ve
/// uzunluk tam 32.
const GECERLI_BICIM = "a".repeat(32);

test("Origin basligi olmayan istek 403", async () => {
  const yanit = await POST(istek({ origin: null, govde: { token: GECERLI_BICIM } }));
  expect(yanit.status).toBe(403);
});

test("yabanci Origin 403", async () => {
  const yanit = await POST(
    istek({
      origin: "https://kotu-site.example",
      govde: { token: GECERLI_BICIM },
    }),
  );
  expect(yanit.status).toBe(403);
});

test("bozuk JSON 400", async () => {
  const yanit = await POST(istek({ hamGovde: "{bu json degil" }));
  expect(yanit.status).toBe(400);
});

test("token yok 400", async () => {
  const yanit = await POST(istek({ govde: {} }));
  expect(yanit.status).toBe(400);
});

test("kisa token 400 - veritabanina hic sorulmuyor", async () => {
  // Bicim kontrolu KIMLIKTEN ONCE: bozuk bir link oturum sorgusu actirmiyor.
  // Testin gecmesi bunu ayrica kanitliyor - `auth()` cagrilsaydi `cookies()`
  // firlatirdi ve bu test 400 yerine hata alirdi.
  const yanit = await POST(istek({ govde: { token: "abc" } }));
  expect(yanit.status).toBe(400);
});

test("alfabede olmayan karakter tasiyan token 400", async () => {
  // "0" ve "1" karisan karakterler oldugu icin alfabeye hic alinmadi
  // (bkz. iptal-token.ts).
  const yanit = await POST(istek({ govde: { token: "0".repeat(32) } }));
  expect(yanit.status).toBe(400);
});

test("metin olmayan token 400", async () => {
  const yanit = await POST(istek({ govde: { token: 12345 } }));
  expect(yanit.status).toBe(400);
});

test("hata metni token'in KENDISINI tasimiyor", async () => {
  // DEGISMEZ 5: hata metinleri log'lara ve tarayici gecmisine dusuyor, oysa bu
  // deger tek basina yetki tasiyor.
  const yanit = await POST(istek({ govde: { token: GECERLI_BICIM.slice(0, 10) } }));
  expect(await hataMetni(yanit)).not.toContain("aaaa");
});

test("bicimi tutan token kimlik adimina ULASIYOR", async () => {
  // `auth()` cagrildigi icin firlatiyor - ve firlatmasi testin kaniti: bicim
  // kapisi gecildi. Ayni zamanda ADIM SIRASINI zorluyor; sira degisirse
  // yukaridaki 400 testleri de firlatmaya baslar ve bozulma sessiz kalmaz.
  await expect(POST(istek({ govde: { token: GECERLI_BICIM } }))).rejects.toThrow();
});
