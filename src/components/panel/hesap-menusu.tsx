"use client";

import { ChevronsUpDownIcon } from "lucide-react";

import { CikisDugmesi } from "@/components/panel/cikis-dugmesi";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

// Hesap menusu: kimin oturumda oldugunu gosterir ve cikisi barindirir.
// Istemci bileseni cunku Popover acilma durumunu tutuyor.

/// Rol arayuzde teknik degeriyle gorunmez. "kullanici" kelimesi de hic gecmez
/// (docs/marka.md terim sozlugu).
export const ROL_ADI = {
  SAHIP: "İşletme sahibi",
  PERSONEL: "Personel",
} as const;

export type PanelRolu = keyof typeof ROL_ADI;

/// Bas harf yalnizca susleme; okunacak bilgi zaten yaninda yaziyor.
/// toLocaleUpperCase("tr") sart: "i" harfinin buyugu Turkce'de "İ".
export function basHarf(ad: string) {
  return ad.trim().charAt(0).toLocaleUpperCase("tr") || "?";
}

type Props = {
  ad: string;
  eposta: string;
  rol: PanelRolu;
};

export function HesapMenusu({ ad, eposta, rol }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto w-full justify-start gap-2 px-2 py-1.5 text-left"
        >
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground"
          >
            {basHarf(ad)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{ad}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {ROL_ADI[rol]}
            </span>
          </span>
          <ChevronsUpDownIcon
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-64">
        <PopoverHeader>
          <PopoverTitle className="truncate">{ad}</PopoverTitle>
          <PopoverDescription className="break-all">{eposta}</PopoverDescription>
        </PopoverHeader>

        <Separator />

        <CikisDugmesi />
      </PopoverContent>
    </Popover>
  );
}
