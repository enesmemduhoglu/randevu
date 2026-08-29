// KAPI DISI DOSYA: ham veritabani istemcisi yalnizca burada kurulur
// (bkz. CLAUDE.md degismez 1). Route handler'lar buraya degil,
// src/lib/scoped-db.ts'e bakar.

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as sema from "@/db/sema";

export type Db = PostgresJsDatabase<typeof sema>;

type HyperdriveBinding = { connectionString: string };

/// Workers uzerinde calisiyorsak Hyperdrive binding'inin urettigi yerel
/// baglanti dizesini doner; degilse undefined.
async function hyperdriveDizesi(): Promise<string | undefined> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return (env as unknown as { HYPERDRIVE?: HyperdriveBinding }).HYPERDRIVE
      ?.connectionString;
  } catch {
    // Cloudflare baglami yok: vitest, duz node betigi ya da next dev.
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

// Yerel ve testte tek istemci yeniden kullanilir: havuz bir kez acilir.
let yerelIstemci: ReturnType<typeof postgres> | undefined;
let yerelDb: Db | undefined;

export async function getDb(): Promise<Db> {
  const hyperdrive = await hyperdriveDizesi();

  if (hyperdrive) {
    // Workers yolu: istemci ISTEK BASINA uretilir. Havuzlamayi zaten Hyperdrive
    // yapiyor, yani isolate icinde havuz tutmanin kazanci yok.
    //
    // fetch_types kapali: postgres.js acilista tip kesfi icin fazladan bir
    // gidis-donus yapiyor; Hyperdrive arkasinda bu her istege gecikme ekler.
    const sql = postgres(hyperdrive, { max: 5, fetch_types: false });
    return drizzle(sql, { schema: sema });
  }

  if (!yerelDb) {
    yerelIstemci = postgres(yerelDizi(), { max: 5 });
    yerelDb = drizzle(yerelIstemci, { schema: sema });
  }
  return yerelDb;
}

// Testlerin ve betiklerin havuzu kapatabilmesi icin.
export async function baglantiyiKapat(): Promise<void> {
  await yerelIstemci?.end();
  yerelIstemci = undefined;
  yerelDb = undefined;
}
