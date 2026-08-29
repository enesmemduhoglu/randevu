CREATE TABLE "isletme" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"ad" text NOT NULL,
	"saat_dilimi" text DEFAULT 'Europe/Istanbul' NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"olusturma_tarihi" timestamp with time zone DEFAULT now() NOT NULL,
	"guncelleme_tarihi" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "isletme_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "isletme_aktif_idx" ON "isletme" USING btree ("aktif");