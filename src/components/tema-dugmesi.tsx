"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function TemaDugmesi() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      // Etiket iki durumda da dogru: hangi temada oldugunu soylemek yerine ne
      // yaptigini soyluyor. Boylece sunucu ciktisiyla istemci arasinda fark
      // olusmuyor ve hydration icin ek durum tutmaya gerek kalmiyor.
      aria-label="Temayı değiştir"
    >
      {/* Ikon secimi JS ile degil CSS ile: .dark sinifi zaten <html>'de.
          Boylece ilk render'da ikon sicramasi olmuyor. */}
      <SunIcon className="hidden dark:block" aria-hidden="true" />
      <MoonIcon className="block dark:hidden" aria-hidden="true" />
    </Button>
  );
}
