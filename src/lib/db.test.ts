import { afterAll, beforeEach, expect, test } from "vitest";

import { baglantiyiKapat, getDb } from "./db";

// Bu dosya Faz A'nin kanit testi: sema, migration, gercek Postgres ve Prisma
// adaptoru birlikte calisiyor mu? Is mantigini degil, zemini dogrular.

beforeEach(async () => {
  const db = await getDb();
  await db.isletme.deleteMany();
});

afterAll(async () => {
  await baglantiyiKapat();
});

test("isletme yazilip geri okunabiliyor", async () => {
  const db = await getDb();

  const olusan = await db.isletme.create({
    data: { ad: "Test Kuafor", slug: "test-kuafor" },
  });

  expect(olusan.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(olusan.saatDilimi).toBe("Europe/Istanbul");
  expect(olusan.aktif).toBe(true);

  const okunan = await db.isletme.findUnique({ where: { slug: "test-kuafor" } });
  expect(okunan?.ad).toBe("Test Kuafor");
});

test("ayni slug iki kez kullanilamaz", async () => {
  const db = await getDb();
  await db.isletme.create({ data: { ad: "Birinci", slug: "ayni-slug" } });

  await expect(
    db.isletme.create({ data: { ad: "Ikinci", slug: "ayni-slug" } }),
  ).rejects.toThrow();
});
