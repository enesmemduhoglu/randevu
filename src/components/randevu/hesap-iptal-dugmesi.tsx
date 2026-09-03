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

// `/randevularim` listesindeki iptal eylemi.
//
// `IptalKarti` ILE AYRI TUTULDU. Ikisi ayni sonucu uretiyor ama farkli seye
// dayaniyor: o token'a (oturumsuz, tek randevuluk sayfa), bu sahiplige
// (oturumlu liste). Ortak bir bilesene indirilseydi icinde "token mu id mi"
// diye ayrilan bir dal olurdu ve o dal, iki yetki modelini tek yerde
// karistiran bir yer haline gelirdi - yani en yanlis yerde.
//
// Gorunum de ayni degil: orada iptal sayfanin BIRINCIL eylemi ve tam
// genislikte bir dugme; burada listedeki bir satirin ikincil eylemi.
//
// `window.confirm` KULLANILMIYOR; gerekcesi iptal-karti.tsx'te.

type Ozellikler = {
  /// Randevu kimligi. Yetki tasimiyor - sunucu her istekte sahipligi kendi
  /// dogruluyor (musteri-db.ts > randevuIptalEt). Baskasinin id'si buradan
  /// gonderilse 404 doner.
  randevuId: string;
  /// Onay penceresinde tekrarlanan ozet: modal acikken kart arkada kaliyor ve
  /// "hangi randevuydu?" sorusu cevapsiz kalmamali. Listede birden cok
  /// randevu yan yana durdugu icin bu, tek randevuluk sayfadakinden daha da
  /// onemli.
  ozet: string;
};

export function HesapIptalDugmesi({ randevuId, ozet }: Ozellikler) {
  const router = useRouter();
  const [onayAcik, setOnayAcik] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function iptalEt() {
    if (gonderiliyor) return;
    setGonderiliyor(true);
    setHata(null);

    try {
      const yanit = await fetch(
        `/api/randevularim/${encodeURIComponent(randevuId)}/iptal`,
        { method: "POST" },
      );

      if (!yanit.ok) {
        const cevap = (await yanit.json().catch(() => null)) as {
          hata?: string;
        } | null;

        setHata(
          cevap?.hata ??
            "Randevu iptal edilemedi. Sayfayı yenileyip yeniden deneyin.",
        );
        setOnayAcik(false);
        setGonderiliyor(false);

        // 409 "artik iptal edilemez" demek, yani sunucudaki durum bizim
        // gosterdigimizden farkli - isletme kapatmis ya da baska bir sekmeden
        // iptal edilmis olabilir. Tazeliyoruz ki kullanici hata metninin
        // yaninda listenin GERCEK halini de gorsun.
        if (yanit.status === 409) router.refresh();
        return;
      }
    } catch {
      // Aga hic cikamadik. Bu "iptal edilmedi" demek DEGIL - istek gitmis ama
      // cevabi kaybolmus olabilir. Tekrar denemek guvenli: ikinci istek 409
      // alir.
      setHata(
        "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
      );
      setOnayAcik(false);
      setGonderiliyor(false);
      return;
    }

    // Sunucu bileseni yeniden kosuyor ve randevu artik "iptal edildi"
    // durumuyla, gecmis listesinde donuyor.
    router.refresh();
    setOnayAcik(false);
    setGonderiliyor(false);
  }

  return (
    <div className="space-y-2">
      {hata ? <HataKutusu mesaj={hata} /> : null}

      <Button
        variant="outline"
        className="h-10 w-full sm:w-auto"
        onClick={() => setOnayAcik(true)}
      >
        İptal et
      </Button>

      <Dialog
        open={onayAcik}
        // Gonderim surerken kapanmiyor: yarim kalmis bir istegin ustune modali
        // kapatmak, kullaniciya isin bittigini dusundururdu.
        onOpenChange={(acik) => {
          if (!acik && !gonderiliyor) setOnayAcik(false);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Randevu iptal edilecek</DialogTitle>
            <DialogDescription>
              {ozet} randevunuz iptal edilecek ve bu saat yeniden randevuya
              açılacak. Bu işlem geri alınamaz.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              className="h-10"
              onClick={() => setOnayAcik(false)}
              disabled={gonderiliyor}
            >
              Vazgeç
            </Button>
            <Button
              variant="destructive"
              className="h-10"
              onClick={iptalEt}
              disabled={gonderiliyor}
            >
              {gonderiliyor ? "İptal ediliyor…" : "Evet, iptal et"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
