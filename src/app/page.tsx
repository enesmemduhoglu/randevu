import { ArrowRightIcon, StoreIcon } from "lucide-react";
import Link from "next/link";

import { DizinKarti } from "@/components/dizin/dizin-karti";
import { AltBilgi } from "@/components/genel/alt-bilgi";
import { KahramanArama } from "@/components/genel/kahraman-arama";
import { KategoriKutucuklari } from "@/components/genel/kategori-kutucuklari";
import { UstBar } from "@/components/genel/ust-bar";
import { Button } from "@/components/ui/button";
import { filtreSecenekleri, isletmeleriAra } from "@/lib/dizin";
import { VITRIN_ILLERI, ilSlugu } from "@/lib/dizin-girdi";

// Ana sayfa MUSTERIYE konusuyor.
//
// Bu sayfa Faz N'de ters cevrildi. Oncesinde isletme sahibine konusuyordu
// ("Hizmetlerinizi tanimlayin, calisma saatlerinizi belirleyin") ve musteri
// yolu sayfanin dibinde tek satir gri metindi - yani Faz M dizini ekledi ama
// on kapiyi cevirmedi. Karar ve gerekcesi: TODOS.md > Urun kimligi.
// Isletmeye konusan icerik `/isletmeler-icin`e tasindi.
//
// Kiraci-ustu okuma: butun sorgular `@/lib/dizin` uzerinden gidiyor (DEGISMEZ
// 12). Burada ham `db` yok.
//
// `/dizin` ile ayni sebeple dinamik: bir dakikalik bayat liste, dizinden yeni
// cikmis bir isletmeyi ana sayfada gostermeye devam ederdi.
export const dynamic = "force-dynamic";

/// Sehir bolumunde kac kart. Alti, ucluk izgarada iki tam satir - yedincisi
/// yarim kalmis bir satir olurdu.
const VITRIN_KART_SAYISI = 6;

export default async function KokSayfa() {
  // Tek turda: filtre secenekleri + her vitrin ilinin ilk karti. Sirayla
  // beklenselerdi sayfa acilisi sorgu sayisi kadar gecikirdi.
  const [secenekler, sehirler] = await Promise.all([
    filtreSecenekleri(),
    Promise.all(
      VITRIN_ILLERI.map(async (il) => ({
        il,
        ...(await isletmeleriAra({ il, enCok: VITRIN_KART_SAYISI })),
      })),
    ),
  ]);

  const doluSehirler = sehirler.filter((sehir) => sehir.kartlar.length > 0);

  return (
    <div className="flex flex-1 flex-col">
      {/* Kendi arama kutusu asagida; ust barda ikincisi olmasin. */}
      <UstBar arama={false} />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-5 pt-10 pb-12 sm:pt-16">
          <div className="mx-auto max-w-2xl space-y-3 pb-8 text-center">
            <h1 className="font-heading text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Randevunuzu buradan alın
            </h1>
            <p className="text-base text-muted-foreground text-pretty">
              Kuaför, berber, güzellik salonu ve daha fazlası. Uygun saati
              görün, hesap açmadan randevu alın.
            </p>
          </div>

          <KahramanArama iller={secenekler.iller} />
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 pb-14">
          <h2 className="pb-4 font-heading text-xl font-semibold tracking-tight">
            Ne yaptırmak istiyorsunuz?
          </h2>
          <KategoriKutucuklari />
        </section>

        {doluSehirler.length > 0 ? (
          doluSehirler.map((sehir) => (
            <section key={sehir.il} className="mx-auto w-full max-w-6xl px-5 pb-14">
              <div className="flex flex-wrap items-baseline justify-between gap-3 pb-4">
                {/* Il adina EK GETIRILMIYOR ("Bursa'da" degil). Turkce'de ek
                    unlu uyumuna gore degisiyor - "Bursa'da" ama "İzmir'de" -
                    ve listeye yarin eklenen bir il sessizce yanlis yazilirdi.
                    Tire, eki gereksiz kiliyor. */}
                <h2 className="font-heading text-xl font-semibold tracking-tight">
                  {sehir.il} — öne çıkan işletmeler
                </h2>
                {/* Baglanti yalnizca gosterilenden FAZLASI varsa: "tumunu gor"
                    deyip ayni alti karti tekrar gostermek, kullaniciyi bos yere
                    bir tiklama ettirmek olurdu. */}
                {sehir.toplam > sehir.kartlar.length ? (
                  // Faz O: baglanti artik sorgu parametresine degil INIS
                  // SAYFASINA gidiyor. Ikisi ayni listeyi gosteriyor ama
                  // `/dizin?il=...` dizine girmiyor (canonical inis sayfasini
                  // gosteriyor); ana sayfadan cikan baglantinin dizine giren
                  // sayfaya isaret etmesi, ic baglanti degerinin dogru yere
                  // akmasi demek.
                  <Link
                    href={`/dizin/${ilSlugu(sehir.il)}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {sehir.toplam} işletmenin tümü
                    <ArrowRightIcon className="size-4" aria-hidden="true" />
                  </Link>
                ) : null}
              </div>

              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sehir.kartlar.map((kart) => (
                  <li key={kart.slug}>
                    <DizinKarti kart={kart} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        ) : (
          // DURUST BOS DURUM. Dizin bugun neredeyse bos ve bunu gizlemenin yolu
          // yok: sahte kart gostermek, tiklayinca hicbir yere gitmeyen bir
          // urun demek. Onun yerine ne oldugu soyleniyor ve iki gercek yol
          // birakiliyor - dizine bakmak, ya da isletme sahibiyse eklemek.
          <section className="mx-auto w-full max-w-6xl px-5 pb-14">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center">
              <StoreIcon
                className="size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="font-medium">Dizin henüz yeni</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  {VITRIN_ILLERI.join(" ve ")} için listelenen bir işletme yok.
                  Aradığınız işletmenin randevu sayfası varsa doğrudan
                  bağlantısından randevu alabilirsiniz.
                </p>
              </div>
              <Link
                href="/dizin"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Dizinin tamamına bakın
              </Link>
            </div>
          </section>
        )}

        {/* Isletmeye konusan tek bolum ve sayfanin SONUNDA: ana sayfanin
            kullanicisi musteri. Isletme sahibi buraya gelene kadar urunun ne
            yaptigini zaten gormus oluyor. */}
        <section className="border-t border-border bg-muted/40">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 className="font-heading text-lg font-semibold tracking-tight">
                İşletmenizi buraya ekleyin
              </h2>
              <p className="text-sm text-muted-foreground">
                Randevu sayfanızı dakikalar içinde kurun, dizinde görünün.
              </p>
            </div>
            <Button asChild variant="outline" className="h-11 px-5">
              <Link href="/isletmeler-icin">İşletmeler için</Link>
            </Button>
          </div>
        </section>
      </main>

      <AltBilgi />
    </div>
  );
}
