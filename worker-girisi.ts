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
import { nabziTetikle, type ZamanlayiciOrtami } from "./src/lib/zamanlayici";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export * from "./.open-next/worker.js";

const giris = {
  fetch: openNext.fetch,

  // Bugun tek tetik var (`wrangler.jsonc > triggers.crons`). Ikincisi eklenince
  // (Faz K, hatirlatma) ayrim `controller.cron` ile yapilacak.
  async scheduled(_controller: unknown, ortam: ZamanlayiciOrtami): Promise<void> {
    await nabziTetikle(ortam);
  },
};

export default giris;
