import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Dizin filtresi. DUZ BIR GET FORMU, istemci bileseni degil.
//
// Neden: bu sayfa urunu hic tanimayan bir musteriye acilan ilk ekran ve tek isi
// bir isletme bulmak. JavaScript'e baglamak, yavas bagalantida bos bir sayfa
// ve calismayan bir arama kutusu demek. GET formu tarayicinin kendi isi:
// gonderilen alanlar URL'e giriyor, sonuc paylasilabilir ve geri tusu calisiyor.
//
// Sayfa numarasi forma KOYULMUYOR: yeni bir filtreyle 7. sayfada kalmak,
// kullanicinin bos sonuc gormesi demek olurdu. Alan olmadigi icin gonderimde
// kendiliginden dusuyor.

const SECIM_SINIFI =
  "h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function DizinFiltresi({
  secili,
  secenekler,
}: {
  secili: { arama: string; il: string; kategori: string };
  secenekler: { iller: string[]; kategoriler: string[] };
}) {
  const filtreliMi = Boolean(secili.arama || secili.il || secili.kategori);

  return (
    <form
      method="get"
      action="/dizin"
      className="space-y-4 rounded-xl border border-border bg-card p-5"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          {/* Etiket her zaman gorunur (docs/tasarim-sistemi.md): yer tutucu
              etiketin yerini almaz. */}
          {/* Etiket ve yer tutucu Faz P'de genisledi: sorgu artik isletme adi
              ve slug'in yanina kategoriyi ve hizmet adini da aliyor. Eski
              "İşletme adı" etiketi ana sayfanin "Ne arıyorsunuz?" vaadiyle
              celisiyordu. */}
          <Label htmlFor="arama">Ne arıyorsunuz?</Label>
          <Input
            id="arama"
            name="arama"
            defaultValue={secili.arama}
            placeholder="Örneğin: saç kesimi"
            className="h-10"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="il">İl</Label>
          <select
            id="il"
            name="il"
            defaultValue={secili.il}
            className={SECIM_SINIFI}
          >
            {/* Yalnizca DOLU iller listeleniyor (dizin.ts > filtreSecenekleri):
                81 ilin 78'i bos bir dizinde kullanici tek tek deneyip bos sonuc
                gorurdu. */}
            <option value="">Tüm iller</option>
            {secenekler.iller.map((il) => (
              <option key={il} value={il}>
                {il}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="kategori">Kategori</Label>
          <select
            id="kategori"
            name="kategori"
            defaultValue={secili.kategori}
            className={SECIM_SINIFI}
          >
            <option value="">Tüm kategoriler</option>
            {secenekler.kategoriler.map((kategori) => (
              <option key={kategori} value={kategori}>
                {kategori}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-10">
          Ara
        </Button>
        {filtreliMi ? (
          <Link
            href="/dizin"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Filtreleri temizle
          </Link>
        ) : null}
      </div>
    </form>
  );
}
