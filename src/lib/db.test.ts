import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, test } from "vitest";

import { isletme } from "@/db/sema";
import { tablolariBosalt } from "@/db/test-temizlik";
import { baglantiyiKapat, getDb } from "@/lib/db";

// Bu dosya zeminin kanit testi: sema, migration, gercek Postgres ve Drizzle
// birlikte calisiyor mu? Is mantigini degil, altyapiyi dogrular.

beforeEach(async () => {
  await tablolariBosalt();
});

afterAll(async () => {
  await baglantiyiKapat();
});

test("isletme yazilip geri okunabiliyor", async () => {
  const db = await getDb();

  const [olusan] = await db
    .insert(isletme)
    .values({ ad: "Test Kuafor", slug: "test-kuafor" })
    .returning();

  expect(olusan.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(olusan.saatDilimi).toBe("Europe/Istanbul");
  expect(olusan.aktif).toBe(true);

  const [okunan] = await db
    .select()
    .from(isletme)
    .where(eq(isletme.slug, "test-kuafor"));
  expect(okunan?.ad).toBe("Test Kuafor");
});

test("ayni slug iki kez kullanilamaz", async () => {
  const db = await getDb();
  await db.insert(isletme).values({ ad: "Birinci", slug: "ayni-slug" });

  await expect(
    db.insert(isletme).values({ ad: "Ikinci", slug: "ayni-slug" }),
  ).rejects.toThrow();
});
