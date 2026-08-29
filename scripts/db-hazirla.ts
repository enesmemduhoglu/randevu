// Verilen baglanti dizesindeki veritabani yoksa olusturur.
//
// Neden gerekli: warden'in SessionStart hook'u konteyneri tek bir POSTGRES_DB
// ile ayaga kaldiriyor. Bize iki veritabani lazim - randevu_dev ve randevu_test -
// ve ikincisi konteyner disinda olusturulmak zorunda.

import { Client } from "pg";

export async function veritabaniniOlustur(baglantiDizesi: string): Promise<void> {
  const hedef = new URL(baglantiDizesi);
  const ad = decodeURIComponent(hedef.pathname.replace(/^\//, ""));
  if (!ad) throw new Error(`Baglanti dizesinde veritabani adi yok: ${hedef.host}`);

  // Bakim baglantisi: 'postgres' veritabanina baglanip hedefi olustururuz.
  const bakim = new URL(baglantiDizesi);
  bakim.pathname = "/postgres";
  bakim.search = "";

  const istemci = new Client({ connectionString: bakim.toString() });
  await istemci.connect();
  try {
    const { rowCount } = await istemci.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [ad],
    );
    if (rowCount === 0) {
      // Tanimlayici baglanma parametresi olarak gecirilemez; ad .env'den gelen
      // kendi degerimiz, yine de cift tirnak kacisi yapiliyor.
      await istemci.query(`CREATE DATABASE "${ad.replace(/"/g, '""')}"`);
      console.log(`veritabani olusturuldu: ${ad}`);
    } else {
      console.log(`veritabani zaten var: ${ad}`);
    }
  } finally {
    await istemci.end();
  }
}

// Dogrudan calistirildiginda (npm run db:hazirla) .env'deki iki veritabanini da kurar.
if (process.argv[1]?.endsWith("db-hazirla.ts")) {
  const { config } = await import("dotenv");
  config();
  for (const anahtar of ["DATABASE_URL", "TEST_DATABASE_URL"]) {
    const url = process.env[anahtar];
    if (url) await veritabaniniOlustur(url);
  }
}
