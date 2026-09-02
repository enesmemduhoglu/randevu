ALTER TABLE "isletme" ADD COLUMN "il" text;--> statement-breakpoint
ALTER TABLE "isletme" ADD COLUMN "ilce" text;--> statement-breakpoint
ALTER TABLE "isletme" ADD COLUMN "kategori" text;--> statement-breakpoint
ALTER TABLE "isletme" ADD COLUMN "yayinda" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "isletme_dizin_idx" ON "isletme" USING btree ("il","kategori") WHERE "isletme"."yayinda" = true and "isletme"."aktif" = true;--> statement-breakpoint

-- Buradan asagisi ELLE yazildi: drizzle-kit CHECK kisiti uretmiyor.
--
-- Yarim doldurulmus profil YAYINA ALINAMAZ. Uygulama katmani da bunu kontrol
-- ediyor (scoped-db > yayindaAyarla) ama tek gerceklik kaynagi veritabani
-- olmali: `il` ya da `kategori` bos bir kayit dizinde "—" olarak gorunur ve
-- filtrelerin hicbirine dusmez, yani listede yer kaplayip tiklanamaz olurdu.
--
-- `NOT yayinda OR (...)`: kisit yalnizca yayindaki satirlari baglıyor. Taslak
-- halde duran bir isletme il/kategori girmeden de kaydedilebiliyor - kurulum
-- sirasi zorlanmiyor, yalnizca yayina cikis ani zorlaniyor.
ALTER TABLE "isletme" ADD CONSTRAINT "isletme_yayin_alanlari_tam"
  CHECK (NOT "yayinda" OR ("il" IS NOT NULL AND "kategori" IS NOT NULL));