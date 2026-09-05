import { SearchIcon } from "lucide-react";
import Link from "next/link";

import { UstBarHesabi } from "@/components/genel/ust-bar-hesabi";
import { Logo } from "@/components/marka/logo";
import { TemaDugmesi } from "@/components/tema-dugmesi";
import { auth } from "@/lib/auth";

// Halka acik sayfalarin ortak ust bari: `/`, `/dizin`, `/isletmeler-icin` ve
// `/randevularim`.
//
// `/r/[slug]`e BILEREK KONMADI. O sayfa isletmenin kendi randevu sayfasi ve
// cogu ziyaretci oraya Instagram biyografisinden geliyor; ustune bizim
// markamizi ve "Isletme misiniz?" cagrisini koymak, isletmenin musterisini
// isletmenin sayfasindan geri cagirmak olurdu.
//
// OTURUMU YANSITIYOR (Faz J sonrasi). Onceden "Randevularım" herkese
// gorunuyor, "Giriş yap" ise ALT BILGIDE duruyor ve oturum acikken bile
// ciziliyordu. Sonucu somut bir hataydi: isletme sahibi "Giriş yap"a basinca
// `/giris` onu zaten girisli gorup `/panel`e atiyordu - dugme hem yanlis
// yerdeydi hem yanlis seyi soyluyordu. Oturum acikken "Giriş yap" artik hic
// cizilmiyor, yani o yonlendirme de olusamiyor.
//
// BEDELI ACIKCA: `auth()` cagrisi `cookies()` okuyor, yani bu bileseni
// kullanan her sayfa DINAMIK oluyor. Pratikte tek kaybimiz
// `/isletmeler-icin` - digerlerinin hepsi zaten `force-dynamic`. Alternatifi
// oturumu her sayfadan prop olarak gecirmekti; o da statik kalan sayfada
// girisli kullaniciya "Giriş yap" gostermeye devam ederdi, yani duzeltilen
// hatanin ta kendisini bir sayfada birakirdi.
//
// Sunucu bileseni: tema dugmesi ve hesap menusu disinda etkilesimi yok.

type Props = {
  /// Ust barda arama kutusu gorunsun mu. Kendi arama yuzeyi olan sayfalarda
  /// (ana sayfanin kahraman kutusu, `/dizin`in filtresi) KAPALI: ayni sayfada
  /// iki arama alani, kullanicinin hangisinin ne aradigini bilmemesi demek.
  arama?: boolean;
};

/// Dokunma hedefi 44px: bar mobilde parmakla kullaniliyor ve baglantilar yan
/// yana duruyor.
///
/// GORUNURLUK SINIFI BURADA YOK (`inline-flex` dahil) ve bu bilincli: Tailwind
/// ayni ozelligi yazan iki utility arasinda kaynak sirasina degil URETILEN CSS
/// sirasina bakiyor, yani `${BAGLANTI} hidden sm:inline-flex` yazildiginda
/// `hidden` sessizce eziliyordu - baglanti mobilde de gorunuyordu. Olculdu:
/// 390px genislikte iki baglanti yan yana sigmayip bari iki satira cikariyordu.
/// Display sinifini her baglanti kendi yaziyor.
const BAGLANTI =
  "min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

export async function UstBar({ arama = true }: Props) {
  const oturum = await auth();
  const isletmeTarafi = oturum !== null && oturum.rol !== "MUSTERI";

  return (
    // Yapiskan: dizinde asagi inen kullanici aramaya donmek icin en yukari
    // kaydirmak zorunda kalmamali. Yari saydam zemin + blur, altindan gecen
    // kartlarin bari okunmaz hale getirmesini engelliyor.
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-2.5 sm:gap-4 sm:px-5">
        <Link href="/" aria-label="Ana sayfa" className="shrink-0">
          <Logo />
        </Link>

        {arama ? (
          // Duz GET formu (dizin filtresiyle ayni gerekce): tarayicinin kendi
          // isi, JavaScript yuklenmeden calisiyor ve sonuc paylasilabilir bir
          // URL uretiyor. Mobilde gizli - dar ekranda logo, arama ve iki
          // baglanti yan yana sigmiyor ve o ekranlarda sayfanin kendi arama
          // kutusu bir kaydirma uzakta.
          <form
            method="get"
            action="/dizin"
            role="search"
            className="hidden flex-1 md:block"
          >
            <div className="relative max-w-sm">
              <SearchIcon
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                name="arama"
                aria-label="İşletme veya hizmet ara"
                placeholder="Hizmet ya da işletme ara"
                className="h-10 w-full rounded-lg border border-input bg-transparent pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
            </div>
          </form>
        ) : (
          <span className="flex-1" />
        )}

        <nav className="flex items-center gap-1">
          {oturum ? (
            // GIRISLI. Bardaki tek baglanti kisinin gidecegi yer: musteri
            // randevularina, isletme paneline. Isletmenin randevu listesi de
            // erisilebilir kaliyor ama hesap menusunun ICINDE - bar dar ve
            // isletme sahibinin oradaki isi gunde bir kez, panele girmek.
            <Link
              href={isletmeTarafi ? "/panel" : "/randevularim"}
              className={`inline-flex ${BAGLANTI}`}
            >
              {isletmeTarafi ? "Panel" : "Randevularım"}
            </Link>
          ) : (
            // GIRISSIZ. "Randevularım" burada ≥sm'de duruyor: o sayfa girissiz
            // halde zaten bir uyelik karti, yani yanindaki "Giriş yap" ile
            // ayni isi yapiyor ve mobilde ikisini birden gostermek bari iki
            // satira cikariyor (olcum yukarida, BAGLANTI'nin yaninda).
            <>
              <Link
                href="/randevularim"
                className={`hidden sm:inline-flex ${BAGLANTI}`}
              >
                Randevularım
              </Link>
              <Link href="/giris" className={`inline-flex ${BAGLANTI}`}>
                Giriş yap
              </Link>
            </>
          )}

          {/* Isletme tarafindaki kisiye GOSTERILMIYOR: zaten isletme. Mobilde
              gizli ve bu bir eksiklik degil - ust barin dar ekrandaki isi
              musteriyi randevusuna goturmek. Isletme sahibi icin ayni baglanti
              alt bilgide ve ana sayfanin sonunda duruyor. */}
          {isletmeTarafi ? null : (
            <Link
              href="/isletmeler-icin"
              className={`hidden sm:inline-flex ${BAGLANTI}`}
            >
              İşletme misiniz?
            </Link>
          )}

          {oturum ? (
            <UstBarHesabi
              ad={oturum.ad}
              eposta={oturum.eposta}
              rol={oturum.rol}
              birincil={
                isletmeTarafi
                  ? { metin: "Panel", yol: "/panel" }
                  : { metin: "Randevularım", yol: "/randevularim" }
              }
              ikincil={
                isletmeTarafi
                  ? { metin: "Randevularım", yol: "/randevularim" }
                  : undefined
              }
            />
          ) : null}

          <TemaDugmesi />
        </nav>
      </div>
    </header>
  );
}
