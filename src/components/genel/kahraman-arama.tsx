import { SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// Ana sayfanin arama kutusu. Sayfanin TEK isi bu: siteye giren kisi randevu
// almaya gelmistir (bkz. TODOS.md > Urun kimligi).
//
// Duz GET formu, istemci bileseni degil - `/dizin` filtresiyle ayni gerekce:
// JavaScript yuklenmeden calisiyor, sonuc URL'e giriyor ve geri tusu bozulmuyor.
//
// ONERI LISTESI (yazdikca acilan tamamlama) BILEREK YOK. Her tusa basista
// sunucuya sorgu atan bir kutu, hem bu sayfayi istemci bilesenine cevirirdi hem
// de bugun ucu bulmayan bir dizinde onerecek bir sey yok. Dizin dolunca deger
// kazanir; o zaman ayri bir is.

export function KahramanArama({ iller }: { iller: string[] }) {
  return (
    <form
      method="get"
      action="/dizin"
      role="search"
      className="mx-auto w-full max-w-2xl rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"
    >
      {/* Uc alan tek satirda ve TABANDAN hizali (`items-end`): etiketler farkli
          yuksekliklerde oldugu icin ust hizada dizilseydi dugme kutulardan
          yukarida kalirdi. Mobilde alt alta yigiliyor. */}
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <div className="space-y-2">
          {/* Etiket her zaman gorunur (docs/tasarim-sistemi.md). */}
          <Label htmlFor="kahraman-arama">Ne arıyorsunuz?</Label>
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            {/* Yer tutucu ARAMANIN GERCEKTEN YAPABILDIGINI soyluyor. Onceden
                "İşletme adı" yaziyordu ve etiket "Ne arıyorsunuz?" diyordu -
                ikisi ayni kutu icin iki ayri vaat. Faz P'de sorgu kategori ve
                hizmet adina da bakar hale geldi, yer tutucu da onu anlatiyor. */}
            <input
              id="kahraman-arama"
              type="search"
              name="arama"
              placeholder="Saç kesimi, kuaför, işletme adı…"
              className="h-11 w-full rounded-lg border border-input bg-transparent pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm dark:bg-input/30"
            />
          </div>
        </div>

        {/* Il secimi aramanin YANINDA, altinda degil: iki alan tek bir soruyu
            olusturuyor ("nerede, ne"). Yalnizca DOLU iller listeleniyor
            (dizin.ts > filtreSecenekleri) - bos bir il secip bos sonuc gormek
            kullaniciya dizinin calismadigini dusundururdu. */}
        <div className="space-y-2">
          <Label htmlFor="kahraman-il">İl</Label>
          <select
            id="kahraman-il"
            name="il"
            className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm dark:bg-input/30"
          >
            <option value="">Tüm iller</option>
            {iller.map((il) => (
              <option key={il} value={il}>
                {il}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" className="h-11 w-full sm:px-8">
          Ara
        </Button>
      </div>
    </form>
  );
}
