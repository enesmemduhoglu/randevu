import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { DurumRozeti } from "@/components/randevu/durum-rozeti";
import { HesabaEkleDugmesi } from "@/components/randevu/hesaba-ekle-dugmesi";
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
import { auth } from "@/lib/auth";
import { iptalTokenGecerliMi } from "@/lib/iptal-token";
import { getHalkaAcikDb } from "@/lib/scoped-db";
import { yerelParcalar, type YerelParcalar } from "@/lib/zaman";

// Musterinin randevusunu gordugu ve iptal edebildigi sayfa.
//
// YETKIYI URL'DEKI IPTAL TOKEN'I TASIYOR - oturum degil. Kiraci yine slug'dan
// cozuluyor ve `getHalkaAcikDb` filtreyi kapanis degiskeni olarak tutuyor
// (DEGISMEZ 1) - baska bir salonun sayfasindan gelen token burada bulunamiyor.
//
// OTURUM Faz P'de OKUNMAYA BASLADI ama yetki icin DEGIL: sayfa yalnizca
// "bu randevuyu hesabina ekle" teklifini gosterip gostermeyecegine karar
// veriyor. Oturumsuz ziyaretci sayfayi eskisi gibi tam olarak goruyor ve
// iptal edebiliyor; okunan oturum hicbir kapiyi acmiyor, yalnizca bir kutu
// ciziyor.
//
// Bu teklif NEDEN BURADA duruyor, onay ekraninda degil: baglama ucu token
// istiyor ve token tek basina yetki tasiyor. Onay ekranindan giris yoluna
// gecirmek icin token'i `?devam=` gibi bir parametreye koymak gerekirdi ve o
// deger sunucu erisim loglarina duserdi (DEGISMEZ 5'in ruhu). Token'in zaten
// adres cubugunda oldugu tek yer burasi.
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

  const oturum = await auth();
  // Randevu zaten BU hesaba bagliysa teklif edilecek bir sey yok. Baskasina
  // bagliysa da dugme cizilmiyor: uc o durumda 409 donuyor ve kullaniciya
  // basacagi ama calismayacak bir dugme gostermek yanlis.
  const hesabaEklenebilir =
    oturum !== null && randevu.kullaniciId === null;
  const buHesaba = oturum !== null && randevu.kullaniciId === oturum.kullaniciId;

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

      {/* HESAP KOPRUSU (Faz P).
          
          Uc durum, uc ayri cumle. Onceden bu sayfa oturumdan tamamen habersizdi
          ve Faz J'nin "elinizdeki randevuyu ekleyin" kutusu `/randevularim`da
          duruyordu - yani kullanicidan linki kopyalayip baska bir sayfaya gidip
          GERI yapistirmasi bekleniyordu. Linki elinde tuttugu tek an burasi. */}
      {buHesaba ? (
        <p className="mt-6 rounded-lg bg-muted/50 px-4 py-3 text-center text-sm text-muted-foreground">
          Bu randevu hesabınıza ekli.{" "}
          <Link
            href="/randevularim"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Randevularım
          </Link>
        </p>
      ) : hesabaEklenebilir ? (
        <div className="mt-6 space-y-2 rounded-lg border border-border px-4 py-4">
          <p className="text-sm text-muted-foreground">
            Randevunuzu hesabınıza ekleyin; bu bağlantıyı saklamanız
            gerekmesin.
          </p>
          <HesabaEkleDugmesi token={token} />
        </div>
      ) : oturum === null ? (
        // OTURUMSUZ ZIYARETCI. Uyelik burada TEKLIF ediliyor ama randevunun
        // onune GECMIYOR: sayfanin birincil eylemi iptal ve o yukarida duruyor.
        //
        // Baglantilar `devam` TASIMIYOR: tasisalardi degeri bu sayfanin adresi
        // olurdu, o adres de token'i iceriyor ve `/giris?devam=...` istegi
        // token'i sunucu loglarina sokardi. Kullanici giris yaptiktan sonra bu
        // sayfaya kendi donuyor - baglanti e-postasinda ve tarayici gecmisinde.
        <div className="mt-6 space-y-1 rounded-lg border border-dashed border-border px-4 py-4 text-center">
          <p className="text-sm font-medium">Bu bağlantıyı saklamak istemiyorsanız</p>
          <p className="text-sm text-muted-foreground">
            <Link
              href="/uye-ol"
              className="font-medium text-primary underline underline-offset-4"
            >
              Üye olun
            </Link>{" "}
            ya da{" "}
            <Link
              href="/giris"
              className="font-medium text-primary underline underline-offset-4"
            >
              giriş yapın
            </Link>
            , sonra bu sayfaya dönüp randevunuzu hesabınıza ekleyin.
          </p>
        </div>
      ) : null}

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
