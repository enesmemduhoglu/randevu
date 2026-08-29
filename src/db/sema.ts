// Veritabani semasi. Model ve alan adlari Turkce - depo sozlesmesi (CLAUDE.md).

import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/// Kiraci koku. Kiraciya bagli her tablo isletmeId tasir ve sorgular yalnizca
/// src/lib/scoped-db.ts uzerinden, o filtre enjekte edilerek gider.
export const isletme = pgTable(
  "isletme",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    ad: text("ad").notNull(),

    // Randevu zamanlari DB'de UTC durur; yerel saate cevirme bu alanla yapilir.
    saatDilimi: text("saat_dilimi").notNull().default("Europe/Istanbul"),

    aktif: boolean("aktif").notNull().default(true),
    olusturmaTarihi: timestamp("olusturma_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow(),
    guncellemeTarihi: timestamp("guncelleme_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("isletme_aktif_idx").on(t.aktif)],
);
