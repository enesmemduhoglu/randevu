CREATE TYPE "public"."bildirim_durum" AS ENUM('BEKLIYOR', 'GONDERILDI', 'HATA');--> statement-breakpoint
CREATE TYPE "public"."bildirim_turu" AS ENUM('EPOSTA', 'SMS');--> statement-breakpoint
CREATE TYPE "public"."randevu_durum" AS ENUM('BEKLIYOR', 'ONAYLI', 'IPTAL', 'TAMAMLANDI', 'GELMEDI');--> statement-breakpoint
CREATE TYPE "public"."randevu_kaynak" AS ENUM('MUSTERI', 'ISLETME');--> statement-breakpoint
CREATE TABLE "bildirim_kuyrugu" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"isletme_id" uuid NOT NULL,
	"randevu_id" uuid NOT NULL,
	"tur" "bildirim_turu" NOT NULL,
	"sablon" text NOT NULL,
	"planlanan_zaman" timestamp with time zone NOT NULL,
	"gonderim_zamani" timestamp with time zone,
	"durum" "bildirim_durum" DEFAULT 'BEKLIYOR' NOT NULL,
	"hata_metni" text,
	"onizleme_html" text,
	"olusturma_tarihi" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calisma_saati" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"isletme_id" uuid NOT NULL,
	"personel_id" uuid NOT NULL,
	"haftanin_gunu" integer NOT NULL,
	"baslangic_dk" integer NOT NULL,
	"bitis_dk" integer NOT NULL,
	"olusturma_tarihi" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hizmet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"isletme_id" uuid NOT NULL,
	"ad" text NOT NULL,
	"aciklama" text,
	"sure_dk" integer NOT NULL,
	"fiyat_kurus" integer DEFAULT 0 NOT NULL,
	"renk" text,
	"sira" integer DEFAULT 0 NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"olusturma_tarihi" timestamp with time zone DEFAULT now() NOT NULL,
	"guncelleme_tarihi" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kapali" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"isletme_id" uuid NOT NULL,
	"personel_id" uuid,
	"baslangic" timestamp with time zone NOT NULL,
	"bitis" timestamp with time zone NOT NULL,
	"aciklama" text,
	"olusturma_tarihi" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "musteri" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"isletme_id" uuid NOT NULL,
	"ad" text NOT NULL,
	"telefon" text NOT NULL,
	"eposta" text,
	"not" text,
	"kullanici_id" uuid,
	"olusturma_tarihi" timestamp with time zone DEFAULT now() NOT NULL,
	"guncelleme_tarihi" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personel_hizmet" (
	"personel_id" uuid NOT NULL,
	"hizmet_id" uuid NOT NULL,
	"isletme_id" uuid NOT NULL,
	CONSTRAINT "personel_hizmet_personel_id_hizmet_id_pk" PRIMARY KEY("personel_id","hizmet_id")
);
--> statement-breakpoint
CREATE TABLE "randevu" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"isletme_id" uuid NOT NULL,
	"personel_id" uuid NOT NULL,
	"hizmet_id" uuid NOT NULL,
	"musteri_id" uuid NOT NULL,
	"baslangic" timestamp with time zone NOT NULL,
	"bitis" timestamp with time zone NOT NULL,
	"durum" "randevu_durum" DEFAULT 'BEKLIYOR' NOT NULL,
	"kaynak" "randevu_kaynak" DEFAULT 'MUSTERI' NOT NULL,
	"not" text,
	"iptal_token" text NOT NULL,
	"olusturma_tarihi" timestamp with time zone DEFAULT now() NOT NULL,
	"guncelleme_tarihi" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "isletme" ADD COLUMN "telefon" text;--> statement-breakpoint
ALTER TABLE "isletme" ADD COLUMN "adres" text;--> statement-breakpoint
ALTER TABLE "isletme" ADD COLUMN "hakkinda" text;--> statement-breakpoint
ALTER TABLE "isletme" ADD COLUMN "slot_araligi_dk" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "isletme" ADD COLUMN "min_once_bildirim_dk" integer DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE "isletme" ADD COLUMN "maks_ileri_gun" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "isletme" ADD COLUMN "otomatik_onay" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "bildirim_kuyrugu" ADD CONSTRAINT "bildirim_kuyrugu_isletme_id_isletme_id_fk" FOREIGN KEY ("isletme_id") REFERENCES "public"."isletme"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bildirim_kuyrugu" ADD CONSTRAINT "bildirim_kuyrugu_randevu_id_randevu_id_fk" FOREIGN KEY ("randevu_id") REFERENCES "public"."randevu"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calisma_saati" ADD CONSTRAINT "calisma_saati_isletme_id_isletme_id_fk" FOREIGN KEY ("isletme_id") REFERENCES "public"."isletme"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calisma_saati" ADD CONSTRAINT "calisma_saati_personel_id_personel_id_fk" FOREIGN KEY ("personel_id") REFERENCES "public"."personel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hizmet" ADD CONSTRAINT "hizmet_isletme_id_isletme_id_fk" FOREIGN KEY ("isletme_id") REFERENCES "public"."isletme"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapali" ADD CONSTRAINT "kapali_isletme_id_isletme_id_fk" FOREIGN KEY ("isletme_id") REFERENCES "public"."isletme"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kapali" ADD CONSTRAINT "kapali_personel_id_personel_id_fk" FOREIGN KEY ("personel_id") REFERENCES "public"."personel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "musteri" ADD CONSTRAINT "musteri_isletme_id_isletme_id_fk" FOREIGN KEY ("isletme_id") REFERENCES "public"."isletme"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "musteri" ADD CONSTRAINT "musteri_kullanici_id_kullanici_id_fk" FOREIGN KEY ("kullanici_id") REFERENCES "public"."kullanici"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personel_hizmet" ADD CONSTRAINT "personel_hizmet_personel_id_personel_id_fk" FOREIGN KEY ("personel_id") REFERENCES "public"."personel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personel_hizmet" ADD CONSTRAINT "personel_hizmet_hizmet_id_hizmet_id_fk" FOREIGN KEY ("hizmet_id") REFERENCES "public"."hizmet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personel_hizmet" ADD CONSTRAINT "personel_hizmet_isletme_id_isletme_id_fk" FOREIGN KEY ("isletme_id") REFERENCES "public"."isletme"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "randevu" ADD CONSTRAINT "randevu_isletme_id_isletme_id_fk" FOREIGN KEY ("isletme_id") REFERENCES "public"."isletme"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "randevu" ADD CONSTRAINT "randevu_personel_id_personel_id_fk" FOREIGN KEY ("personel_id") REFERENCES "public"."personel"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "randevu" ADD CONSTRAINT "randevu_hizmet_id_hizmet_id_fk" FOREIGN KEY ("hizmet_id") REFERENCES "public"."hizmet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "randevu" ADD CONSTRAINT "randevu_musteri_id_musteri_id_fk" FOREIGN KEY ("musteri_id") REFERENCES "public"."musteri"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bildirim_kuyrugu_planlanan_idx" ON "bildirim_kuyrugu" USING btree ("durum","planlanan_zaman");--> statement-breakpoint
CREATE INDEX "bildirim_kuyrugu_randevu_id_idx" ON "bildirim_kuyrugu" USING btree ("randevu_id");--> statement-breakpoint
CREATE INDEX "calisma_saati_isletme_id_idx" ON "calisma_saati" USING btree ("isletme_id");--> statement-breakpoint
CREATE INDEX "calisma_saati_personel_gun_idx" ON "calisma_saati" USING btree ("personel_id","haftanin_gunu");--> statement-breakpoint
CREATE INDEX "hizmet_isletme_id_idx" ON "hizmet" USING btree ("isletme_id");--> statement-breakpoint
CREATE INDEX "kapali_isletme_id_idx" ON "kapali" USING btree ("isletme_id");--> statement-breakpoint
CREATE INDEX "kapali_aralik_idx" ON "kapali" USING btree ("isletme_id","baslangic","bitis");--> statement-breakpoint
CREATE UNIQUE INDEX "musteri_isletme_telefon_idx" ON "musteri" USING btree ("isletme_id","telefon");--> statement-breakpoint
CREATE INDEX "musteri_kullanici_id_idx" ON "musteri" USING btree ("kullanici_id");--> statement-breakpoint
CREATE INDEX "personel_hizmet_isletme_id_idx" ON "personel_hizmet" USING btree ("isletme_id");--> statement-breakpoint
CREATE INDEX "personel_hizmet_hizmet_id_idx" ON "personel_hizmet" USING btree ("hizmet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "randevu_iptal_token_idx" ON "randevu" USING btree ("iptal_token");--> statement-breakpoint
CREATE INDEX "randevu_isletme_baslangic_idx" ON "randevu" USING btree ("isletme_id","baslangic");--> statement-breakpoint
CREATE INDEX "randevu_personel_baslangic_idx" ON "randevu" USING btree ("personel_id","baslangic");--> statement-breakpoint
CREATE INDEX "randevu_musteri_id_idx" ON "randevu" USING btree ("musteri_id");

--> statement-breakpoint
-- ============================================================================
-- ELLE YAZILDI. Buradan asagisi drizzle-kit'in urettigi kisim degil.
--
-- DEGISMEZ 8: ayni personelin cakisan iki AKTIF randevusu veritabani
-- seviyesinde imkansiz. Drizzle EXCLUDE kisitini ifade edemiyor, bu yuzden
-- kisit migration'a elle yaziliyor ve sema dosyasinda yalnizca yorumla
-- anlatiliyor. `drizzle-kit generate` bir daha kosarsa bu bloku SILMEZ ama
-- yeni dosyaya da TASIMAZ - blok bu dosyada kalir.
--
-- Neden uygulama katmaninda degil: "once bak, sonra yaz" iki es zamanli istek
-- arasinda hep aciktir. Iki musteri ayni saniyede ayni saate bassa ikisi de
-- bos gorur. Kisit Postgres'te oldugu icin ikincisi yazamiyor ve uygulama onu
-- 409'a ceviriyor.
-- ============================================================================

-- gist indeksinde uuid gibi skaler tipleri = ile karsilastirabilmek icin.
-- Bu uzanti olmadan asagidaki kisit "data type uuid has no default operator
-- class for access method gist" ile duser.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

-- Aralik '[)': baslangic dahil, bitis haric. 10:00-11:00 ile 11:00-12:00
-- CAKISMIYOR - biri bitince digeri basliyor. '[]' olsaydi ardisik iki randevu
-- alinamazdi.
--
-- WHERE kosulu sart: iptal edilmis ya da gelinmemis bir randevu saati BOSALTIR.
-- Kisit onlari da kapsasaydi iptal edilen saate yeni randevu alinamazdi.
ALTER TABLE "randevu" ADD CONSTRAINT "randevu_cakisma_yok"
  EXCLUDE USING gist (
    "personel_id" WITH =,
    tstzrange("baslangic", "bitis", '[)') WITH &&
  ) WHERE ("durum" IN ('BEKLIYOR', 'ONAYLI'));--> statement-breakpoint

-- Bitis her zaman baslangictan sonra. EXCLUDE kisiti ters araligi yakalamaz
-- (tstzrange zaten hata verir ama mesaji anlasilmaz olur); bu kontrol sorunu
-- yazma aninda ve okunur bicimde durduruyor.
ALTER TABLE "randevu" ADD CONSTRAINT "randevu_bitis_baslangictan_sonra"
  CHECK ("bitis" > "baslangic");--> statement-breakpoint

ALTER TABLE "kapali" ADD CONSTRAINT "kapali_bitis_baslangictan_sonra"
  CHECK ("bitis" > "baslangic");--> statement-breakpoint

-- Calisma saati: gun 0-6, dakikalar gun icinde ve sirali.
-- 1440 = 24 saat; bitis 1440 olabilir (gece yarisinda kapanis).
ALTER TABLE "calisma_saati" ADD CONSTRAINT "calisma_saati_gecerli"
  CHECK (
    "haftanin_gunu" BETWEEN 0 AND 6
    AND "baslangic_dk" >= 0
    AND "bitis_dk" <= 1440
    AND "bitis_dk" > "baslangic_dk"
  );--> statement-breakpoint

-- Sure ve fiyat negatif olamaz. Arayuz zaten engelliyor ama tek gerceklik
-- kaynagi veritabani olmali.
ALTER TABLE "hizmet" ADD CONSTRAINT "hizmet_gecerli"
  CHECK ("sure_dk" > 0 AND "fiyat_kurus" >= 0);
