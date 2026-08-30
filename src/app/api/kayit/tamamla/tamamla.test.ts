import { expect, test } from "vitest";

import { hataMetni, sahteIstek } from "@/lib/test-istek";

import { POST } from "./route";

// NEDEN BURADA 401 VE MUTLU YOL TESTI YOK
//
// Bu route'un dorduncu adimi `authKimligi()` cagiriyor, o da `cookies()`
// uzerinden Next'in istek baglamina giriyor - vitest'in node ortaminda o
// baglam yok. Yani "oturumsuz 401" bile ancak istek baglami taklit edilerek
// sinanabilirdi ve taklit ettigimiz sey testin kendisi olurdu.
//
// Sinanan dilim, kimlige HIC dokunmadan biten kisim: checkOrigin, govde
// ayristirma, girdi dogrulama.
//
// ELLE DOGRULANACAKLAR (ag gerektiriyor, `npm run dev` ile):
//   - oturumsuz istek -> 401 "Oturum bulunamadı. Yeniden giriş yapın."
//   - Supabase kimligi olan ama bizde kaydi olmayan kisi -> 200 `{ yon: "/panel" }`
//     ve isletme + kullanici + personel uclusu olusmus
//   - kaydi zaten tam olan kisi -> 409, govdede `yon: "/panel"` var (kullanici
//     acisindan is bitmis; form onu cikmazda birakmiyor)
//   - e-posta govdeden DEGIL token'dan aliniyor: govdeye baska bir adres
//     koymak kaydi degistirmiyor

const istek = (secenekler?: Parameters<typeof sahteIstek>[1]) =>
  sahteIstek("/api/kayit/tamamla", secenekler);

const GECERLI = { isletmeAdi: "Çağdaş Berber", adSoyad: "Ali Demir" };

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

test("bozuk JSON govdesi 400, firlatmiyor", async () => {
  const yanit = await POST(istek({ hamGovde: "bozuk" }));
  expect(yanit.status).toBe(400);
  expect(await hataMetni(yanit)).toContain("İstek okunamadı");
});

test("isletme adi yoksa 400 - kimlik hic sorulmadan", async () => {
  // Dogrulamanin kimlikten ONCE bitmesi bu testin dayanagi: `authKimligi()`
  // cagrilsaydi `cookies()` firlatir, test 400 yerine hata alirdi.
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

test("tek harflik isletme adi 400", async () => {
  const yanit = await POST(istek({ govde: { ...GECERLI, isletmeAdi: "A" } }));
  expect(yanit.status).toBe(400);
});
