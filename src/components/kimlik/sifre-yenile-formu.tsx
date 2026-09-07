"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { kimlikGonder } from "@/components/kimlik/gonder";
import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Yeni sifre formu. `tokenHash` sayfadan (searchParams) geliyor, forma
// GIZLI alan olarak degil, dogrudan props ile - kullaniciya gorunmesinin
// hicbir faydasi yok.
//
// Basarili yanit /api/giris ile AYNI sozlesmeyi tasiyor ({ yon }): bu route
// da oturum aciyor, o yuzden router.refresh() ayni gerekceyle burada da var.

export function SifreYenileFormu({ tokenHash }: { tokenHash: string }) {
  const router = useRouter();
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  async function gonder(olay: React.FormEvent<HTMLFormElement>) {
    olay.preventDefault();
    if (gonderiliyor) return;

    const veri = new FormData(olay.currentTarget);
    setGonderiliyor(true);
    setHata(null);

    const sonuc = await kimlikGonder("/api/sifre/yenile", {
      tokenHash,
      sifre: veri.get("sifre"),
    });

    if (!sonuc.tamam) {
      setHata(sonuc.hata);
      setGonderiliyor(false);
      return;
    }

    router.replace(sonuc.yon);
    router.refresh();
  }

  return (
    <form onSubmit={gonder} className="space-y-4" noValidate>
      {hata ? <HataKutusu mesaj={hata} id="sifre-yenile-hatasi" /> : null}

      <div className="space-y-2">
        <Label htmlFor="sifre">Yeni şifre</Label>
        <Input
          id="sifre"
          name="sifre"
          type="password"
          autoComplete="new-password"
          autoFocus
          required
          disabled={gonderiliyor}
          aria-describedby={hata ? "sifre-yenile-hatasi" : undefined}
          className="h-10"
        />
      </div>

      <Button type="submit" className="h-10 w-full" disabled={gonderiliyor}>
        {gonderiliyor ? "Kaydediliyor…" : "Şifreyi güncelle"}
      </Button>
    </form>
  );
}
