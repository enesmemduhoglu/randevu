"use client";

import { ChevronRightIcon } from "lucide-react";

import {
  AdimBasligi,
  hizmetBilgisi,
  type HizmetOzeti,
} from "@/components/randevu/ortak";

// Birinci adim: hizmet secimi.
//
// Secim TEK DOKUNUSLA ilerliyor, ayrica "Devam" dugmesi yok: liste satirina
// dokunmak zaten "bunu istiyorum" demek ve ikinci bir onay adimi mobilde bos
// bir tur daha kaydirma uretiyordu. Saat izgarasinda karar farkli (bkz.
// zaman-secimi.tsx): orada hedefler kucuk ve yanlis dokunma olasi.

export function HizmetSecimi({
  hizmetler,
  secili,
  onSec,
}: {
  hizmetler: HizmetOzeti[];
  secili: HizmetOzeti | null;
  onSec: (hizmet: HizmetOzeti) => void;
}) {
  return (
    <section className="space-y-4">
      <AdimBasligi
        baslik="Hangi hizmet?"
        aciklama="Süre ve ücret hizmete göre değişiyor."
        odakla={false}
      />

      <ul className="space-y-2">
        {hizmetler.map((hizmet) => {
          const bu = secili?.id === hizmet.id;

          return (
            <li key={hizmet.id}>
              <button
                type="button"
                onClick={() => onSec(hizmet)}
                aria-current={bu ? "true" : undefined}
                className={`flex min-h-saat w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                  bu
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-accent/40"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {hizmet.ad}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {hizmetBilgisi(hizmet)}
                    {hizmet.aciklama ? ` · ${hizmet.aciklama}` : ""}
                  </span>
                </span>

                <ChevronRightIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
