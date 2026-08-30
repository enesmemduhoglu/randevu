import { checkOrigin } from "@/lib/origin";
import { supabaseSunucu } from "@/lib/supabase/sunucu";

// Oturum tazeleme.
//
// NEDEN VAR: Supabase erisim token'i kisa omurlu ve yenilenmesi icin cookie
// YAZMAK gerekiyor. Sunucu bilesenleri cookie yazamiyor (Next izin vermiyor),
// route handler'lar yazabiliyor. Bu route'un tek isi o yazma iznini
// kullanmak.
//
// Bu isi Faz D'de `src/proxy.ts` yapiyordu. Faz E'de olculdu: Next 16'da
// proxy ZORUNLU olarak Node.js runtime'inda kosuyor (`runtime` secenegi yok,
// verilirse hata firlatiyor) ve OpenNext onun icin Next sunucu runtime'inin
// IKINCI bir kopyasini paketliyor - Worker bundle'ina 1358 KiB gzip ekliyordu,
// yani 3 MiB'lik ucretsiz plan butcesinin %44'u. Ayni is burada birkac
// kilobayta yapiliyor.
//
// POST, GET degil: durum degistiriyor (cookie yaziyor) ve DEGISMEZ 2 geregi
// checkOrigin'den geciyor.

export async function POST(istek: Request) {
  const engel = checkOrigin(istek);
  if (engel) return engel;

  const supabase = await supabaseSunucu();

  // getClaims suresi dolmus token'i yenileyip cookie adaptorunu tetikliyor.
  // Donusu yetki karari icin KULLANILMIYOR - bu route yalnizca tazeliyor.
  const { data } = await supabase.auth.getClaims();

  return Response.json({ acik: Boolean(data?.claims?.sub) });
}
