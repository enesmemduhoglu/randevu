// KAPI DISI DOSYA: ham veritabani istemcisi yalnizca burada kurulur
// (bkz. CLAUDE.md degismez 1). Route handler'lar buraya degil,
// src/lib/scoped-db.ts'e bakar.

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as sema from "@/db/sema";

export type Db = PostgresJsDatabase<typeof sema>;

type HyperdriveBinding = { connectionString: string };

/// GERCEKTEN workerd uzerinde miyiz?
///
/// Bu ayrim `next dev`'i Workers'tan ayirmak icin sart. next.config.ts
/// `initOpenNextCloudflareForDev()` cagiriyor, yani `next dev` sirasinda da
/// Hyperdrive binding'i TAKLIT EDILIYOR ve asagidaki `hyperdriveDizesi`
/// dolu donuyor - ama surec Node, Workers degil.
///
/// Fark neden onemli: Workers yolu istemciyi ISTEK BASINA uretiyor ve
/// kapatmiyor. workerd'de bu dogru - istek bitince isolate'in soketleri
/// toplaniyor. Node'da ise hicbir sey toplamiyor: her istek bes baglanti daha
/// aciyor ve Postgres'in 100 siniri birkac dakikada doluyor
/// ("sorry, too many clients already"). Tarayicida test ederken tam olarak bu
/// oldu; on istek baglantiyi 10'dan 40'a cikardi.
///
/// Tespit `navigator.userAgent` ile: workerd bu degeri "Cloudflare-Workers"
/// olarak veriyor ve Node'da boyle bir deger yok.
function workerdMi(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.userAgent === "Cloudflare-Workers"
  );
}

/// Hyperdrive binding'inin urettigi baglanti dizesi; yoksa undefined.
async function hyperdriveDizesi(): Promise<string | undefined> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return (env as unknown as { HYPERDRIVE?: HyperdriveBinding }).HYPERDRIVE
      ?.connectionString;
  } catch {
    // Cloudflare baglami yok: vitest ya da duz node betigi.
    return undefined;
  }
}

function yerelDizi(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL tanimli degil. Yerelde .env dosyasina bak; testlerde " +
        "vitest.setup.ts TEST_DATABASE_URL'i buraya kopyalar.",
    );
  }
  return url;
}

// Node tarafinda tek istemci yeniden kullanilir: havuz bir kez acilir.
//
// Istemci `globalThis` uzerinde tutuluyor, modul degiskeninde DEGIL. `next dev`
// degisen bir dosyanin import zincirindeki modulleri yeniden degerlendiriyor;
// modul degiskeninde tutulan havuz o an erisilemez hale gelir ve yenisi
// acilirdi. globalThis modul yeniden degerlendirmesinden etkilenmiyor.
//
// NOT: bu oturumda goruldugu uzere baglanti tukenmesinin ASIL sebebi bu
// degildi - olculdugunde sizintinin HMR basina degil ISTEK basina oldugu
// cikti ve kaynak `getDb`'nin Workers dalina girmesiydi (bkz. workerdMi).
// globalThis yine de dogru yer: iki koruma birbirinin yerine gecmiyor.
type KureselDurum = {
  yerelIstemci?: ReturnType<typeof postgres>;
  yerelDb?: Db;
};

const kure = globalThis as typeof globalThis & {
  __randevuVeritabani?: KureselDurum;
};

const durum: KureselDurum = (kure.__randevuVeritabani ??= {});

export async function getDb(): Promise<Db> {
  const hyperdrive = await hyperdriveDizesi();

  if (hyperdrive && workerdMi()) {
    // WORKERS yolu: istemci ISTEK BASINA uretilir ve kapatilmiyor. Havuzlamayi
    // zaten Hyperdrive yapiyor; isolate icinde havuz tutmanin kazanci yok ve
    // istek bitince soketleri workerd topluyor.
    //
    // Bu dal YALNIZCA gercek workerd'de kosuyor. `next dev` de Hyperdrive
    // binding'ini taklit ediyor ama orada surec uzun omurlu bir Node ve ayni
    // desen baglanti sizdiriyor - gerekcesi workerdMi()'nin basinda.
    //
    // fetch_types kapali: postgres.js acilista tip kesfi icin fazladan bir
    // gidis-donus yapiyor; Hyperdrive arkasinda bu her istege gecikme ekler.
    const sql = postgres(hyperdrive, { max: 5, fetch_types: false });
    return drizzle(sql, { schema: sema });
  }

  // NODE yolu: yerel gelistirme, testler ve betikler. Havuz bir kez aciliyor
  // ve yeniden kullaniliyor. Baglanti dizesi taklit edilen Hyperdrive
  // binding'inden de gelebilir (`next dev`), .env'den de.
  if (!durum.yerelDb) {
    durum.yerelIstemci = postgres(hyperdrive ?? yerelDizi(), { max: 5 });
    durum.yerelDb = drizzle(durum.yerelIstemci, { schema: sema });
  }
  return durum.yerelDb;
}

// Testlerin ve betiklerin havuzu kapatabilmesi icin.
export async function baglantiyiKapat(): Promise<void> {
  await durum.yerelIstemci?.end();
  durum.yerelIstemci = undefined;
  durum.yerelDb = undefined;
}
