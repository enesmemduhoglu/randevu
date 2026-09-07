import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MusteriDetayi } from "@/components/panel/musteri-detayi";
import type { TakvimKaydi } from "@/components/panel/takvim-gun";
import { isletmeOturumu } from "@/lib/auth";
import { getScopedDb } from "@/lib/scoped-db";

// Musteri detayi ve randevu gecmisi (Faz H2, ikinci yari).
//
// Veri sunucuda okunuyor, cizim istemcide. `Date` alanlari ISO metne
// cevriliyor: takvimle ayni desen - serilestirmede ve hydration'da en
// guvenlisi bu ve yerel saate cevirmeyi istemci isletmenin dilimiyle
// kendisi yapiyor (DEGISMEZ 7).

export const metadata: Metadata = {
  title: "Müşteri",
  // Panel oturum arkasinda ve robots.txt zaten /panel/ yolunu
  // engelliyor; meta etiketi ikinci kapi (bkz. /saglik ve /r/*/randevu/).
  robots: { index: false, follow: false },
};

export default async function MusteriSayfasi({
  params,
}: PageProps<"/panel/musteriler/[id]">) {
  const oturum = await isletmeOturumu();
  // Duzen bu durumu zaten eliyor; buradaki kontrol tipi daraltmak icin.
  if (!oturum) redirect("/giris");

  const { id } = await params;

  const db = await getScopedDb(oturum);
  const isletme = await db.isletmeyiGetir();
  if (!isletme) redirect("/");

  const musteri = await db.musteriGetir(id);
  // Baska isletmenin musteri id'si de, hic olmayan bir id de ayni 404'u
  // aliyor: kapi bos donduruyor ve burasi varligini sizdirmadan kapatiyor.
  if (!musteri) notFound();

  const gecmis = await db.musteriRandevulariniListele(id);

  const simdi = new Date();

  // Kisitin GECERLI olup olmadigina sunucu karar veriyor, istemci degil: ayni
  // soru randevu yazan yolda da soruluyor (scoped-db.ts > randevuYaz) ve iki
  // yer ayrisirsa ekran "kisitli" derken musteri randevu alabiliyor olurdu.
  const kisitli =
    isletme.gelmediKisitiGun > 0 &&
    musteri.randevuKisitiBitis !== null &&
    musteri.randevuKisitiBitis.getTime() > simdi.getTime();

  const kayitlar: TakvimKaydi[] = gecmis.map((r) => ({
    ...r,
    baslangic: r.baslangic.toISOString(),
    bitis: r.bitis.toISOString(),
  }));

  return (
    <div className="space-y-4">
      <Link
        href="/panel/musteriler"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeftIcon className="size-4" aria-hidden="true" />
        Müşteriler
      </Link>

      <MusteriDetayi
        musteri={{
          id: musteri.id,
          ad: musteri.ad,
          telefon: musteri.telefon,
          eposta: musteri.eposta,
          not: musteri.not,
          olusturmaTarihi: musteri.olusturmaTarihi.toISOString(),
          randevuKisitiBitis:
            musteri.randevuKisitiBitis?.toISOString() ?? null,
          kisitli,
        }}
        gecmis={kayitlar}
        saatDilimi={isletme.saatDilimi}
      />
    </div>
  );
}
