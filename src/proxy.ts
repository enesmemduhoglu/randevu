import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next 16'da bu dosya `middleware.ts` degil `proxy.ts`, export adi da `proxy`.
//
// BURADA YETKILENDIRME YAPILMIYOR. Proxy edge'de kosuyor (OpenNext Node
// middleware'i desteklemiyor), yani veritabani yok - kullanicinin hangi
// isletmeye ve role bagli oldugunu buradan bilemeyiz.
//
// Yaptigi iki sey var:
//   1. Supabase token'ini yeniliyor. Sunucu bilesenleri cookie yazamiyor,
//      yenilemenin tek yapilabilecegi yer burasi.
//   2. Oturum cookie'si hic yoksa panele girisi ucuzca kesiyor - kullaniciyi
//      bos bir sayfaya goturup orada yonlendirmekten iyi.
//
// Gercek yetkilendirme her zaman sunucu tarafinda auth() ile yapiliyor:
// cookie'nin varligi kimlik kaniti DEGIL.

const KORUMALI = ["/panel"];

export async function proxy(istek: NextRequest) {
  let yanit = NextResponse.next({ request: istek });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return yanit;

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return istek.cookies.getAll();
      },
      setAll(yenileri) {
        for (const { name, value } of yenileri) {
          istek.cookies.set(name, value);
        }
        yanit = NextResponse.next({ request: istek });
        for (const { name, value, options } of yenileri) {
          yanit.cookies.set(name, value, options);
        }
      },
    },
  });

  // Bu cagri token suresi dolmak uzereyse yeniliyor ve setAll'i tetikliyor.
  // Donusu yetki karari icin KULLANILMIYOR.
  const { data } = await supabase.auth.getClaims();

  const yol = istek.nextUrl.pathname;
  if (KORUMALI.some((k) => yol === k || yol.startsWith(`${k}/`))) {
    if (!data?.claims?.sub) {
      const girisUrl = new URL("/giris", istek.url);
      // Girisden sonra kullaniciyi gitmek istedigi yere geri gonderelim.
      girisUrl.searchParams.set("devam", yol);
      return NextResponse.redirect(girisUrl);
    }
  }

  return yanit;
}

export const config = {
  // Statik varliklar ve resim optimizasyonu disinda her yol. Proxy her istekte
  // kostugu icin kapsam dar tutuluyor.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
