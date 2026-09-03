"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { kimlikGonder } from "@/components/kimlik/gonder";
import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Musteri uyelik formu. Uc alan: ad soyad, e-posta, sifre.
//
// ISLETME FORMUNDAN (kayit-formu.tsx) TEK FARKI isletme adinin olmamasi - ama
// ortak bir bilesene cikarilmadi. Ikisi ayni gorunuyor olmasi tesaduf: alanlar
// aynilastigi icin degil, bugun oyle denk geldigi icin. Ortaklastirilsaydi
// musteri formuna bir gun eklenecek her alan (telefon dogrulamasi, Faz K)
// isletme formunda da bir bayrak acmayi gerektirirdi.
//
// TELEFON SORULMUYOR; gerekcesi kayit.ts > musteriKaydiOlustur icinde.
//
// Dogrulama kurallarinin sahibi sunucu; gerekcesi giris-formu.tsx'te.

export function UyeOlFormu() {
  const router = useRouter();
  const [hata, setHata] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  async function gonder(olay: React.FormEvent<HTMLFormElement>) {
    olay.preventDefault();
    if (gonderiliyor) return;

    const veri = new FormData(olay.currentTarget);
    setGonderiliyor(true);
    setHata(null);

    const sonuc = await kimlikGonder("/api/uye-ol", {
      adSoyad: veri.get("adSoyad"),
      eposta: veri.get("eposta"),
      sifre: veri.get("sifre"),
    });

    if (!sonuc.tamam) {
      setHata(sonuc.hata);
      setGonderiliyor(false);
      return;
    }

    // Supabase'de e-posta dogrulamasi acikken oturum acilmiyor: kullanici
    // listesine degil /giris'e gidiyor ve ne yapmasi gerektigini burada
    // ogreniyor.
    if (sonuc.mesaj) setMesaj(sonuc.mesaj);

    router.replace(sonuc.yon);
    router.refresh();
  }

  if (mesaj) {
    return (
      <p className="rounded-lg bg-muted px-3 py-2.5 text-sm" role="status">
        {mesaj}
      </p>
    );
  }

  return (
    <form onSubmit={gonder} className="space-y-4" noValidate>
      {hata ? <HataKutusu mesaj={hata} id="uye-ol-hatasi" /> : null}

      <div className="space-y-2">
        <Label htmlFor="adSoyad">Ad soyad</Label>
        <Input
          id="adSoyad"
          name="adSoyad"
          autoComplete="name"
          autoFocus
          required
          disabled={gonderiliyor}
          aria-describedby={hata ? "uye-ol-hatasi" : undefined}
          className="h-10"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="eposta">E-posta</Label>
        <Input
          id="eposta"
          name="eposta"
          type="email"
          autoComplete="email"
          required
          disabled={gonderiliyor}
          aria-describedby={hata ? "uye-ol-hatasi" : undefined}
          className="h-10"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="sifre">Şifre</Label>
        <Input
          id="sifre"
          name="sifre"
          type="password"
          autoComplete="new-password"
          required
          disabled={gonderiliyor}
          aria-describedby={hata ? "uye-ol-hatasi" : undefined}
          className="h-10"
        />
        <p className="text-xs text-muted-foreground">En az 8 karakter</p>
      </div>

      <Button type="submit" className="h-10 w-full" disabled={gonderiliyor}>
        {gonderiliyor ? "Hesap açılıyor…" : "Üye ol"}
      </Button>
    </form>
  );
}
