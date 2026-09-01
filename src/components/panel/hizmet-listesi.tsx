"use client";

import { PencilIcon, PlusIcon, ScissorsIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import { HizmetFormu, type HizmetKaydi } from "@/components/panel/hizmet-formu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { paraBicimle, sureBicimle } from "@/lib/bicim";
// Renk eslemesi Faz H'de etiket listesinin yanina tasindi: panel takvimi de
// ayni eslemeyi istiyordu ve iki kopyanin ayrisma riski gercekti.
import { hizmetRenkSinifi } from "@/lib/hizmet-girdi";

// Liste istemci bileseni cunku form ve onay penceresi durum tutuyor. Verinin
// kendisi sunucudan geliyor (prop olarak); burada hicbir sorgu yok.

export function HizmetListesi({ hizmetler }: { hizmetler: HizmetKaydi[] }) {
  const router = useRouter();
  const [formAcik, setFormAcik] = useState(false);
  const [duzenlenen, setDuzenlenen] = useState<HizmetKaydi | null>(null);
  const [kaldirilacak, setKaldirilacak] = useState<HizmetKaydi | null>(null);
  const [kaldiriliyor, setKaldiriliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  function ekle() {
    setDuzenlenen(null);
    setFormAcik(true);
  }

  function duzenle(h: HizmetKaydi) {
    setDuzenlenen(h);
    setFormAcik(true);
  }

  async function kaldir() {
    if (!kaldirilacak || kaldiriliyor) return;
    setKaldiriliyor(true);
    setHata(null);

    try {
      const yanit = await fetch(`/api/hizmetler/${kaldirilacak.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
      });
      if (!yanit.ok) {
        const cevap = (await yanit.json().catch(() => null)) as { hata?: string } | null;
        setHata(cevap?.hata ?? "Kaldırılamadı. Sayfayı yenileyip yeniden deneyin.");
        setKaldiriliyor(false);
        return;
      }
    } catch {
      setHata("Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.");
      setKaldiriliyor(false);
      return;
    }

    router.refresh();
    setKaldiriliyor(false);
    setKaldirilacak(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Hizmetler
          </h1>
          <p className="text-sm text-muted-foreground">
            Müşterileriniz randevu alırken bu listeden seçecek.
          </p>
        </div>

        <Button className="h-10 shrink-0" onClick={ekle}>
          <PlusIcon aria-hidden="true" />
          Hizmet ekle
        </Button>
      </div>

      {hata ? <HataKutusu mesaj={hata} /> : null}

      {hizmetler.length === 0 ? (
        // Bos durum: neyin olmadigi + tek eylem. Espri ve suclama yok.
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <ScissorsIcon className="size-8 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium">Henüz hizmet yok</p>
            <p className="text-sm text-muted-foreground">
              Müşterilerinizin randevu alabilmesi için en az bir hizmet tanımlayın.
            </p>
          </div>
          <Button variant="outline" onClick={ekle}>
            Hizmet ekle
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {hizmetler.map((h) => (
            <li
              key={h.id}
              className="flex items-center gap-3 rounded-lg border border-border px-4 py-3"
            >
              <span
                aria-hidden="true"
                className={`size-2.5 shrink-0 rounded-full ${hizmetRenkSinifi(h.renk)}`}
              />

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{h.ad}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {sureBicimle(h.sureDk)} · {paraBicimle(h.fiyatKurus)}
                  {h.aciklama ? ` · ${h.aciklama}` : ""}
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon-lg"
                aria-label={`${h.ad} hizmetini düzenle`}
                onClick={() => duzenle(h)}
              >
                <PencilIcon aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label={`${h.ad} hizmetini kaldır`}
                onClick={() => setKaldirilacak(h)}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {formAcik ? (
        <HizmetFormu
          acik={formAcik}
          mevcut={duzenlenen}
          onKapat={() => setFormAcik(false)}
        />
      ) : null}

      <Dialog
        open={Boolean(kaldirilacak)}
        onOpenChange={(a) => (a ? null : setKaldirilacak(null))}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Hizmet kaldırılacak</DialogTitle>
            <DialogDescription>
              {kaldirilacak?.ad} listeden kalkacak ve yeni randevularda
              seçilemeyecek. Geçmiş randevular olduğu gibi kalır.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-10"
              onClick={() => setKaldirilacak(null)}
              disabled={kaldiriliyor}
            >
              Vazgeç
            </Button>
            <Button
              variant="destructive"
              className="h-10"
              onClick={kaldir}
              disabled={kaldiriliyor}
            >
              {kaldiriliyor ? "Kaldırılıyor…" : "Kaldır"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
