"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import { Button } from "@/components/ui/button";

// Token sayfasindaki "Hesabıma ekle" eylemi (Faz P).
//
// NEDEN BURADA, onay ekraninda degil: randevuyu hesaba baglayan uc token
// istiyor (`POST /api/randevularim/ekle`) ve token TEK BASINA YETKI tasiyor
// (DEGISMEZ 5). Onay ekranindan giris/uyelik yoluna gecirmek icin token'i
// `?devam=` gibi bir sorgu parametresine koymak gerekirdi ve o deger sunucu
// erisim loglarina duserdi. Token'in ZATEN adres cubugunda oldugu tek yer bu
// sayfa; dugmeyi buraya koymak yeni hicbir yere sizdirmiyor.
//
// Onay kutusu YOK - iptalin aksine bu geri alinabilir ve zararsiz bir islem.
//
// Ikinci kez basmak da zararsiz: uc "eklendi" ile "zaten-benim" durumlarina
// AYNI 200'u donuyor (gerekcesi ekle/route.ts'te). Dugme yine de yalnizca
// baglanmamis randevuda ciziliyor; sunucu bileseni karari veriyor.

export function HesabaEkleDugmesi({ token }: { token: string }) {
  const router = useRouter();
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function ekle() {
    if (gonderiliyor) return;
    setGonderiliyor(true);
    setHata(null);

    try {
      const yanit = await fetch("/api/randevularim/ekle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!yanit.ok) {
        const cevap = (await yanit.json().catch(() => null)) as {
          hata?: string;
        } | null;
        setHata(
          cevap?.hata ??
            "Randevu hesabınıza eklenemedi. Sayfayı yenileyip yeniden deneyin.",
        );
        setGonderiliyor(false);
        return;
      }
    } catch {
      // Aga hic cikamadik. Tekrar denemek guvenli: ayni token ikinci kez
      // gonderildiginde uc yine 200 donuyor.
      setHata(
        "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
      );
      setGonderiliyor(false);
      return;
    }

    // Sunucu bileseni yeniden kosuyor; randevu artik bagli goruluyor ve dugme
    // yerini "hesabınıza eklendi" satirina birakiyor.
    router.refresh();
    setGonderiliyor(false);
  }

  return (
    <div className="space-y-2">
      {hata ? <HataKutusu mesaj={hata} /> : null}

      <Button
        variant="outline"
        className="h-10 w-full"
        onClick={ekle}
        disabled={gonderiliyor}
      >
        {gonderiliyor ? "Ekleniyor…" : "Randevumu hesabıma ekle"}
      </Button>
    </div>
  );
}
