import { createRequire } from "node:module";

import { sql } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterAll, describe, expect, test } from "vitest";

import { baglantiyiKapat, getDb } from "@/lib/db";
import { hataOzeti } from "@/lib/hata";
import { pgHata } from "@/lib/pg-hata";

// `patches/drizzle-orm+0.45.2.patch`in kaniti. Yama `DrizzleQueryError`
// mesajindan parametreleri cikariyor: Next yakalanmamis hatanin mesajini
// Workers Logs'a basiyor (`cf:onizle`'de olculdu, TODOS.md > Faz P2 - log'daki
// query parametreleri) ve parametre e-posta, telefon ya da ham iptal jetonu
// olabiliyor. DEGISMEZ 5.
//
// Yamayi zorlayan BU DOSYA. `npm ci` postinstall'da `patch-package`i kosuyor;
// yama uygulanmazsa, Drizzle surumu degisip yama bosa duserse ya da biri
// postinstall'dan kaldirirsa buradaki testler kirmiziya doner. Hata GERCEK bir
// sorguyla uretiliyor, elle degil - bicimi yanlis bilinen bir hata bu depoda
// daha once "gecti" diye isaretlenmisti (bkz. pg-hata.test.ts).

const GIZLI = "GIZLI-05551234567-ali@ornek.com";

afterAll(async () => {
  await baglantiyiKapat();
});

async function yakala(is: () => Promise<unknown>): Promise<Error> {
  try {
    await is();
  } catch (hata) {
    return hata as Error;
  }
  throw new Error("sorgu hata vermeliydi");
}

describe("gercek sorgu hatasi parametre tasimiyor", () => {
  test("tip hatasi (22P02): mesajda deger yok, sorgu metni var", async () => {
    const db = await getDb();
    const hata = await yakala(() => db.execute(sql`select ${GIZLI}::uuid`));

    // Next'in log satiri tam olarak bu: `Error: <mesaj>`.
    expect(String(hata)).not.toContain(GIZLI);
    expect(hata.message).not.toContain("params");
    // Hangi sorgunun dustugu hata ayiklamada hala okunabiliyor. Sorgu metni
    // deger tasimiyor: Drizzle her degeri `$n` olarak geciyor.
    expect(hata.message).toBe("Failed query: select $1::uuid");
  });

  test("benzersizlik ihlali (23505), transaction icinde", async () => {
    const db = await getDb();
    const hata = await yakala(() =>
      db.transaction(async (tx) => {
        await tx.execute(sql`create temp table yama_t (x text primary key) on commit drop`);
        await tx.execute(sql`insert into yama_t values (${GIZLI}), (${GIZLI})`);
      }),
    );

    expect(String(hata)).not.toContain(GIZLI);
    // DEGISMEZ 8'in 409'u bu bilgiyle kuruluyor; yama ona dokunmamali.
    expect(pgHata(hata)).toMatchObject({ kod: "23505", kisit: "yama_t_pkey" });
  });

  test("`params` sayilamaz: okunabiliyor ama nesneyi dolasan kod onu gormuyor", async () => {
    const db = await getDb();
    const hata = await yakala(() => db.execute(sql`select ${GIZLI}::uuid`));

    expect(Object.keys(hata)).not.toContain("params");
    expect((hata as unknown as { params: unknown }).params).toEqual([GIZLI]);
    // hata.ts turu bicimden taniyor (`query` + `params` alani). Yama alani
    // silseydi tur sessizce "Error"a donerdi.
    expect(hataOzeti("route /api/deneme", hata).tur).toBe("DrizzleQueryError");
  });
});

describe("paketin iki bicimi de yamali", () => {
  // Worker paketinde sinifin birden fazla kopyasi var (ESM ve CJS - P2e'de
  // `instanceof`'un tutmamasinin sebebi). Hangisinin kullanildigi paketleyiciye
  // bagli; ikisi de ayri ayri sinaniyor.
  test("ESM (errors.js)", () => {
    const hata = new DrizzleQueryError("select $1", [GIZLI], undefined);
    expect(hata.message).toBe("Failed query: select $1");
  });

  test("CJS (errors.cjs)", () => {
    const iste = createRequire(import.meta.url);
    const cjs = iste("drizzle-orm/errors") as { DrizzleQueryError: typeof DrizzleQueryError };
    expect(cjs.DrizzleQueryError).not.toBe(DrizzleQueryError);

    const hata = new cjs.DrizzleQueryError("select $1", [GIZLI], undefined);
    expect(hata.message).toBe("Failed query: select $1");
  });
});
