import {
  DropletsIcon,
  Flower2Icon,
  HandIcon,
  type LucideIcon,
  PawPrintIcon,
  ScissorsIcon,
  SparklesIcon,
  SprayCanIcon,
  StethoscopeIcon,
  StoreIcon,
} from "lucide-react";
import Link from "next/link";

import { KATEGORILER, type Kategori } from "@/lib/dizin-girdi";

// Kategori kutucuklari: ana sayfanin ikinci giris yolu.
//
// Neden arama kutusunun yaninda ayrica bunlar var: urunu hic tanimayan
// ziyaretci ne yazacagini bilmiyor. Kutucuklar "burada ne var" sorusunun
// cevabini tek bakista veriyor ve her biri hazir bir aramaya goturuyor.
//
// Kutucuklar SABIT LISTEDEN uretiliyor (dizinde o kategoride isletme olmasa
// da). Dizin filtresinin tersi bir karar ve bilincli: orada secenek listesi
// gercek veriden geliyor cunku amac bulunan sonucu daraltmak; burada amac
// kapsami gostermek, ve kategorileri dizin dolduguna gore gizlemek ana
// sayfanin gunden gune sekil degistirmesi olurdu.

const IKONLAR: Record<Kategori, LucideIcon> = {
  Kuaför: ScissorsIcon,
  Berber: SprayCanIcon,
  "Güzellik Salonu": SparklesIcon,
  "Tırnak Stüdyosu": HandIcon,
  "Cilt Bakımı": DropletsIcon,
  "Masaj & Spa": Flower2Icon,
  "Diş Kliniği": StethoscopeIcon,
  Veteriner: PawPrintIcon,
  Diğer: StoreIcon,
};

export function KategoriKutucuklari() {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {KATEGORILER.map((kategori) => {
        const Ikon = IKONLAR[kategori];
        return (
          <li key={kategori}>
            <Link
              href={`/dizin?kategori=${encodeURIComponent(kategori)}`}
              className="flex h-full min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-4 text-center transition-colors hover:border-primary/50 hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Ikon className="size-6 text-primary" aria-hidden="true" />
              <span className="text-sm font-medium">{kategori}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
