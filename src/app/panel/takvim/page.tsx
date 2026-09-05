import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Takvim } from "@/components/panel/takvim";
import type { TakvimKaydi } from "@/components/panel/takvim-gun";
import { isletmeOturumu } from "@/lib/auth";
import { getScopedDb } from "@/lib/scoped-db";
import { gorunumAyristir, pencere } from "@/lib/takvim-araligi";
import { gunBasi, gunEkle, tarihAyristir, yerelGun } from "@/lib/zaman";

// Panel takvimi. Veri sunucuda okunuyor, cizim istemcide.
//
// Sorgu parametreleri: ?gorunum=gun|hafta|ay&tarih=YYYY-MM-DD&personel=<uuid>
// Ucu de KULLANICIDAN geliyor ve ucu de elle duzenlenebilir. Hicbiri hata
// sayfasi uretmiyor: bozuk bir parametre yuzunden isletmeyi gununu goremez
// birakmak, sessizce makul bir varsayilana dusmekten kotu.
//
// `searchParams` Next 16'da bir PROMISE - `await` edilmeden okunamiyor.

export const metadata: Metadata = {
  title: "Takvim",
  // Panel oturum arkasinda ve robots.txt zaten /panel/ yolunu
  // engelliyor; meta etiketi ikinci kapi (bkz. /saglik ve /r/*/randevu/).
  robots: { index: false, follow: false },
};

export default async function TakvimSayfasi({
  searchParams,
}: PageProps<"/panel/takvim">) {
  const oturum = await isletmeOturumu();
  // Duzen bu durumu zaten eliyor; buradaki kontrol tipi daraltmak icin.
  if (!oturum) redirect("/giris");

  const db = await getScopedDb(oturum);
  const [isletme, personeller] = await Promise.all([
    db.isletmeyiGetir(),
    db.personelleriListele(),
  ]);
  if (!isletme) redirect("/");

  const parametreler = await searchParams;

  const gorunum = gorunumAyristir(parametreler.gorunum);

  // ISLETMENIN bugunu, sunucunun degil (DEGISMEZ 7). Worker'in dilimi UTC,
  // gelistirici makinesininki Europe/Istanbul; `new Date()` disinda hicbir
  // yerel-zaman API'si kullanilmiyor ve gun karari isletmenin `saatDilimi`
  // alaniyla veriliyor. Aksi halde gece 01:00'de acilan panel, Istanbul'daki
  // isletmeye bir onceki gunu gosterirdi.
  const bugun = yerelGun(new Date(), isletme.saatDilimi);
  const tarih = tarihAyristir(parametreler.tarih) ?? bugun;

  // Personel suzgeci KENDI listemizde aranarak dogrulaniyor.
  // `personelleriListele` zaten kiraci filtresinden geciyor, yani baska
  // isletmenin personel id'si burada bulunamiyor - suzgec sessizce yok
  // sayiliyor ve o id'nin var olup olmadigi da disariya sizmiyor.
  const istenen = parametreler.personel;
  const seciliPersonel =
    personeller.find((p) => typeof istenen === "string" && p.id === istenen) ??
    null;

  // PENCEREYI UTC'YE CEVIRME.
  //
  // Alt sinir pencerenin ilk gununun yerel 00:00'i; ust sinir SON GUNDEN BIR
  // SONRAKI gunun yerel 00:00'i, yani aralik `[alt, ust)`.
  //
  // Alt sinira "gun sayisi x 24 saat" EKLENMIYOR. Yaz saati gecisinin oldugu
  // haftada bir gun 23, bir gun 25 saat suruyor; 24 saatlik toplama o
  // haftalarda pencereyi bir saat kaydirir ve son gunun ilk (ya da son)
  // randevusu listeden duserdi. `gunEkle` takvim gunu ekliyor, `gunBasi` o
  // gunun yerel gece yarisini dilim kurallariyla UTC'ye ceviriyor - gecis
  // hangi gune denk gelirse gelsin sinir dogru yerde duruyor.
  const p = pencere(gorunum, tarih);
  const alt = gunBasi(isletme.saatDilimi, p.ilkGun);
  const ust = gunBasi(isletme.saatDilimi, gunEkle(p.ilkGun, p.gunSayisi));

  const randevular = await db.randevulariListele(
    alt,
    ust,
    seciliPersonel ? { personelId: seciliPersonel.id } : undefined,
  );

  // `Date` yerine ISO metin gonderiliyor. Sunucu/istemci sinirinda `Date`
  // serilestirmesi calisiyor ama istemcinin onu yerel saate cevirmemesi
  // gerektigini hicbir sey hatirlatmiyor; metin olarak gecince tek yol
  // `yerelParcalar(..., saatDilimi)` kaliyor (DEGISMEZ 7).
  const kayitlar: TakvimKaydi[] = randevular.map((r) => ({
    ...r,
    baslangic: r.baslangic.toISOString(),
    bitis: r.bitis.toISOString(),
  }));

  return (
    <Takvim
      gorunum={gorunum}
      tarih={tarih}
      bugun={bugun}
      saatDilimi={isletme.saatDilimi}
      personeller={personeller.map((kisi) => ({
        id: kisi.id,
        ad: kisi.ad,
        aktif: kisi.aktif,
      }))}
      seciliPersonelId={seciliPersonel?.id ?? null}
      randevular={kayitlar}
    />
  );
}
