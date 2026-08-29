import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase istemcisinin sunucu tarafi. Kimlik dogrulamasi burada BITMIYOR:
// bu istemci yalnizca cookie'leri okuyup token'i cozuyor, oturumun kime ait
// oldugu src/lib/auth.ts'te belirleniyor.

function ayarlar() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY tanimli degil. " +
        ".env.example dosyasina bak.",
    );
  }
  return { url, anon };
}

/// Sunucu bilesenleri ve route handler'lar icin istemci.
export async function supabaseSunucu() {
  const { url, anon } = ayarlar();
  const cookieDeposu = await cookies();

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieDeposu.getAll();
      },
      setAll(yenileri) {
        try {
          for (const { name, value, options } of yenileri) {
            // DEGISMEZ 11: Domain niteligi koke genisletilmiyor. Supabase
            // varsayilan olarak da yazmiyor; burada acikca ezmiyoruz ki
            // cookie yalnizca kendi host'una bagli kalsin.
            cookieDeposu.set(name, value, options);
          }
        } catch {
          // Sunucu bileseninden cagrildiginda Next cookie yazmaya izin
          // vermiyor. Token yenilemesini proxy (middleware) yapiyor, bu
          // yuzden burada sessizce gecmek dogru - hata firlatmak her sayfayi
          // dusururdu.
        }
      },
    },
  });
}
