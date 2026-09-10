// Canli sitenin ayakta oldugunu dogrular. Iki yerden cagriliyor:
//
//   ci.yml > yayinla   - deploy'dan hemen sonra, `--surum` ile
//   nabiz.yml          - zamanlanmis, surumsuz
//
//   node scripts/duman.ts https://randevu.enesmemduhoglu.tech [--surum <id>]
//
// Bagimliligi yok (yalnizca node'un fetch'i): nabiz isi `npm ci` kosmadan
// calissin, otuz dakikada bir bir dakikalik kurulum odenmesin.
//
// NEDEN `--surum`: deploy'dan hemen sonra gelen bir 200'u eski surum de
// verebilir - Cloudflare yeni surumu saniyeler icinde yayiyor ama "aninda"
// demiyor. Yani surum kimligi eslesmeden `/api/saglik`'in 200'u yeni yayinin
// kaniti degil; betik eslesene kadar bekliyor. Kimligin nereden geldigi
// `src/lib/surum.ts`'te.
//
// Cikti public bir depoda, herkese acik Actions log'una gidiyor. Basilan her
// sey zaten `/api/saglik`'in halka acik govdesi - baska bir sey basilmiyor.

const SAYFALAR = ["/", "/dizin", "/giris", "/isletmeler-icin", "/saglik"];
const DENEME = 12;
const ARALIK_MS = 5_000;
const ZAMAN_ASIMI_MS = 10_000;
const KIMLIK = "randevu-duman/1";

const argumanlar = process.argv.slice(2);
const surumSirasi = argumanlar.indexOf("--surum");
const beklenenSurum = surumSirasi >= 0 ? argumanlar[surumSirasi + 1] : undefined;
const adres = argumanlar.find(
  (a, i) => !a.startsWith("--") && !(surumSirasi >= 0 && i === surumSirasi + 1),
);

if (!adres) {
  console.error("kullanim: node scripts/duman.ts <adres> [--surum <id>]");
  process.exit(2);
}
if (surumSirasi >= 0 && !beklenenSurum) {
  // Bos bir `--surum` sessizce surumsuz kontrole dusseydi, yayin isinde
  // kimlik okunamadiginda duman testi eski davranisa donup yesil yanardi.
  console.error("--surum verildi ama degeri bos.");
  process.exit(2);
}

const kok = adres.replace(/\/+$/, "");

async function iste(yol: string): Promise<Response> {
  return fetch(kok + yol, {
    // Yonlendirme takip edilmiyor: bir sayfanin /giris'e ya da hata sayfasina
    // atmasi "200 geldi" diye gecmesin.
    redirect: "manual",
    headers: { "User-Agent": KIMLIK, "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
  });
}

const bekle = (ms: number) => new Promise((coz) => setTimeout(coz, ms));

async function saglikYokla(): Promise<boolean> {
  for (let deneme = 1; deneme <= DENEME; deneme++) {
    let durum = "istek-dustu";
    let surum: string | null = null;
    let govde = "";
    try {
      const yanit = await iste("/api/saglik");
      durum = String(yanit.status);
      surum = yanit.headers.get("x-worker-surum");
      const json = yanit.headers.get("content-type")?.includes("application/json");
      const metin = await yanit.text();
      govde = json ? metin.slice(0, 200) : "";
      const surumTutuyor = !beklenenSurum || surum === beklenenSurum;
      if (yanit.status === 200 && surumTutuyor) {
        console.log(`saglik: 200 ${govde} surum=${surum ?? "-"}`);
        return true;
      }
    } catch (hata) {
      durum = hata instanceof Error ? hata.name : "istek-dustu";
    }
    console.log(
      `saglik: deneme ${deneme}/${DENEME} - ${durum} surum=${surum ?? "-"}` +
        (beklenenSurum ? ` beklenen=${beklenenSurum}` : "") +
        (govde ? ` ${govde}` : ""),
    );
    if (deneme < DENEME) await bekle(ARALIK_MS);
  }
  return false;
}

async function sayfalariYokla(): Promise<string[]> {
  const kirik: string[] = [];
  for (const yol of SAYFALAR) {
    let sonuc: string;
    try {
      const yanit = await iste(yol);
      sonuc = String(yanit.status);
      await yanit.arrayBuffer();
    } catch (hata) {
      sonuc = hata instanceof Error ? hata.name : "istek-dustu";
    }
    console.log(`sayfa: ${yol} ${sonuc}`);
    if (sonuc !== "200") kirik.push(`${yol} (${sonuc})`);
  }
  return kirik;
}

async function calistir(): Promise<number> {
  if (!(await saglikYokla())) {
    console.error(
      beklenenSurum
        ? `\n/api/saglik ${DENEME} denemede beklenen surumle 200 donmedi.`
        : `\n/api/saglik ${DENEME} denemede 200 donmedi.`,
    );
    return 1;
  }

  const kirik = await sayfalariYokla();
  if (kirik.length > 0) {
    console.error(`\n200 donmeyen sayfalar: ${kirik.join(", ")}`);
    return 1;
  }

  console.log("\nduman testi temiz.");
  return 0;
}

calistir().then((kod) => process.exit(kod));
