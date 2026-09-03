import { CalendarOffIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RandevuAkisi } from "@/components/randevu/randevu-akisi";
import { TemaDugmesi } from "@/components/tema-dugmesi";
import { telefonBicimle } from "@/lib/bicim";
import { MARKA_ADI } from "@/lib/marka";
import { getHalkaAcikDb } from "@/lib/scoped-db";
import { yerelGun } from "@/lib/zaman";

// Musterinin gordugu randevu sayfasi.
//
// OTURUMSUZ ve halka acik: musteri randevu almak icin hesap acmiyor. Kiraci
// oturumdan degil slug'dan cozuluyor ve butun okumalar `getHalkaAcikDb`
// uzerinden gidiyor - bu dosyada ham `db` yok (DEGISMEZ 1, eslint kurali
// zorluyor).
//
// ONBELLEKSIZ. Sayfa musaitlik yazma kararini besliyor: bayat bir hizmet
// listesi ya da kaldirilmis bir personel, musteriyi hicbir zaman alinamayacak
// bir slota goturur. /api/musaitlik de ayni sebeple `no-store`.
export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/r/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const db = await getHalkaAcikDb(slug);

  // Baslik isletmenin adi: bu baglanti WhatsApp'ta ve Instagram biyografisinde
  // paylasiliyor, her isletme icin "Randevu" yazan bir sekme faydasiz.
  if (!db) return { title: "Randevu sayfası bulunamadı" };

  return {
    // MUTLAK baslik: kok layout'un "%s · Randevu" sablonu buraya UYGULANMIYOR.
    // Bu baglanti isletmenin kendi sayfasi ve WhatsApp'ta paylasiliyor; sonuna
    // bizim marka adimizi eklemek hem gereksiz uzun hem de isletmenin sayfasini
    // bizim sayfamiz gibi gosterirdi.
    title: { absolute: `${db.isletme.ad} — Randevu al` },
    description: `${db.isletme.ad} için uygun saatleri görün, hesap açmadan randevu alın.`,
  };
}

export default async function RandevuSayfasi(props: PageProps<"/r/[slug]">) {
  const { slug } = await props.params;

  const db = await getHalkaAcikDb(slug);
  // Kapali ya da hic olmayan isletme AYNI cevabi aliyor: hangi slug'larin
  // kayitli oldugunu sizdirmanin faydasi yok (/api/musaitlik ile ayni karar).
  if (!db) notFound();

  const isletme = db.isletme;

  const [hizmetler, personeller] = await Promise.all([
    db.hizmetleriListele(),
    db.personelleriListele(),
  ]);

  // Hangi hizmeti kimin verdigi. "Esleme yoksa hepsi" kurali scoped-db'de
  // cozuluyor; arayuz o kurali bilmiyor ve burada tekrarlanmiyor.
  //
  // Hizmet basina bir cagri: bu bir N+1 ve tek bir `hizmetPersonelEslemeleri()`
  // metoduyla tek sorguya inebilir - ama o metot scoped-db.ts'te yok ve bu faz
  // o dosyaya dokunmuyor. Kucuk isletmede hizmet sayisi tek haneli, cagrilar da
  // paralel.
  const hizmetiVerenler = await Promise.all(
    hizmetler.map((h) => db.hizmetiVerenPersoneller(h.id)),
  );

  const hizmetOzetleri = hizmetler
    .map((hizmet, i) => ({
      id: hizmet.id,
      ad: hizmet.ad,
      aciklama: hizmet.aciklama,
      sureDk: hizmet.sureDk,
      fiyatKurus: hizmet.fiyatKurus,
      personelIdler: (hizmetiVerenler[i] ?? []).map((p) => p.id),
    }))
    // Kimsenin vermedigi hizmet LISTEDEN CIKIYOR. Gostermek, secildiginde hep
    // bos bir saat listesi uretir ve musteri sebebini isletmede arar.
    .filter((hizmet) => hizmet.personelIdler.length > 0);

  // "Bugun" isletmenin takviminde. Tarayicinin dilimine guvenilmiyor
  // (DEGISMEZ 7): musteri baska bir dilimdeyse kendi bugununu gorur ve
  // isletmenin dununu secmeye calisirdi.
  const bugun = yerelGun(new Date(), isletme.saatDilimi);

  const telefon = telefonBicimle(isletme.telefon);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-end px-5 py-3">
        <TemaDugmesi />
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-5 pb-16">
        <div className="space-y-2 pb-8">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {isletme.ad}
          </h1>

          {isletme.hakkinda ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {isletme.hakkinda}
            </p>
          ) : null}

          {isletme.adres || telefon ? (
            <p className="text-sm text-muted-foreground">
              {isletme.adres}
              {isletme.adres && telefon ? " · " : ""}
              {telefon ? (
                // Mobilde dokununca ariyor: musterinin en cok istedigi ikinci
                // sey randevu almak degil, isletmeyi aramak.
                <a
                  href={`tel:${aramaNumarasi(isletme.telefon)}`}
                  className="underline-offset-4 hover:underline"
                >
                  {telefon}
                </a>
              ) : null}
            </p>
          ) : null}
        </div>

        {hizmetOzetleri.length === 0 || personeller.length === 0 ? (
          // Bos durum: neyin olmadigi + tek yol. Suclama ve espri yok.
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
            <CalendarOffIcon
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="font-medium">Şu anda internetten randevu alınamıyor</p>
              <p className="text-sm text-muted-foreground">
                {telefon
                  ? "Randevu için işletmeyi arayabilirsiniz."
                  : "İşletme randevu sayfasını henüz hazırlamamış."}
              </p>
            </div>
          </div>
        ) : (
          <RandevuAkisi
            isletme={{
              slug: isletme.slug,
              ad: isletme.ad,
              saatDilimi: isletme.saatDilimi,
              maksIleriGun: isletme.maksIleriGun,
            }}
            hizmetler={hizmetOzetleri}
            personeller={personeller.map((p) => ({
              id: p.id,
              ad: p.ad,
              unvan: p.unvan,
            }))}
            bugun={bugun}
          />
        )}
      </main>

      <footer className="px-5 py-8">
        <p className="text-center text-xs text-muted-foreground">
          <Link
            href="/"
            className="font-medium underline-offset-4 hover:underline"
          >
            {MARKA_ADI}
          </Link>{" "}
          ile hazırlandı
        </p>
      </footer>
    </div>
  );
}

/// Veritabanindaki numara 10 hane ve bastaki 0 kirpilmis (bkz. bicim.ts).
/// `tel:` baglantisi uluslararasi bicimi istiyor; tanimadigimiz bir bicim
/// oldugu gibi geciyor - bozup aranamaz hale getirmektense ham birakmak daha
/// durust.
function aramaNumarasi(rakamlar: string | null): string {
  if (!rakamlar) return "";
  return /^\d{10}$/.test(rakamlar) ? `+90${rakamlar}` : rakamlar;
}
