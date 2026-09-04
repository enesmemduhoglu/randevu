import { expect, test } from "vitest";

import { sahteIstek } from "@/lib/test-istek";

import { POST } from "./route";

// SINANAN DILIM: yalnizca CSRF kapisi. Bu route'un IKINCI adimi `auth()`
// cagiriyor, o da `cookies()` uzerinden Next'in istek baglamina giriyor ve
// vitest'in node ortaminda o baglam yok.
//
// KIMLIK NEDEN BICIM KONTROLUNDEN ONCE: kardes route (`/api/randevularim/ekle`)
// bicim kontrolunu kimlikten once yapiyor ve bu bilincli bir fark. Orada
// kontrol edilen sey bir SIR (iptal token'i) ve bozuk bir linkin oturum sorgusu
// actirmasini engellemek, ayrica zamanlama farkindan token uzunlugunu okumayi
// zorlastirmak istiyoruz. Burada kontrol edilen sey ise sira gelmis bir randevu
// kimligi - gizli degil, ve oturumsuz bir cagirana 401 yerine 404 donmek
// dogru cevabi degistirmeden yaniltici olurdu.
//
// IDOR, YARISAN IKINCI KARAR VE 404/409 AYRIMI NEREDE SINANIYOR:
// `src/lib/musteri-db.test.ts`. Bu route'un guvencesi tamamen
// `randevuIptalEt`in `where` kosuluna dayaniyor - route oturumdan kimligi
// aliyor ve sonucu HTTP koduna ceviriyor. Orada iki AYRI hesap kuruluyor,
// birinin randevusu digerinin kimligiyle iptal edilmeye calisiliyor, `null`
// dondugu VE randevunun gercekten ONAYLI kaldigi goruluyor; ayrica iki
// eszamanli iptalden tam olarak birinin kazandigi (DEGISMEZ 3) sinaniyor.
//
// ELLE DOGRULANACAKLAR (`npm run dev` ile, uye olmus bir hesapla):
//   - oturumsuz istek -> 401
//   - kendi aktif randevusu -> 200 `{ iptal: true }`, liste tazelenince
//     "Gecmis" bolumunde IPTAL rozetiyle goruluyor
//   - ayni randevu ikinci kez -> 409 "Bu randevu iptal edilmiş..."
//   - baskasinin randevu id'si -> 404 (var olmayan bir id ile AYNI cevap)
//   - iptalden sonra isletmenin bildirim kuyruguna iptal mesajlari dusuyor ve
//     bekleyen hatirlatma dusuruluyor (/panel/gelistirici/bildirimler)

const RANDEVU_ID = "11111111-1111-4111-8111-111111111111";

const istek = (secenekler?: Parameters<typeof sahteIstek>[1]) =>
  sahteIstek(`/api/randevularim/${RANDEVU_ID}/iptal`, secenekler);

/// Route `ctx.params`i bekliyor; testte elle veriliyor.
const baglam = { params: Promise.resolve({ id: RANDEVU_ID }) };

test("Origin basligi olmayan istek 403", async () => {
  const yanit = await POST(istek({ origin: null }), baglam);
  expect(yanit.status).toBe(403);
});

test("yabanci Origin 403", async () => {
  const yanit = await POST(
    istek({ origin: "https://kotu-site.example" }),
    baglam,
  );
  expect(yanit.status).toBe(403);
});

test("CSRF kapisi ILK SATIRDA - kimlige hic gidilmiyor", async () => {
  // Yukaridaki iki testin GECIYOR olmasi zaten bunun kaniti: `auth()`
  // cagrilsaydi `cookies()` firlatirdi ve 403 yerine hata alirdik. Bu test o
  // cikarimi acikca yaziyor, cunku 403 bekleyen bir test yanlis sebeple de
  // yesil kalabilir ve sirayi koruyan sey bu dosyada baska bir yerde yazili
  // degil.
  await expect(
    POST(istek({ origin: "https://kotu-site.example" }), baglam),
  ).resolves.toBeInstanceOf(Response);
});

test("mesru origin kimlik adimina ULASIYOR", async () => {
  // Firlatmasi testin kaniti: CSRF kapisi gecildi. Ayni zamanda ADIM SIRASINI
  // zorluyor - kimlik bir gun CSRF'ten oncesine kayarsa yukaridaki 403
  // testleri de firlatmaya baslar ve bozulma sessiz kalmaz.
  await expect(POST(istek(), baglam)).rejects.toThrow();
});
