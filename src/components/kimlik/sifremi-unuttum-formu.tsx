"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { kimlikGonder } from "@/components/kimlik/gonder";
import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import { TurnstileAlani } from "@/components/randevu/turnstile-alani";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Sifre sifirlama talebi. Tek alan: e-posta.
//
// Basari yanitinda daima ayni sabit sayfaya gidiyoruz (kayitli/kayitsiz
// ayrimi yok - kullanici numaralandirmasina kapi acardi, gerekce
// /api/sifre/sifirla/route.ts'te).

export function SifremiUnuttumFormu() {
  const router = useRouter();
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  async function gonder(olay: React.FormEvent<HTMLFormElement>) {
    olay.preventDefault();
    if (gonderiliyor) return;

    const veri = new FormData(olay.currentTarget);
    setGonderiliyor(true);
    setHata(null);

    const sonuc = await kimlikGonder("/api/sifre/sifirla", {
      eposta: veri.get("eposta"),
      turnstile: String(veri.get("cf-turnstile-response") ?? ""),
    });

    if (!sonuc.tamam) {
      setHata(sonuc.hata);
      setGonderiliyor(false);
      return;
    }

    router.replace(sonuc.yon);
  }

  return (
    <form onSubmit={gonder} className="space-y-4" noValidate>
      {hata ? <HataKutusu mesaj={hata} id="sifremi-unuttum-hatasi" /> : null}

      <div className="space-y-2">
        <Label htmlFor="eposta">E-posta</Label>
        <Input
          id="eposta"
          name="eposta"
          type="email"
          autoComplete="email"
          autoFocus
          required
          disabled={gonderiliyor}
          aria-describedby={hata ? "sifremi-unuttum-hatasi" : undefined}
          className="h-10"
        />
      </div>

      <TurnstileAlani hata={hata} />

      <Button type="submit" className="h-10 w-full" disabled={gonderiliyor}>
        {gonderiliyor ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
      </Button>
    </form>
  );
}
