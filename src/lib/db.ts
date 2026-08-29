// KAPI DISI DOSYA. warden degismez kapisi bu dosyayi muaf tutar (bkz. CLAUDE.md
// degismez 1): ham PrismaClient yalnizca burada kurulur. Route handler'lar
// buraya degil, src/lib/scoped-db.ts'e bakar.

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

function baglantiDizesi(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL tanimli degil. Yerelde .env dosyasina bak; testlerde " +
        "vitest.setup.ts TEST_DATABASE_URL'i buraya kopyalar.",
    );
  }
  return url;
}

// Yerel ve test ortaminda tek istemci yeniden kullanilir: baglanti havuzu bir
// kez acilir, testler arasinda tasinir.
//
// Faz B'de Workers yolu eklenecek ve orada istemci ISTEK BASINA uretilecek -
// modul seviyesinde tutulan bir PrismaClient Hyperdrive ile takilabiliyor
// (prisma#28193). Iki ortam ayrildiginda bu dosya ikiye bolunmeyecek, sadece
// getDb icinde dallanacak.
let yerelIstemci: PrismaClient | undefined;

export async function getDb(): Promise<PrismaClient> {
  if (!yerelIstemci) {
    yerelIstemci = new PrismaClient({
      adapter: new PrismaPg({ connectionString: baglantiDizesi() }),
    });
  }
  return yerelIstemci;
}

// Testlerin ve betiklerin havuzu kapatabilmesi icin.
export async function baglantiyiKapat(): Promise<void> {
  await yerelIstemci?.$disconnect();
  yerelIstemci = undefined;
}
