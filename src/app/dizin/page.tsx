import { SearchXIcon, StoreIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DizinFiltresi } from "@/components/dizin/dizin-filtresi";
import { DizinKarti } from "@/components/dizin/dizin-karti";
import { AltBilgi } from "@/components/genel/alt-bilgi";
import { UstBar } from "@/components/genel/ust-bar";
import {
  EN_COK_SAYFA,
  filtreSecenekleri,
  isletmeleriAra,
  SAYFA_BOYUTU,
} from "@/lib/dizin";

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

export const metadata: Metadata = {
  // Kok layout'un "%s · Randevu" sablonu marka adini kendisi ekliyor.
  title: "İşletme dizini",
  description:
    "İl ve kategoriye göre işletme bulun, uygun saati seçin, hesap açmadan randevu alın.",
};

/// Tek bir parametreyi metne indirger. Next arama parametresini dizi olarak da
/// verebiliyor (`?il=A&il=B`); ilkini almak, "geçersizse yok say" kuralinin
/// (bkz. dizin.ts) URL katmanindaki karsiligi.
function tekDeger(ham: string | string[] | undefined): string {
  if (Array.isArray(ham)) return ham[0] ?? "";
  return ham ?? "";
}

export default async function DizinSayfasi(props: PageProps<"/dizin">) {
  const arananlar = await props.searchParams;

  const arama = tekDeger(arananlar.arama).trim();
  const il = tekDeger(arananlar.il);
  const kategori = tekDeger(arananlar.kategori);
  const sayfa = Math.max(1, Number.parseInt(tekDeger(arananlar.sayfa), 10) || 1);

  const [{ kartlar, toplam }, secenekler] = await Promise.all([
    isletmeleriAra({ arama, il, kategori, sayfa }),
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
          secili={{ arama, il, kategori }}
          secenekler={secenekler}
        />

        {kartlar.length > 0 ? (
          <>
            {/* Sayim filtreliyken gosteriliyor: filtresiz listede "142 işletme"
                yazmak kullaniciya hiçbir şey söylemiyor, filtreliyken ise
                aramanın işe yarayıp yaramadığını söylüyor. */}
            {filtreliMi ? (
              <p className="pt-6 text-sm text-muted-foreground" role="status">
                {toplam} işletme bulundu
              </p>
            ) : null}

            <ul className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-3">
              {kartlar.map((kart) => (
                <li key={kart.slug}>
                  <DizinKarti kart={kart} />
                </li>
              ))}
            </ul>

            {sonSayfa > 1 ? (
              <nav
                className="flex items-center justify-between gap-4 pt-8"
                aria-label="Sayfalar"
              >
                {/* Numarali sayfa listesi yerine iki yon: 200 sayfaya kadar
                    cikabilen bir listede numaralari cizmek mobilde tasar ve
                    dizinde "17. sayfaya git" diyen bir kullanim yok. */}
                {sayfa > 1 ? (
                  <Link
                    href={sayfaYolu(sayfa - 1)}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                    rel="prev"
                  >
                    ← Önceki
                  </Link>
                ) : (
                  <span />
                )}

                <span className="text-sm text-muted-foreground">
                  Sayfa {sayfa} / {sonSayfa}
                </span>

                {sayfa < sonSayfa ? (
                  <Link
                    href={sayfaYolu(sayfa + 1)}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                    rel="next"
                  >
                    Sonraki →
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </>
        ) : (
          // Iki ayri bos durum: aramasi tutmayan kullaniciyla dizinin gercekten
          // bos oldugu gun ayni cumleyi gormemeli. Ilkinde yapacak bir sey var
          // (filtreyi temizle), ikincisinde yok - ve olmadigini soylemek,
          // kullaniciyi olmayan bir sonucu aramaya birakmaktan durust.
          <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
            {filtreliMi ? (
              <>
                <SearchXIcon
                  className="size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <p className="font-medium">Aramanıza uygun işletme yok</p>
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
        )}
      </main>

      <AltBilgi />
    </div>
  );
}
