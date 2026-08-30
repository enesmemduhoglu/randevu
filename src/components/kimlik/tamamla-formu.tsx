"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { kimlikGonder } from "@/components/kimlik/gonder";
import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Yarida kalmis kaydi bitiren form. Sifre ve e-posta SORULMUYOR: ikisi de
// Supabase'de zaten var ve e-posta govdeden degil token'dan okunuyor - aksi
// halde kullanici kendi hesabini baskasinin adresiyle esleyebilirdi.

export function TamamlaFormu({ onAd }: { onAd: string }) {
  const router = useRouter();
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  async function gonder(olay: React.FormEvent<HTMLFormElement>) {
    olay.preventDefault();
    if (gonderiliyor) return;

    const veri = new FormData(olay.currentTarget);
    setGonderiliyor(true);
    setHata(null);

    const sonuc = await kimlikGonder("/api/kayit/tamamla", {
      isletmeAdi: veri.get("isletmeAdi"),
      adSoyad: veri.get("adSoyad"),
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
      {hata ? <HataKutusu mesaj={hata} id="tamamla-hatasi" /> : null}

      <div className="space-y-2">
        <Label htmlFor="isletmeAdi">İşletme adı</Label>
        <Input
          id="isletmeAdi"
          name="isletmeAdi"
          autoComplete="organization"
          autoFocus
          required
          disabled={gonderiliyor}
          aria-describedby={hata ? "tamamla-hatasi" : undefined}
          className="h-10"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="adSoyad">Ad soyad</Label>
        <Input
          id="adSoyad"
          name="adSoyad"
          autoComplete="name"
          required
          // Kayit sirasinda Supabase'e yazilan ad varsa on dolduruluyor.
          // defaultValue: alan duzenlenebilir kalmali, kullanici duzeltebilsin.
          defaultValue={onAd}
          disabled={gonderiliyor}
          aria-describedby={hata ? "tamamla-hatasi" : undefined}
          className="h-10"
        />
      </div>

      <Button type="submit" className="h-10 w-full" disabled={gonderiliyor}>
        {gonderiliyor ? "Kaydediliyor…" : "Kaydı tamamla"}
      </Button>
    </form>
  );
}
