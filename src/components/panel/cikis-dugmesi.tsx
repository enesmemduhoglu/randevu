"use client";

import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function CikisDugmesi() {
  const router = useRouter();
  const [cikiliyor, setCikiliyor] = useState(false);

  async function cik() {
    if (cikiliyor) return;
    setCikiliyor(true);

    let yon = "/giris";
    try {
      const yanit = await fetch("/api/cikis", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const govde: unknown = await yanit.json().catch(() => null);
      if (govde && typeof govde === "object" && "yon" in govde) {
        const gelen = (govde as { yon?: unknown }).yon;
        if (typeof gelen === "string") yon = gelen;
      }
    } catch {
      // Ag koparsa bile /giris'e gidiyoruz. Cikis isteginin ulasmamis olmasi
      // ihtimali var, ama kullaniciyi panelde tutup "cikilamadi" demek daha
      // kotu: /giris'te oturum hala aciksa zaten panele geri yonlendirilir,
      // yani yanlis bir sey iddia etmis olmuyoruz.
    }

    router.replace(yon);

    // refresh SART: cookie silindi ama sunucu bilesenlerinin ciktisi
    // istemcide onbellekli duruyor. Yenilemezsek geri dugmesi kullaniciyi
    // oturum acikmis gibi gorunen eski bir panele dondurur.
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      className="w-full justify-start"
      onClick={cik}
      disabled={cikiliyor}
    >
      <LogOutIcon aria-hidden="true" />
      {cikiliyor ? "Çıkış yapılıyor…" : "Çıkış yap"}
    </Button>
  );
}
