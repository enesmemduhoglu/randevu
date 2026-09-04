import { expect, test } from "vitest";

import { hataMetni, sahteIstek } from "@/lib/test-istek";

import { POST } from "./route";

// NEDEN BURADA 401 VE MUTLU YOL TESTI YOK
//
// Bu route'un dorduncu adimi `authKimligi()` cagiriyor, o da `cookies()`
// uzerinden Next'in istek baglamina giriyor - vitest'in node ortaminda o
// baglam yok. Yani "oturumsuz 401" bile ancak istek baglami taklit edilerek
// sinanabilirdi ve taklit ettigimiz sey testin kendisi olurdu. Ayni gerekce
// kardes dosyada (`/api/kayit/tamamla`) da yazili.
//
// Sinanan dilim, kimlige HIC dokunmadan biten kisim: checkOrigin, govde
// ayristirma, girdi dogrulama.
//
// ELLE DOGRULANACAKLAR (ag gerektiriyor, `npm run dev` ile):
//   - oturumsuz istek -> 401 "Oturum bulunamadı. Yeniden giriş yapın."
//   - Supabase kimligi olan ama bizde kaydi olmayan kisi -> 200
//     `{ yon: "/randevularim" }` ve `kullanici` satiri rol=MUSTERI,
//     isletme_id=NULL olarak olusmus
//   - kaydi zaten olan kisi -> 409, govdede `yon: "/randevularim"` var
//     (kullanici acisindan is bitmis; form onu cikmazda birakmiyor)
//   - e-posta govdeden DEGIL token'dan aliniyor: govdeye baska bir adres
//     koymak kaydi degistirmiyor
//
// NEDEN BU ROUTE VAR: `/kayit/tamamla` ekrani Faz D'den beri ISLETME aciyor.
// Faz J ikinci bir kayit yolu ekleyince o ekran sessizce yanlis hale geldi -
// musteri kaydi yarida kalan biri oraya gonderiliyor ve "Isletme adi" kutusunu
// dolduruca MUSTERI degil SAHIP oluyordu. `kullanici_auth_user_id` tekil
// oldugu icin bunun geri donusu de yok.

const istek = (secenekler?: Parameters<typeof sahteIstek>[1]) =>
  sahteIstek("/api/uye-ol/tamamla", secenekler);

const GECERLI = { adSoyad: "Ali Demir" };

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
  const yanit = await POST(istek({ hamGovde: "[]" }));
  expect(yanit.status).toBe(400);
});

test("ad soyad bos 400", async () => {
  const yanit = await POST(istek({ govde: { adSoyad: "  " } }));
  expect(yanit.status).toBe(400);
  expect(await hataMetni(yanit)).toContain("Ad soyad");
});

test("isletme adi SORULMUYOR - kimlige kadar ilerliyor", async () => {
  // Kardes route (`/api/kayit/tamamla`) burada 400 doner cunku isletme adi
  // sart. Bu route'un ayri olmasinin butun sebebi bu fark; ayni govdeyle iki
  // ayri davranis, ikisinin gercekten ayri kaldigini gosteriyor.
  //
  // `authKimligi()` cagrildigi icin firlatiyor - ve firlatmasi TESTIN
  // KANITI: dogrulama gecildi, akis kimlik adimina ulasti.
  await expect(POST(istek({ govde: GECERLI }))).rejects.toThrow();
});
