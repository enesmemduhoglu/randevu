// KAPI DISI DOSYA (bkz. CLAUDE.md degismez 1). Ham veritabani erisimi burada
// mesru: aranan kayit kiraciya bagli DEGIL, kiraciyi belirleyen kaydin ta
// kendisi. scoped-db bu dosyanin ciktisini girdi olarak aliyor.

import { eq } from "drizzle-orm";

import { kullanici } from "@/db/sema";
import { getDb } from "@/lib/db";
import type { IsletmeOturumu, Rol } from "@/lib/scoped-db";
import { supabaseSunucu } from "@/lib/supabase/sunucu";

export type Oturum = {
  kullaniciId: string;
  authUserId: string;
  eposta: string;
  ad: string;
  rol: Rol;
  /// DEGISMEZ 6: duz string. Musteri rolunde null - musteri tek bir isletmeye
  /// bagli degil.
  isletmeId: string | null;
};

/// Istegi yapan kisiyi cozer. Oturum yoksa null.
///
/// Kimlik SUPABASE JWT'sinden, yetki KENDI veritabanimizdan geliyor. Ikisini
/// ayirmak bilincli: rol ya da kiraci degistiginde token'in yenilenmesini
/// beklemiyoruz, bir sonraki istekte dogru deger okunuyor.
export async function auth(): Promise<Oturum | null> {
  const supabase = await supabaseSunucu();

  // getClaims, getSession'in aksine imzayi DOGRULUYOR. Asimetrik imza
  // anahtarlariyla dogrulama yerelde WebCrypto ile yapiliyor, JWKS
  // onbellekleniyor - istek basina ag turu yok. getSession cookie'den geleni
  // dogrulamadan donduruyor ve Supabase kendi dokumaninda ona guvenilmemesi
  // gerektigini soyluyor.
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  const authUserId = data.claims.sub;

  const db = await getDb();
  const [kayit] = await db
    .select({
      id: kullanici.id,
      eposta: kullanici.eposta,
      ad: kullanici.ad,
      rol: kullanici.rol,
      isletmeId: kullanici.isletmeId,
    })
    .from(kullanici)
    .where(eq(kullanici.authUserId, authUserId))
    .limit(1);

  // Supabase'de hesap var ama bizde kullanici kaydi yok: kayit akisi yarida
  // kalmis demektir. Oturum acilmis saymiyoruz - yarim bir hesapla panele
  // girmek, kiracisi olmayan bir oturum uretirdi.
  if (!kayit) return null;

  return {
    kullaniciId: kayit.id,
    authUserId,
    eposta: kayit.eposta,
    ad: kayit.ad,
    rol: kayit.rol,
    isletmeId: kayit.isletmeId,
  };
}

/// Panel tarafi icin daraltilmis oturum. Isletmeye bagli olmayan bir rol
/// (musteri) ya da isletmeId'si olmayan bir kayit buraya gecemiyor; boylece
/// scoped-db'nin `isletmeId: string` sozlesmesi tip seviyesinde garanti.
export async function isletmeOturumu(): Promise<IsletmeOturumu | null> {
  const oturum = await auth();
  if (!oturum) return null;
  if (oturum.rol === "MUSTERI") return null;
  if (!oturum.isletmeId) return null;

  return {
    kullaniciId: oturum.kullaniciId,
    authUserId: oturum.authUserId,
    isletmeId: oturum.isletmeId,
    rol: oturum.rol,
  };
}
