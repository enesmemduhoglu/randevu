"use client";

import { MenuIcon } from "lucide-react";
import { useState } from "react";

import { Gezinme } from "@/components/panel/gezinme";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// Mobilde kenar cubugu yerine cekmece. Ayri bir bilesen cunku acilma durumunu
// tutmasi gerekiyor; masaustu kenar cubugu ise sunucuda kaliyor.

export function MobilMenu({ isletmeAdi }: { isletmeAdi: string }) {
  const [acik, setAcik] = useState(false);

  return (
    <Sheet open={acik} onOpenChange={setAcik}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-lg" aria-label="Menüyü aç">
          <MenuIcon aria-hidden="true" />
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="w-72 p-5">
        <SheetHeader className="p-0">
          <SheetTitle className="truncate text-left">{isletmeAdi}</SheetTitle>
        </SheetHeader>

        {/* Bir baglantiya basildiginda cekmece kendiliginden kapanmali:
            acik kalan menu, gidilen sayfayi ortuyor. */}
        <Gezinme onGezindi={() => setAcik(false)} />
      </SheetContent>
    </Sheet>
  );
}
