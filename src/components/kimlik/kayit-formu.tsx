"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { kimlikGonder } from "@/components/kimlik/gonder";
import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Kayit formu. Dort alan: isletme adi, ad soyad, e-posta, sifre.
//
// Telefon SORULMUYOR. Semada var ve istege bagli; kayit anindaki her ek alan
// tamamlanma oranini dusuruyor ve telefonun ilk gun bir isi yok - randevu
// hatirlatmasi Faz I'de geliyor, o zaman ayarlardan istenecek.
//
// Dogrulama kurallarinin sahibi sunucu; gerekcesi giris-formu.tsx'te.

export function KayitFormu() {
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

    const sonuc = await kimlikGonder("/api/kayit", {
      isletmeAdi: veri.get("isletmeAdi"),
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
    // panele degil /giris'e gidiyor ve ne yapmasi gerektigini burada
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
      {hata ? <HataKutusu mesaj={hata} id="kayit-hatasi" /> : null}

      <div className="space-y-2">
        <Label htmlFor="isletmeAdi">İşletme adı</Label>
        <Input
          id="isletmeAdi"
          name="isletmeAdi"
          autoComplete="organization"
          autoFocus
          required
          disabled={gonderiliyor}
          aria-describedby={hata ? "kayit-hatasi" : undefined}
          className="h-10"
        />
        <p className="text-xs text-muted-foreground">
          Randevu sayfanızın adresi bu addan üretilecek.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="adSoyad">Ad soyad</Label>
        <Input
          id="adSoyad"
          name="adSoyad"
          autoComplete="name"
          required
          disabled={gonderiliyor}
          aria-describedby={hata ? "kayit-hatasi" : undefined}
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
          aria-describedby={hata ? "kayit-hatasi" : undefined}
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
          aria-describedby={hata ? "kayit-hatasi" : undefined}
          className="h-10"
        />
        <p className="text-xs text-muted-foreground">En az 8 karakter</p>
      </div>

      <Button type="submit" className="h-10 w-full" disabled={gonderiliyor}>
        {gonderiliyor ? "Hesap açılıyor…" : "Kayıt ol"}
      </Button>
    </form>
  );
}
