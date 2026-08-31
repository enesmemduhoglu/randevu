"use client";

import { ChevronLeftIcon, ChevronRightIcon, UsersIcon } from "lucide-react";

import { AdimBasligi, type PersonelOzeti } from "@/components/randevu/ortak";
import { Button } from "@/components/ui/button";

// Ikinci adim: personel secimi.
//
// BU ADIM HER ZAMAN GORUNMUYOR. Tek kisilik isletmede - ki sema o durumu
// birinci sinif kabul ediyor, `personel` tablosunun yorumuna bak - secilecek
// bir sey yok; adimi gostermek musteriye anlamsiz bir tur attirirdi. Karari
// cagiran taraf veriyor (randevu-akisi.tsx), cunku listeyi SECILEN HIZMETI
// verebilen personellerle daraltmasi gerekiyor: hizmeti vermeyen birini
// secmek, "bu gun icin uygun saat yok" gibi gorunen bir cikmaz sokak uretiyor.
//
// "Farketmez" ILK SIRADA ve varsayilan yol: musterilerin cogu icin kim
// oldugu onemli degil ve en cok bos saat bu secenekte cikiyor.

export function PersonelSecimi({
  personeller,
  secili,
  onSec,
  onGeri,
}: {
  personeller: PersonelOzeti[];
  /// null = "farketmez".
  secili: string | null;
  onSec: (personelId: string | null) => void;
  onGeri: () => void;
}) {
  return (
    <section className="space-y-4">
      <AdimBasligi
        baslik="Kiminle?"
        aciklama="Fark etmiyorsa en uygun saatleri görmek için ilk seçeneği bırakın."
      />

      <ul className="space-y-2">
        <li>
          <SecimSatiri
            baslik="Farketmez"
            altBaslik="Uygun olan personelle randevu oluşturulur"
            secili={secili === null}
            onSec={() => onSec(null)}
            simge={
              <UsersIcon
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            }
          />
        </li>

        {personeller.map((personel) => (
          <li key={personel.id}>
            <SecimSatiri
              baslik={personel.ad}
              altBaslik={personel.unvan}
              secili={secili === personel.id}
              onSec={() => onSec(personel.id)}
            />
          </li>
        ))}
      </ul>

      <Button variant="ghost" className="h-10" onClick={onGeri}>
        <ChevronLeftIcon aria-hidden="true" />
        Hizmeti değiştir
      </Button>
    </section>
  );
}

function SecimSatiri({
  baslik,
  altBaslik,
  secili,
  onSec,
  simge,
}: {
  baslik: string;
  altBaslik?: string | null;
  secili: boolean;
  onSec: () => void;
  simge?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSec}
      aria-current={secili ? "true" : undefined}
      className={`flex min-h-saat w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
        secili
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50 hover:bg-accent/40"
      }`}
    >
      {simge}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{baslik}</span>
        {altBaslik ? (
          <span className="block truncate text-sm text-muted-foreground">
            {altBaslik}
          </span>
        ) : null}
      </span>
      <ChevronRightIcon
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  );
}
