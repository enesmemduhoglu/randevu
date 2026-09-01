"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import {
  DurumRozeti,
  kayitGunu,
  saatAraligi,
  type TakvimKaydi,
} from "@/components/panel/takvim-gun";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { paraBicimle, sureBicimle, tarihUzun, telefonBicimle } from "@/lib/bicim";
import {
  EYLEM_ETIKETLERI,
  GECISLER,
  type RandevuDurumu,
} from "@/lib/randevu-durum";

// Randevu ayrintisi ve durum degistirme.
//
// Cekmece (Sheet) secildi, sayfa degil: isletme sahibi bir randevuya bakip
// karar verdikten sonra ayni gune donuyor. Ayri bir sayfa her karardan sonra
// geri tusuna basmak demekti. Radix cekmeceyi acarken odagi iceri aliyor,
// kapanirken tikladigi satira geri veriyor - odak yonetimi bu yuzden elle
// yazilmadi.

const KAYNAK_ETIKETLERI: Record<TakvimKaydi["kaynak"], string> = {
  MUSTERI: "Müşteri aldı",
  ISLETME: "İşletme ekledi",
};

/// Eylem dugmelerinin gorunumu.
///
/// Yalnizca ONAYLI birincil: bekleyen bir randevuda yapilacak sey odur ve
/// dordunu de birincil yapmak hicbirini one cikarmazdi. Iptal yikici, digerleri
/// notr. Statik harita: Tailwind gibi burada da dinamik ad uretmek yok, tip
/// sistemi eksik durumu yakalasin.
const EYLEM_GORUNUMU: Record<
  RandevuDurumu,
  "default" | "outline" | "destructive"
> = {
  BEKLIYOR: "outline",
  ONAYLI: "default",
  IPTAL: "destructive",
  TAMAMLANDI: "outline",
  GELMEDI: "outline",
};

function Satir({
  etiket,
  children,
}: {
  etiket: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{etiket}</dt>
      <dd className="break-words">{children}</dd>
    </>
  );
}

export function RandevuDetayi({
  kayit,
  saatDilimi,
  onKapat,
}: {
  kayit: TakvimKaydi;
  saatDilimi: string;
  onKapat: () => void;
}) {
  const router = useRouter();
  const [hata, setHata] = useState<string | null>(null);
  /// Hangi hedef isleniyor: dugme yazisini degistirmek ve digerlerini kilitlemek
  /// icin. Duz bir boolean, "hangi dugmeye basildi"yi kaybederdi.
  const [islenen, setIslenen] = useState<RandevuDurumu | null>(null);

  const gun = kayitGunu(kayit, saatDilimi);
  const hedefler = GECISLER[kayit.durum];

  async function degistir(hedef: RandevuDurumu) {
    if (islenen) return;
    setIslenen(hedef);
    setHata(null);

    try {
      const yanit = await fetch(`/api/randevular/${kayit.id}/durum`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ durum: hedef }),
      });

      if (!yanit.ok) {
        const cevap = (await yanit.json().catch(() => null)) as {
          hata?: string;
        } | null;
        setHata(
          cevap?.hata ?? "Randevu güncellenemedi. Sayfayı yenileyip yeniden deneyin.",
        );
        setIslenen(null);

        // 409 = randevu bu sirada degisti (baska sekme, ya da musteri iptal
        // baglantisini kullandi). Sunucunun Turkce aciklamasi zaten ekranda;
        // ustune listeyi tazeliyoruz ki cekmece GERCEK durumu gostersin -
        // aksi halde kullanici artik gecerli olmayan dugmelere basmaya devam
        // ederdi. Cekmece bilerek ACIK kaliyor: kapatmak, hata mesajini
        // okunmadan goturmek demek.
        if (yanit.status === 409) router.refresh();
        return;
      }
    } catch {
      setHata("Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.");
      setIslenen(null);
      return;
    }

    // Liste sunucu bileseninde; yeniden cizilmesi icin refresh sart.
    router.refresh();
    setIslenen(null);
    onKapat();
  }

  return (
    <Sheet open onOpenChange={(acik) => (acik ? null : onKapat())}>
      {/* Genislik AYNI data-side onekiyle eziliyor: taban sinif
          `data-[side=right]:w-3/4` ve duz bir `w-full` ondan daha dusuk
          ozgullukte kalip telefonda cekmeceyi ekranin dortte ucune sikistirirdi
          - detay listesi orada zaten dar. */}
      <SheetContent
        side="right"
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle className="pr-8">{kayit.musteriAd}</SheetTitle>
          <SheetDescription>
            {tarihUzun(gun)} · {saatAraligi(kayit, saatDilimi)}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <div className="mb-4">
            <DurumRozeti durum={kayit.durum} />
          </div>

          <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2.5 text-sm">
            <Satir etiket="Hizmet">
              {kayit.hizmetAd}
              <span className="text-muted-foreground">
                {" "}
                {/* Fiyat 0 ISE HIC YAZILMIYOR (marka kurali, bkz. ortak.tsx >
                    hizmetBilgisi): semadaki varsayilan 0 "ucretsiz" degil,
                    "isletme fiyat girmemis" demek. */}
                · {sureBicimle(kayit.hizmetSureDk)}
                {kayit.hizmetFiyatKurus > 0
                  ? ` · ${paraBicimle(kayit.hizmetFiyatKurus)}`
                  : ""}
              </span>
            </Satir>

            <Satir etiket="Personel">{kayit.personelAd}</Satir>

            <Satir etiket="Telefon">
              {/* tel: baglantisi - panel cogunlukla telefondan aciliyor ve
                  "musteriyi ara" en sik yapilan sey. */}
              <a
                href={`tel:${kayit.musteriTelefon}`}
                className="rounded-sm underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {telefonBicimle(kayit.musteriTelefon)}
              </a>
            </Satir>

            <Satir etiket="E-posta">
              {kayit.musteriEposta ? (
                <a
                  href={`mailto:${kayit.musteriEposta}`}
                  className="rounded-sm underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {kayit.musteriEposta}
                </a>
              ) : (
                <span className="text-muted-foreground">Verilmedi</span>
              )}
            </Satir>

            <Satir etiket="Kayıt">{KAYNAK_ETIKETLERI[kayit.kaynak]}</Satir>

            <Satir etiket="Not">
              {kayit.not ? (
                <span className="whitespace-pre-wrap">{kayit.not}</span>
              ) : (
                <span className="text-muted-foreground">Yok</span>
              )}
            </Satir>
          </dl>
        </div>

        <Separator />

        <SheetFooter>
          {hata ? <HataKutusu mesaj={hata} /> : null}

          {hedefler.length === 0 ? (
            // Terminal durum. Bos bir alan birakmak yerine SEBEBI yaziyoruz:
            // dugmelerin nereye gittigini soran kullanici, cevabi ekranda
            // bulsun (gerekcesi randevu-durum.ts > GECISLER).
            <p className="text-sm text-muted-foreground">
              Bu randevunun durumu artık değiştirilemiyor. Yeni bir saat vermek
              için randevuyu yeniden oluşturmanız gerekir.
            </p>
          ) : (
            <>
              {hedefler.map((hedef) => (
                <Button
                  key={hedef}
                  variant={EYLEM_GORUNUMU[hedef]}
                  className="min-h-saat w-full"
                  disabled={islenen !== null}
                  onClick={() => degistir(hedef)}
                >
                  {islenen === hedef ? "Kaydediliyor…" : EYLEM_ETIKETLERI[hedef]}
                </Button>
              ))}
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
