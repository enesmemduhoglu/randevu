-- CreateTable
CREATE TABLE "Isletme" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "saatDilimi" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "olusturmaTarihi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guncellemeTarihi" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Isletme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Isletme_slug_key" ON "Isletme"("slug");

-- CreateIndex
CREATE INDEX "Isletme_aktif_idx" ON "Isletme"("aktif");
