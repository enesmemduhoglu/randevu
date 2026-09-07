import { sql } from "drizzle-orm";
import { afterAll, expect, test } from "vitest";

import { baglantiyiKapat, getDb } from "@/lib/db";
import { kamuyaAcilanYoklama, veritabaniniYokla } from "@/lib/saglik";

// L3'un yeniden canlanmasini yakalamak icin var (TODOS.md > Faz L3): "200
// donuyor" sema kanitliyor sanmak. Her bozma kendi testinde acilip
// try/finally ile geri aliniyor - testler `fileParallelism: false` ile
// kosuyor (CLAUDE.md), yani sirali calismalari guvenli.

afterAll(async () => {
  await baglantiyiKapat();
});

test("mutlu yol: saglikli, goc N/N, surum 17", async () => {
  const yoklama = await veritabaniniYokla();

  expect(yoklama.durum).toBe("saglikli");
  expect(yoklama.surum).toBe("17");
  expect(yoklama.eksikKolonlar).toEqual([]);
  expect(yoklama.cakismaKisitiVar).toBe(true);
  expect(yoklama.gocEksik).toBe(false);

  const [uygulanan, beklenen] = yoklama.goc.split("/").map(Number);
  expect(uygulanan).toBe(beklenen);
  expect(uygulanan).toBeGreaterThan(0);
});

test("L3'un yeniden canlanmasi: eksik kolon bozuk yapiyor", async () => {
  const db = await getDb();
  await db.execute(sql`alter table hizmet drop column aciklama`);
  try {
    const yoklama = await veritabaniniYokla();
    expect(yoklama.durum).toBe("bozuk");
    expect(yoklama.eksikKolonlar).toContain("hizmet.aciklama");
  } finally {
    await db.execute(sql`alter table hizmet add column aciklama text`);
  }
});

test("fazla kolon BOZUK degil - dogru goc sirasinin ara durumu", async () => {
  const db = await getDb();
  await db.execute(sql`alter table hizmet add column gecici_kolon text`);
  try {
    const yoklama = await veritabaniniYokla();
    expect(yoklama.durum).toBe("saglikli");
    expect(yoklama.fazlaKolonlar).toContain("hizmet.gecici_kolon");
  } finally {
    await db.execute(sql`alter table hizmet drop column gecici_kolon`);
  }
});

test("eksik goc satiri bozuk yapiyor", async () => {
  const db = await getDb();
  const [{ max_id }] = await db.execute<{ max_id: number }>(
    sql`select max(id) as max_id from drizzle.__drizzle_migrations`,
  );
  const [silinen] = await db.execute<{ hash: string; created_at: string }>(
    sql`delete from drizzle.__drizzle_migrations where id = ${max_id} returning hash, created_at`,
  );

  try {
    const yoklama = await veritabaniniYokla();
    expect(yoklama.durum).toBe("bozuk");
    expect(yoklama.gocEksik).toBe(true);
  } finally {
    await db.execute(
      sql`insert into drizzle.__drizzle_migrations (id, hash, created_at) values (${max_id}, ${silinen.hash}, ${silinen.created_at})`,
    );
  }
});

test("cakisma kisiti dususu bozuk yapiyor", async () => {
  const db = await getDb();
  await db.execute(sql`alter table randevu drop constraint randevu_cakisma_yok`);
  try {
    const yoklama = await veritabaniniYokla();
    expect(yoklama.durum).toBe("bozuk");
    expect(yoklama.cakismaKisitiVar).toBe(false);
  } finally {
    await db.execute(sql`
      alter table randevu add constraint randevu_cakisma_yok
      exclude using gist (
        personel_id with =,
        tstzrange(baslangic, bitis, '[)') with &&
      ) where (durum in ('BEKLIYOR', 'ONAYLI'))
    `);
  }
});

test("ayni adla CHECK kisiti gecmiyor - contype ayrimi tutuyor", async () => {
  const db = await getDb();
  await db.execute(sql`alter table randevu drop constraint randevu_cakisma_yok`);
  await db.execute(
    sql`alter table randevu add constraint randevu_cakisma_yok check (baslangic < bitis)`,
  );
  try {
    const yoklama = await veritabaniniYokla();
    expect(yoklama.durum).toBe("bozuk");
    expect(yoklama.cakismaKisitiVar).toBe(false);
  } finally {
    await db.execute(sql`alter table randevu drop constraint randevu_cakisma_yok`);
    await db.execute(sql`
      alter table randevu add constraint randevu_cakisma_yok
      exclude using gist (
        personel_id with =,
        tstzrange(baslangic, bitis, '[)') with &&
      ) where (durum in ('BEKLIYOR', 'ONAYLI'))
    `);
  }
});

test("DEGISMEZ 5: kamu govdesi baglanti dizesi ve kolon adi tasimiyor", async () => {
  const yoklama = await veritabaniniYokla();
  const kamu = kamuyaAcilanYoklama(yoklama);
  const govde = JSON.stringify(kamu);

  expect(govde).not.toMatch(/postgres:\/\//);
  expect(govde).not.toContain("password");
  expect(govde).not.toContain("hizmet.");
  expect(govde).not.toContain("randevu.");
  // eksikKolonlar / cakismaKisitiVar gibi teshis alanlari hic yok.
  expect(Object.keys(kamu).sort()).toEqual(["durum", "goc", "sureMs", "surum"]);
});
