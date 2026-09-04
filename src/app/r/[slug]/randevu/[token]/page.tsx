import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { DurumRozeti } from "@/components/randevu/durum-rozeti";
import { IptalKarti } from "@/components/randevu/iptal-karti";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  paraBicimle,
  saatBicimle,
  sureBicimle,
  tarihUzun,
  telefonBicimle,
} from "@/lib/bicim";
import { iptalTokenGecerliMi } from "@/lib/iptal-token";
import { getHalkaAcikDb } from "@/lib/scoped-db";
import { yerelParcalar, type YerelParcalar } from "@/lib/zaman";

// Musterinin randevusunu gordugu ve iptal edebildigi sayfa.
//
// OTURUMSUZ: yetkiyi URL'deki iptal token'i tasiyor. Kiraci yine slug'dan
// cozuluyor ve `getHalkaAcikDb` filtreyi kapanis degiskeni olarak tutuyor
// (DEGISMEZ 1) - baska bir salonun sayfasindan gelen token burada bulunamiyor.
//
// Veri SUNUCUDA okunuyor; istemci bilesenine yalnizca hazir metinler gidiyor.

// Onbellege ALINMIYOR. Randevunun durumu degisiyor (isletme onayliyor, musteri
// iptal ediyor) ve saklanmis bir kopya, iptal edilmis bir randevuyu aktif
// gostererek iptal dugmesini geri getirirdi. `/api/randevu/iptal`'in
// `no-store` karariyla ayni gerekce.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Randevunuz",
  // URL tek basina yetki tasiyor: arama motoruna dusmesi, linki elde eden
  // herkese iptal hakki vermek demek olurdu.
  robots: { index: false, follow: false },
};

/// "Su an" okumasi bilesenin DISINDA: React Compiler render govdesindeki
/// `Date.now()` cagrisini saf olmayan olarak isaretliyor (react-hooks/purity)
/// ve hakli - ayni render iki kez kosarsa iki farkli sonuc cikabilir. Sayfa
/// `force-dynamic`, yani karar istek basina bir kez veriliyor.
function randevuGecmisteMi(baslangic: Date): boolean {
  return baslangic.getTime() <= Date.now();
}

function saatiYaz(p: YerelParcalar): string {
  return saatBicimle(p.saat * 60 + p.dakika);
}

/// Faz J'de `bicim.ts > tarihUzun`a devredildi. Bu dosyada kendi ay adi
/// listesi ve kendi yazimi vardi; gerekcesi "bicim.ts ay adlarini tasimiyor"
/// diye yaziliydi ve o cumle Faz H'den beri DOGRU DEGILDI - takvim yazimlari
/// o fazda bicim.ts'e tasinmisti. Iki liste yan yana durdugu surece birinde
/// duzeltilen bir ay adi otekinde eski kalabilirdi.
function tarihiYaz(p: YerelParcalar): string {
  return tarihUzun(p);
}

function Satir({ baslik, children }: { baslik: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{baslik}</dt>
      <dd className="font-medium">{children}</dd>
    </>
  );
}

export default async function RandevuDetaySayfasi({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;

  // Bicimi tutmayan token VERITABANINA HIC SORULMUYOR. Bu yol halka acik:
  // her bozuk ya da kirpilmis link aksi halde bir sorgu actirirdi ve yanit
  // suresi farki token uzunlugunu ele verirdi (bkz. iptal-token.ts).
  if (!iptalTokenGecerliMi(token)) notFound();

  const db = await getHalkaAcikDb(slug);
  // Pasif isletme ile hic olmayan isletme AYNI cevabi aliyor: hangi
  // slug'larin kayitli oldugunu sizdirmanin bir faydasi yok.
  if (!db) notFound();

  const randevu = await db.randevuTokenIleGetir(token);
  // Yanlis token ile BASKA isletmenin token'i de ayni cevabi aliyor - sorgu
  // kiraci filtresini tasidigi icin ikincisi zaten bos donuyor.
  if (!randevu) notFound();

  // DEGISMEZ 7: yerel saate cevirme yalnizca zaman.ts uzerinden ve isletmenin
  // saatDilimi alaniyla. Sunucunun dilimi (Workers'ta UTC, gelistirme
  // makinesinde baska bir sey) hicbir yerde kullanilmiyor.
  const saatDilimi = db.isletme.saatDilimi;
  const baslangic = yerelParcalar(randevu.baslangic, saatDilimi);
  const bitis = yerelParcalar(randevu.bitis, saatDilimi);

  const aktif = randevu.durum === "BEKLIYOR" || randevu.durum === "ONAYLI";

  // Saati gecmis bir randevuda iptal dugmesi anlamsiz: iptal, saati yeniden
  // satilabilir kilmak icin var ve gecmis bir saat kimseye satilmiyor.
  //
  // Bu bir ARAYUZ karari, kural degil - `/api/randevu/iptal` gecmis bir
  // randevuyu da iptal ediyor. Sinirlamayi API'ye koymak, oraya bir "su an"
  // tanimi tasimak demekti; isletme henuz kapatmadigi bir randevuyu musteri
  // aradiginda yine de iptal edebilmeli.
  const gecmis = randevuGecmisteMi(randevu.baslangic);
  const iptalEdilebilir = aktif && !gecmis;

  const kapaliAciklama = aktif
    ? "Bu randevunun saati geçti, bu yüzden buradan iptal edilemiyor. Bir değişiklik gerekiyorsa işletmeyi arayabilirsiniz."
    : randevu.durum === "IPTAL"
      ? "Bu randevu iptal edildi. Yeni bir randevu almak isterseniz işletmenin randevu sayfasından devam edebilirsiniz."
      : randevu.durum === "TAMAMLANDI"
        ? "Bu randevu tamamlandı."
        : "Bu randevu geçmişte kaldı.";

  // Telefon veritabaninda yalnizca rakam duruyor (bkz. bicim.ts). `tel:`
  // baglantisi icin ulke kodu ekleniyor; urun su an yalnizca TR numarasi
  // kabul ediyor, tanimadigi bicimde numara baglanti YAPILMIYOR - bozuk bir
  // tel: linki, numarayi hic gostermemekten kotu.
  const telefon = db.isletme.telefon;
  const telefonHref =
    telefon && /^\d{10}$/.test(telefon) ? `tel:+90${telefon}` : null;

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <header className="mb-6 space-y-1">
        <p className="text-sm text-muted-foreground">{db.isletme.ad}</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Randevunuz
        </h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{randevu.hizmetAd}</CardTitle>
          <CardDescription>
            {sureBicimle(randevu.hizmetSureDk)} ·{" "}
            {paraBicimle(randevu.hizmetFiyatKurus)}
          </CardDescription>
          <CardAction>
            <DurumRozeti durum={randevu.durum} />
          </CardAction>
        </CardHeader>

        <CardContent>
          {/* Iki sutun: etiketler dar, degerler kalan alani aliyor. Mobilde de
              tek satirda duruyorlar cunku etiketler kisa. */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <Satir baslik="Tarih">{tarihiYaz(baslangic)}</Satir>
            <Satir baslik="Saat">
              {saatiYaz(baslangic)} – {saatiYaz(bitis)}
            </Satir>
            <Satir baslik="Personel">{randevu.personelAd}</Satir>
            <Satir baslik="Ad soyad">{randevu.musteriAd}</Satir>
            {randevu.not ? (
              <Satir baslik="Notunuz">{randevu.not}</Satir>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <div className="mt-6">
        {iptalEdilebilir ? (
          <IptalKarti
            slug={slug}
            token={token}
            ozet={`${tarihiYaz(baslangic)}, ${saatiYaz(baslangic)}`}
          />
        ) : (
          // Dugme yerine ne oldugunu anlatan bir durum: sonuc belli, yapacak
          // bir sey yok. Rozet zaten durumu soyluyor, bu metin nedenini.
          <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            {kapaliAciklama}
          </p>
        )}
      </div>

      {telefonHref ? (
        // Cumle isletme adini almiyor: Turkce'de ek son unluye gore degisiyor
        // ("...Salonu'nu" ama "...Guzellik'i") ve adi degisken bir metnin
        // icine koymak, kacinilmaz olarak yanlis ekli cumleler uretirdi.
        <p className="mt-6 text-center text-sm text-muted-foreground">
          İşletmenin telefonu:{" "}
          <a
            href={telefonHref}
            className="font-medium text-foreground underline underline-offset-4"
          >
            {telefonBicimle(telefon)}
          </a>
        </p>
      ) : null}
    </main>
  );
}
