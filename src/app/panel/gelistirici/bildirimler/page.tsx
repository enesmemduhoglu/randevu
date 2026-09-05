import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isletmeOturumu } from "@/lib/auth";
import { SABLON_ADLARI, sablonGecerliMi } from "@/lib/bildirim-sablon";
import { saatBicimle, tarihUzun } from "@/lib/bicim";
import { bildirimModu } from "@/lib/email";
import { uretimMi } from "@/lib/mod";
import { getScopedDb } from "@/lib/scoped-db";
import { yerelParcalar } from "@/lib/zaman";

// BILDIRIM KUYRUGUNUN GORUNEN YUZU (Faz I).
//
// Neden bir ekran gerekiyor: `sahte` modda hicbir mail gonderilmiyor, yani
// sablonun gercekten neye benzedigini gormenin baska yolu yok. Ekran olmasa
// dogrulama "kodu okuyup hayal etmek" olurdu - oysa bu depoda iki kez, gozle
// bakilinca ortaya cikan bicim hatalari yasandi (Faz M'de Turkce arama,
// Faz N'de mobilde ezilen `hidden`).
//
// GELISTIRICI EKRANI: `/panel/gelistirici/*` altinda, vitrinle ayni yerde.
// Isletmenin gunluk isine ait degil; kuyrugun ne yaptigini gormek icin.
//
// URETIMDE KAPALI (Faz P), vitrinle ayni kapidan. Bu ekran vitrinden farkli
// olarak GERCEK bir ise yariyabilirdi - "mailim neden gitmedi" sorusunun cevabi
// burada. Yine de kapatildi: bugunku hali kuyrugun ham durum adlarini ve sablon
// kimliklerini gosteren bir teshis ekrani, isletmeye konusan bir ekran degil.
// Isletmeye gerekli oldugunda AYRI bir sayfa olarak, kendi diliyle yazilacak -
// gelistirici araci uretim yuzeyine tasinarak degil.
//
// Sunucu bileseni ve okuma scoped-db uzerinden: kuyruk musteri adi ve randevu
// saati tasiyor, yani kiraciya bagli veri (DEGISMEZ 1).

/// Kac satir gosteriliyor. Sayfalama YOK ve bilincli: bu ekran kuyrugun
/// arsivi degil, "az once ne oldu" penceresi.
const EN_COK = 50;

const DURUM_ROZETI: Record<string, { ad: string; sinif: string }> = {
  BEKLIYOR: {
    ad: "Bekliyor",
    sinif: "bg-durum-bekliyor-zemin text-durum-bekliyor",
  },
  GONDERILDI: {
    ad: "Gönderildi",
    sinif: "bg-durum-onayli-zemin text-durum-onayli",
  },
  HATA: { ad: "Hata", sinif: "bg-durum-gelmedi-zemin text-durum-gelmedi" },
};

/// DEGISMEZ 7: cevrim isletmenin dilimiyle, sunucununkiyle degil.
function zaman(an: Date, saatDilimi: string): string {
  const p = yerelParcalar(an, saatDilimi);
  return `${tarihUzun(p)} — ${saatBicimle(p.saat * 60 + p.dakika)}`;
}

export const metadata: Metadata = {
  title: "Bildirimler",
  // Panel oturum arkasinda ve robots.txt zaten /panel/ yolunu
  // engelliyor; meta etiketi ikinci kapi (bkz. /saglik ve /r/*/randevu/).
  robots: { index: false, follow: false },
};

export default async function BildirimlerSayfasi() {
  if (uretimMi()) notFound();

  const oturum = await isletmeOturumu();
  // Duzen bu durumu zaten eliyor; buradaki kontrol tipi daraltmak icin.
  if (!oturum) redirect("/giris");

  const db = await getScopedDb(oturum);
  const [isletme, kayitlar, mod] = await Promise.all([
    db.isletmeyiGetir(),
    db.bildirimleriListele(EN_COK),
    bildirimModu(),
  ]);

  if (!isletme) redirect("/");
  const saatDilimi = isletme.saatDilimi;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Bildirimler</h1>
        <p className="text-sm text-muted-foreground">
          Randevu olaylarında kuyruğa yazılan mesajlar. Gönderim modu{" "}
          <span className="font-medium text-foreground">
            {mod === "gercek" ? "gerçek" : "sahte"}
          </span>
          {mod === "sahte"
            ? " — hiçbir e-posta gönderilmiyor, mesajın gerçek HTML'i aşağıda önizlenebiliyor."
            : " — mesajlar Resend üzerinden gönderiliyor."}
        </p>
      </div>

      {kayitlar.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Kuyruk boş</CardTitle>
            <CardDescription>
              Bir randevu alındığında, onaylandığında ya da iptal edildiğinde
              mesajlar burada görünür.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="space-y-3">
        {kayitlar.map((k) => {
          const rozet = DURUM_ROZETI[k.durum] ?? {
            ad: k.durum,
            sinif: "bg-muted text-muted-foreground",
          };
          const ad = sablonGecerliMi(k.sablon)
            ? SABLON_ADLARI[k.sablon]
            : k.sablon;

          return (
            <Card key={k.id}>
              <CardHeader className="gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{ad}</CardTitle>
                  <Badge className={rozet.sinif} variant="secondary">
                    {rozet.ad}
                  </Badge>
                  <Badge variant="outline">{k.tur}</Badge>
                </div>
                <CardDescription>
                  {k.musteriAd} · randevu {zaman(k.baslangic, saatDilimi)}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Planlanan</dt>
                    <dd>{zaman(k.planlananZaman, saatDilimi)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Gönderim</dt>
                    <dd>
                      {k.gonderimZamani
                        ? zaman(k.gonderimZamani, saatDilimi)
                        : "—"}
                    </dd>
                  </div>
                </dl>

                {k.hataMetni ? (
                  // DEGISMEZ 5: burada saglayicinin ham yaniti degil,
                  // email.ts'in ozetledigi kisa kod duruyor.
                  <p className="rounded-md bg-durum-gelmedi-zemin px-3 py-2 font-mono text-xs text-durum-gelmedi">
                    {k.hataMetni}
                  </p>
                ) : null}

                {k.onizlemeHtml ? (
                  // <details>: acilip kapanma icin JavaScript gerekmiyor, yani
                  // bu sayfa sunucu bileseni olarak kalabiliyor.
                  <details className="rounded-md border border-border">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                      Önizleme
                    </summary>
                    {/* iframe + srcDoc: mesajin kendi stilleri panelin
                        stillerine karismasin. Sandbox bos - onizlenen HTML
                        bizim urettigimiz sablon ama yine de icinde hicbir sey
                        calistirilmasina gerek yok. */}
                    <iframe
                      title="Mesaj önizlemesi"
                      srcDoc={k.onizlemeHtml}
                      sandbox=""
                      className="h-96 w-full rounded-b-md border-0 bg-white"
                    />
                  </details>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
