"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Dizine cikma anahtari. Ayarlar formundan AYRI bir bilesen, cunku ayri bir
// route'a gidiyor - gerekcesi `src/app/api/dizin/route.ts` basliginda.
//
// Ayni ekranda iki form olmasi kullaniciya tuhaf gelmesin diye kart, ayarlar
// formunun ALTINDA ve kendi basligini tasiyor: "Kaydet" dugmesinin bu anahtari
// da kaydettigi izlenimi verilmemeli.

/// Eksik anahtarlarinin karsiligi. Sunucu ham anahtar donuyor (route basligi):
/// her eksigin yaninda gidilecek bir ekran var ve o bilgi arayuze ait.
///
/// `null` yol "bu sayfada, yukarida" demek - kullaniciyi bulundugu sayfaya
/// linkleyip hicbir sey olmamis gibi gostermek kafa karistirici olurdu.
const EKSIK_METINLERI: Record<string, { metin: string; yol: string | null }> = {
  il: { metin: "İl seçilmedi", yol: null },
  kategori: { metin: "Kategori seçilmedi", yol: null },
  hizmet: { metin: "En az bir hizmet gerekiyor", yol: "/panel/hizmetler" },
  personel: { metin: "En az bir personel gerekiyor", yol: "/panel/personel" },
  "calisma-saati": {
    metin: "Çalışma saatleri girilmedi",
    yol: "/panel/calisma-saatleri",
  },
};

export function DizinYayinKarti({ yayinda }: { yayinda: boolean }) {
  const router = useRouter();
  const [hata, setHata] = useState<string | null>(null);
  const [eksikler, setEksikler] = useState<string[]>([]);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  async function degistir() {
    if (gonderiliyor) return;
    setGonderiliyor(true);
    setHata(null);
    setEksikler([]);

    try {
      const yanit = await fetch("/api/dizin", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ yayinda: !yayinda }),
      });

      if (!yanit.ok) {
        const cevap = (await yanit.json().catch(() => null)) as {
          hata?: string;
          eksikler?: string[];
        } | null;
        // Eksik listesi varsa hata kutusu yerine onu gosteriyoruz: kullanicinin
        // yapacagi is belli ve "olmadi" demek onu ekranda tikar.
        if (cevap?.eksikler?.length) {
          setEksikler(cevap.eksikler);
        } else {
          setHata(cevap?.hata ?? "İşlem tamamlanamadı. Sayfayı yenileyip yeniden deneyin.");
        }
        setGonderiliyor(false);
        return;
      }
    } catch {
      setHata("Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.");
      setGonderiliyor(false);
      return;
    }

    setGonderiliyor(false);
    // Sunucudan gelen `yayinda`yi yerel duruma kopyalamiyoruz; sayfayi
    // tazeliyoruz. Tek gerceklik kaynagi veritabani kalsin.
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="font-heading">Randevu dizini</CardTitle>
          <Badge variant={yayinda ? "default" : "outline"}>
            {yayinda ? "Yayında" : "Yayında değil"}
          </Badge>
        </div>
        <CardDescription>
          Dizin, müşterilerin il ve kategoriye göre işletme aradığı halka açık
          liste. Dizinden çıkmak randevu sayfanızı kapatmaz — linkiniz olan
          müşteriler randevu almaya devam eder.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {hata ? <HataKutusu mesaj={hata} /> : null}

        {eksikler.length > 0 ? (
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <p className="text-sm font-medium">
              Dizine eklenmeden önce tamamlanması gerekenler:
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {eksikler.map((eksik) => {
                const bilgi = EKSIK_METINLERI[eksik];
                // Bilinmeyen bir anahtar gelirse ham haliyle gosteriliyor.
                // Sessizce atlamak, kullaniciya listeyi tamamladigini gosterip
                // dugmenin yine calismamasi demekti.
                if (!bilgi) return <li key={eksik}>{eksik}</li>;
                return (
                  <li key={eksik}>
                    {bilgi.yol ? (
                      <Link href={bilgi.yol} className="text-primary underline underline-offset-4">
                        {bilgi.metin}
                      </Link>
                    ) : (
                      <>{bilgi.metin} — yukarıdaki &ldquo;Dizin bilgileri&rdquo; bölümünden</>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={degistir}
            variant={yayinda ? "outline" : "default"}
            className="h-10"
            disabled={gonderiliyor}
          >
            {gonderiliyor
              ? "Kaydediliyor…"
              : yayinda
                ? "Dizinden çıkar"
                : "Dizine ekle"}
          </Button>
          {yayinda ? (
            <Link
              href="/dizin"
              className="text-sm text-primary underline underline-offset-4"
            >
              Dizini görüntüle
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
