// Son bir saatte kac sunucu hatasi yazildigini sayar; sifir degilse 1 ile cikar.
// `nabiz.yml` duman testinden sonra cagiriyor - basarisiz kosum bildirim
// gonderdigi icin hata takibinin UYARI kanali tam olarak bu cikis kodu.
//
//   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_ANALIZ_TOKENI=... node scripts/hata-say.ts
//
// Sayac `src/lib/hata.ts > hataBildir()`'in Analytics Engine'e yazdigi
// `randevu_hata` veri seti. Neden veritabani ya da log sorgusu olmadigi orada.
//
// JETON YALNIZCA OKUYOR: Account > Account Analytics > Read. Yayin jetonu
// (CLOUDFLARE_API_TOKEN) kullanilmiyor - otuz dakikada bir kosan bir isin
// Worker yayinlayabilen bir anahtar tasimasi gerekmiyor.
//
// Jeton ya da hesap kimligi yoksa betik SESSIZCE GECMIYOR, 2 ile cikiyor.
// Faz L'deki TURNSTILE_MODU dersi: ayari eksik bir kapinin yesil yanmasi, hic
// olmamasindan kotu.
//
// CIKTI PUBLIC LOG'A GIDIYOR. Yalnizca TOPLAM basiliyor; hangi route'un
// patladigi, hangi kisitin cignendigi basilmiyor - P2b'deki `/saglik`
// daraltmasinin gerekcesi (drift bilgisi saldirgana harita). Ayrinti
// Cloudflare > Workers Logs'ta, `olay = "hata"` suzgeciyle.

const VERI_SETI = "randevu_hata";

// Pencere nabiz araligindan (30 dk) BILEREK uzun. GitHub zamanlanmis kosumlari
// dakikalarca geciktirebiliyor; pencere araliga esit olsaydi iki kosum
// arasindaki fark 30 dakikayi astiginda aradaki hatalar hic sayilmazdi. Bedeli
// ayni hatanin iki kosumda gorulmesi - kacirmaktansa iki kez duymak.
const PENCERE_DAKIKA = 60;

const ZAMAN_ASIMI_MS = 15_000;

const hesap = process.env.CLOUDFLARE_ACCOUNT_ID;
const jeton = process.env.CLOUDFLARE_ANALIZ_TOKENI;

async function calistir(): Promise<number> {
  if (!hesap || !jeton) {
    console.error(
      "CLOUDFLARE_ACCOUNT_ID ve CLOUDFLARE_ANALIZ_TOKENI gerekli (docs/yayin.md > Hata takibi).",
    );
    return 2;
  }

  const sorgu =
    `SELECT SUM(_sample_interval) AS adet FROM ${VERI_SETI} ` +
    `WHERE timestamp > NOW() - INTERVAL '${PENCERE_DAKIKA}' MINUTE FORMAT JSON`;

  let yanit: Response;
  try {
    yanit = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${hesap}/analytics_engine/sql`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${jeton}` },
        body: sorgu,
        signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
      },
    );
  } catch (hata) {
    console.error(`hata sayimi: istek dustu (${hata instanceof Error ? hata.name : "?"})`);
    return 1;
  }

  const metin = await yanit.text();
  if (!yanit.ok) {
    // API'nin kendi hata metni basiliyor: jeton ya da kimlik icermiyor, izin
    // eksigini ("Authentication error") ayirt etmenin tek yolu bu. GitHub
    // sir degerlerini log'da zaten maskeliyor.
    console.error(`hata sayimi: API ${yanit.status} - ${metin.slice(0, 300)}`);
    return 1;
  }

  let adet: number;
  try {
    const govde = JSON.parse(metin) as { data?: Array<{ adet?: unknown }> };
    if (!Array.isArray(govde.data)) throw new Error("data yok");
    // Bos pencerede SUM ya satir dondurmuyor ya da null donduruyor; ikisi de
    // sifir. 64 bitlik sayilar JSON'da metin olarak gelebiliyor, Number() ikisini
    // de karsiliyor.
    adet = Number(govde.data[0]?.adet ?? 0);
    if (!Number.isFinite(adet)) throw new Error("adet sayi degil");
  } catch {
    // Bicim degistiyse "0 hata" DEMIYORUZ: okuyamadigimiz sayac yesil yanmasin.
    console.error(`hata sayimi: beklenmeyen yanit bicimi - ${metin.slice(0, 200)}`);
    return 1;
  }

  if (adet > 0) {
    console.error(
      `hata sayimi: son ${PENCERE_DAKIKA} dakikada ${adet} sunucu hatasi.\n` +
        `Ayrinti: Cloudflare > Workers & Pages > randevu > Logs, olay = "hata".`,
    );
    return 1;
  }

  console.log(`hata sayimi: son ${PENCERE_DAKIKA} dakikada hata yok.`);
  return 0;
}

calistir().then((kod) => process.exit(kod));
