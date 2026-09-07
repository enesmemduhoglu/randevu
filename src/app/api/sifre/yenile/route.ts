import { girisYonu, kullaniciyiYukle } from "@/lib/auth";
import { sifreDogrula } from "@/lib/girdi";
import { govdeOku, govdeOkunamadi } from "@/lib/govde";
import { checkOrigin } from "@/lib/origin";
import { sifreYenilemeHatasi } from "@/lib/supabase/hata";
import { supabaseSunucu } from "@/lib/supabase/sunucu";

// Sifre sifirlamanin IKINCI adimi: mailden gelen token_hash'i dogrular, yeni
// sifreyi yazar, oturum acar.
//
// TOKEN_HASH + verifyOtp, PKCE ?code= DEGIL: `@supabase/ssr` PKCE akisini
// zorluyor ve resetPasswordForEmail bir code_verifier'i COOKIE'YE yaziyor.
// Mail telefonda Gmail uygulamasinin KENDI IC TARAYICISINDA aciliyorsa o
// cookie orada yok ve akis sessizce oluyor - hedef kitle telefondan geliyor,
// yani bu marjinal degil baskin durum. token_hash cihazdan bagimsiz.
//
// HANGI HESABIN SIFRESI DEGISTI'ni yalnizca token_hash belirliyor - govdeye
// fazladan `eposta` ya da `kullaniciId` eklense DAHI davranis degismiyor
// (ayni disiplin /api/kayit/tamamla'da: "e-posta token'dan geliyor, govdeden
// DEGIL").
//
// Oturum bu route'u ACMIYOR: `auth()`/`panelKapisi` cagrilmiyor. Token'siz
// istek oturumlu bir tarayicidan gelse bile 400 - oturum sahibi baskasinin
// sifresini degistiremiyor.

export async function POST(istek: Request) {
  const engel = checkOrigin(istek);
  if (engel) return engel;

  const govde = await govdeOku(istek);
  if (!govde) return govdeOkunamadi();

  const tokenHash = govde.tokenHash;
  if (typeof tokenHash !== "string" || tokenHash.length === 0 || tokenHash.length > 512) {
    return Response.json(
      { hata: "Bağlantı geçersiz ya da süresi dolmuş. Yeni bir sıfırlama bağlantısı isteyin." },
      { status: 400 },
    );
  }

  // GIRISTEKI GEVSEK KURALIN AKSINE burada TAM kural gecerli: bu YENI bir
  // sifre, eski bir hesabin kalinti degeri degil.
  const sifre = sifreDogrula(govde.sifre);
  if (!sifre.tamam) return Response.json({ hata: sifre.hata }, { status: 400 });

  const supabase = await supabaseSunucu();

  const { data, error: dogrulamaHatasi } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "recovery",
  });
  if (dogrulamaHatasi || !data.user) {
    const yanit = sifreYenilemeHatasi(dogrulamaHatasi);
    return Response.json({ hata: yanit.hata }, { status: yanit.durum });
  }

  const { error: yazmaHatasi } = await supabase.auth.updateUser({
    password: sifre.deger,
  });
  if (yazmaHatasi) {
    const yanit = sifreYenilemeHatasi(yazmaHatasi);
    return Response.json({ hata: yanit.hata }, { status: yanit.durum });
  }

  // "others": bu akis "hesabimin kontrolunu kaybettim" yolu - /api/cikis'in
  // TERSI (orada "local", cunku kullanici yalnizca bu tarayicidan cikmak
  // istiyor). Diger cihazlardaki yenileme token'larini ayakta birakmak,
  // sifirlamanin amacini bosa cikarirdi.
  await supabase.auth.signOut({ scope: "others" });

  const kayit = await kullaniciyiYukle(data.user.id);
  return Response.json({ yon: girisYonu(kayit, undefined) });
}
