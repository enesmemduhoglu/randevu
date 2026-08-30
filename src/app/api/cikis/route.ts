import { checkOrigin } from "@/lib/origin";
import { supabaseSunucu } from "@/lib/supabase/sunucu";

// Cikis: oturum cookie'lerini temizler.
//
// GET DEGIL POST. Cikis durum degistiren bir islem; GET olsaydi yabanci bir
// sayfadaki <img src="/api/cikis"> kullaniciyi habersiz atardi. POST olunca
// DEGISMEZ 2 geregi checkOrigin de devreye giriyor.
//
// YANIT SOZLESMESI: basari `{ yon }`.

export async function POST(istek: Request) {
  const engel = checkOrigin(istek);
  if (engel) return engel;

  // Govde okunmuyor: cikisin girdisi yok. Ayristirma adimi olmadigi icin bozuk
  // govde diye bir durum da olusmuyor.
  const supabase = await supabaseSunucu();

  try {
    // KAPSAM "local", varsayilan "global" DEGIL.
    //
    // `global` kullanicinin TUM cihazlarindaki yenileme token'larini iptal
    // ediyor: telefonundan cikan biri masaustundeki oturumundan da atilmis
    // oluyor. Bu, kullanicinin "cikis yap"tan bekledigi sey degil - bekledigi
    // sey su anki tarayicinin oturumunun kapanmasi.
    //
    // Guvenlik bedeli yok: erisim token'i kisa omurlu ve imzayla dogrulaniyor,
    // yenileme token'i da bu cihazin cookie'sinde duruyordu ve simdi siliniyor.
    // "Tum cihazlardan cik" ayri ve acikca secilen bir islem olmali (Faz J).
    // Donus DEGERI BILEREK OKUNMUYOR. signOut firlatmiyor, `{ error }`
    // donuyor - ve bu hata bizi ilgilendirmiyor: SDK ag adimi basarisiz olsa
    // bile yerel oturumu (yani cookie'yi) yine de siliyor. Kullanici acisindan
    // cikis gerceklesmis oluyor, geride yalnizca sunucudaki yenileme
    // token'inin iptali kaliyor ve o token artik hicbir yerde durmuyor.
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Cikis adimi firlatirsa bile AKISI KESMIYORUZ ve kullaniciya basarili
    // donuyoruz. Gerekce: "cikis yapilamadi" diyen bir ekran, cikmis oldugunu
    // saniyorken oturumu acik kalan bir kullanicidan daha iyi bir sonuc
    // uretmiyor; her iki durumda da yapilacak sey ayni - istemci /giris'e
    // gidiyor ve orada oturum yoksa zaten giris formu cikiyor.
  }

  return Response.json({ yon: "/giris" });
}
