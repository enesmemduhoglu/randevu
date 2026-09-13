// Cloudflare Cron Trigger'in isi: GitHub'daki nabiz is akisini tetiklemek.
// Cagiran `worker-girisi.ts > scheduled`.
//
// NEDEN: GitHub'in zamanlanmis is akislari "mumkun oldugunda" kosuyor. Nabiz
// `*/30` ile yazilmisti, 10-13 Eylul 2026'da olculen gercek aralik 2 ile 5,5
// saat arasiydi (ortalama ~3). Hata sayiminin 60 dakikalik penceresi o
// araliklarin cogunu hic gormuyordu. Cloudflare'in Cron Trigger'i zamaninda
// kosuyor; `workflow_dispatch` ile tetiklenen kosum da zamanlanmis kosum gibi
// ertelenip dusurulmuyor.
//
// NEDEN KONTROLLERIN KENDISI BURADA DEGIL: gozcu gozledigi seyin disinda
// kalsin. Worker bozuk yayinlanirsa, DNS ya da sertifika giderse, icerden
// bakan bir kontrol bunu goremez. Uyari kanali da GitHub'in kendisi: basarisiz
// kosum zaten e-posta atiyor. Burada yazilan yalnizca SAAT.
//
// SESSIZCE OLEMEZ, IKI KATMANDA:
//   1. Tetikleme basarisizsa (jeton yok, suresi dolmus, GitHub cevap vermiyor)
//      hata kapisina yaziliyor. Faz L'deki TURNSTILE_MODU dersi: ayari eksik
//      bir kapi yesil yanmasin.
//   2. Bu fonksiyon hic kosmuyorsa (tetik silindi, Worker patladi, islemci
//      siniri asildi) kapiya da yazilamaz. Onu `nabiz.yml`'deki yedek
//      zamanlanmis kosum yakaliyor: son `workflow_dispatch` kosumu cok
//      eskiyse kirmizi yaniyor.

import { hataBildir, type HataOrtami } from "./hata";

const DEPO = "enesmemduhoglu/randevu";

/// `.github/workflows/` altindaki dosya adi. `degismezler.test.ts` dosyanin var
/// oldugunu ve elle tetiklenebildigini ariyor: ad degisirse GitHub 404 donerdi.
export const NABIZ_IS_AKISI = "nabiz.yml";

const DAL = "main";

/// Kaynak etiketi `hata.ts`'teki bicimde: "<tur> <ad>".
const KAYNAK = "cron nabiz";

const ZAMAN_ASIMI_MS = 10_000;

export type ZamanlayiciOrtami = HataOrtami & {
  /// Ince taneli GitHub jetonu: yalnizca bu depo, yalnizca Actions yazma.
  /// `wrangler secret put` ile giriliyor (docs/yayin.md).
  GITHUB_NABIZ_TOKENI?: unknown;
};

/// Kapi mesaji hic almiyor; ayirt edici bilgi `code` alaninda tasiniyor ve
/// kapinin `kod` sutununa dusuyor. Jeton ya da GitHub'in yanit govdesi hicbir
/// yere konmuyor (DEGISMEZ 5).
function tetikHatasi(kod: string): Error {
  return Object.assign(new Error("nabiz tetiklenemedi"), {
    name: "ZamanlayiciHatasi",
    code: kod,
  });
}

/// ASLA firlatmaz. Basariliysa true.
export async function nabziTetikle(
  ortam: ZamanlayiciOrtami,
  istek: typeof fetch = fetch,
): Promise<boolean> {
  const jeton = ortam.GITHUB_NABIZ_TOKENI;
  if (typeof jeton !== "string" || jeton === "") {
    await hataBildir(KAYNAK, tetikHatasi("JETON_YOK"), ortam);
    return false;
  }

  let yanit: Response;
  try {
    yanit = await istek(
      `https://api.github.com/repos/${DEPO}/actions/workflows/${NABIZ_IS_AKISI}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jeton}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          // GitHub User-Agent'siz istegi 403 ile reddediyor.
          "User-Agent": "randevu-zamanlayici",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: DAL }),
        signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
      },
    );
  } catch (hata) {
    // Ag hatasi ya da zaman asimi. Kapi yalnizca turunu aliyor.
    await hataBildir(KAYNAK, hata, ortam);
    return false;
  }

  // Basari 204. `ok` bakiliyor, 204'e degil: API ileride govdeli 200 donerse
  // saglam bir tetik hata sayilmasin.
  if (!yanit.ok) {
    await hataBildir(KAYNAK, tetikHatasi(`HTTP_${yanit.status}`), ortam);
    return false;
  }
  return true;
}
