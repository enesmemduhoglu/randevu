import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { isletme, kullanici } from "@/db/sema";
import { tablolariBosalt } from "@/db/test-temizlik";
import { baglantiyiKapat, getDb } from "@/lib/db";
import { benzersizIhlaliMi, cakismaIhlaliMi, pgHata } from "@/lib/pg-hata";

// Bu dosyanin yarisi GERCEK bir Drizzle hatasiyla kosuyor, elde yazilmis bir
// nesneyle degil. Sebep: hatanin bicimi tam olarak burada yanlis bilinmisti.
// Drizzle, postgres.js'in hatasini kendi DrizzleQueryError'una sariyor ve
// `code` alani sarmalayicida YOK. Elde uydurulmus bir nesneyle sinanan bir
// cikarim, uretimde hic eslesmeyen bir dali "gecti" diye isaretlerdi.

beforeEach(async () => {
  await tablolariBosalt();
});

afterAll(async () => {
  await baglantiyiKapat();
});

describe("pgHata - gercek Drizzle hatasi", () => {
  test("sarmalanmis hatadan kod ve kisit adi cikariyor", async () => {
    const db = await getDb();
    const [i] = await db
      .insert(isletme)
      .values({ ad: "Deneme", slug: "pg-hata-deneme" })
      .returning();

    const veri = {
      authUserId: "pg-hata-ayni",
      eposta: "a@ornek.com",
      ad: "Deneme",
      rol: "SAHIP" as const,
      isletmeId: i.id,
    };
    await db.insert(kullanici).values(veri);

    let yakalanan: unknown;
    try {
      await db.insert(kullanici).values(veri);
    } catch (hata) {
      yakalanan = hata;
    }

    // Once sarmalayicinin gercekten sardigini gosteriyoruz: dogrudan okuma
    // BOS donuyor. Bu satir, yardimci fonksiyonun neden var oldugunu anlatan
    // kanit.
    expect((yakalanan as { code?: unknown }).code).toBeUndefined();

    const bilgi = pgHata(yakalanan);
    expect(bilgi?.kod).toBe("23505");
    expect(bilgi?.kisit).toBe("kullanici_auth_user_id_idx");
    expect(benzersizIhlaliMi(yakalanan, "kullanici_auth_user_id_idx")).toBe(true);
  });

  test("baska bir kisit adi eslesmiyor", async () => {
    const db = await getDb();
    await db.insert(isletme).values({ ad: "Bir", slug: "ayni-slug" });

    let yakalanan: unknown;
    try {
      await db.insert(isletme).values({ ad: "Iki", slug: "ayni-slug" });
    } catch (hata) {
      yakalanan = hata;
    }

    expect(pgHata(yakalanan)?.kod).toBe("23505");
    expect(benzersizIhlaliMi(yakalanan, "kullanici_auth_user_id_idx")).toBe(false);
    expect(benzersizIhlaliMi(yakalanan, "isletme_slug_unique")).toBe(true);
  });
});

describe("pgHata - sinir durumlari", () => {
  test("Postgres hatasi olmayan degerler null donuyor", () => {
    expect(pgHata(null)).toBeNull();
    expect(pgHata("bir metin")).toBeNull();
    expect(pgHata(new Error("duz hata"))).toBeNull();
  });

  test("dongusel cause sonsuz donguye sokmuyor", () => {
    // Kendini gosteren bir `cause` gercekte olabiliyor (bazi sarmalayicilar
    // hatayi kendi icine koyuyor); derinlik siniri bunun icin.
    const a: { cause?: unknown } = {};
    a.cause = a;
    expect(pgHata(a)).toBeNull();
  });

  test("kisit adi olmayan hata da kod donduruyor", () => {
    // Postgres her hata icin constraint_name vermiyor (ornegin sozdizimi
    // hatasi). Kod okunabilmeli, kisit null kalmali.
    expect(pgHata({ code: "42601" })).toEqual({ kod: "42601", kisit: null });
  });

  test("cakisma ihlali kodu taniniyor", () => {
    expect(cakismaIhlaliMi({ code: "23P01" })).toBe(true);
    expect(cakismaIhlaliMi({ code: "23505" })).toBe(false);
    expect(cakismaIhlaliMi(null)).toBe(false);
  });
});
