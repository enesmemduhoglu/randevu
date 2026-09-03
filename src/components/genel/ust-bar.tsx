import { SearchIcon } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/marka/logo";
import { TemaDugmesi } from "@/components/tema-dugmesi";

// Halka acik sayfalarin ortak ust bari: `/`, `/dizin`, `/isletmeler-icin` ve
// `/randevularim`.
//
// `/r/[slug]`e BILEREK KONMADI. O sayfa isletmenin kendi randevu sayfasi ve
// cogu ziyaretci oraya Instagram biyografisinden geliyor; ustune bizim
// markamizi ve "Isletme misiniz?" cagrisini koymak, isletmenin musterisini
// isletmenin sayfasindan geri cagirmak olurdu.
//
// Sunucu bileseni: tema dugmesi disinda etkilesimi yok, yani menu icin
// istemciye JavaScript gitmiyor.

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

export function UstBar({ arama = true }: Props) {
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
                aria-label="İşletme ara"
                placeholder="İşletme adı ara"
                className="h-10 w-full rounded-lg border border-input bg-transparent pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
            </div>
          </form>
        ) : (
          <span className="flex-1" />
        )}

        <nav className="flex items-center gap-1">
          <Link href="/randevularim" className={`inline-flex ${BAGLANTI}`}>
            Randevularım
          </Link>

          {/* Mobilde gizli ve bu bir eksiklik degil: ust barin dar ekrandaki
              isi musteriyi randevusuna goturmek. Isletme sahibi icin ayni
              baglanti alt bilgide ve ana sayfanin sonunda duruyor. */}
          <Link
            href="/isletmeler-icin"
            className={`hidden sm:inline-flex ${BAGLANTI}`}
          >
            İşletme misiniz?
          </Link>

          <TemaDugmesi />
        </nav>
      </div>
    </header>
  );
}
