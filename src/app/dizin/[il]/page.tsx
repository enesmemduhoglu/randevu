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
  ilSlugu,
  kategoriSlugu,
  slugdanIl,
} from "@/lib/dizin-girdi";

// IL INIS SAYFASI (Faz O).
//
// NEDEN `/dizin?il=İstanbul` YETMIYOR: arama motoru sorgu parametreli adresleri
// ayni sayfanin varyantlari olarak gorur ve hicbirine tam deger vermez. Kendi
// adresi, kendi basligi ve kendi ic baglantilari olan bir sayfa ise "İstanbul
// kuaför" aramasinin inebilecegi bir yer. Urunun buyume yolu bu sayfalar
// (docs/plan.md > Kurucu ilkeler).
//
// Kiraci-ustu okuma yine yalnizca `@/lib/dizin` uzerinden (DEGISMEZ 12); bu
// dosyada ham `db` yok (DEGISMEZ 1).
//
// `force-dynamic`: `/dizin` ile ayni gerekce - dizinden yeni cikmis bir
// isletmeyi gostermeye devam eden bayat bir liste istemiyoruz. Sayfa sayisi
// 81 il ile sinirli, yani onbellekten kazanilacak sey de sinirli.
export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/dizin/[il]">,
): Promise<Metadata> {
  const { il: ilSlug } = await props.params;
  const il = slugdanIl(ilSlug);

  // Taninmayan slug 404 aliyor; metadata da onu bekliyor.
  if (!il) return { title: "Sayfa bulunamadı" };

  return {
    title: `${il} işletmeleri`,
    description: `${il} ilindeki kuaför, berber ve güzellik salonlarını görün. Uygun saati seçin, hesap açmadan randevu alın.`,
    alternates: { canonical: `/dizin/${ilSlugu(il)}` },
  };
}

export default async function IlSayfasi(props: PageProps<"/dizin/[il]">) {
  const { il: ilSlug } = await props.params;
  const arananlar = await props.searchParams;

  // TANIMAYAN SLUG 404. Dizin sorgusunda gecersiz bir il parametresi yok
  // sayiliyor (bkz. dizin.ts) cunku orada kullanicinin gordugu sey bir liste;
  // burada il ADRESIN KENDISI ve "var ama bos" demek, arama motoruna sonsuz
  // sayida anlamsiz URL acmak olurdu.
  const il = slugdanIl(ilSlug);
  if (!il) notFound();

  const sayfaHam = Array.isArray(arananlar.sayfa)
    ? arananlar.sayfa[0]
    : arananlar.sayfa;
  const sayfa = Math.max(1, Number.parseInt(sayfaHam ?? "", 10) || 1);

  const { kartlar, toplam } = await isletmeleriAra({ il, sayfa });

  const sonSayfa = Math.min(
    EN_COK_SAYFA,
    Math.max(1, Math.ceil(toplam / SAYFA_BOYUTU)),
  );

  const sayfaYolu = (hedef: number) =>
    hedef > 1 ? `/dizin/${ilSlugu(il)}?sayfa=${hedef}` : `/dizin/${ilSlugu(il)}`;

  return (
    <div className="flex flex-1 flex-col">
      <UstBar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-8 pb-16">
        {/* Kirilma yolu: hem kullaniciya nerede oldugunu soyluyor hem de
            dizinin kok sayfasina ic baglanti veriyor - inis sayfalarinin
            birbirine baglanmasi bu fazin isinin yarisi. */}
        <nav aria-label="Konum" className="pb-4 text-sm text-muted-foreground">
          <Link href="/dizin" className="underline-offset-4 hover:underline">
            İşletme dizini
          </Link>
          <span aria-hidden="true"> / </span>
          <span className="text-foreground">{il}</span>
        </nav>

        <div className="space-y-2 pb-6">
          {/* Ek IL ADINA GELMIYOR, "işletme" kelimesine geliyor: "İstanbul
              işletmeleri" 81 ilin hepsinde dogru. "İstanbul'daki" yazsaydik ek
              unlu uyumuna gore degisir ve listeye yarin eklenen bir il sessizce
              yanlis yazilirdi (ayni karar Faz N'de sehir basliklari icin). */}
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {il} işletmeleri
          </h1>
          <p className="text-base text-muted-foreground">
            {il} ilinde yayında olan işletmeler. Randevu almak için hesap
            açmanız gerekmiyor.
          </p>
        </div>

        {/* Kategori baglantilari SABIT listeden, dizin dolulugundan degil.
            Ayni karar Faz N'de ana sayfanin kutucuklari icin verildi: filtrede
            amac bulunan sonucu daraltmak, burada ise kapsami gostermek. Bos
            cikan bir kategori sayfasi kullaniciya "burada henuz yok" diyor -
            baglantinin hic gorunmemesinden durust. */}
        <nav aria-label="Kategoriler" className="flex flex-wrap gap-2 pb-2">
          {KATEGORILER.map((kategori) => (
            <Link
              key={kategori}
              href={`/dizin/${ilSlugu(il)}/${kategoriSlugu(kategori)}`}
              className="rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {kategori}
            </Link>
          ))}
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
                  {il} ilinde yayında işletme yok
                </p>
                <p className="text-sm text-muted-foreground">
                  Dizin şehir şehir doluyor. İşletmeniz buradaysa ilk siz
                  olabilirsiniz.
                </p>
              </div>
              <Link
                href="/kayit"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                İşletmenizi ekleyin
              </Link>
            </div>
          }
        />
      </main>

      <AltBilgi />
    </div>
  );
}
