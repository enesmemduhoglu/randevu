"use client";

import { CalendarDaysIcon, PencilIcon, ShieldOffIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import {
  DURUM_SINIFI,
  saatAraligi,
  type TakvimKaydi,
} from "@/components/panel/takvim-gun";
import { Badge } from "@/components/ui/badge";
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
import { gunAyYil, telefonBicimle } from "@/lib/bicim";
import { DURUM_ETIKETLERI } from "@/lib/randevu-durum";
import { yerelParcalar } from "@/lib/zaman";

// Musteri detayi: kayit duzeltme, GELMEDI kisitinin kaldirilmasi ve randevu
// gecmisi (Faz H2, ikinci yari).
//
// Istemci bileseni cunku form ve onay penceresi durum tutuyor. Verinin
// kendisi sunucudan prop olarak geliyor; burada hicbir sorgu yok.

export type MusteriKaydi = {
  id: string;
  ad: string;
  telefon: string;
  eposta: string | null;
  not: string | null;
  /// ISO metin: sunucu bileseni `Date`i istemciye metin olarak geciriyor
  /// (serilestirmede ve hydration'da en guvenlisi bu), yerel saate cevirmeyi
  /// istemci isletmenin dilimiyle kendisi yapiyor - takvimle ayni desen.
  olusturmaTarihi: string;
  /// NULL = kisit yok. Dolu olmasi kisitin GECERLI oldugu anlamina gelmiyor;
  /// karari sunucu veriyor ve `kisitli` ile bildiriyor.
  randevuKisitiBitis: string | null;
  kisitli: boolean;
};

export function MusteriDetayi({
  musteri,
  gecmis,
  saatDilimi,
}: {
  musteri: MusteriKaydi;
  gecmis: TakvimKaydi[];
  saatDilimi: string;
}) {
  const router = useRouter();

  const [formAcik, setFormAcik] = useState(false);
  const [ad, setAd] = useState(musteri.ad);
  const [eposta, setEposta] = useState(musteri.eposta ?? "");
  const [not, setNot] = useState(musteri.not ?? "");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [formHatasi, setFormHatasi] = useState<string | null>(null);

  const [kisitOnayi, setKisitOnayi] = useState(false);
  const [kisitKaldiriliyor, setKisitKaldiriliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  function formuAc() {
    // Alanlar her acilista SUNUCUDAKI degerden basliyor: yarim birakilip
    // kapatilan bir duzenleme, bir sonraki aciliste kaydedilmis gibi
    // gorunmemeli.
    setAd(musteri.ad);
    setEposta(musteri.eposta ?? "");
    setNot(musteri.not ?? "");
    setFormHatasi(null);
    setFormAcik(true);
  }

  async function kaydet(olay: React.FormEvent) {
    olay.preventDefault();
    if (kaydediliyor) return;

    setKaydediliyor(true);
    setFormHatasi(null);

    try {
      const yanit = await fetch(`/api/musteriler/${musteri.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ad, eposta, not }),
      });

      if (!yanit.ok) {
        const cevap = (await yanit.json().catch(() => null)) as {
          hata?: string;
        } | null;
        setFormHatasi(
          cevap?.hata ?? "Kaydedilemedi. Sayfayı yenileyip yeniden deneyin.",
        );
        setKaydediliyor(false);
        return;
      }
    } catch {
      setFormHatasi(
        "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
      );
      setKaydediliyor(false);
      return;
    }

    router.refresh();
    setKaydediliyor(false);
    setFormAcik(false);
  }

  async function kisitiKaldir() {
    if (kisitKaldiriliyor) return;

    setKisitKaldiriliyor(true);
    setHata(null);

    try {
      const yanit = await fetch(`/api/musteriler/${musteri.id}/kisit`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
      });

      if (!yanit.ok) {
        const cevap = (await yanit.json().catch(() => null)) as {
          hata?: string;
        } | null;
        setHata(
          cevap?.hata ?? "Kısıt kaldırılamadı. Sayfayı yenileyip tekrar deneyin.",
        );
        setKisitKaldiriliyor(false);
        return;
      }
    } catch {
      setHata(
        "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
      );
      setKisitKaldiriliyor(false);
      return;
    }

    router.refresh();
    setKisitKaldiriliyor(false);
    setKisitOnayi(false);
  }

  const kisitBitisMetni = musteri.randevuKisitiBitis
    ? gunAyYil(yerelParcalar(new Date(musteri.randevuKisitiBitis), saatDilimi))
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="font-heading truncate text-2xl font-semibold tracking-tight">
            {musteri.ad}
          </h1>
          <p className="text-sm text-muted-foreground">
            {telefonBicimle(musteri.telefon)}
            {musteri.eposta ? ` · ${musteri.eposta}` : ""}
          </p>
        </div>

        <Button
          variant="outline"
          className="h-10 shrink-0"
          onClick={formuAc}
        >
          <PencilIcon aria-hidden="true" />
          Düzenle
        </Button>
      </div>

      {hata ? <HataKutusu mesaj={hata} /> : null}

      {musteri.kisitli ? (
        // Kisit kartı yalnizca kisit GECERLIYKEN ciziliyor: gecmiste kalmis
        // bir tarih ya da ayari 0 olan bir isletme icin "kısıtlı" demek,
        // olmayan bir engeli varmis gibi gostermek olurdu.
        <div className="space-y-3 rounded-lg border border-border bg-durum-gelmedi-zemin px-4 py-3">
          <div className="flex items-start gap-3">
            <ShieldOffIcon
              className="mt-0.5 size-5 shrink-0 text-durum-gelmedi"
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-1">
              <p className="font-medium text-durum-gelmedi">
                Randevu kısıtı var
              </p>
              <p className="text-sm text-durum-gelmedi">
                Randevusuna gelmediği için {kisitBitisMetni} tarihine kadar
                kendisi randevu alamıyor. Panelden siz yazarsanız kısıt engel
                olmuyor.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="h-10"
            onClick={() => setKisitOnayi(true)}
          >
            Kısıtı kaldır
          </Button>
        </div>
      ) : null}

      {musteri.not ? (
        <div className="space-y-1 rounded-lg border border-border px-4 py-3">
          <p className="text-sm font-medium">Not</p>
          {/* Not isletmenin IC kaydi: musteriye hicbir kapidan gosterilmiyor
              (bkz. musteri-db.ts). `whitespace-pre-line` satir sonlarini
              koruyor - not cogunlukla madde madde yaziliyor. */}
          <p className="text-sm whitespace-pre-line text-muted-foreground">
            {musteri.not}
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Randevu geçmişi
        </h2>

        {gecmis.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center">
            <CalendarDaysIcon
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="font-medium">Randevu yok</p>
              <p className="text-sm text-muted-foreground">
                Bu müşterinin kayıtlı bir randevusu bulunmuyor.
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {gecmis.map((r) => {
              const gun = gunAyYil(
                yerelParcalar(new Date(r.baslangic), saatDilimi),
              );

              return (
                <li
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {gun} · {saatAraligi(r, saatDilimi)}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {r.hizmetAd} · {r.personelAd}
                      {r.kaynak === "ISLETME" ? " · Panelden eklendi" : ""}
                    </p>
                  </div>

                  <Badge className={`shrink-0 ${DURUM_SINIFI[r.durum]}`}>
                    {DURUM_ETIKETLERI[r.durum]}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={formAcik} onOpenChange={(a) => (a ? null : setFormAcik(false))}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={kaydet} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Müşteri kaydı</DialogTitle>
              <DialogDescription>
                Telefon numarası müşterinin kimliği olduğu için burada
                değiştirilemiyor. Numarası değişen müşteri, yeni numarayla
                gelen ilk randevuda ayrı bir kayıt olarak açılıyor.
              </DialogDescription>
            </DialogHeader>

            {formHatasi ? <HataKutusu mesaj={formHatasi} /> : null}

            <div className="space-y-2">
              <Label htmlFor="musteri-ad">Ad soyad</Label>
              <Input
                id="musteri-ad"
                value={ad}
                onChange={(o) => setAd(o.target.value)}
                className="h-10"
                disabled={kaydediliyor}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="musteri-eposta">E-posta (isteğe bağlı)</Label>
              <Input
                id="musteri-eposta"
                type="email"
                value={eposta}
                onChange={(o) => setEposta(o.target.value)}
                className="h-10"
                disabled={kaydediliyor}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="musteri-not">Not (yalnızca siz görürsünüz)</Label>
              <textarea
                id="musteri-not"
                value={not}
                onChange={(o) => setNot(o.target.value)}
                rows={3}
                maxLength={500}
                disabled={kaydediliyor}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={() => setFormAcik(false)}
                disabled={kaydediliyor}
              >
                Vazgeç
              </Button>
              <Button type="submit" className="h-10" disabled={kaydediliyor}>
                {kaydediliyor ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={kisitOnayi}
        onOpenChange={(a) => (a ? null : setKisitOnayi(false))}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Kısıt kaldırılacak</DialogTitle>
            <DialogDescription>
              {musteri.ad} yeniden kendi randevusunu alabilecek. Geçmiş
              randevuları olduğu gibi kalır.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-10"
              onClick={() => setKisitOnayi(false)}
              disabled={kisitKaldiriliyor}
            >
              Vazgeç
            </Button>
            <Button
              className="h-10"
              onClick={kisitiKaldir}
              disabled={kisitKaldiriliyor}
            >
              {kisitKaldiriliyor ? "Kaldırılıyor…" : "Kısıtı kaldır"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
