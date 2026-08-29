// Verilen baglanti dizesindeki veritabani yoksa olusturur.
//
// Neden gerekli: warden'in SessionStart hook'u konteyneri tek bir POSTGRES_DB
// ile ayaga kaldiriyor. Bize iki veritabani lazim - randevu_dev ve randevu_test -
// ve ikincisi konteyner disinda olusturulmak zorunda.

import postgres from "postgres";

export async function veritabaniniOlustur(baglantiDizesi: string): Promise<void> {
  const hedef = new URL(baglantiDizesi);
  const ad = decodeURIComponent(hedef.pathname.replace(/^\//, ""));
  if (!ad) throw new Error(`Baglanti dizesinde veritabani adi yok: ${hedef.host}`);

  // Bakim baglantisi: 'postgres' veritabanina baglanip hedefi olustururuz.
  const bakim = new URL(baglantiDizesi);
  bakim.pathname = "/postgres";
  bakim.search = "";

  const sql = postgres(bakim.toString(), { max: 1 });
  try {
    const varMi = await sql`SELECT 1 FROM pg_database WHERE datname = ${ad}`;
    if (varMi.length === 0) {
      // Tanimlayici baglanma parametresi olarak gecirilemez; ad .env'den gelen
      // kendi degerimiz, yine de cift tirnak kacisi yapiliyor.
      await sql.unsafe(`CREATE DATABASE "${ad.replace(/"/g, '""')}"`);
      console.log(`veritabani olusturuldu: ${ad}`);
    } else {
      console.log(`veritabani zaten var: ${ad}`);
    }
  } finally {
    await sql.end();
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
