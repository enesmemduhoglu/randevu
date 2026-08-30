// YALNIZCA TESTLERDE kullanilan yardimci: kiraciya bagli her tabloyu bosaltir.
//
// NEDEN VAR: her test dosyasi kendi bildigi tablolari tek tek siliyordu ve
// Faz E'de sema buyuyunce bu sessizce bozuldu. `randevu` tablosu personele
// `ON DELETE restrict` ile bagli; bir test dosyasi randevu birakip cikinca
// SONRAKI dosyanin `delete(personel)` cagrisi kisit ihlaliyle dusuyordu.
// Testler tek tek gecerken hep birlikte dusuyorlardi - en pahali hata turu.
//
// TRUNCATE ... CASCADE, foreign key zincirini Postgres'e cozduruyor: yeni bir
// tablo eklendiginde bu dosyaya dokunmak gerekmiyor. Kok olarak `isletme` ve
// `kullanici` yetiyor cunku kiraciya bagli her sey ikisinden birine zincirle
// bagli.

import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";

export async function tablolariBosalt(): Promise<void> {
  const db = await getDb();
  await db.execute(
    sql`truncate table "isletme", "kullanici" restart identity cascade`,
  );
}
