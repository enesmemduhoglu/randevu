"use client";

import {
  CalendarCheckIcon,
  CalendarDaysIcon,
  ClockIcon,
  PaletteIcon,
  ScissorsIcon,
  SettingsIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// Gezinme istemci bileseni: aktif yolu isaretlemek icin usePathname gerekiyor.
// Duzenin geri kalani sunucuda kaliyor, yani oturum ve isletme verisi istemci
// paketine hic inmiyor.

type Oge = {
  ad: string;
  ikon: LucideIcon;
  /// Yol YOKSA sayfa henuz yazilmadi demektir. Olmayan bir sayfaya link vermek
  /// yerine oge tiklanamaz duruyor: 404'e goturen menu, eksik menuden kotu.
  yol?: string;
  /// "/panel" butun panelin koku. Alt yollar (or. /panel/gelistirici/vitrin) da
  /// onunla basladigi icin burada onek degil TAM eslesme isteniyor, yoksa
  /// vitrin acikken "Bugün" de aktif gorunurdu.
  tam?: boolean;
};

type Bolum = {
  baslik?: string;
  ogeler: Oge[];
};

const BOLUMLER: Bolum[] = [
  {
    ogeler: [
      { ad: "Bugün", ikon: CalendarCheckIcon, yol: "/panel", tam: true },
      { ad: "Takvim", ikon: CalendarDaysIcon },
      { ad: "Hizmetler", ikon: ScissorsIcon, yol: "/panel/hizmetler" },
      { ad: "Personel", ikon: UsersIcon, yol: "/panel/personel" },
      { ad: "Çalışma saatleri", ikon: ClockIcon },
      { ad: "Ayarlar", ikon: SettingsIcon },
    ],
  },
  {
    baslik: "Geliştirici",
    ogeler: [
      {
        ad: "Bileşen vitrini",
        ikon: PaletteIcon,
        yol: "/panel/gelistirici/vitrin",
      },
    ],
  },
];

const OGE_ORTAK =
  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors";

function aktifMi(yol: string, oge: Oge) {
  if (!oge.yol) return false;
  if (oge.tam) return yol === oge.yol;
  return yol === oge.yol || yol.startsWith(`${oge.yol}/`);
}

export function Gezinme({ onGezindi }: { onGezindi?: () => void }) {
  const yol = usePathname();

  return (
    <nav aria-label="Panel gezinmesi" className="flex flex-col gap-1">
      {BOLUMLER.map((bolum, sira) => (
        <div key={bolum.baslik ?? "ana"} className="flex flex-col gap-0.5">
          {sira > 0 ? (
            <Separator className="my-2 bg-sidebar-border" />
          ) : null}
          {bolum.baslik ? (
            <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">
              {bolum.baslik}
            </p>
          ) : null}

          {bolum.ogeler.map((oge) => {
            const Ikon = oge.ikon;

            if (!oge.yol) {
              return (
                // Devre disi oge <a> degil <span>: klavyeyle gezerken duraga
                // donusmemeli, cunku basildiginda yapacak bir sey yok.
                <span
                  key={oge.ad}
                  aria-disabled="true"
                  className={cn(OGE_ORTAK, "text-muted-foreground")}
                >
                  <Ikon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{oge.ad}</span>
                  <Badge variant="secondary" className="ml-auto shrink-0">
                    Yakında
                  </Badge>
                </span>
              );
            }

            const aktif = aktifMi(yol, oge);

            return (
              <Link
                key={oge.ad}
                href={oge.yol}
                onClick={onGezindi}
                // aria-current: ekran okuyucu hangi sayfada oldugunu renkten
                // degil buradan ogreniyor.
                aria-current={aktif ? "page" : undefined}
                className={cn(
                  OGE_ORTAK,
                  "focus-visible:ring-sidebar-ring focus-visible:outline-none focus-visible:ring-2",
                  aktif
                    ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Ikon className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{oge.ad}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
