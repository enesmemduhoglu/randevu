// Dis servislere gercekten baglanilip baglanilmayacagini soyleyen tek kural.
//
// Iki kapi bunu kullaniyor: `turnstile.ts` (bot dogrulamasi) ve `email.ts`
// (bildirim gonderimi). Ikisinde de mantik ayniydi ve iki kez yazilmisti;
// asagidaki hata da tam olarak o kopyanin bir yarisinda ortaya cikti.
//
// NEDEN AYRI DOSYA - Faz I'de bulunan gercek hata:
//
// `next.config.ts` icindeki `initOpenNextCloudflareForDev()`, `next dev`
// sirasinda `getCloudflareContext()`i CALISIR HALE GETIRIYOR. Amac yerelde
// Hyperdrive gibi binding'lere ulasabilmek, ama yan etkisi su: `wrangler.jsonc
// > vars` icindeki degiskenler de YERELDE OKUNUYOR. Faz L'de oraya
// `TURNSTILE_MODU: "gercek"` yazildi ve o gunden beri `next dev` bot kapisini
// GERCEK modda calistiriyordu. Uretim site anahtari yalnizca
// randevu.enesmemduhoglu.tech icin kayitli oldugundan widget `localhost`ta
// Turnstile 110200 (bilinmeyen alan adi) hatasi veriyor, jeton uretilmiyor ve
// her yerel randevu denemesi "Dogrulama tamamlanamadi" ile 403 aliyordu.
//
// `.env.example` "yerelde sahte" diyordu ama bu ULASILAMAZ bir vaatti: cf
// degeri `??` zincirinde once geldigi icin `.env`e ne yazilirsa yazilsin
// eziliyordu.
//
// KURAL BU YUZDEN ORTAMA BAKIYOR:
//   - Uretimde (`NODE_ENV === "production"`) karar Cloudflare degiskeninin,
//     `.env` yedek. Uretim paketinde `.env` zaten yok; olsa bile uretimin
//     kararini yerel bir dosyanin ezmesi istenmiyor - "sessizce sahte moda
//     dusmus uretim" bu deponun iki kez yasadigi hata (Faz L, ve Faz I'de
//     `email.ts`in anahtarsiz hali).
//   - Yerelde ve testte YALNIZCA `.env`. Gelistiricinin makinesinde uretim
//     yapilandirmasinin kendiliginden devreye girmesi, gelistirmeyi
//     engellemekten baska bir sey yapmiyor.
//
// Gevsetme YONU onemli: bu dal uretimi hicbir kosulda gevsetemiyor, cunku
// `NODE_ENV` uretim paketinde `next build` tarafindan "production" olarak
// sabitleniyor.

export type Mod = "sahte" | "gercek";

export function uretimMi(): boolean {
  return process.env.NODE_ENV === "production";
}

/// `cf` = Cloudflare ortamindan okunan ham deger, `env` = `process.env`den.
///
/// VARSAYILAN `sahte` ve yalnizca acikca "gercek" yazan deger gercek sayiliyor.
/// Tersini yapmak - tanimsizken gercege dusmek - yeni bir gelistiricinin ilk
/// gununde her randevuyu 403'e cevirirdi, ve e-posta tarafinda yerel
/// denemelerin gercek adreslere mail atmasi demek olurdu.
export function modCoz(
  cf: string | undefined,
  env: string | undefined,
): Mod {
  const ham = uretimMi() ? (cf ?? env) : env;
  return ham === "gercek" ? "gercek" : "sahte";
}
