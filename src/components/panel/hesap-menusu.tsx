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
import { basHarf, ROL_ETIKETLERI } from "@/lib/rol";

// Hesap menusu: kimin oturumda oldugunu gosterir ve cikisi barindirir.
// Istemci bileseni cunku Popover acilma durumunu tutuyor.

/// Panele girebilen roller. MUSTERI BILEREK YOK - `auth.ts > isletmeOturumu`
/// onu zaten geciremiyor ve bu tip, o kapinin arayuzdeki karsiligi.
/// Etiketlerin kendisi `@/lib/rol`de, cunku ayni harita halka acik ust barda
/// da gerekiyor (orada MUSTERI de var).
export type PanelRolu = "SAHIP" | "PERSONEL";

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
              {ROL_ETIKETLERI[rol]}
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
