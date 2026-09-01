"use client";

import { CalendarX2Icon } from "lucide-react";

import { saatBicimle } from "@/lib/bicim";
// `hizmet.renk` renk KODU degil, kapali listeden bir ETIKET ("teal",
// "amber"...): esleme etiketin tanimlandigi yerde duruyor, DEGISMEZ 10
// bozulmuyor ve hizmet listesiyle tek kaynagi paylasiyoruz.
import { hizmetRenkSinifi } from "@/lib/hizmet-girdi";
import { DURUM_ETIKETLERI, type RandevuDurumu } from "@/lib/randevu-durum";
import type { TakvimRandevusu } from "@/lib/scoped-db";
import { tarihMetni, yerelParcalar, type YerelTarih } from "@/lib/zaman";

// Gun gorunumu + takvimin PAYLASILAN sozlugu.
//
// Randevu satiri, durum rozeti ve zaman bicimleri burada duruyor cunku hafta
// ve ay gorunumleri de ayni yazimi kullaniyor. Ikinci bir kopya tutmak, bir
// gun birinde saat araligi "09:00-09:45", digerinde "09:00 – 09:45" yazmasi
// demekti. Bagimlilik yonu tek yonlu: hafta ve ay buradan aliyor, burasi
// onlardan hicbir sey almiyor.

/// Takvimin istemci tarafindaki randevu kaydi.
///
/// `TakvimRandevusu`DAN TURETILIYOR, elden yazilmiyor: veri katmanina bir alan
/// eklendiginde burasi da kendiliginden ogreniyor. Tek fark `baslangic` ve
/// `bitis`in ISO metin olmasi - sunucu bileseni `Date`i istemciye metin olarak
/// geciriyor (serilestirmede ve hydration'da en guvenlisi bu), saate cevirmeyi
/// istemci isletmenin dilimiyle kendisi yapiyor.
export type TakvimKaydi = Omit<TakvimRandevusu, "baslangic" | "bitis"> & {
  baslangic: string;
  bitis: string;
};

/// DEGISMEZ 10: ham renk yok, hepsi semantic token.
///
/// Sinif adlari TAM yaziliyor, parcalardan birlestirilmiyor: Tailwind kaynak
/// dosyalari metin olarak tariyor ve `bg-durum-${durum}-zemin` gibi bir ifadeyi
/// goremiyor - uretilmemis sinif, sessizce renksiz bir rozet demek.
export const DURUM_SINIFI: Record<RandevuDurumu, string> = {
  BEKLIYOR: "bg-durum-bekliyor-zemin text-durum-bekliyor",
  ONAYLI: "bg-durum-onayli-zemin text-durum-onayli",
  IPTAL: "bg-durum-iptal-zemin text-durum-iptal",
  TAMAMLANDI: "bg-durum-tamamlandi-zemin text-durum-tamamlandi",
  GELMEDI: "bg-durum-gelmedi-zemin text-durum-gelmedi",
};

/// ISO an -> isletmenin dilimindeki "09:00".
///
/// DEGISMEZ 7: donusum yalnizca zaman.ts uzerinden ve isletmenin `saatDilimi`
/// alaniyla. Panelin acildigi tarayici baska bir dilimde olabilir (sahibi
/// tatilde, telefonun dilimi elle degistirilmis); `getHours` kullanmak o
/// durumda randevuyu yanlis saatte gosterirdi.
export function saatiGoster(iso: string, saatDilimi: string): string {
  const p = yerelParcalar(new Date(iso), saatDilimi);
  return saatBicimle(p.saat * 60 + p.dakika);
}

/// "09:00 – 09:45".
export function saatAraligi(kayit: TakvimKaydi, saatDilimi: string): string {
  return `${saatiGoster(kayit.baslangic, saatDilimi)} – ${saatiGoster(kayit.bitis, saatDilimi)}`;
}

/// Randevunun isletme takvimindeki gunu.
export function kayitGunu(kayit: TakvimKaydi, saatDilimi: string): YerelTarih {
  const p = yerelParcalar(new Date(kayit.baslangic), saatDilimi);
  return { yil: p.yil, ay: p.ay, gun: p.gun };
}

/// Randevulari gune gore kumeliyor. Anahtar "2026-09-01".
///
/// Pencere sorgusu araligi KESISEN randevulari getiriyor, yani gece yarisini
/// asan bir randevu pencerenin ilk gununde gorunmeyebilir. Gruplama BASLANGIC
/// gunune gore: randevu, basladigi gunun altinda duruyor - isletme sahibi
/// gunu "kim ne zaman geliyor" diye okuyor, kaydin bittigi gune gore degil.
export function gunlereGore(
  kayitlar: TakvimKaydi[],
  saatDilimi: string,
): Map<string, TakvimKaydi[]> {
  const kume = new Map<string, TakvimKaydi[]>();
  for (const kayit of kayitlar) {
    const anahtar = tarihMetni(kayitGunu(kayit, saatDilimi));
    const mevcut = kume.get(anahtar);
    if (mevcut) mevcut.push(kayit);
    else kume.set(anahtar, [kayit]);
  }
  return kume;
}

/// Durum rozeti.
///
/// `Badge` bileseni KULLANILMIYOR: onun varyantlari zemini ve metni kendi
/// token'lariyla belirliyor ve ustune durum sinifi yazmak iki renk kuralini
/// birbirine karistiriyor. Rozet burada dogrudan durum token'larindan
/// besleniyor.
export function DurumRozeti({
  durum,
  className,
}: {
  durum: RandevuDurumu;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap ${DURUM_SINIFI[durum]} ${className ?? ""}`}
    >
      {DURUM_ETIKETLERI[durum]}
    </span>
  );
}

/// Ekran okuyucuya giden tek cumle.
///
/// Satirin icinde saat, ad, hizmet ve durum ayri ayri kutularda duruyor;
/// dugmeye `aria-label` vermeden okundugunda parcali ve sirasiz bir yigin
/// cikiyordu.
export function kayitEtiketi(kayit: TakvimKaydi, saatDilimi: string): string {
  return `${saatAraligi(kayit, saatDilimi)}, ${kayit.musteriAd}, ${kayit.hizmetAd}, ${kayit.personelAd}, ${DURUM_ETIKETLERI[kayit.durum]}. Ayrıntıları aç.`;
}

/// Listedeki tek randevu. Gun gorunumu ve haftanin MOBIL listesi ayni satiri
/// kullaniyor.
///
/// Gercek `<button>`: klavyeyle gezilebilir olmasi ve Enter/Space ile acilmasi
/// bedava geliyor. `div` + `onClick` yazsaydik ikisini de elle kurmak
/// gerekirdi ve biri er ya da gec unutulurdu.
export function RandevuSatiri({
  kayit,
  saatDilimi,
  onSec,
}: {
  kayit: TakvimKaydi;
  saatDilimi: string;
  onSec: (kayit: TakvimKaydi) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSec(kayit)}
      aria-label={kayitEtiketi(kayit, saatDilimi)}
      // min-h-saat = 44px dokunma hedefi (globals.css'teki token). Panelin
      // hedef kitlesi telefondan bakiyor; 44 pikselin altina inilmiyor.
      className="flex min-h-saat w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span
        aria-hidden="true"
        className={`h-8 w-1 shrink-0 rounded-full ${hizmetRenkSinifi(kayit.hizmetRenk)}`}
      />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {saatAraligi(kayit, saatDilimi)}
          </span>
          <span className="truncate text-sm">{kayit.musteriAd}</span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {kayit.hizmetAd} · {kayit.personelAd}
        </span>
      </span>

      <DurumRozeti durum={kayit.durum} />
    </button>
  );
}

/// Bos gun. Gun gorunumunde tek basina, haftanin mobil listesinde her gunun
/// altinda kullaniliyor.
export function BosGun({ kisa = false }: { kisa?: boolean }) {
  if (kisa) {
    return (
      <p className="px-3 py-2 text-sm text-muted-foreground">Randevu yok</p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <CalendarX2Icon className="size-8 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-medium">Bu gün randevu yok</p>
        <p className="text-sm text-muted-foreground">
          Müşterileriniz randevu sayfanızdan aldıkça buraya düşecek.
        </p>
      </div>
    </div>
  );
}

export function TakvimGun({
  randevular,
  saatDilimi,
  onSec,
}: {
  /// Pencere zaten tek gun; sunucu sorgusu bu gunle kesisenleri getiriyor ve
  /// sirali donuyor, burada yeniden siralamaya gerek yok.
  randevular: TakvimKaydi[];
  saatDilimi: string;
  onSec: (kayit: TakvimKaydi) => void;
}) {
  if (randevular.length === 0) return <BosGun />;

  return (
    <ul className="space-y-2">
      {randevular.map((kayit) => (
        <li key={kayit.id}>
          <RandevuSatiri kayit={kayit} saatDilimi={saatDilimi} onSec={onSec} />
        </li>
      ))}
    </ul>
  );
}
