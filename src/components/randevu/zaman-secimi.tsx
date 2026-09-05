"use client";

import { ChevronLeftIcon } from "lucide-react";

import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import { GunSerisi } from "@/components/randevu/gun-serisi";
import { AdimBasligi, saatiGoster, tarihUzun, type Slot } from "@/components/randevu/ortak";
import { SaatIzgarasi } from "@/components/randevu/saat-izgarasi";
import { Button } from "@/components/ui/button";
import type { YerelTarih } from "@/lib/zaman";

// Ucuncu adim: gun ve saat.
//
// Hizmet ve personel adimlarindan farkli olarak burada ACIK BIR "Devam"
// dugmesi var. Sebep dokunma hedeflerinin yogunlugu: izgarada onlarca kucuk
// dugme yan yana ve yanlis saate dokunup dogrudan bir sonraki adima atlamak,
// musteriyi yanlis randevuya bir adim yaklastirirdi. Secim once ekranda
// onaylaniyor, sonra ilerleniyor.

export function ZamanSecimi({
  bugun,
  tarih,
  maksIleriGun,
  slotlar,
  seciliSlot,
  saatDilimi,
  durum,
  hata,
  uyari,
  geriEtiketi,
  personelSecildi,
  onTarihSec,
  onSlotSec,
  onYenile,
  onGeri,
  onDevam,
}: {
  bugun: YerelTarih;
  tarih: YerelTarih;
  maksIleriGun: number;
  slotlar: Slot[];
  seciliSlot: Slot | null;
  saatDilimi: string;
  durum: "yukleniyor" | "hazir" | "hata";
  hata: string | null;
  /// Yarisi kaybedilen randevudan sonra gosterilen uyari (409). Ayri tutuluyor
  /// cunku listenin kendi hatasi degil: liste tazelenmis ve gecerli.
  uyari: string | null;
  geriEtiketi: string;
  /// Belirli bir personel secili mi. Bos gun mesajindaki "Farketmez" ipucu
  /// yalnizca o zaman anlamli - bkz. saat-izgarasi.tsx.
  personelSecildi: boolean;
  onTarihSec: (tarih: YerelTarih) => void;
  onSlotSec: (slot: Slot) => void;
  onYenile: () => void;
  onGeri: () => void;
  onDevam: () => void;
}) {
  return (
    <section className="space-y-4">
      <AdimBasligi
        baslik="Gün ve saat"
        aciklama={`Saatler ${tarihUzun(tarih)} için, işletmenin saatiyle gösteriliyor.`}
      />

      {uyari ? <HataKutusu mesaj={uyari} /> : null}

      <GunSerisi
        bugun={bugun}
        secili={tarih}
        maksIleriGun={maksIleriGun}
        onSec={onTarihSec}
      />

      <SaatIzgarasi
        personelSecildi={personelSecildi}
        slotlar={slotlar}
        secili={seciliSlot}
        saatDilimi={saatDilimi}
        durum={durum}
        hata={hata}
        onSec={onSlotSec}
        onYenile={onYenile}
      />

      {/* SATIR HER ZAMAN YER KAPLIYOR (Faz P). Onceden yalnizca secim varken
          ciziliyordu ve ortaya cikisi altindaki "Devam et" dugmesini asagi
          itiyordu - yani slota basip hemen devam etmeye giden tiklama bosa
          gidiyordu. Klasik yerlesim kaymasi; olculdu, gercekten iskalatiyor.
          Bos halde `invisible`: yer ayrilmis kaliyor ama ekran okuyucu bos bir
          satir duymuyor (`aria-hidden`). */}
      <p
        aria-hidden={seciliSlot ? undefined : true}
        className={`text-sm text-muted-foreground ${seciliSlot ? "" : "invisible"}`}
      >
        {seciliSlot ? (
          <>
            Seçilen:{" "}
            <span className="font-medium text-foreground">
              {tarihUzun(tarih)} ·{" "}
              {saatiGoster(seciliSlot.baslangic, saatDilimi)}
              {" – "}
              {saatiGoster(seciliSlot.bitis, saatDilimi)}
            </span>
          </>
        ) : (
          // Gorunmez ama satir yuksekligini veren bir yer tutucu.
          " "
        )}
      </p>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" className="h-10" onClick={onGeri}>
          <ChevronLeftIcon aria-hidden="true" />
          {geriEtiketi}
        </Button>

        <Button className="h-10" disabled={!seciliSlot} onClick={onDevam}>
          Devam et
        </Button>
      </div>
    </section>
  );
}
