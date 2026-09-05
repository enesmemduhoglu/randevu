import { SearchXIcon, StoreIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DizinFiltresi } from "@/components/dizin/dizin-filtresi";
import { DizinListesi } from "@/components/dizin/dizin-listesi";
import { AltBilgi } from "@/components/genel/alt-bilgi";
import { UstBar } from "@/components/genel/ust-bar";
import {
  EN_COK_SAYFA,
  filtreSecenekleri,
  isletmeleriAra,
  SAYFA_BOYUTU,
} from "@/lib/dizin";
import { etkinFiltreler } from "@/lib/dizin-secenek";
import {
  ILLER,
  KATEGORILER,
  ilSlugu,
  kategoriSlugu,
  type Il,
  type Kategori,
} from "@/lib/dizin-girdi";

// Halka acik pazaryeri dizini.
//
// OTURUMSUZ: musteri bir isletme bulmak icin hesap acmiyor. Bu sayfa deponun
// TEK kiraci-ustu okumasi ve butun sorgular `@/lib/dizin` uzerinden gidiyor -
// o dosyanin basligi neden guvenli oldugunu anlatiyor ve `degismezler.test.ts`
// seklini zorluyor. Burada ham `db` yok (DEGISMEZ 1).
//
// `/r/[slug]`in aksine ONBELLEKSIZ OLMASI SART DEGIL: dizin bir yazma kararini
// beslemiyor, yalnizca bir liste. Yine de dinamik kaliyor cunku sorgu
// parametreleri her istekte degisiyor ve bir dakikalik bayat liste, dizinden
// yeni cikmis bir isletmeyi gostermeye devam ederdi.
export const dynamic = "force-dynamic";

/// Tek bir parametreyi metne indirger. Next arama parametresini dizi olarak da
/// verebiliyor (`?il=A&il=B`); ilkini almak, "geçersizse yok say" kuralinin
/// (bkz. dizin.ts) URL katmanindaki karsiligi.
function tekDeger(ham: string | string[] | undefined): string {
  if (Array.isArray(ham)) return ham[0] ?? "";
  return ham ?? "";
}

/// Kapali listeye karsi dogrulanmis filtreler. `dizin.ts` ayni kontrolu sorgu
/// icin yapiyor; burada AYRICA gerekiyor cunku canonical adresini uretmek
/// gecerli bir il/kategori degeri istiyor.
function filtreleriCoz(arananlar: Record<string, string | string[] | undefined>) {
  const ilHam = tekDeger(arananlar.il);
  const kategoriHam = tekDeger(arananlar.kategori);

  return {
    arama: tekDeger(arananlar.arama).trim(),
    il: (ILLER as readonly string[]).includes(ilHam) ? (ilHam as Il) : null,
    kategori: (KATEGORILER as readonly string[]).includes(kategoriHam)
      ? (kategoriHam as Kategori)
      : null,
    sayfa: Math.max(1, Number.parseInt(tekDeger(arananlar.sayfa), 10) || 1),
  };
}

// FACETED NAVIGATION KAPISI (Faz O).
//
// `/dizin` filtre parametreleriyle sinirsiz sayida URL uretebiliyor
// (`?il=...&kategori=...&arama=...&sayfa=...`) ve hepsi ayni kartlari farkli
// siralarda gosteriyor. Bu, pazaryeri SEO'sunun bir numarali olum sebebi:
// arama motoru ayni icerigi yuzlerce adreste gorur, tarama butcesini orada
// harcar ve hicbirini guclu bulmaz.
//
// IKI ARAC VAR ve HER URL'E YALNIZCA BIRI KONUYOR:
//
//   - Filtre gercek bir INIS SAYFASINA karsilik geliyorsa (il, ya da
//     il+kategori, arama yok, ilk sayfa) -> `canonical` o sayfayi gosteriyor.
//     Sinyal "bu icerigin asli surada" demek ve biriken deger oraya gidiyor.
//   - Karsiligi olmayan her sey (arama metni, ikinci ve sonraki sayfalar,
//     ilsiz kategori) -> `noindex, follow`. Dizine girmiyor ama baglantilar
//     izleniyor, yani isletme sayfalari yine bulunuyor.
//
// IKISI BIRDEN KONMUYOR. `noindex` ile baska bir adresi gosteren `canonical`
// celiskili sinyal: motorlar `noindex`i canonical hedefine tasiyabiliyor, yani
// asil sayfayi da dizinden dusurme riski var.
export async function generateMetadata(
  props: PageProps<"/dizin">,
): Promise<Metadata> {
  const { arama, il, kategori, sayfa } = filtreleriCoz(await props.searchParams);

  const temel = {
    // Kok layout'un "%s · Randevu" sablonu marka adini kendisi ekliyor.
    title: "İşletme dizini",
    description:
      "İl ve kategoriye göre işletme bulun, uygun saati seçin, hesap açmadan randevu alın.",
  };

  // Filtresiz dizin kendi kendisinin aslidir.
  if (!arama && !il && !kategori && sayfa === 1) {
    return { ...temel, alternates: { canonical: "/dizin" } };
  }

  // Inis sayfasi karsiligi olan filtreler.
  if (!arama && il && sayfa === 1) {
    const hedef = kategori
      ? `/dizin/${ilSlugu(il)}/${kategoriSlugu(kategori)}`
      : `/dizin/${ilSlugu(il)}`;
    return { ...temel, alternates: { canonical: hedef } };
  }

  return { ...temel, robots: { index: false, follow: true } };
}

export default async function DizinSayfasi(props: PageProps<"/dizin">) {
  const arananlar = await props.searchParams;
  const { arama, il, kategori, sayfa } = filtreleriCoz(arananlar);

  const [{ kartlar, toplam }, secenekler] = await Promise.all([
    isletmeleriAra({
      arama,
      il: il ?? undefined,
      kategori: kategori ?? undefined,
      sayfa,
    }),
    filtreSecenekleri(),
  ]);

  // Ust sinir sorgu katmaninin kendi siniri (derin OFFSET pahali, ve dizinde
  // 200 sayfa gezmenin mesru bir kullanimi yok). Arayuz de ayni yerde durmali:
  // aksi halde "Sonraki" sessizce ayni sayfayi getirirdi.
  const sonSayfa = Math.min(
    EN_COK_SAYFA,
    Math.max(1, Math.ceil(toplam / SAYFA_BOYUTU)),
  );
  const filtreliMi = Boolean(arama || il || kategori);
  const etkin = etkinFiltreler({ arama, kategori, il });

  // Sayfa baglantilari mevcut filtreyi TASIYOR: 2. sayfaya gecince aramanin
  // sifirlanmasi, kullanicinin listeyi bastan taramasi demek olurdu.
  const sayfaYolu = (hedef: number) => {
    const parametreler = new URLSearchParams();
    if (arama) parametreler.set("arama", arama);
    if (il) parametreler.set("il", il);
    if (kategori) parametreler.set("kategori", kategori);
    if (hedef > 1) parametreler.set("sayfa", String(hedef));
    const sorgu = parametreler.toString();
    return sorgu ? `/dizin?${sorgu}` : "/dizin";
  };

  return (
    <div className="flex flex-1 flex-col">
      {/* Sayfanin kendi filtresinde arama alani var; ust bardaki ikinci kutu
          hangisinin ne aradigi sorusunu doguruyordu. */}
      <UstBar arama={false} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-8 pb-16">
        <div className="space-y-2 pb-8">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            İşletme dizini
          </h1>
          <p className="text-base text-muted-foreground">
            İl ve kategoriye göre arayın, uygun saati seçin. Randevu almak için
            hesap açmanız gerekmiyor.
          </p>
        </div>

        <DizinFiltresi
          secili={{ arama, il: il ?? "", kategori: kategori ?? "" }}
          secenekler={secenekler}
        />

        <DizinListesi
          kartlar={kartlar}
          toplam={toplam}
          sayfa={sayfa}
          sonSayfa={sonSayfa}
          sayfaYolu={sayfaYolu}
          sayimGoster={filtreliMi}
          bosDurum={
            // Iki ayri bos durum: aramasi tutmayan kullaniciyla dizinin
            // gercekten bos oldugu gun ayni cumleyi gormemeli. Ilkinde yapacak
            // bir sey var (filtreyi temizle), ikincisinde yok - ve olmadigini
            // soylemek, kullaniciyi olmayan bir sonucu aramaya birakmaktan
            // durust.
            <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
              {filtreliMi ? (
                <>
                  <SearchXIcon
                    className="size-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="space-y-1">
                    <p className="font-medium">Aramanıza uygun işletme yok</p>
                    {/* NEYIN suzuldugu YAZILIYOR. Onceden yalnizca "filtreleri
                        gevsetin" deniyordu ve bos bir kategoriye dusen
                        kullanici icin bu bir cikmazdi: secili kategori filtre
                        kutusunda gorunmuyordu (o liste yalnizca dolu
                        kategorilerden geliyor), yani gevsetilecek gorunur bir
                        sey yoktu. Kutu tarafi `secenekleriBirlestir` ile
                        cozuldu; bu satir ayni seyi bos durumda soyluyor. */}
                    {etkin ? (
                      <p className="text-sm font-medium">{etkin}</p>
                    ) : null}
                    <p className="text-sm text-muted-foreground">
                      Filtreleri gevşetip yeniden deneyebilirsiniz.
                    </p>
                  </div>
                  <Link
                    href="/dizin"
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Filtreleri temizle
                  </Link>
                </>
              ) : (
                <>
                  <StoreIcon
                    className="size-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="space-y-1">
                    <p className="font-medium">Dizin henüz boş</p>
                    <p className="text-sm text-muted-foreground">
                      Burada listelenen bir işletme yok. İşletmeniz varsa dizine
                      ekleyebilirsiniz.
                    </p>
                  </div>
                  <Link
                    href="/kayit"
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    İşletmenizi ekleyin
                  </Link>
                </>
              )}
            </div>
          }
        />
      </main>

      <AltBilgi />
    </div>
  );
}
