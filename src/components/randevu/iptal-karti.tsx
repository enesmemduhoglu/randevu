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

// Iptal eylemi. Istemci bileseni cunku onay adimi ve gonderim durumu tutuyor;
// randevunun KENDISI burada okunmuyor - sayfa sunucuda okuyup hazir bir ozet
// veriyor, yani sorgu istemci paketine hic inmiyor (DEGISMEZ 1).
//
// `window.confirm` KULLANILMIYOR. Tarayici modali sayfanin disinda duruyor:
// stillenemiyor, mobilde adres cubuguna yapisik cikiyor ve metni Turkce
// yazsak bile dugmeleri tarayicinin dilinde kaliyor ("OK" / "Cancel") - yani
// yikici bir eylemin en kritik aninda kullanici tanimadigi bir kutuya bakiyor.
// Radix Dialog ise odagi tuzakliyor, Esc ile kapaniyor ve ekran okuyucuya
// basligi aciklamayla birlikte duyuruyor.

type Ozellikler = {
  slug: string;
  /// Iptal yetkisini tasiyan sir. Zaten kullanicinin adres cubugunda - istemciye
  /// gecmesi yeni bir aciklik degil. Buradan yalnizca kendi sunucumuza gidiyor;
  /// hicbir log'a, hicbir hata metnine yazilmiyor (DEGISMEZ 5).
  token: string;
  /// Onay penceresinde tekrarlanan tek satirlik randevu ozeti: modal acikken
  /// kart arkada kaliyor ve "hangi randevuydu?" sorusu cevapsiz kalmamali.
  ozet: string;
};

export function IptalKarti({ slug, token, ozet }: Ozellikler) {
  const router = useRouter();
  const [onayAcik, setOnayAcik] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function iptalEt() {
    if (gonderiliyor) return;
    setGonderiliyor(true);
    setHata(null);

    try {
      const yanit = await fetch("/api/randevu/iptal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isletme: slug, token }),
      });

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
        // gosterdigimizden farkli (baska bir sekmeden iptal edilmis ya da
        // isletme kapatmis olabilir). Tazeliyoruz ki kullanici hata metninin
        // yaninda randevunun GERCEK durumunu da gorsun.
        if (yanit.status === 409) router.refresh();
        return;
      }
    } catch {
      // Aga hic cikamadik. Bu, "iptal edilmedi" demek DEGIL - istek gitmis ama
      // cevabi kaybolmus olabilir. Metin bu yuzden "olmadi" demiyor, tekrar
      // denemeyi soyluyor; tekrar deneme guvenli, cunku ikinci istek 409 alir.
      setHata(
        "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
      );
      setOnayAcik(false);
      setGonderiliyor(false);
      return;
    }

    // TAM SAYFA YENIDEN YUKLEME YOK: sunucu bileseni yeniden calisiyor ve
    // randevu artik "iptal edildi" durumuyla donuyor. Iptal edilmis bir
    // randevuda bu bilesen zaten hic render edilmiyor.
    router.refresh();
    setOnayAcik(false);
    setGonderiliyor(false);
  }

  return (
    <div className="space-y-3">
      {hata ? <HataKutusu mesaj={hata} /> : null}

      {/* h-11: parmakla basilan birincil eylem. Mobilde tek sutun, tam
          genislik - randevu linki cogunlukla telefonda aciliyor. */}
      <Button
        variant="destructive"
        className="h-11 w-full"
        onClick={() => setOnayAcik(true)}
      >
        Randevuyu iptal et
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        İptal ettiğinizde bu saat yeniden randevuya açılır.
      </p>

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
