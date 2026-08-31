"use client";

import { CheckIcon } from "lucide-react";

// Akisin neresinde olundugunu gosteren serit.
//
// Tiklanabilir DEGIL. Geri donmek her adimin kendi "Geri" dugmesiyle oluyor;
// gostergeyi de tiklanabilir yapmak, ileri adima atlama gibi anlamsiz bir
// durumu mumkun kilar ve ekran okuyucuda ayni bilgi iki kez gezilir.
//
// Mobilde yalnizca ICINDE OLUNAN adimin etiketi yaziliyor. Dort etiket 360
// piksellik ekranda yan yana sigmiyordu ve sayfayi yatay kaydiriyordu; numara
// zaten sirayi soyluyor.

export type AdimTanimi = { anahtar: string; etiket: string };

export function AdimGostergesi({
  adimlar,
  mevcut,
}: {
  adimlar: AdimTanimi[];
  mevcut: string;
}) {
  const sira = adimlar.findIndex((a) => a.anahtar === mevcut);

  return (
    <ol
      aria-label="Randevu adımları"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
    >
      {adimlar.map((adim, i) => {
        const gecildi = i < sira;
        const icinde = i === sira;

        return (
          <li
            key={adim.anahtar}
            aria-current={icinde ? "step" : undefined}
            className="flex items-center gap-2"
          >
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                icinde
                  ? "bg-primary text-primary-foreground"
                  : gecildi
                    ? "bg-secondary text-secondary-foreground"
                    : "border border-border text-muted-foreground"
              }`}
            >
              {gecildi ? (
                <CheckIcon className="size-3" aria-hidden="true" />
              ) : (
                i + 1
              )}
            </span>

            <span
              className={`${icinde ? "font-medium text-foreground" : "hidden text-muted-foreground sm:inline"}`}
            >
              {adim.etiket}
            </span>

            {i < adimlar.length - 1 ? (
              <span aria-hidden="true" className="h-px w-3 bg-border sm:w-4" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
