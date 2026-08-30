"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { kimlikGonder } from "@/components/kimlik/gonder";
import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Giris formu.
//
// ISTEMCIDE AGIR DOGRULAMA YOK. Kurallarin tek sahibi sunucu (src/lib/girdi.ts);
// burada ayni kurallari tekrar yazmak, ikisinin zamanla ayrismasi ve
// kullanicinin sunucuda goremedigi bir hatayla karsilasmasi demek olurdu.
// Tarayicinin `required` ve `type="email"` ipuclari yeterli.
//
// Alan yuksekligi 40px (h-10). Varsayilan `h-8` panel ici yogun arayuz icin
// olculmus bir deger; bu ekran mobilde parmakla kullaniliyor ve tasarim
// sistemi dokunma hedefini en az 44px aliyor (etiketle birlikte o araliga
// giriyor).

export function GirisFormu({ devam }: { devam?: string }) {
  const router = useRouter();
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  async function gonder(olay: React.FormEvent<HTMLFormElement>) {
    olay.preventDefault();
    if (gonderiliyor) return; // cift gonderim engeli

    const veri = new FormData(olay.currentTarget);
    setGonderiliyor(true);
    setHata(null);

    const sonuc = await kimlikGonder("/api/giris", {
      eposta: veri.get("eposta"),
      sifre: veri.get("sifre"),
      devam,
    });

    if (!sonuc.tamam) {
      setHata(sonuc.hata);
      setGonderiliyor(false);
      return;
    }

    router.replace(sonuc.yon);
    // refresh SART: oturum cookie'si yeni yazildi ve sunucu bilesenlerinin
    // ciktisi istemcide onbellekli. Yenilemezsek panel, oturum acilmadan once
    // uretilmis haliyle gosterilir.
    router.refresh();
    // `gonderiliyor` bilerek true birakiliyor: yonlendirme bitene kadar form
    // kapali kalsin, ikinci gonderim olusmasin.
  }

  return (
    <form onSubmit={gonder} className="space-y-4" noValidate>
      {hata ? <HataKutusu mesaj={hata} id="giris-hatasi" /> : null}

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
          aria-describedby={hata ? "giris-hatasi" : undefined}
          className="h-10"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="sifre">Şifre</Label>
        <Input
          id="sifre"
          name="sifre"
          type="password"
          autoComplete="current-password"
          required
          disabled={gonderiliyor}
          aria-describedby={hata ? "giris-hatasi" : undefined}
          className="h-10"
        />
      </div>

      <Button type="submit" className="h-10 w-full" disabled={gonderiliyor}>
        {gonderiliyor ? "Giriş yapılıyor…" : "Giriş yap"}
      </Button>
    </form>
  );
}
