// Sunucu tarafindaki hatalarin TEK kapisi - `email.ts > gonder()` deseninin
// hata yolundaki karsiligi (TODOS.md > Teknik borc 3).
//
// NEDEN TEK KAPI: DEGISMEZ 5 en kolay hata yolunda deliniyor. Bir `catch`
// blogunda `console.error(hata)` yazmak dogal geliyor, ama bu depoda hata
// nesnesinin MESAJI kisisel veri tasiyor: Drizzle'in `DrizzleQueryError`'u
// mesaja sorgunun PARAMETRELERINI ekliyor (`params: ali@ornek.com,0555...`).
// Suzgec her cagrida yeniden yazilsaydi biri bir gun unuturdu; burada bir kez
// yazili ve `degismezler.test.ts` `console.error`'un `src` altinda baska bir
// yerde gecmesini yasakliyor.
//
// NE TASINIYOR: kaynak, hatanin turu, Postgres kodu ve kisit adi, React'in
// digest'i. MESAJ VE YIGIN TASINMIYOR - desenle temizlemeye calismak yerine hic
// alinmiyor. Bir desen listesi bir gun eksik kalir, yokluk eksik kalmaz.
// Ayrintinin kendisi zaten kaybolmuyor: Next yakalanmamis hatayi kendi
// log'una da basiyor, `digest` iki satiri eslestiriyor.
//
// NEREYE GIDIYOR:
//   console.error -> Workers Logs. Hesaba bagli ve ozel; "ne oldu" sorusunun
//                    cevabina bakilan yer (`olay = "hata"`).
//   HATA binding  -> Workers Analytics Engine. Nabiz isi BURADAN sayiyor
//                    (`scripts/hata-say.ts`) ve sayi sifir degilse kirmizi yaniyor.
//
// NEDEN VERITABANI DEGIL: en olasi hata veritabaninin kendisi - Supabase
// duraklatildi, Hyperdrive baglantiyi kaybetti. Hatayi DB'ye yazan bir kapi tam
// o anda kendisi de duserdi ve en cok duyulmasi gereken ariza sessiz kalirdi.
//
// NEDEN WORKERS LOGS'U SORGULAMAK DEGIL: log satirini metinle aramak, satirin
// bicimi bir gun degistiginde sessizce SIFIR dondurur ve nabiz yesil yanar.
// Analytics Engine'de sayac ayri bir kayit; SQL API'si tek satir sorgu ve tek
// bir okuma izni (Account Analytics Read) istiyor.

import { pgHata } from "@/lib/pg-hata";

/// wrangler.jsonc > analytics_engine_datasets[].binding
const BINDING = "HATA";

/// Analytics Engine index'i en fazla 96 bayt; kaynak ASCII oldugu icin karakter
/// sayisi yetiyor.
const KAYNAK_SINIRI = 96;

type OlayYazici = {
  writeDataPoint(nokta: { blobs?: string[]; indexes?: string[] }): void;
};

export type HataOzeti = {
  kaynak: string;
  tur: string;
  kod: string | null;
  kisit: string | null;
  digest: string | null;
};

function kisalt(metin: string, sinir: number): string {
  return metin.length > sinir ? metin.slice(0, sinir) : metin;
}

function turu(hata: unknown): string {
  // IKI YOL DA `cf:onizle`'de OLCULUP ELENDI:
  //   `constructor.name` -> "a2". Worker paketinde sinif adlari kucultuluyor.
  //   `instanceof DrizzleQueryError` -> tutmadi. Pakette sinifin birden fazla
  //     kopyasi var (ESM/CJS), yani instanceof yanlis negatif veriyor.
  // Kalan guvenilir isaret bicim: Drizzle'in sarmalayicisi `query` metnini ve
  // `params`'i alan olarak tasiyor ve `name`'i ayarlamiyor. Alanlarin DEGERINE
  // bakilmiyor, yalnizca varligina.
  if (hata instanceof Error) {
    const alanlar = hata as { query?: unknown; params?: unknown };
    if (typeof alanlar.query === "string" && "params" in alanlar) return "DrizzleQueryError";
    return kisalt(hata.name || "Error", 60);
  }
  return typeof hata;
}

/// Saf: ag ve baglam yok, test edilen yuzey bu.
export function hataOzeti(kaynak: string, hata: unknown): HataOzeti {
  // Kaynak sabit bir metin ya da route DOSYA yolu olmali, istek yolu degil.
  // Yine de sorgu dizesi burada kesiliyor: `?token=` tasiyan bir yol yanlislikla
  // verilirse iptal baglantisinin jetonu log'a dusmesin.
  const temizKaynak = kisalt(kaynak.split("?")[0] || "bilinmiyor", KAYNAK_SINIRI);

  try {
    // `pgHata` zinciri geziyor (DEGISMEZ 8'deki sarmalayici sorunu). Node'un ag
    // hatalari da `code` tasidigi icin (ECONNREFUSED) "veritabanina
    // ulasilamadi" ile "kisit ihlali" ayni alanda ayirt ediliyor.
    const pg = pgHata(hata);
    const kod = pg ? kisalt(pg.kod, 20) : null;
    const kisit = pg?.kisit ? kisalt(pg.kisit, 63) : null;
    const digest =
      hata && typeof hata === "object" && typeof (hata as { digest?: unknown }).digest === "string"
        ? kisalt((hata as { digest: string }).digest, 64)
        : null;
    return { kaynak: temizKaynak, tur: turu(hata), kod, kisit, digest };
  } catch {
    // Getter'i firlatan tuhaf bir nesne kapinin kendisini dusurmesin.
    return { kaynak: temizKaynak, tur: "okunamadi", kod: null, kisit: null, digest: null };
  }
}

async function olayYazici(): Promise<OlayYazici | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const aday = (env as unknown as Record<string, unknown>)[BINDING];
    return aday && typeof (aday as OlayYazici).writeDataPoint === "function"
      ? (aday as OlayYazici)
      : null;
  } catch {
    // Cloudflare baglami yok (vitest, `next dev`): yalnizca log.
    return null;
  }
}

/// ASLA firlatmaz. Hata kapisinin kendi hatasi, bildirmeye calistigi hatanin
/// yerini alip istegi baska bir sekilde dusurmemeli.
export async function hataBildir(kaynak: string, hata: unknown): Promise<void> {
  const ozet = hataOzeti(kaynak, hata);

  try {
    console.error(JSON.stringify({ olay: "hata", ...ozet }));
  } catch {
    // console bile yoksa yapilacak bir sey kalmiyor.
  }

  try {
    const yazici = await olayYazici();
    yazici?.writeDataPoint({
      blobs: [ozet.kaynak, ozet.tur, ozet.kod ?? "", ozet.kisit ?? ""],
      indexes: [ozet.kaynak],
    });
  } catch {
    // Sayac yazilamadiysa log satiri yine duruyor.
  }
}
