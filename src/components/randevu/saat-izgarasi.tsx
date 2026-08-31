"use client";

import { CalendarX2Icon } from "lucide-react";

import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import { saatiGoster, type Slot } from "@/components/randevu/ortak";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Saat izgarasi: urunun en kritik bileseni.
//
// Yalnizca BOS saatler geliyor - /api/musaitlik dolu olanlari hic gondermiyor.
// Bu yuzden vitrindeki "dolu" durumu burada kullanilmiyor: musteriye
// secemeyecegi saatleri gostermek, izgarayi iki kat uzatip taramayi
// zorlastiriyor. Isletmenin doluluk takvimi de disariya sizmamis oluyor.
//
// Dokunma hedegi `min-h-saat` (44px) ve aralik 8px: token'lar globals.css'te
// tanimli, bilesen olcu karari vermiyor.

const ISKELET_SAYISI = 9;

export function SaatIzgarasi({
  slotlar,
  secili,
  saatDilimi,
  durum,
  hata,
  onSec,
  onYenile,
}: {
  slotlar: Slot[];
  secili: Slot | null;
  /// Saatler ISLETMENIN diliminde yaziliyor; yanittan gelen deger kullaniliyor
  /// (DEGISMEZ 7 - tarayicinin dilimine guvenilmiyor).
  saatDilimi: string;
  durum: "yukleniyor" | "hazir" | "hata";
  hata: string | null;
  onSec: (slot: Slot) => void;
  onYenile: () => void;
}) {
  if (durum === "yukleniyor") {
    return (
      <div
        aria-busy="true"
        aria-label="Uygun saatler yükleniyor"
        className="grid grid-cols-3 gap-2 sm:grid-cols-4"
      >
        {/* Yer bastan ayriliyor: saatler gelince sayfa ziplamasin. */}
        {Array.from({ length: ISKELET_SAYISI }, (_, i) => (
          <Skeleton key={i} className="h-saat w-full" />
        ))}
      </div>
    );
  }

  if (durum === "hata") {
    return (
      <div className="space-y-3">
        <HataKutusu
          mesaj={hata ?? "Uygun saatler getirilemedi. Tekrar deneyin."}
        />
        <Button variant="outline" className="h-10" onClick={onYenile}>
          Tekrar dene
        </Button>
      </div>
    );
  }

  if (slotlar.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center">
        <CalendarX2Icon
          className="size-8 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className="font-medium">Bu gün için uygun saat yok</p>
          <p className="text-sm text-muted-foreground">
            Başka bir gün seçin. Kimin uygun olduğu fark etmiyorsa personel
            adımında “Farketmez” daha çok saat açıyor.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Uygun saatler"
      className="grid grid-cols-3 gap-2 sm:grid-cols-4"
    >
      {slotlar.map((slot) => {
        const bu = secili?.baslangic === slot.baslangic;

        return (
          <button
            key={slot.baslangic}
            type="button"
            aria-pressed={bu}
            onClick={() => onSec(slot)}
            className={`flex min-h-saat items-center justify-center rounded-md border text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
              bu
                ? "border-transparent bg-saat-secili-zemin text-saat-secili-metin"
                : "border-saat-bos-kenar bg-saat-bos-zemin text-saat-bos-metin hover:border-primary"
            }`}
          >
            {saatiGoster(slot.baslangic, saatDilimi)}
          </button>
        );
      })}
    </div>
  );
}
