import { createBrowserClient } from "@supabase/ssr";

// Tarayici tarafi istemci. Yalnizca giris/cikis/kayit gibi kimlik akislari
// icin; veri okuma DAIMA sunucudan ve scoped-db uzerinden gider.
//
// anon key tarayiciya gidiyor - tasarim geregi halka acik. Kiraci izolasyonu
// bu anahtara degil, sunucudaki scoped-db katmanina dayaniyor.
export function supabaseTarayici() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY tanimli degil.",
    );
  }
  return createBrowserClient(url, anon);
}
