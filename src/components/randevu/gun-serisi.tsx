"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import {
  gunKisaAdi,
  tarihAraligi,
  tarihUzun,
} from "@/components/randevu/ortak";
import { Button } from "@/components/ui/button";
import { gunEkle, gunFarki, type YerelTarih } from "@/lib/zaman";

// Gun seridi: bir haftalik pencere + hafta atlayan oklar.
//
// Neden pencere: takvim `maksIleriGun` kadar ileri acik ve varsayilan 60. Altmis
// bir dugmeyi tek seride basmak, kirkinci gune ulasmak icin yirmi kaydirma
// demekti. Ok'lar hafta hafta atliyor, serit de kendi icinde kaydirilabiliyor.
//
// Serit KENDI ICINDE yatay kayiyor (`overflow-x-auto`), sayfa kaymiyor: 360
// piksellik ekranda yedi dokunma hedefi yan yana sigmiyor ve dokunma hedefini
// 44 pikselin altina indirmek yerine seridi kaydirilabilir birakmak seciliyor.
//
// "Bugün" ve "Yarın" gun adinin yerine yaziliyor: musterilerin buyuk cogunlugu
// bu iki gunden birini seciyor ve "Sal 1" yerine "Bugün 1" bir adim tasarruf.

const PENCERE = 7;

export function GunSerisi({
  bugun,
  secili,
  maksIleriGun,
  onSec,
}: {
  /// Isletmenin takvimindeki bugun. Sunucudan geliyor - tarayicinin dilimi
  /// isletmeninkinden farkli olabilir (DEGISMEZ 7).
  bugun: YerelTarih;
  secili: YerelTarih;
  maksIleriGun: number;
  onSec: (tarih: YerelTarih) => void;
}) {
  // Pencere secili gunun haftasindan aciliyor: adimlar arasinda ileri geri
  // gidildiginde musteri sectigi gunu ariyor durumda kalmasin.
  const [ofset, setOfset] = useState(() =>
    Math.max(0, Math.floor(gunFarki(bugun, secili) / PENCERE) * PENCERE),
  );

  const gunler: number[] = [];
  for (let i = 0; i < PENCERE; i += 1) {
    const uzaklik = ofset + i;
    if (uzaklik <= maksIleriGun) gunler.push(uzaklik);
  }

  // BASLIK GORUNEN ARALIGI YAZIYOR, ay adini degil (Faz P). Onceden "Eylül
  // 2026" yaziyordu ve oklar arasinda duran bir ay adi, oklarin AY atladigini
  // soyluyordu - oysa serit hafta hafta ilerliyor. `aria-label` bastan beri
  // dogruydu ("Sonraki hafta"), yani ekran okuyucu ile goz farkli sey
  // duyuyordu. Yazim panelin takvimiyle ayni yerden geliyor.
  const ilk = gunEkle(bugun, gunler[0] ?? 0);
  const son = gunEkle(bugun, gunler[gunler.length - 1] ?? 0);
  const baslik = tarihAraligi(ilk, son);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Önceki hafta"
          disabled={ofset === 0}
          onClick={() => setOfset(Math.max(0, ofset - PENCERE))}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>

        <p aria-live="polite" className="text-sm font-medium">
          {baslik}
        </p>

        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Sonraki hafta"
          disabled={ofset + PENCERE > maksIleriGun}
          onClick={() => setOfset(ofset + PENCERE)}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>

      <div className="-mx-1 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-1 pb-1">
        {gunler.map((uzaklik) => {
          const tarih = gunEkle(bugun, uzaklik);
          const bu = gunFarki(secili, tarih) === 0;
          const etiket =
            uzaklik === 0 ? "Bugün" : uzaklik === 1 ? "Yarın" : gunKisaAdi(tarih);

          return (
            <button
              key={uzaklik}
              type="button"
              // Gorunen metin kisa ("Sal 1"); ekran okuyucu tam tarihi duysun.
              aria-label={tarihUzun(tarih)}
              aria-current={bu ? "date" : undefined}
              onClick={() => {
                if (!bu) onSec(tarih);
              }}
              className={`flex min-h-saat min-w-12 shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                bu
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border hover:border-primary/50 hover:bg-accent/40"
              }`}
            >
              <span
                aria-hidden="true"
                className={`text-[11px] leading-none ${bu ? "" : "text-muted-foreground"}`}
              >
                {etiket}
              </span>
              <span aria-hidden="true" className="text-sm leading-none font-semibold">
                {tarih.gun}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
