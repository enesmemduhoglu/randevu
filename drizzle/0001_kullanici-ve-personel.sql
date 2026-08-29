CREATE TYPE "public"."rol" AS ENUM('SAHIP', 'PERSONEL', 'MUSTERI');--> statement-breakpoint
CREATE TABLE "kullanici" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" text NOT NULL,
	"eposta" text NOT NULL,
	"ad" text NOT NULL,
	"telefon" text,
	"rol" "rol" NOT NULL,
	"isletme_id" uuid,
	"olusturma_tarihi" timestamp with time zone DEFAULT now() NOT NULL,
	"guncelleme_tarihi" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"isletme_id" uuid NOT NULL,
	"ad" text NOT NULL,
	"unvan" text,
	"kullanici_id" uuid,
	"sira" integer DEFAULT 0 NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"olusturma_tarihi" timestamp with time zone DEFAULT now() NOT NULL,
	"guncelleme_tarihi" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kullanici" ADD CONSTRAINT "kullanici_isletme_id_isletme_id_fk" FOREIGN KEY ("isletme_id") REFERENCES "public"."isletme"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personel" ADD CONSTRAINT "personel_isletme_id_isletme_id_fk" FOREIGN KEY ("isletme_id") REFERENCES "public"."isletme"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personel" ADD CONSTRAINT "personel_kullanici_id_kullanici_id_fk" FOREIGN KEY ("kullanici_id") REFERENCES "public"."kullanici"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kullanici_auth_user_id_idx" ON "kullanici" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "kullanici_isletme_id_idx" ON "kullanici" USING btree ("isletme_id");--> statement-breakpoint
CREATE INDEX "personel_isletme_id_idx" ON "personel" USING btree ("isletme_id");--> statement-breakpoint
CREATE INDEX "personel_kullanici_id_idx" ON "personel" USING btree ("kullanici_id");