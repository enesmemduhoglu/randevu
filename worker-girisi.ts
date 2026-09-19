// Worker'in giris noktasi (`wrangler.jsonc > main`): OpenNext'in urettigi
// Worker'a Cron Trigger ekliyor.
//
// NEDEN AYRI BIR WORKER DEGIL: plan Faz K'nin hatirlaticisini ayri bir
// Worker'a koymustu, gerekcesi "`scheduled`'i OpenNext'in Worker'ina iliştirmek
// adaptorun ic yapisina bagimlilik yaratir" idi. OpenNext bu deseni artik
// kendisi belgeliyor (opennext.js.org/cloudflare/howtos/custom-worker) ve
// bagimlilik tek bir import'tan ibaret. Ayri Worker ise ikinci bir yayin
// adimi, ikinci bir sir seti ve ikinci bir wrangler dosyasi demekti.
//
// `fetch` DOKUNULMADAN geciriliyor ve adlandirilmis export'lar (Durable Object
// siniflari) `export *` ile aynen cikiyor: OpenNext ileride yeni bir sinif
// eklerse burada unutulmasin.

// `.open-next/worker.js` `cf:kur` ile uretiliyor; CI'in tip adimi ondan once
// kosuyor. `@ts-expect-error` olmuyor: yerelde build sonrasi dosya var ve tsc
// "kullanilmayan yonerge" hatasi veriyor.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import openNext from "./.open-next/worker.js";
import {
  hatirlaticiyiTetikle,
  nabziTetikle,
  type ZamanlayiciOrtami,
} from "./src/lib/zamanlayici";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export * from "./.open-next/worker.js";

const giris = {
  fetch: openNext.fetch,

  // TEK TETIK, IKI IS (`wrangler.jsonc > triggers.crons`, 30 dakika). Faz K
  // ikinci bir tetik eklemedi: ucretsiz planda hesap basina 5 tetik var ve
  // hatirlatmanin 30 dakikalik cozunurlugu nabizinkiyle ayni ihtiyac - 24 saat
  // onceden giden bir mesajda yarim saat sapma fark edilmiyor.
  //
  // Ikisi PARALEL ve ikisi de hicbir zaman firlatmiyor: biri takilirsa oteki
  // beklemesin. Hatirlatici bu Worker'in kendi `fetch`ine gidiyor (aga
  // cikmadan) ve `scheduled`in `ctx`'ini tasiyor: OpenNext istek baglamini o
  // `ctx` ile kuruyor, `getCloudflareContext` route'ta bu yuzden calisiyor.
  async scheduled(
    _controller: unknown,
    ortam: ZamanlayiciOrtami,
    ctx: ExecutionContext,
  ): Promise<void> {
    await Promise.all([
      nabziTetikle(ortam),
      hatirlaticiyiTetikle(ortam, (istek) => openNext.fetch(istek, ortam, ctx)),
    ]);
  },
};

export default giris;
