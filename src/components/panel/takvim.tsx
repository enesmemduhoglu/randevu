"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { RandevuDetayi } from "@/components/panel/randevu-detayi";
import { TakvimAy } from "@/components/panel/takvim-ay";
import { TakvimGun, type TakvimKaydi } from "@/components/panel/takvim-gun";
import { TakvimHafta } from "@/components/panel/takvim-hafta";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ayVeYil, gunVeAy, tarihUzun } from "@/lib/bicim";
import {
  GORUNUMLER,
  GORUNUM_ETIKETLERI,
  pencere,
  pencereGunleri,
  kaydir,
  type Gorunum,
} from "@/lib/takvim-araligi";
import { tarihMetni, type YerelTarih } from "@/lib/zaman";

// Panel takviminin kabugu: baslik, gezinme, gorunum secici, personel suzgeci
// ve secili gorunumun cizimi.
//
// DURUM URL'DE, BILESENDE DEGIL.
//
// Gorunum, tarih ve personel suzgeci `useState` ile tutulabilirdi ve daha az
// kod olurdu. URL'de tutulmasinin uc somut sebebi var:
//   1. Isletme sahibi "3 Eylül'e bak" diyerek ortagina adres yollayabiliyor.
//   2. Yogun bir gunu yer imine koyup her sabah oradan aciyor.
//   3. Tarayicinin geri tusu calisiyor - ay gorunumunden bir gune inip geri
//      donmek, insanlarin refleks olarak yaptigi sey.
// Ustelik veri zaten sunucudan geliyor: adres degisince Next sayfayi yeniden
// cizip yeni randevulari getiriyor, yani ayrica bir fetch yazmiyoruz.
//
// Gezinme `<Link>` ile: gorunum secici, oklar ve gun hucreleri gercek birer
// adres. Baglanti olunca orta tikla yeni sekmede acilabiliyor ve adresi
// kopyalanabiliyor - `onClick` + `router.push` bunlarin ikisini de goturur.
// `router.push` yalnizca personel suzgecinde kullaniliyor: acilir listenin
// secenegi bir `<a>` degil, verecek bir href'i yok.

const TABAN = "/panel/takvim";

/// Acilir listede "hepsi" secenegi. Bos dize KULLANILAMIYOR: Radix Select bos
/// degeri "secim yok" sayiyor ve secenek tiklanamaz hale geliyor.
const HEPSI = "hepsi";

export type TakvimPersoneli = { id: string; ad: string; aktif: boolean };

const ONCEKI_ETIKETI: Record<Gorunum, string> = {
  gun: "Önceki gün",
  hafta: "Önceki hafta",
  ay: "Önceki ay",
};

const SONRAKI_ETIKETI: Record<Gorunum, string> = {
  gun: "Sonraki gün",
  hafta: "Sonraki hafta",
  ay: "Sonraki ay",
};

/// Pencerenin insan okur basligi.
///
/// Hafta gorunumunde yil bir kez yaziliyor, iki uc ayni yildaysa: "31 Ağustos –
/// 6 Eylül 2026". Yil da degisiyorsa ikisi de yaziliyor, yoksa yilbasi haftasi
/// yanlis okunurdu.
function pencereBasligi(
  gorunum: Gorunum,
  tarih: YerelTarih,
  gunler: YerelTarih[],
): string {
  if (gorunum === "gun") return tarihUzun(tarih);
  if (gorunum === "ay") return ayVeYil(tarih);

  const ilk = gunler[0];
  const son = gunler[gunler.length - 1];

  if (ilk.yil !== son.yil) {
    return `${gunVeAy(ilk)} ${ilk.yil} – ${gunVeAy(son)} ${son.yil}`;
  }
  if (ilk.ay === son.ay) {
    return `${ilk.gun} – ${gunVeAy(son)} ${son.yil}`;
  }
  return `${gunVeAy(ilk)} – ${gunVeAy(son)} ${son.yil}`;
}

export function Takvim({
  gorunum,
  tarih,
  bugun,
  saatDilimi,
  personeller,
  seciliPersonelId,
  randevular,
}: {
  gorunum: Gorunum;
  /// Pencerenin dayandigi gun. URL'den geldi ya da isletmenin bugunune dustu.
  tarih: YerelTarih;
  /// ISLETMENIN takvimindeki bugun - sunucuda `yerelGun(new Date(), saatDilimi)`
  /// ile hesaplandi. Tarayicidan `new Date()` okumuyoruz (DEGISMEZ 7).
  bugun: YerelTarih;
  saatDilimi: string;
  personeller: TakvimPersoneli[];
  seciliPersonelId: string | null;
  randevular: TakvimKaydi[];
}) {
  const router = useRouter();

  /// Secili randevu ID OLARAK tutuluyor, nesne olarak degil.
  ///
  /// Durum degistiginde `router.refresh()` yeni listeyi getiriyor; nesneyi
  /// saklasaydik cekmece eski kaydi gostermeye devam ederdi ve 409'dan sonra
  /// kullaniciya artik gecerli olmayan dugmeler sunulurdu. ID'den turetince
  /// cekmece her tazelemede kendiliginden guncelleniyor.
  const [seciliId, setSeciliId] = useState<string | null>(null);
  const secili = randevular.find((r) => r.id === seciliId) ?? null;

  const p = pencere(gorunum, tarih);
  const gunler = pencereGunleri(p);
  const baslik = pencereBasligi(gorunum, tarih, gunler);

  function baglanti(
    hedefGorunum: Gorunum,
    hedefTarih: YerelTarih,
    personelId: string | null,
  ): string {
    const sorgu = new URLSearchParams({
      gorunum: hedefGorunum,
      tarih: tarihMetni(hedefTarih),
    });
    // Suzgec yoksa parametre hic yazilmiyor: "tum personel" varsayilan durum ve
    // paylasilan adresi gereksiz uzatmiyor.
    if (personelId) sorgu.set("personel", personelId);
    return `${TABAN}?${sorgu.toString()}`;
  }

  const gunAdresi = (hedef: YerelTarih) =>
    baglanti("gun", hedef, seciliPersonelId);

  // ODAK YONETIMI. Gorunum ya da pencere degistiginde ekranin tamami
  // degisiyor ama odak basilan okta kaliyor; ekran okuyucu kullanan biri icin
  // hicbir sey olmamis gibi gorunuyordu. Odagi pencere basligina tasimak yeni
  // araligin adini okutuyor (ayni desen randevu akisinda AdimBasligi'nda var).
  //
  // ILK CIZIMDE CALISMIYOR: sayfa acilir acilmaz odak calmak sayfayi kaydirir
  // ve klavye kullanicisini gezinme baglantilarinin altina firlatir.
  const baslikRef = useRef<HTMLHeadingElement>(null);
  const ilkCizim = useRef(true);
  const pencereAnahtari = `${gorunum}|${tarihMetni(tarih)}|${seciliPersonelId ?? ""}`;

  useEffect(() => {
    if (ilkCizim.current) {
      ilkCizim.current = false;
      return;
    }
    baslikRef.current?.focus();
  }, [pencereAnahtari]);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Takvim
        </h1>
        <p className="text-sm text-muted-foreground">
          Randevularınızı görün, birine dokunup durumunu değiştirin.
        </p>
      </div>

      {/* Kontrol seridi. Mobilde alt alta sariyor; oklar ve "Bugün" bir arada
          kaliyor ki en sik kullanilan ikili bolunmesin. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon-lg" className="h-saat w-saat">
            <Link
              href={baglanti(gorunum, kaydir(gorunum, tarih, -1), seciliPersonelId)}
              aria-label={ONCEKI_ETIKETI[gorunum]}
              scroll={false}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Link>
          </Button>

          <Button asChild variant="outline" className="h-saat px-4">
            <Link
              href={baglanti(gorunum, bugun, seciliPersonelId)}
              scroll={false}
            >
              Bugün
            </Link>
          </Button>

          <Button asChild variant="outline" size="icon-lg" className="h-saat w-saat">
            <Link
              href={baglanti(gorunum, kaydir(gorunum, tarih, 1), seciliPersonelId)}
              aria-label={SONRAKI_ETIKETI[gorunum]}
              scroll={false}
            >
              <ChevronRightIcon aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <div
          role="group"
          aria-label="Takvim görünümü"
          className="flex items-center gap-1 rounded-lg border border-border p-1"
        >
          {GORUNUMLER.map((g) => {
            const bu = g === gorunum;
            return (
              <Link
                key={g}
                href={baglanti(g, tarih, seciliPersonelId)}
                scroll={false}
                // aria-current: hangi gorunumde oldugumuz renkten degil buradan
                // ogreniliyor.
                aria-current={bu ? "true" : undefined}
                className={`flex min-h-saat items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                  bu
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {GORUNUM_ETIKETLERI[g]}
              </Link>
            );
          })}
        </div>

        {personeller.length > 0 ? (
          <Select
            value={seciliPersonelId ?? HEPSI}
            onValueChange={(deger) => {
              router.push(
                baglanti(gorunum, tarih, deger === HEPSI ? null : deger),
                // Suzgec degisince sayfa basina firlamak, listenin ortasinda
                // calisan kullaniciyi yerinden ediyor.
                { scroll: false },
              );
            }}
          >
            {/* min-h-saat: tetigin kendi yuksekligi 32px ve dokunma hedefi
                44 pikselin altina inmemeli. */}
            <SelectTrigger
              aria-label="Personele göre filtrele"
              className="min-h-saat w-full sm:ml-auto sm:w-52"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={HEPSI}>Tüm personel</SelectItem>
              {personeller.map((kisi) => (
                <SelectItem key={kisi.id} value={kisi.id}>
                  {/* Pasif personel de listede: gecmis randevulari duruyor ve
                      isletme onlari suzmek isteyebiliyor. Etiketten durumu
                      anlasilmazsa "neden kimse gorunmuyor" sorusu dogardi. */}
                  {kisi.aktif ? kisi.ad : `${kisi.ad} (pasif)`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <h2
        ref={baslikRef}
        tabIndex={-1}
        // aria-live YOK: odak zaten basliga geliyor ve ekran okuyucu metni bir
        // kez okuyor. Ikisi birden olsaydi ayni cumle iki kez duyulurdu.
        className="font-heading text-lg font-semibold tracking-tight outline-none"
      >
        {baslik}
      </h2>

      {personeller.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="font-medium">Henüz personel yok</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Randevular bir personele bağlanıyor. Personel eklenene kadar takvimde
            gösterilecek bir şey olmayacak.
          </p>
          <Button asChild variant="outline" className="mt-4 h-saat">
            <Link href="/panel/personel">Personel ekle</Link>
          </Button>
        </div>
      ) : gorunum === "gun" ? (
        <TakvimGun
          randevular={randevular}
          saatDilimi={saatDilimi}
          onSec={(kayit) => setSeciliId(kayit.id)}
        />
      ) : gorunum === "hafta" ? (
        <TakvimHafta
          gunler={gunler}
          bugun={bugun}
          randevular={randevular}
          saatDilimi={saatDilimi}
          gunAdresi={gunAdresi}
          onSec={(kayit) => setSeciliId(kayit.id)}
        />
      ) : (
        <TakvimAy
          gunler={gunler}
          odakAyi={{ yil: tarih.yil, ay: tarih.ay }}
          bugun={bugun}
          randevular={randevular}
          saatDilimi={saatDilimi}
          gunAdresi={gunAdresi}
        />
      )}

      {secili ? (
        // key: baska bir randevu secilince cekmece sifirdan kuruluyor, yani
        // onceki kaydin hata mesaji yenisinde asili kalmiyor.
        <RandevuDetayi
          key={secili.id}
          kayit={secili}
          saatDilimi={saatDilimi}
          onKapat={() => setSeciliId(null)}
        />
      ) : null}
    </div>
  );
}
