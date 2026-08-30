import { CheckIcon, GlobeIcon } from "lucide-react";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auth, isletmeOturumu } from "@/lib/auth";
import { getScopedDb } from "@/lib/scoped-db";

// Panelin giris ekrani. Faz D'de bilerek SADE: gosterecek randevu, hizmet ve
// calisma saati verisi henuz yok. Sahte istatistik ya da bos bir takvim
// cizmek yerine elimizdeki gercek bilgiyi ve siradaki adimlari gosteriyoruz.
//
// auth() ve isletmeOturumu() burada tekrar cagriliyor gibi gorunuyor ama
// duzenle ayni istekte kosuyorlar ve auth() `cache` ile sarili: JWT bir kez
// dogrulaniyor, kullanici satiri bir kez okunuyor.

/// Kurulum adimlari. Ucu de sonraki fazlarda aciliyor; simdilik yalnizca yolu
/// gosteriyorlar. "Yapmadiniz" demiyoruz, "sirada bu var" diyoruz.
const ADIMLAR = [
  {
    baslik: "Hizmetlerinizi tanımlayın",
    aciklama: "Müşterinin seçeceği hizmetler, süreleri ve ücretleri.",
  },
  {
    baslik: "Çalışma saatlerinizi belirleyin",
    aciklama: "Hangi günler, hangi saatler arasında randevu alınabileceği.",
  },
  {
    baslik: "Randevu sayfanızı paylaşın",
    aciklama: "Müşterileriniz bu adresten uygun saati görüp randevu alıyor.",
  },
];

export default async function PanelSayfasi() {
  const oturum = await auth();
  const isletmeOturum = await isletmeOturumu();

  // Duzen bu iki durumu zaten eliyor; buradaki kontrol tipi daraltmak icin.
  if (!oturum || !isletmeOturum) redirect("/giris");

  const db = await getScopedDb(isletmeOturum);
  const isletme = await db.isletmeyiGetir();
  if (!isletme) redirect("/");

  const ilkAd = oturum.ad.trim().split(" ")[0];

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Merhaba, {ilkAd}
        </h1>
        <p className="text-sm text-muted-foreground">
          İşletmenizi randevu almaya hazırlamak için birkaç adım kaldı.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GlobeIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            Randevu sayfanız
          </CardTitle>
          <CardDescription>
            Bu adres size ayrıldı. Sayfa hazır olduğunda müşterileriniz buradan
            randevu alacak.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Link DEGIL duz metin: sayfa henuz yok, tiklanabilir yapmak
              kullaniciyi 404'e goturur. */}
          <p className="rounded-lg bg-muted px-3 py-2 font-mono text-sm break-all">
            randevu.enesmemduhoglu.tech/r/{isletme.slug}
          </p>
          <p className="text-xs text-muted-foreground">
            Adres işletme adınızdan üretildi ve değişmez — müşterilerinize
            verdiğiniz bağlantının bir gün kırılmaması için.
          </p>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-semibold">Kurulum adımları</h2>
          <p className="text-sm text-muted-foreground">
            Bu ekranlar hazırlanıyor; sırayla açılacaklar.
          </p>
        </div>

        <ol className="space-y-2">
          {ADIMLAR.map((adim, sira) => (
            <li
              key={adim.baslik}
              className="flex items-start gap-3 rounded-lg border border-border px-4 py-3"
            >
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
              >
                {sira + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{adim.baslik}</span>
                <span className="block text-sm text-muted-foreground">
                  {adim.aciklama}
                </span>
              </span>
              <Badge variant="secondary" className="shrink-0">
                Yakında
              </Badge>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-lg font-semibold">İşletme bilgileri</h2>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">İşletme adı</dt>
          <dd>{isletme.ad}</dd>

          <dt className="text-muted-foreground">Saat dilimi</dt>
          <dd>{isletme.saatDilimi}</dd>

          <dt className="text-muted-foreground">Durum</dt>
          <dd className="flex items-center gap-1.5">
            {isletme.aktif ? (
              <>
                <CheckIcon
                  className="size-4 text-durum-onayli"
                  aria-hidden="true"
                />
                Açık
              </>
            ) : (
              "Kapalı"
            )}
          </dd>
        </dl>
      </section>
    </div>
  );
}
