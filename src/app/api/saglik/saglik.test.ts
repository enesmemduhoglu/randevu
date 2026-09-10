import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import type { KamuYoklama } from "@/lib/saglik";

import { GET } from "./route";

// GET, mutasyon yok - checkOrigin kapsami disinda (route.ts'te yazili).
// Buradaki tek is durum kodunun ve govdenin dogru yuzeye ciktigini kanitlamak;
// yoklamanin kendisi (sema/goc/kisit kontrolu) src/lib/saglik.test.ts'te.
//
// "bozuk -> 503" dalinin ORAYA degil BURAYA yazilmamasi bilincli: DEGISMEZ 1
// bu dosyanin `@/lib/db`'yi dogrudan import etmesini de yasakliyor (src/app
// altindaki her .ts icin - test dosyalari dahil, kural eslint VE
// degismezler.test.ts'te ikisinde de). Semayi elle bozup geri almak bu
// dosyada yapilamiyor; durum-kodu eslemesi asagida METIN olarak dogrulaniyor.
//
// Havuz burada KAPATILMIYOR: ayni gerekce iptal.test.ts / randevu.test.ts'te
// yazili - `baglantiyiKapat` @/lib/db'de, havuz globalThis'te yasiyor,
// `fileParallelism: false` oldugu icin src/lib altindaki entegrasyon testleri
// kendi afterAll'larinda kapatmasi yetiyor.

test("mutlu yol: 200 ve kamu govdesi", async () => {
  const yanit = await GET();
  expect(yanit.status).toBe(200);
  expect(yanit.headers.get("cache-control")).toBe("no-store");
  // Cloudflare baglami yok: bos ya da uydurma bir kimlik yerine baslik HIC
  // gitmiyor, yoksa duman betigi "surum geldi" sanabilirdi.
  expect(yanit.headers.get("x-worker-surum")).toBeNull();

  const govde = (await yanit.json()) as KamuYoklama;
  expect(govde.durum).toBe("saglikli");
  expect(Object.keys(govde).sort()).toEqual(["durum", "goc", "sureMs", "surum"]);
});

test("saglikli disindaki her durum 503'e esleniyor", () => {
  const metin = readFileSync(
    join(process.cwd(), "src", "app", "api", "saglik", "route.ts"),
    "utf-8",
  );
  expect(metin).toContain('status: govde.durum === "saglikli" ? 200 : 503');
});
