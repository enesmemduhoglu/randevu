// Veritabani semasi. Tablo ve alan adlari Turkce - depo sozlesmesi (CLAUDE.md).

import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const rolEnum = pgEnum("rol", ["SAHIP", "PERSONEL", "MUSTERI"]);

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

/// Kimligi Supabase Auth sagliyor, veriyi biz tutuyoruz.
///
/// DEGISMEZ 9: auth.users'a foreign key YOK. authUserId duz bir uuid string
/// olarak duruyor. Boylece migration'lar tum semaya tek basina sahip oluyor,
/// yerel Postgres'te auth semasi olmadan kosuyor ve testler kendi JWT'lerini
/// imzalayabiliyor.
export const kullanici = pgTable(
  "kullanici",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authUserId: text("auth_user_id").notNull(),
    eposta: text("eposta").notNull(),
    ad: text("ad").notNull(),
    telefon: text("telefon"),
    rol: rolEnum("rol").notNull(),

    // Musteri rolunde null: musteri tek bir isletmeye bagli degil, bircok
    // isletmeden randevu alabilir.
    isletmeId: uuid("isletme_id").references(() => isletme.id, {
      onDelete: "cascade",
    }),

    olusturmaTarihi: timestamp("olusturma_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow(),
    guncellemeTarihi: timestamp("guncelleme_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Her istekte bu indeks uzerinden tek satir okunuyor: auth.ts token'daki
    // sub degerini burada arayip isletmeId ve rolu buluyor.
    uniqueIndex("kullanici_auth_user_id_idx").on(t.authUserId),
    index("kullanici_isletme_id_idx").on(t.isletmeId),
  ],
);

/// Randevunun bagli oldugu kisi. Tek kisilik isletmede de bir personel var:
/// kayit sirasinda otomatik olusturuluyor ve arayuz personel secimi hic
/// gostermiyor. Boylece ikinci personel eklemek migration gerektirmiyor.
export const personel = pgTable(
  "personel",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    isletmeId: uuid("isletme_id")
      .notNull()
      .references(() => isletme.id, { onDelete: "cascade" }),
    ad: text("ad").notNull(),
    unvan: text("unvan"),

    // Personelin giris hesabi olmayabilir; isletme sahibi onun adina yonetir.
    kullaniciId: uuid("kullanici_id").references(() => kullanici.id, {
      onDelete: "set null",
    }),

    sira: integer("sira").notNull().default(0),
    aktif: boolean("aktif").notNull().default(true),
    olusturmaTarihi: timestamp("olusturma_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow(),
    guncellemeTarihi: timestamp("guncelleme_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("personel_isletme_id_idx").on(t.isletmeId),
    index("personel_kullanici_id_idx").on(t.kullaniciId),
  ],
);

export const isletmeIliskileri = relations(isletme, ({ many }) => ({
  kullanicilar: many(kullanici),
  personeller: many(personel),
}));

export const kullaniciIliskileri = relations(kullanici, ({ one }) => ({
  isletme: one(isletme, {
    fields: [kullanici.isletmeId],
    references: [isletme.id],
  }),
}));

export const personelIliskileri = relations(personel, ({ one }) => ({
  isletme: one(isletme, {
    fields: [personel.isletmeId],
    references: [isletme.id],
  }),
  kullanici: one(kullanici, {
    fields: [personel.kullaniciId],
    references: [kullanici.id],
  }),
}));
