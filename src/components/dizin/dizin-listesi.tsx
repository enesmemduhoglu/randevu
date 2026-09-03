import Link from "next/link";
import type { ReactNode } from "react";

import { DizinKarti } from "@/components/dizin/dizin-karti";
import type { DizinKarti as Kart } from "@/lib/dizin";

// Kart izgarasi + sayfalama. Faz O'da `/dizin` sayfasindan CIKARILDI, cunku il
// ve il+kategori inis sayfalari ayni listeyi gosteriyor.
//
// Neden bilesen, neden kopya degil: sayfalamanin sinir davranisi (son sayfada
// "Sonraki" cizilmemesi, filtrenin baglantilarda tasinmasi) uc yerde ayri ayri
// dogru tutulmasi gereken bir sey olurdu. Bir kere yanlis kopyalanmasi,
// kullanicinin ayni sayfayi tekrar tekrar gormesi demek.
//
// Bos durum DISARIDAN geliyor: `/dizin`de iki ayri bos durum var (aramasi
// tutmayan kullanici ile gercekten bos dizin), inis sayfasinda ise tek. Ayni
// cumleyi uc yerde gostermek, kullaniciya yapabilecegi seyi soylememek olurdu.

export function DizinListesi({
  kartlar,
  toplam,
  sayfa,
  sonSayfa,
  sayfaYolu,
  sayimGoster,
  bosDurum,
}: {
  kartlar: Kart[];
  toplam: number;
  sayfa: number;
  sonSayfa: number;
  sayfaYolu: (hedef: number) => string;
  /// Sayim yalnizca bir sey daralttiginda anlamli: filtresiz listede
  /// "142 işletme" kullaniciya hiçbir şey söylemiyor.
  sayimGoster: boolean;
  bosDurum: ReactNode;
}) {
  if (kartlar.length === 0) return <>{bosDurum}</>;

  return (
    <>
      {sayimGoster ? (
        <p className="pt-6 text-sm text-muted-foreground" role="status">
          {toplam} işletme bulundu
        </p>
      ) : null}

      <ul className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-3">
        {kartlar.map((kart) => (
          <li key={kart.slug}>
            <DizinKarti kart={kart} />
          </li>
        ))}
      </ul>

      {sonSayfa > 1 ? (
        <nav
          className="flex items-center justify-between gap-4 pt-8"
          aria-label="Sayfalar"
        >
          {/* Numarali sayfa listesi yerine iki yon: 200 sayfaya kadar cikabilen
              bir listede numaralari cizmek mobilde tasar ve dizinde "17. sayfaya
              git" diyen bir kullanim yok. */}
          {sayfa > 1 ? (
            <Link
              href={sayfaYolu(sayfa - 1)}
              className="text-sm font-medium underline-offset-4 hover:underline"
              rel="prev"
            >
              ← Önceki
            </Link>
          ) : (
            <span />
          )}

          <span className="text-sm text-muted-foreground">
            Sayfa {sayfa} / {sonSayfa}
          </span>

          {sayfa < sonSayfa ? (
            <Link
              href={sayfaYolu(sayfa + 1)}
              className="text-sm font-medium underline-offset-4 hover:underline"
              rel="next"
            >
              Sonraki →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
