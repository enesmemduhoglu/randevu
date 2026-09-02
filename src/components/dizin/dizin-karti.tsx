import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { paraBicimle } from "@/lib/bicim";
import type { DizinKarti as DizinKartiVerisi } from "@/lib/dizin";

// Dizindeki tek bir isletme karti. Sunucu bileseni - tiklanabilir olmasi disinda
// etkilesimi yok, yani istemciye JavaScript gitmiyor.
//
// Kartin GOSTERDIGI alanlar `DizinKarti` tipiyle sinirli ve o tip elle yazilmis
// (bkz. src/lib/dizin.ts basligi): semaya yarin eklenen bir kolon buraya
// kendiliginden dusmuyor.

export function DizinKarti({ kart }: { kart: DizinKartiVerisi }) {
  // Konum tek bir satirda: "Kadıköy, İstanbul". Ilcesi olmayan isletme yalnizca
  // il yaziyor - bos bir virgul birakmak ozensiz gorunur.
  const konum = [kart.ilce, kart.il].filter(Boolean).join(", ");

  return (
    <Link
      href={`/r/${kart.slug}`}
      className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="space-y-1">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          {kart.ad}
        </h2>
        {konum ? (
          <p className="text-sm text-muted-foreground">{konum}</p>
        ) : null}
      </div>

      {kart.hakkinda ? (
        // Uc satirda kesiliyor: kartlar izgarada yan yana duruyor ve biri uzun
        // metin yuzunden digerlerinin iki kati olursa liste okunmaz hale gelir.
        <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {kart.hakkinda}
        </p>
      ) : null}

      {/* Alt satir yukari degil ASAGI yapisiyor (mt-auto): farkli
          yuksekliklerdeki kartlarda ozet bilgisi ayni hizada kaliyor. */}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {kart.kategori ? (
          <Badge variant="secondary">{kart.kategori}</Badge>
        ) : null}
        <span className="text-sm text-muted-foreground">
          {/* Hizmeti olmayan isletme de listede kaliyor (dizin.ts kararı);
              o durumda "0 hizmet" yazmak yaniltici olurdu. */}
          {kart.hizmetSayisi > 0 ? `${kart.hizmetSayisi} hizmet` : "Hizmetler yakında"}
          {kart.enDusukFiyatKurus !== null
            ? ` · ${paraBicimle(kart.enDusukFiyatKurus)}'den başlıyor`
            : ""}
        </span>
      </div>
    </Link>
  );
}
