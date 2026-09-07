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
  // PRERENDER'I ILK SATIRDA KES - SIRA BURADA SOZLESMENIN KENDISI.
  //
  // `cookies()` bir istek-ani API'si ve Next dinamik sayfayi ancak boyle bir
  // cagriya GERCEKTEN ulasinca dinamige dusuruyor. Onceki sira `ayarlar()`
  // once, `cookies()` sonraydi; sirlar yokken build `cookies()`e hic varamadan
  // `ayarlar()` uzerinden dusuyordu - `/giris`, `/kayit`, `/uye-ol`,
  // `/kayit/tamamla` ve UstBar tasiyan her sayfa. Olculdu (Faz P2),
  // varsayilmadi.
  //
  // NEDEN `connection()` DEGIL: o cagri anlami acikca yaziyor ama `next/server`
  // import'u bu modul uzerinden worker paketine +45 KiB gzip ekliyordu
  // (1792 -> 1838, olculdu). Butce 3 MiB ve her fazda izleniyor; ayni kesmeyi
  // zaten burada duran bir cagri bedelsiz yapiyor.
  //
  // "Iki satirin sirasi" kirilgan bir garanti gibi gorunur - o yuzden kaza
  // olmaktan cikarildi: `degismezler.test.ts` govdenin ILK ifadesinin bu satir
  // oldugunu zorluyor. Satirlar takas edilirse test kirmiziya doner.
  const cookieDeposu = await cookies();
  const { url, anon } = ayarlar();

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
          // vermiyor. Token yenilemesini `POST /api/oturum` yapiyor (Faz D'de
          // bu isi `src/proxy.ts` yapiyordu, Faz E'de kaldirildi), bu yuzden
          // burada sessizce gecmek dogru - hata firlatmak her sayfayi
          // dusururdu.
        }
      },
    },
  });
}
