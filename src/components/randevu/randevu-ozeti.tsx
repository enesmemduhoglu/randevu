"use client";

import { anTarihi, saatiGoster, tarihUzun } from "@/components/randevu/ortak";

// Randevunun dort satirlik ozeti. Iki yerde kullaniliyor: bilgi formunun
// ustunde (henuz olusmamis randevu) ve onay ekraninda (olusmus randevu).
//
// Tek bilesen olmasinin sebebi tutarlilik: musteri "onayla"dan once gordugu
// ozetle sonra gordugu ozetin ayni sirada ve ayni yazimda olmasini bekliyor.
// Iki ayri blok yazsaydik biri degistiginde digeri sessizce ayrisirdi.
//
// Alanlar sunucudan gelen HAM degerler degil, cagiranin hazirladigi metinler:
// olusmadan onceki ozette hizmetin suresi ve ucreti var, olustuktan sonraki
// yanitta yok. Bileseni ikiye bolmek yerine ikincil bilgi istege bagli.

export function RandevuOzeti({
  hizmetAd,
  hizmetBilgisi,
  personelAd,
  baslangic,
  bitis,
  saatDilimi,
}: {
  hizmetAd: string;
  hizmetBilgisi?: string;
  /// "Farketmez" de olabilir: randevu olusmadan once personel belli degil.
  personelAd: string;
  /// ISO/UTC.
  baslangic: string;
  bitis: string;
  saatDilimi: string;
}) {
  const tarih = anTarihi(baslangic, saatDilimi);

  return (
    <dl className="divide-y divide-border text-sm">
      <Satir baslik="Hizmet">
        <span className="font-medium">{hizmetAd}</span>
        {hizmetBilgisi ? (
          <span className="block text-muted-foreground">{hizmetBilgisi}</span>
        ) : null}
      </Satir>

      <Satir baslik="Personel">
        <span className="font-medium">{personelAd}</span>
      </Satir>

      <Satir baslik="Tarih">
        <span className="font-medium">{tarihUzun(tarih)}</span>
      </Satir>

      <Satir baslik="Saat">
        <span className="font-medium">
          {saatiGoster(baslangic, saatDilimi)} –{" "}
          {saatiGoster(bitis, saatDilimi)}
        </span>
      </Satir>
    </dl>
  );
}

function Satir({
  baslik,
  children,
}: {
  baslik: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="shrink-0 text-muted-foreground">{baslik}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
