"use client";

import Link from "next/link";

import { CikisDugmesi } from "@/components/panel/cikis-dugmesi";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { basHarf, ROL_ETIKETLERI } from "@/lib/rol";
import type { Rol } from "@/lib/scoped-db";

// Halka acik ust bardaki hesap menusu (Faz J).
//
// PANELDEKI `HesapMenusu`NUN KOPYASI DEGIL, KARDESI. Icerik yapisi ayni ve
// cikis dugmesi BIREBIR ayni bilesen - `CikisDugmesi` oradan import ediliyor,
// cunku cikisin yaptigi is (cookie sil, yonlendir, router.refresh) iki barda
// da ayni ve ikinci bir kopya bir gun `refresh` cagrisini kaybederdi.
//
// Ayri bilesen olmasinin sebebi TETIKLEYICI. Panelinki genis bir kenar
// cubugu dugmesi: tam genislik, iki satir, chevron. Ust bar ise dar ve
// yatay - orada ayni tetikleyici mobilde tek basina bari ikinci satira
// dusururdu. Tek bilesende toplansaydi icinde "hangi bardayim" diye ayrilan
// bir bayrak olurdu ve o bayrak, iki ayri duzeni tek govdede tutmanin
// baslangici.
//
// Istemci bileseni cunku Popover acilma durumunu tutuyor. Oturumun KENDISI
// burada okunmuyor - sunucu okuyup hazir alanlari veriyor, yani sorgu istemci
// paketine hic inmiyor (DEGISMEZ 1).

type Ozellikler = {
  ad: string;
  eposta: string;
  rol: Rol;
  /// Menudeki birincil baglanti. Sunucu karar veriyor: musteri
  /// `/randevularim`a, isletme `/panel`e gidiyor.
  birincil: { metin: string; yol: string };
  /// Isletme rolundeki kisi de bir musteri olabilir (bkz. musteri-db.ts'te rol
  /// kontrolu olmamasinin gerekcesi), o yuzden onun menusunde randevu listesi
  /// IKINCI baglanti olarak duruyor. Musteride ikinci baglanti yok.
  ikincil?: { metin: string; yol: string };
};

const MENU_BAGLANTISI =
  "flex min-h-10 items-center rounded-md px-2 text-sm font-medium transition-colors hover:bg-muted";

export function UstBarHesabi({ ad, eposta, rol, birincil, ikincil }: Ozellikler) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* Tetikleyicide AD YOK, yalnizca bas harf. Ad uzun olabiliyor
            ("Ayşe Yılmaz Güzellik") ve dar ekranda bari tasirdi; kim oldugu
            zaten menu acilinca ilk satirda yaziyor. */}
        <Button
          variant="ghost"
          className="size-9 shrink-0 rounded-full p-0"
          aria-label={`${ad} — hesap menüsü`}
        >
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium"
          >
            {basHarf(ad)}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-60">
        <PopoverHeader>
          <PopoverTitle className="truncate">{ad}</PopoverTitle>
          <PopoverDescription className="break-all">{eposta}</PopoverDescription>
        </PopoverHeader>

        <Separator />

        <div className="space-y-0.5 py-1">
          <p className="px-2 pb-1 text-xs text-muted-foreground">
            {ROL_ETIKETLERI[rol]}
          </p>

          <Link href={birincil.yol} className={MENU_BAGLANTISI}>
            {birincil.metin}
          </Link>

          {ikincil ? (
            <Link href={ikincil.yol} className={MENU_BAGLANTISI}>
              {ikincil.metin}
            </Link>
          ) : null}
        </div>

        <Separator />

        <CikisDugmesi />
      </PopoverContent>
    </Popover>
  );
}
