import Link from "next/link";

import { MARKA_ADI } from "@/lib/marka";

// Halka acik sayfalarin alt bilgisi.
//
// Kisa tutuldu: bugun burada dolduracak gercek bir icerik yok (hakkimizda,
// gizlilik ve iletisim sayfalari yazilmadi) ve olmayan sayfalara baglanti
// vermek, kullaniciyi 404'e goturmek olurdu. Sayfalar yazildikca buyur.

export function AltBilgi() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} {MARKA_ADI}
        </p>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Link
            href="/dizin"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            İşletme dizini
          </Link>
          {/* Ust barda mobilde gizlenen baglanti burada her ekranda duruyor. */}
          <Link
            href="/isletmeler-icin"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            İşletme misiniz?
          </Link>
          <Link
            href="/giris"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Giriş yap
          </Link>
        </nav>
      </div>
    </footer>
  );
}
