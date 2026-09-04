import { CalendarClockIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AltBilgi } from "@/components/genel/alt-bilgi";
import { UstBar } from "@/components/genel/ust-bar";
import { DurumRozeti } from "@/components/randevu/durum-rozeti";
import { HesapIptalDugmesi } from "@/components/randevu/hesap-iptal-dugmesi";
import { RandevuEkleFormu } from "@/components/randevu/randevu-ekle-formu";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { paraBicimle, saatBicimle, sureBicimle, tarihUzun } from "@/lib/bicim";
import { getMusteriDb, type MusteriRandevusu } from "@/lib/musteri-db";
import { yerelParcalar, type YerelParcalar } from "@/lib/zaman";

// Musterinin butun randevulari, tek listede (Faz J).
//
// Faz N'de burasi bir YER TUTUCUYDU: "randevu listesi bir musteri hesabi
// gerektiriyor ve o Faz J'nin isi" yaziyordu. Bu dosya o vaadi yerine
// getiriyor.
//
// KAPI `getMusteriDb`. Sorgunun filtresi `isletmeId` degil `kullaniciId` -
// musterinin randevulari tanimi geregi cok kiracili ve `scoped-db`nin tek
// kiraci sozlesmesi burada dogru soruyu soramiyor. Gerekcenin tamami
// `musteri-db.ts`in basinda; DEGISMEZ 1 delinmiyor, ikinci bir eksende
// tekrarlaniyor.
//
// Onbellege ALINMIYOR: randevunun durumu degisiyor (isletme onayliyor,
// musteri iptal ediyor) ve saklanmis bir kopya iptal edilmis bir randevuyu
// aktif gosterirdi. Ayrica sayfa oturuma OZEL - paylasilan bir onbellege
// dusmesi baskasinin randevularini gostermek olurdu.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Randevularım",
  description: "Aldığınız randevuları görün, gerekirse iptal edin.",
  // Oturuma ozel ve kisisel veri tasiyor: arama motorunda isi yok.
  robots: { index: false, follow: false },
};

/// "Su an" okumasi bilesenin DISINDA: React Compiler render govdesindeki
/// `Date.now()` cagrisini saf olmayan olarak isaretliyor ve hakli - ayni
/// render iki kez kosarsa iki farkli sonuc cikabilir. Sayfa `force-dynamic`,
/// yani karar istek basina bir kez veriliyor.
function simdiMs(): number {
  return Date.now();
}

function saatiYaz(p: YerelParcalar): string {
  return saatBicimle(p.saat * 60 + p.dakika);
}

/// Randevunun saati ISLETMENIN diliminde yaziliyor (DEGISMEZ 7). Listede
/// birden cok isletme yan yana durabiliyor ve her satir kendi isletmesinin
/// saatini gosteriyor: musteri o saatte o salonun kapisinda olacak, kendi
/// telefonunun dilimi bunu degistirmiyor.
function RandevuKarti({
  randevu,
  iptalEdilebilir,
}: {
  randevu: MusteriRandevusu;
  iptalEdilebilir: boolean;
}) {
  const baslangic = yerelParcalar(randevu.baslangic, randevu.isletmeSaatDilimi);
  const bitis = yerelParcalar(randevu.bitis, randevu.isletmeSaatDilimi);
  const ozet = `${tarihUzun(baslangic)}, ${saatiYaz(baslangic)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{randevu.hizmetAd}</CardTitle>
        <CardDescription>
          {/* Isletme adi BAGLANTI: musterinin bir sonraki adimi cogunlukla
              "ayni yerden bir randevu daha". */}
          <Link
            href={`/r/${randevu.isletmeSlug}`}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {randevu.isletmeAd}
          </Link>
        </CardDescription>
        <CardAction>
          <DurumRozeti durum={randevu.durum} />
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Tarih</dt>
          <dd className="font-medium">{tarihUzun(baslangic)}</dd>

          <dt className="text-muted-foreground">Saat</dt>
          <dd className="font-medium">
            {saatiYaz(baslangic)} – {saatiYaz(bitis)}
          </dd>

          <dt className="text-muted-foreground">Personel</dt>
          <dd className="font-medium">{randevu.personelAd}</dd>

          <dt className="text-muted-foreground">Hizmet</dt>
          <dd className="font-medium">
            {sureBicimle(randevu.hizmetSureDk)} ·{" "}
            {paraBicimle(randevu.hizmetFiyatKurus)}
          </dd>

          {randevu.not ? (
            <>
              <dt className="text-muted-foreground">Notunuz</dt>
              <dd className="font-medium">{randevu.not}</dd>
            </>
          ) : null}
        </dl>

        {iptalEdilebilir ? (
          <HesapIptalDugmesi randevuId={randevu.id} ozet={ozet} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function Bolum({
  baslik,
  children,
}: {
  baslik: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-lg font-semibold tracking-tight">
        {baslik}
      </h2>
      {children}
    </section>
  );
}

export default async function RandevularimSayfasi() {
  const oturum = await auth();

  // OTURUMSUZ HALI KORUNUYOR ve bu bilincli: ust bardaki "Randevularım"
  // baglantisi herkese gorunuyor ve tiklayanin cogu henuz uye degil. Onu
  // dogrudan /giris'e atmak, hesap acmadan da randevusuna ULASABILECEGINI -
  // elindeki baglantiyla - hic ogrenmemesi demekti.
  if (!oturum) {
    return (
      <div className="flex flex-1 flex-col">
        <UstBar />

        <main className="mx-auto w-full max-w-2xl flex-1 px-5 pt-12 pb-16">
          <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card px-6 py-12 text-center">
            <CalendarClockIcon
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />

            <div className="space-y-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">
                Randevularınız
              </h1>
              <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
                Randevularınızı tek listede görmek için üye olun. Üye
                olmadan aldığınız randevulara, size verilen bağlantıdan
                ulaşmaya devam edebilirsiniz.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="h-11 px-6">
                <Link href="/uye-ol">Üye ol</Link>
              </Button>
              <Button asChild variant="outline" className="h-11 px-6">
                <Link href="/giris">Giriş yap</Link>
              </Button>
            </div>
          </div>
        </main>

        <AltBilgi />
      </div>
    );
  }

  const db = await getMusteriDb(oturum.kullaniciId);
  const randevular = await db.randevulariListele();

  // Ayrim SQL'de degil BURADA yapiliyor: iki ayri sorgu, aralarindaki an
  // farki yuzunden tam o anda baslayan bir randevuyu iki listeye birden ya da
  // hicbirine koyabilirdi.
  //
  // Sinir BASLANGIC anina bakiyor, bitise degil: suren bir randevu artik
  // "yaklasan" degil - musteri zaten koltukta.
  const simdi = simdiMs();
  const yaklasan = randevular
    .filter((r) => r.baslangic.getTime() > simdi)
    // Liste yeniden eskiye geliyor (musteri-db.ts); yaklasanlar icin dogru
    // sira TERSI - en yakin randevu en ustte olmali.
    .reverse();
  const gecmis = randevular.filter((r) => r.baslangic.getTime() <= simdi);

  return (
    <div className="flex flex-1 flex-col">
      <UstBar />

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-5 pt-10 pb-16">
        <header className="space-y-1.5">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Randevularım
          </h1>
          <p className="text-sm text-muted-foreground">{oturum.ad}</p>
        </header>

        {randevular.length === 0 ? (
          // BOS DURUM DURUST KURULUYOR. Yeni uyenin listesi bos olacak ve
          // sebebi iki tane: ya henuz randevu almadi, ya da uye olmadan
          // aldigi randevular hesabina bagli degil. Ikisinin de cevabi burada
          // duruyor - yoksa kullanici randevusunun kaybolduğunu sanir.
          <div className="space-y-6 rounded-xl border border-border bg-card px-6 py-10 text-center">
            <div className="space-y-2">
              <CalendarClockIcon
                className="mx-auto size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <h2 className="font-heading text-lg font-semibold tracking-tight">
                Henüz randevunuz yok
              </h2>
              <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
                Üye olmadan önce aldığınız randevular listeye kendiliğinden
                gelmiyor. Elinizde randevu bağlantısı varsa aşağıya
                yapıştırarak ekleyebilirsiniz.
              </p>
            </div>

            <Button asChild className="h-11 px-6">
              <Link href="/dizin">İşletme dizinine bakın</Link>
            </Button>
          </div>
        ) : null}

        {yaklasan.length > 0 ? (
          <Bolum baslik="Yaklaşan">
            <div className="space-y-4">
              {yaklasan.map((randevu) => (
                <RandevuKarti
                  key={randevu.id}
                  randevu={randevu}
                  // Gecmis bir randevuda iptal dugmesi anlamsiz: iptal, saati
                  // yeniden satilabilir kilmak icin var. Bu bir ARAYUZ karari,
                  // kural degil - route gecmis bir randevuyu da iptal ediyor
                  // (ayni ayrim `/r/[slug]/randevu/[token]` sayfasinda da
                  // yazili).
                  iptalEdilebilir={
                    randevu.durum === "BEKLIYOR" || randevu.durum === "ONAYLI"
                  }
                />
              ))}
            </div>
          </Bolum>
        ) : null}

        {gecmis.length > 0 ? (
          <Bolum baslik="Geçmiş">
            <div className="space-y-4">
              {gecmis.map((randevu) => (
                <RandevuKarti
                  key={randevu.id}
                  randevu={randevu}
                  iptalEdilebilir={false}
                />
              ))}
            </div>
          </Bolum>
        ) : null}

        {/* Ekleme formu HER ZAMAN gorunuyor, yalnizca liste bosken degil:
            musteri uye olduktan sonra da elinde eski baglantilar olabilir ve
            onlari ekledigi anda formun kaybolmasi, ikincisini eklemesini
            imkansiz kilardi. */}
        <Bolum baslik="Elinizdeki randevuyu ekleyin">
          <div className="rounded-xl border border-border bg-card px-5 py-5">
            <RandevuEkleFormu />
          </div>
        </Bolum>
      </main>

      <AltBilgi />
    </div>
  );
}
