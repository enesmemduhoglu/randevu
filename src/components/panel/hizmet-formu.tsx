"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { paraBicimle } from "@/lib/bicim";
import { HIZMET_RENKLERI } from "@/lib/hizmet-girdi";

// Hizmet ekleme ve duzenleme formu. Ikisi ayni bilesen: alanlar birebir ayni
// ve iki kopya tutmak, birinde yapilan duzeltmenin digerinde unutulmasi
// demekti. Fark yalnizca hedef adres ve HTTP metodu.

export type HizmetKaydi = {
  id: string;
  ad: string;
  aciklama: string | null;
  sureDk: number;
  fiyatKurus: number;
  renk: string | null;
};

/// Renk etiketi -> arayuz sinifi. DEGISMEZ 10: kod icinde renk KODU yok,
/// hepsi token uzerinden.
const RENK_SINIFI: Record<string, string> = {
  terracotta: "bg-primary",
  teal: "bg-durum-onayli",
  amber: "bg-durum-bekliyor",
  tas: "bg-durum-tamamlandi",
};

const RENK_ADI: Record<string, string> = {
  terracotta: "Turuncu",
  teal: "Yeşil",
  amber: "Sarı",
  tas: "Gri",
};

type Props = {
  acik: boolean;
  onKapat: () => void;
  /// Doluysa duzenleme, bossa ekleme.
  mevcut?: HizmetKaydi | null;
};

export function HizmetFormu({ acik, onKapat, mevcut }: Props) {
  const router = useRouter();
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [renk, setRenk] = useState<string | null>(mevcut?.renk ?? null);

  const duzenleme = Boolean(mevcut);

  async function gonder(olay: React.FormEvent<HTMLFormElement>) {
    olay.preventDefault();
    if (gonderiliyor) return;

    const veri = new FormData(olay.currentTarget);
    setGonderiliyor(true);
    setHata(null);

    const govde = {
      ad: veri.get("ad"),
      aciklama: veri.get("aciklama"),
      sureDk: veri.get("sureDk"),
      fiyat: veri.get("fiyat"),
      renk,
    };

    try {
      const yanit = await fetch(
        duzenleme ? `/api/hizmetler/${mevcut?.id}` : "/api/hizmetler",
        {
          method: duzenleme ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(govde),
        },
      );

      if (!yanit.ok) {
        const cevap = (await yanit.json().catch(() => null)) as { hata?: string } | null;
        setHata(cevap?.hata ?? "Kaydedilemedi. Sayfayı yenileyip yeniden deneyin.");
        setGonderiliyor(false);
        return;
      }
    } catch {
      setHata("Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.");
      setGonderiliyor(false);
      return;
    }

    // Liste sunucu bileseninde; yeniden cizilmesi icin refresh sart.
    router.refresh();
    setGonderiliyor(false);
    onKapat();
  }

  return (
    <Dialog open={acik} onOpenChange={(a) => (a ? null : onKapat())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{duzenleme ? "Hizmeti düzenle" : "Hizmet ekle"}</DialogTitle>
          <DialogDescription>
            Müşterileriniz randevu alırken bu hizmetler arasından seçecek.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={gonder} className="space-y-4" noValidate>
          {hata ? <HataKutusu mesaj={hata} id="hizmet-hatasi" /> : null}

          <div className="space-y-2">
            <Label htmlFor="ad">Hizmet adı</Label>
            <Input
              id="ad"
              name="ad"
              defaultValue={mevcut?.ad ?? ""}
              autoFocus
              required
              disabled={gonderiliyor}
              className="h-10"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sureDk">Süre (dk)</Label>
              <Input
                id="sureDk"
                name="sureDk"
                inputMode="numeric"
                defaultValue={mevcut?.sureDk ?? 30}
                required
                disabled={gonderiliyor}
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fiyat">Ücret</Label>
              <Input
                id="fiyat"
                name="fiyat"
                inputMode="decimal"
                placeholder="350"
                defaultValue={
                  mevcut ? paraBicimle(mevcut.fiyatKurus).replace(" ₺", "") : ""
                }
                disabled={gonderiliyor}
                className="h-10"
              />
              <p className="text-xs text-muted-foreground">Boş bırakılırsa ücretsiz</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="aciklama">Açıklama</Label>
            <Input
              id="aciklama"
              name="aciklama"
              defaultValue={mevcut?.aciklama ?? ""}
              disabled={gonderiliyor}
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            {/* Renk bir grup radyo dugmesi; kutucuklar yalnizca gorsel oldugu
                icin her birinin ekran okuyucuya giden bir adi var. */}
            <span className="text-sm font-medium">Takvim rengi</span>
            <div role="radiogroup" aria-label="Takvim rengi" className="flex gap-2">
              {HIZMET_RENKLERI.map((secenek) => (
                <button
                  key={secenek}
                  type="button"
                  role="radio"
                  aria-checked={renk === secenek}
                  aria-label={RENK_ADI[secenek]}
                  onClick={() => setRenk(renk === secenek ? null : secenek)}
                  disabled={gonderiliyor}
                  className={`size-9 rounded-full ${RENK_SINIFI[secenek]} ${
                    renk === secenek
                      ? "ring-2 ring-ring ring-offset-2 ring-offset-background"
                      : ""
                  } focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
                />
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={onKapat}
              disabled={gonderiliyor}
            >
              Vazgeç
            </Button>
            <Button type="submit" className="h-10" disabled={gonderiliyor}>
              {gonderiliyor ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
