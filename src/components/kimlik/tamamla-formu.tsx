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
//
// IKI HESAP TURU (Faz J). Bu ekrana dusen kisinin ne olmak istedigini sunucu
// BILMIYOR: elimizde yalnizca bir Supabase kimligi var, hangi formu
// doldurdugunun kaydi hicbir yerde durmuyor. Faz J'den once soru yoktu, tek
// yol isletmeydi; simdi sormamak, randevu almaya gelen kisiyi sessizce
// isletme sahibi yapmak demek - ve `kullanici_auth_user_id` tekil oldugu icin
// bunun geri donusu yok.
//
// Varsayilan ISLETME: bu ekrana dusmenin yolu neredeyse her zaman isletme
// kaydinin yarida kalmasi (musteri kaydi tek satir yaziyor, yani kirilma
// penceresi cok daha dar). Sik olani onde, digeri tek tiklamayla.

type HesapTuru = "isletme" | "musteri";

export function TamamlaFormu({ onAd }: { onAd: string }) {
  const router = useRouter();
  const [tur, setTur] = useState<HesapTuru>("isletme");
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  async function gonder(olay: React.FormEvent<HTMLFormElement>) {
    olay.preventDefault();
    if (gonderiliyor) return;

    const veri = new FormData(olay.currentTarget);
    setGonderiliyor(true);
    setHata(null);

    const sonuc =
      tur === "isletme"
        ? await kimlikGonder("/api/kayit/tamamla", {
            isletmeAdi: veri.get("isletmeAdi"),
            adSoyad: veri.get("adSoyad"),
          })
        : await kimlikGonder("/api/uye-ol/tamamla", {
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

      {tur === "isletme" ? (
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
      ) : null}

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

      {/* Tur degistirme dugme DEGIL duz metin baglantisi: birincil eylem tek
          kalmali, yoksa iki dolu dugme arasinda hangisinin "devam" oldugu
          okunmuyor. `type="button"` sart - form icindeki varsayilan tur
          "submit" ve tiklanan an formu gonderirdi. */}
      <p className="text-center text-sm text-muted-foreground">
        {tur === "isletme" ? (
          <>
            Randevu almak için üye olmuştunuz?{" "}
            <button
              type="button"
              onClick={() => setTur("musteri")}
              disabled={gonderiliyor}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Müşteri hesabı olarak tamamlayın
            </button>
          </>
        ) : (
          <>
            İşletme kaydı mı yapıyordunuz?{" "}
            <button
              type="button"
              onClick={() => setTur("isletme")}
              disabled={gonderiliyor}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              İşletme olarak tamamlayın
            </button>
          </>
        )}
      </p>
    </form>
  );
}
