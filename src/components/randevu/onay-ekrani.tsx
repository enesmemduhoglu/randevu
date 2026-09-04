"use client";

import { CheckCircle2Icon, CopyIcon, LinkIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { RandevuOzeti } from "@/components/randevu/randevu-ozeti";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Onay ekrani.
//
// Ekranin asil isi ozet degil, IPTAL BAGLANTISI. Musteri hesap acmadan randevu
// aliyor, yani randevusuna donebilecegi tek adres bu token'li baglanti. Bu
// yuzden en gorunur kutuda duruyor, kopyalanabiliyor ve neden onemli oldugu
// acikca yaziyor - "kaydedin" demeden birakmak, musterinin iptal icin isletmeyi
// aramasi demek.

export type AlinanRandevu = {
  id: string;
  /// ISO/UTC.
  baslangic: string;
  bitis: string;
  durum: string;
  personelAd: string;
  hizmetAd: string;
};

export function OnayEkrani({
  randevu,
  iptalYolu,
  hesabaEklendi,
  saatDilimi,
  onYeniden,
}: {
  randevu: AlinanRandevu;
  iptalYolu: string;
  /// Randevu oturumu acik bir hesaba baglandi mi (Faz J).
  ///
  /// Bu bayrak metni degistirmek ZORUNDA. Kutunun "hesabiniz olmadigi icin
  /// kaybederseniz geri getiremiyoruz" cumlesi Faz G'de dogruydu; hesabi olan
  /// biri icin artik yanlis ve bosuna endiselendiriyor - randevu
  /// `/randevularim`da duruyor. Yanlis bir uyari, hic uyari olmamasindan
  /// kotu: kullaniciya sistemin kendisini tanimadigini soyluyor.
  hesabaEklendi: boolean;
  saatDilimi: string;
  onYeniden: () => void;
}) {
  const onayli = randevu.durum === "ONAYLI";

  // Odak basliga tasiniyor: akisin sonu, gorsel olarak yepyeni bir ekran ama
  // odak hala "Randevuyu onayla" dugmesinde kaliyordu. Ref callback ile degil
  // efektle: callback her render'da calisir ve kopyalama sonrasi odagi
  // kullanicidan geri calardi.
  const baslikRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    baslikRef.current?.focus();
  }, []);

  // Tam adres yalnizca TARAYICIDA biliniyor - sunucu render'inda `window` yok.
  // `useSyncExternalStore` bunun icin: sunucuda yolu, istemcide tam adresi
  // veriyor ve hydration uyusmazligi uretmiyor. Aboneligi bos, cunku adres
  // sayfa omru boyunca degismiyor.
  const kokAdres = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const tamAdres = `${kokAdres}${iptalYolu}`;

  const [kopyalandi, setKopyalandi] = useState(false);

  async function kopyala() {
    try {
      await navigator.clipboard.writeText(tamAdres);
      setKopyalandi(true);
      // Etiket eski haline donuyor; kalici "Kopyalandı" ikinci kopyalamanin
      // calisip calismadigini gizlerdi.
      window.setTimeout(() => setKopyalandi(false), 2000);
    } catch {
      // Panoya erisim reddedilebiliyor (izin yok, guvenli olmayan baglam).
      // Baglanti zaten ekranda yazili: elle secilip kopyalanabilir, o yuzden
      // burada kullaniciyi bir hata mesajiyla mesgul etmiyoruz.
      setKopyalandi(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="space-y-3">
        <CheckCircle2Icon className="size-9 text-primary" aria-hidden="true" />
        <div className="space-y-1">
          <h2
            ref={baslikRef}
            tabIndex={-1}
            className="font-heading text-2xl font-semibold tracking-tight outline-none"
          >
            {onayli ? "Randevunuz alındı" : "Randevu talebiniz alındı"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {onayli
              ? "Sizi bekliyoruz. Gelemeyecekseniz aşağıdaki bağlantıdan iptal edebilirsiniz."
              : "İşletme onayladığında size haber verilecek. Bu sırada aşağıdaki bağlantıdan randevunuzu takip edebilirsiniz."}
          </p>
        </div>

        <span
          className={`inline-flex items-center rounded-md px-2.5 py-1 text-sm font-medium ${
            onayli
              ? "bg-durum-onayli-zemin text-durum-onayli"
              : "bg-durum-bekliyor-zemin text-durum-bekliyor"
          }`}
        >
          {onayli ? "Onaylandı" : "Onay bekliyor"}
        </span>
      </div>

      <Card size="sm">
        <CardContent>
          <RandevuOzeti
            hizmetAd={randevu.hizmetAd}
            personelAd={randevu.personelAd}
            baslangic={randevu.baslangic}
            bitis={randevu.bitis}
            saatDilimi={saatDilimi}
          />
        </CardContent>
      </Card>

      <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-start gap-2">
          <LinkIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {hesabaEklendi
                ? "Randevunuz hesabınıza eklendi"
                : "Bu bağlantıyı saklayın"}
            </p>
            <p className="text-sm text-muted-foreground">
              {hesabaEklendi
                ? "Randevularım sayfasından görebilir ve iptal edebilirsiniz. Aşağıdaki bağlantı da çalışıyor — başka bir cihazdan açmak ya da paylaşmak isterseniz."
                : "Randevunuzu görüntüleyebileceğiniz ve iptal edebileceğiniz tek adres bu. Hesabınız olmadığı için kaybederseniz geri getiremiyoruz — işletmeyi aramanız gerekir."}
            </p>
          </div>
        </div>

        <p className="rounded-md bg-card px-3 py-2 text-xs break-all">
          {tamAdres}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-10" onClick={kopyala}>
            <CopyIcon aria-hidden="true" />
            {kopyalandi ? "Kopyalandı" : "Bağlantıyı kopyala"}
          </Button>

          <Button asChild variant="ghost" className="h-10">
            <Link href={hesabaEklendi ? "/randevularim" : iptalYolu}>
              {hesabaEklendi ? "Randevularıma git" : "Randevumu görüntüle"}
            </Link>
          </Button>
        </div>
      </div>

      <Button variant="ghost" className="h-10" onClick={onYeniden}>
        Yeni randevu al
      </Button>
    </section>
  );
}
