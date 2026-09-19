import { cronKapisi } from "@/lib/cron-kapisi";
import { kuyruguBosalt } from "@/lib/hatirlatici";

// Makine yolu (Faz K): kuyrugun zamani gelmis satirlarini bosaltir. Cagiran
// `worker-girisi.ts > scheduled`, 30 dakikada bir, Worker'in icinden.
//
// NEDEN ROUTE, neden `scheduled` isi dogrudan yapmiyor: veritabani (`db.ts`),
// e-posta (`email.ts`) ve hata kapisi (`hata.ts`) ortami
// `getCloudflareContext` ile okuyor ve o baglami OpenNext'in `fetch`
// sarmalayicisi kuruyor. Cron Trigger o sarmalayicidan gecmiyor. Uc dosyaya
// "ortami parametre olarak da al" dali eklemek, uretimde yalnizca bir yoldan
// kosan ve testin hic gormedigi uc dal demekti. Bunun yerine `scheduled`
// isteyi `openNext.fetch`e veriyor ve is, sitenin geri kalaniyla ayni
// baglamda kosuyor.
//
// DEGISMEZ 2: `checkOrigin` yok, `cronKapisi` var - gerekcesi o dosyada.
//
// Hata YAKALANMIYOR: veritabani hatasi `onRequestError` uzerinden hata
// kapisina gidiyor (kaynak `route /api/cron/hatirlatma`) ve 500 donuyor.
// Zamanlayici da 500'u kendi kaynagiyla kapiya yaziyor; ayni ariza iki satir
// uretiyor ve bu bilincli - biri NEYIN kirildigini, oteki zamanlayicinin
// bunu GORDUGUNU soyluyor.
//
// `robots.ts` `/api/` yolunu zaten tumden engelliyor.

export async function POST(istek: Request) {
  const red = await cronKapisi(istek);
  if (red) return red;

  const ozet = await kuyruguBosalt(new Date());

  return Response.json(ozet, { headers: { "Cache-Control": "no-store" } });
}
