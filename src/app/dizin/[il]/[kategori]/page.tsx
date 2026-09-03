import { StoreIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DizinListesi } from "@/components/dizin/dizin-listesi";
import { AltBilgi } from "@/components/genel/alt-bilgi";
import { UstBar } from "@/components/genel/ust-bar";
import { EN_COK_SAYFA, isletmeleriAra, SAYFA_BOYUTU } from "@/lib/dizin";
import {
  KATEGORILER,
  KATEGORI_COGUL,
  ilSlugu,
  kategoriSlugu,
  slugdanIl,
  slugdanKategori,
} from "@/lib/dizin-girdi";

// IL + KATEGORI INIS SAYFASI (Faz O).
//
// Dizinin en degerli sayfasi: "istanbul kuaför" araması tam olarak buraya
// karsilik geliyor. `/dizin/[il]` ile ayni desen, iki farkla - baslik kategori
// cogulunu kullaniyor ve kardes kategoriler arasi gecis burada da duruyor.
//
// 81 il x 9 kategori = 729 sayfa. Hepsi dolu olmayacak ve bu bilincli: bos bir
// kategori sayfasi kullaniciya "burada henuz yok" diyor ve arama motoruna da
// ayni seyi soyluyor. Uydurma icerikle doldurmak, dizinin kendi degerini
// bitirirdi.
export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/dizin/[il]/[kategori]">,
): Promise<Metadata> {
  const { il: ilSlug, kategori: kategoriSlug } = await props.params;
  const il = slugdanIl(ilSlug);
  const kategori = slugdanKategori(kategoriSlug);

  if (!il || !kategori) return { title: "Sayfa bulunamadı" };

  return {
    title: `${il} ${KATEGORI_COGUL[kategori]}`,
    description: `${il} ilindeki ${KATEGORI_COGUL[kategori]}. Uygun saati görün, hesap açmadan randevu alın.`,
    alternates: {
      canonical: `/dizin/${ilSlugu(il)}/${kategoriSlugu(kategori)}`,
    },
  };
}

export default async function IlKategoriSayfasi(
  props: PageProps<"/dizin/[il]/[kategori]">,
) {
  const { il: ilSlug, kategori: kategoriSlug } = await props.params;
  const arananlar = await props.searchParams;

  // Iki parcadan biri bile taninmiyorsa 404 (gerekcesi `/dizin/[il]` icinde).
  const il = slugdanIl(ilSlug);
  const kategori = slugdanKategori(kategoriSlug);
  if (!il || !kategori) notFound();

  const sayfaHam = Array.isArray(arananlar.sayfa)
    ? arananlar.sayfa[0]
    : arananlar.sayfa;
  const sayfa = Math.max(1, Number.parseInt(sayfaHam ?? "", 10) || 1);

  const { kartlar, toplam } = await isletmeleriAra({ il, kategori, sayfa });

  const sonSayfa = Math.min(
    EN_COK_SAYFA,
    Math.max(1, Math.ceil(toplam / SAYFA_BOYUTU)),
  );

  const kok = `/dizin/${ilSlugu(il)}/${kategoriSlugu(kategori)}`;
  const sayfaYolu = (hedef: number) =>
    hedef > 1 ? `${kok}?sayfa=${hedef}` : kok;

  return (
    <div className="flex flex-1 flex-col">
      <UstBar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-8 pb-16">
        <nav aria-label="Konum" className="pb-4 text-sm text-muted-foreground">
          <Link href="/dizin" className="underline-offset-4 hover:underline">
            İşletme dizini
          </Link>
          <span aria-hidden="true"> / </span>
          <Link
            href={`/dizin/${ilSlugu(il)}`}
            className="underline-offset-4 hover:underline"
          >
            {il}
          </Link>
          <span aria-hidden="true"> / </span>
          <span className="text-foreground">{kategori}</span>
        </nav>

        <div className="space-y-2 pb-6">
          {/* Cogul ELLE yazilmis dokuz satirdan geliyor (KATEGORI_COGUL): ek
              unlu uyumuna gore degisiyor ve uretmeye calisan bir fonksiyon
              dokuz durumdan ucunu yanlis yazardi. Ek il adina degil kategori
              kelimesine geldigi icin 81 ilin hepsinde ayni satir calisiyor. */}
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {il} {KATEGORI_COGUL[kategori]}
          </h1>
          {/* Kategori adi CUMLE ICINDE gecmiyor. Kucuk harfe cevirmek
              `toLocaleLowerCase("tr")` isterdi ve workerd'in ICU derlemesi tam
              degil (bkz. docs/plan.md > workerd'in dayattigi uc kisit); ham
              haliyle birakmak da cumle ortasinda buyuk harf demekti. Kategori
              zaten baslikta ve rozetlerde duruyor. */}
          <p className="text-base text-muted-foreground">
            {il} ilinde yayında olan işletmeler. Randevu almak için hesap
            açmanız gerekmiyor.
          </p>
        </div>

        {/* Kardes kategoriler: kullanici yanlis kategoriye dustuyse tek
            tiklamayla gecebiliyor, ve inis sayfalari birbirine baglaniyor. */}
        <nav aria-label="Kategoriler" className="flex flex-wrap gap-2 pb-2">
          {KATEGORILER.map((k) => {
            const seciliMi = k === kategori;
            return (
              <Link
                key={k}
                href={`/dizin/${ilSlugu(il)}/${kategoriSlugu(k)}`}
                aria-current={seciliMi ? "page" : undefined}
                className={
                  seciliMi
                    ? "rounded-full border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                    : "rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                }
              >
                {k}
              </Link>
            );
          })}
        </nav>

        <DizinListesi
          kartlar={kartlar}
          toplam={toplam}
          sayfa={sayfa}
          sonSayfa={sonSayfa}
          sayfaYolu={sayfaYolu}
          sayimGoster
          bosDurum={
            <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
              <StoreIcon
                className="size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="font-medium">
                  Bu kategoride yayında işletme yok
                </p>
                <p className="text-sm text-muted-foreground">
                  {il} ilindeki diğer kategorilere bakabilirsiniz.
                </p>
              </div>
              <Link
                href={`/dizin/${ilSlugu(il)}`}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {il} işletmelerinin tümü
              </Link>
            </div>
          }
        />
      </main>

      <AltBilgi />
    </div>
  );
}
