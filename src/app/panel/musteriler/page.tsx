import { SearchIcon, UserRoundIcon, UsersRoundIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isletmeOturumu } from "@/lib/auth";
import { gunAyYil, telefonBicimle } from "@/lib/bicim";
import { getScopedDb } from "@/lib/scoped-db";
import { yerelParcalar } from "@/lib/zaman";

// Musteri listesi (Faz H2, ikinci yari).
//
// TAMAMEN SUNUCU BILESENI, istemci tarafi hic yok. Arama duz bir GET formu ve
// satirlar birer link - tutulacak bir durum yok. Istemci bileseni yapmak
// listeyi paket boyutuna yazardi ve fazin ilk yarisi zaten +135 KiB getirdi
// (bkz. TODOS.md > bundle butcesi). Ayrica arama JavaScript kapaliyken de
// calisiyor ve sonuc URL'e yaziliyor - isletme "borcu olanlar" gibi bir
// aramayi yer imine koyabiliyor.

export const metadata: Metadata = {
  title: "Müşteriler",
  // Panel oturum arkasinda ve robots.txt zaten /panel/ yolunu
  // engelliyor; meta etiketi ikinci kapi (bkz. /saglik ve /r/*/randevu/).
  robots: { index: false, follow: false },
};

export default async function MusterilerSayfasi({
  searchParams,
}: PageProps<"/panel/musteriler">) {
  const oturum = await isletmeOturumu();
  // Duzen bu durumu zaten eliyor; buradaki kontrol tipi daraltmak icin.
  if (!oturum) redirect("/giris");

  const db = await getScopedDb(oturum);
  const isletme = await db.isletmeyiGetir();
  if (!isletme) redirect("/");

  const parametreler = await searchParams;
  const arama = typeof parametreler.q === "string" ? parametreler.q : "";

  const { satirlar, dahaVar } = await db.musterileriListele({ arama });

  const simdi = new Date();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Müşteriler
        </h1>
        <p className="text-sm text-muted-foreground">
          Randevu alan herkes buraya kaydediliyor. Telefon numarası aynı olan
          randevular tek müşteride birleşiyor.
        </p>
      </div>

      {/* Duz GET formu: arama terimi URL'e yaziliyor, sunucu suzuyor. */}
      <form className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            name="q"
            defaultValue={arama}
            placeholder="Ad ya da telefon numarası"
            aria-label="Müşteri ara"
            className="h-10 pl-9"
          />
        </div>
        <Button type="submit" variant="outline" className="h-10 shrink-0">
          Ara
        </Button>
      </form>

      {satirlar.length === 0 ? (
        // Bos durumun IKI sebebi var ve ikisi ayni cumleyle anlatilamaz:
        // aramanin sonucu bos olabilir ya da isletmenin hic musterisi
        // olmayabilir. Ilkinde "henüz müşteri yok" demek, isletmeye kayitlarini
        // kaybettigini dusundururdu.
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <UsersRoundIcon
            className="size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="font-medium">
              {arama ? "Eşleşen müşteri yok" : "Henüz müşteri yok"}
            </p>
            <p className="text-sm text-muted-foreground">
              {arama
                ? "Aramayı değiştirip yeniden deneyin."
                : "İlk randevu alındığında müşteri kaydı kendiliğinden açılır."}
            </p>
          </div>
          {arama ? (
            <Button variant="outline" asChild>
              <Link href="/panel/musteriler">Aramayı temizle</Link>
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link href="/panel/randevu/yeni">Randevu ekle</Link>
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {satirlar.map((m) => {
            // Kisit GECERLI mi: tarihin gelecekte olmasi TEK BASINA yetmiyor,
            // isletme ayari 0'a cekildiyse kayitli tarih de yok sayiliyor -
            // randevu yazan yol da tam olarak boyle bakiyor (scoped-db.ts >
            // randevuYaz). Iki yer ayni soruyu ayni sekilde sormazsa liste
            // "kisitli" derken musteri randevu alabiliyor olurdu.
            const kisitli =
              isletme.gelmediKisitiGun > 0 &&
              m.randevuKisitiBitis !== null &&
              m.randevuKisitiBitis.getTime() > simdi.getTime();

            const sonRandevu = m.sonRandevu
              ? gunAyYil(yerelParcalar(m.sonRandevu, isletme.saatDilimi))
              : null;

            return (
              <li key={m.id}>
                <Link
                  href={`/panel/musteriler/${m.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-accent"
                >
                  <UserRoundIcon
                    className="size-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.ad}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {telefonBicimle(m.telefon)}
                      {" · "}
                      {m.randevuSayisi} randevu
                      {sonRandevu ? ` · Son: ${sonRandevu}` : ""}
                    </p>
                  </div>

                  {kisitli ? (
                    <Badge className="shrink-0 bg-durum-gelmedi-zemin text-durum-gelmedi">
                      Kısıtlı
                    </Badge>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {dahaVar ? (
        // Liste kesildiginde SUSMAK, isletmeye eksik bir listeyi tam diye
        // gostermek olurdu.
        <p className="text-sm text-muted-foreground">
          İlk {satirlar.length} müşteri gösteriliyor. Aradığınız kişiyi bulmak
          için ad ya da telefon numarasıyla arayın.
        </p>
      ) : null}
    </div>
  );
}
