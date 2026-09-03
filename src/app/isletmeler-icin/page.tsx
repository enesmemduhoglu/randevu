import {
  CalendarCheckIcon,
  ClockIcon,
  Link2Icon,
  ShieldCheckIcon,
  StoreIcon,
  UsersIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AltBilgi } from "@/components/genel/alt-bilgi";
import { UstBar } from "@/components/genel/ust-bar";
import { Button } from "@/components/ui/button";

// Isletmeye konusan sayfa. Faz N'e kadar burasi KOK SAYFAYDI; urun kimligi
// karariyla (TODOS.md > Urun kimligi) on kapi musteriye acildi ve bu icerik
// kendi adresine tasindi. Emsal: Salon Randevu'nun `/isletmeler-icin`i.
//
// Veritabanina dokunmuyor - yani statik uretilebiliyor ve dizin sorgusu
// beklemeden aciliyor.

export const metadata: Metadata = {
  title: "İşletmeler için",
  description:
    "Hizmetlerinizi ve çalışma saatlerinizi tanımlayın, müşterileriniz size " +
    "ayrılan sayfadan uygun saati seçsin. Kurulum ücretsiz.",
};

/// Sayfanin anlattigi sey urunun BUGUN yaptigi is. Yazilmamis ozellik
/// listelenmiyor: sonradan duzeltilmesi gereken bir borc olurdu ve kayit olan
/// isletme ilk gun yaniltildigini gorurdu.
const OZELLIKLER = [
  {
    ikon: Link2Icon,
    baslik: "Kendi randevu sayfanız",
    metin:
      "İşletmenize ayrılan bağlantıyı Instagram biyografinize koyun. Müşteri " +
      "hesap açmadan, tek ekranda randevusunu alsın.",
  },
  {
    ikon: ClockIcon,
    baslik: "Çalışma saatleri ve molalar",
    metin:
      "Her personel için gün gün çalışma saati tanımlayın. Uygun saatler " +
      "hizmet süresine göre kendiliğinden hesaplanır.",
  },
  {
    ikon: UsersIcon,
    baslik: "Personel ve hizmetler",
    metin:
      "Hangi personelin hangi hizmeti verdiğini belirleyin. Müşteri yalnızca " +
      "gerçekten alınabilen saatleri görür.",
  },
  {
    ikon: CalendarCheckIcon,
    baslik: "Tek takvim",
    metin:
      "Gelen randevuları gün, hafta ve ay görünümünde izleyin; onaylayın, " +
      "iptal edin ya da tamamlandı olarak işaretleyin.",
  },
  {
    ikon: StoreIcon,
    baslik: "Dizinde görünün",
    metin:
      "İl ve kategorinizi doldurup dizine çıkın. Sizi tanımayan müşteri de " +
      "aramadan bulabilsin.",
  },
  {
    ikon: ShieldCheckIcon,
    baslik: "Çakışma olmaz",
    metin:
      "Aynı personele aynı saatte iki randevu veritabanı düzeyinde " +
      "engelleniyor. Aynı anda gelen ikinci istek reddedilir.",
  },
];

export default function IsletmelerIcinSayfasi() {
  return (
    <div className="flex flex-1 flex-col">
      <UstBar />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-3xl px-5 pt-12 pb-12 text-center sm:pt-16">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Randevularınız tek yerde
          </h1>
          <p className="pt-3 text-base text-muted-foreground text-pretty">
            Hizmetlerinizi tanımlayın, çalışma saatlerinizi belirleyin.
            Müşterileriniz size ayrılan sayfadan uygun saati seçsin.
          </p>

          <div className="flex flex-col gap-3 pt-7 sm:flex-row sm:justify-center">
            <Button asChild className="h-11 px-6">
              <Link href="/kayit">İşletmenizi ekleyin</Link>
            </Button>
            <Button asChild variant="outline" className="h-11 px-6">
              <Link href="/giris">Giriş yap</Link>
            </Button>
          </div>

          {/* Fiyat sorusu ilk akla gelen soru; cevabi gizlemek guven kaybi.
              Bugunku cevap sade ve dogru (TODOS.md > Urun kimligi: isletmeye
              simdilik bedava, komisyon dizin musteri getirdiginde konusulur). */}
          <p className="pt-4 text-sm text-muted-foreground">
            Kurulum ücretsiz, kredi kartı istemiyoruz.
          </p>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 pb-14">
          <h2 className="pb-5 font-heading text-xl font-semibold tracking-tight">
            Ne yapabilirsiniz
          </h2>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {OZELLIKLER.map((ozellik) => (
              <li
                key={ozellik.baslik}
                className="flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-5"
              >
                <ozellik.ikon
                  className="size-5 text-primary"
                  aria-hidden="true"
                />
                <h3 className="font-medium">{ozellik.baslik}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {ozellik.metin}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-border bg-muted/40">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 className="font-heading text-lg font-semibold tracking-tight">
                Kurulum on beş dakika
              </h2>
              <p className="text-sm text-muted-foreground">
                Hizmet, personel ve çalışma saati; randevu sayfanız hazır.
              </p>
            </div>
            <Button asChild className="h-11 px-6">
              <Link href="/kayit">Kayıt ol</Link>
            </Button>
          </div>
        </section>
      </main>

      <AltBilgi />
    </div>
  );
}
