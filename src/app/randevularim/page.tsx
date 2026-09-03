import { CalendarClockIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AltBilgi } from "@/components/genel/alt-bilgi";
import { UstBar } from "@/components/genel/ust-bar";
import { Button } from "@/components/ui/button";

// Ust bardaki "Randevularım" bu sayfaya geliyor.
//
// NEDEN LISTE YOK: randevu listesi bir MUSTERI HESABI gerektiriyor ve o Faz
// J'nin isi. Bugun randevunun kimligini token tasiyor (bkz. iptal-token.ts),
// yani sunucunun elinde "bu ziyaretcinin randevulari" diye bir kume yok.
//
// Baglanti yine de ust barda duruyor: musteri once bu basligi ariyor ve
// olmadiginda randevusuna nasil ulasacagini hic ogrenemiyor. Burasi o sorunun
// bugunku cevabini veriyor - bos bir liste ya da 404 vermektense.
//
// Faz J bu dosyayi gercek listeyle degistirecek.

export const metadata: Metadata = {
  title: "Randevularım",
  description:
    "Aldığınız randevuya nasıl ulaşacağınız ve nasıl iptal edeceğiniz.",
};

export default function RandevularimSayfasi() {
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
              Randevularınızı burada topluca göreceğiniz hesap henüz hazır
              değil. Şimdilik randevu aldığınızda size verilen bağlantıyı
              saklayın: o sayfada randevunuzun bilgileri duruyor ve iptal de
              oradan yapılıyor.
            </p>
          </div>

          <Button asChild className="h-11 px-6">
            <Link href="/dizin">İşletme dizinine bakın</Link>
          </Button>
        </div>
      </main>

      <AltBilgi />
    </div>
  );
}
