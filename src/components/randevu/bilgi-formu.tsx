"use client";

import { ChevronLeftIcon } from "lucide-react";

import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import { AdimBasligi } from "@/components/randevu/ortak";
import { RandevuOzeti } from "@/components/randevu/randevu-ozeti";
import { TurnstileAlani } from "@/components/randevu/turnstile-alani";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Son adim: musterinin bilgileri ve onay.
//
// ISTEMCIDE AGIR DOGRULAMA YOK - kurallarin tek sahibi sunucu
// (src/lib/randevu-girdi.ts). Ayni kurallari burada tekrar yazmak, ikisinin
// zamanla ayrismasi ve kullanicinin sunucuda goremedigi bir hatayla
// karsilasmasi demekti. `required` ve `inputMode` yalnizca tarayiciya ipucu.
//
// Ozet formun USTUNDE: musteri adini yazarken hangi randevuyu onayladigini
// gormeye devam ediyor. Altta olsaydi mobilde klavye acilinca gorunmezdi.

export type MusteriBilgileri = {
  ad: string;
  telefon: string;
  eposta: string;
  not: string;
  /// Turnstile'in forma kendi yazdigi jeton. Anahtar tanimli degilse (yerel
  /// gelistirme, test) bos kaliyor ve sunucu da ayni kosulda `sahte` modda
  /// oldugu icin istek geciyor.
  turnstile: string;
};

/// Notun sunucudaki ust siniri (randevu-girdi.ts). Burada da yaziyoruz ki
/// tarayici 501. karakteri hic kabul etmesin - reddedilen bir gonderim yerine
/// alanin dolmamasi daha az sinir bozucu.
const NOT_EN_COK = 500;

export function BilgiFormu({
  ozet,
  gonderiliyor,
  hata,
  onGeri,
  onGonder,
}: {
  ozet: React.ComponentProps<typeof RandevuOzeti>;
  gonderiliyor: boolean;
  hata: string | null;
  onGeri: () => void;
  onGonder: (bilgiler: MusteriBilgileri) => void;
}) {
  function gonder(olay: React.FormEvent<HTMLFormElement>) {
    olay.preventDefault();
    if (gonderiliyor) return; // cift gonderim engeli

    const veri = new FormData(olay.currentTarget);
    onGonder({
      ad: String(veri.get("ad") ?? ""),
      telefon: String(veri.get("telefon") ?? ""),
      eposta: String(veri.get("eposta") ?? ""),
      not: String(veri.get("not") ?? ""),
      // Alanin adini Turnstile belirliyor, biz degil: widget onu forma
      // kendisi ekliyor.
      turnstile: String(veri.get("cf-turnstile-response") ?? ""),
    });
  }

  return (
    <section className="space-y-4">
      <AdimBasligi
        baslik="Bilgileriniz"
        aciklama="Hesap açmanıza gerek yok."
      />

      <Card size="sm">
        <CardContent>
          <RandevuOzeti {...ozet} />
        </CardContent>
      </Card>

      <form onSubmit={gonder} className="space-y-4" noValidate>
        {hata ? <HataKutusu mesaj={hata} id="randevu-hatasi" /> : null}

        <div className="space-y-2">
          <Label htmlFor="ad">Ad soyad</Label>
          <Input
            id="ad"
            name="ad"
            autoComplete="name"
            required
            maxLength={80}
            disabled={gonderiliyor}
            aria-describedby={hata ? "randevu-hatasi" : undefined}
            className="h-10"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="telefon">Telefon</Label>
          <Input
            id="telefon"
            name="telefon"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            placeholder="0532 123 45 67"
            disabled={gonderiliyor}
            aria-describedby="telefon-yardim"
            className="h-10"
          />
          <p id="telefon-yardim" className="text-xs text-muted-foreground">
            İşletme size bu numaradan ulaşacak. Randevu hatırlatması da buraya
            gidiyor.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="eposta">
            E-posta{" "}
            <span className="font-normal text-muted-foreground">
              (isteğe bağlı)
            </span>
          </Label>
          <Input
            id="eposta"
            name="eposta"
            type="email"
            autoComplete="email"
            disabled={gonderiliyor}
            className="h-10"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="not">
            Not{" "}
            <span className="font-normal text-muted-foreground">
              (isteğe bağlı)
            </span>
          </Label>
          {/* Depoda `textarea` shadcn bileseni yok. Input'un uzun sinif
              dizisini kopyalamak yerine ayni token'lardan kisa bir set
              yaziliyor; bilesen eklenirse burasi tek satirda degisir. */}
          <textarea
            id="not"
            name="not"
            rows={3}
            maxLength={NOT_EN_COK}
            disabled={gonderiliyor}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
          />
        </div>

        {/* Widget dugmelerin USTUNDE: musteri "onayla"ya basmadan once
            gorunur olmali, yoksa etkilesim isteyen bir kutu ekranin disinda
            kalir ve gonderim sebebi anlasilmadan reddedilir. */}
        <TurnstileAlani hata={hata} />

        <div className="flex items-center justify-between gap-3 pt-1">
          <Button
            type="button"
            variant="ghost"
            className="h-10"
            onClick={onGeri}
            disabled={gonderiliyor}
          >
            <ChevronLeftIcon aria-hidden="true" />
            Saati değiştir
          </Button>

          <Button type="submit" className="h-10" disabled={gonderiliyor}>
            {gonderiliyor ? "Gönderiliyor…" : "Randevuyu onayla"}
          </Button>
        </div>
      </form>
    </section>
  );
}
