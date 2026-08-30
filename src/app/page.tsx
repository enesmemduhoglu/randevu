import Link from "next/link";

import { Logo } from "@/components/marka/logo";
import { TemaDugmesi } from "@/components/tema-dugmesi";
import { Button } from "@/components/ui/button";

// GECICI karsilama sayfasi. Gercek tanitim sayfasi (ne yaptigimiz, kimin icin,
// ekran goruntuleri) urun calisir hale geldikten sonra yazilacak: bugun
// anlatilacak sey yok, uydurulmus ozellik listesi ise sonradan duzeltilmesi
// gereken bir borc olurdu.
//
// Buradaki tek is, giris ve kayit akislarina bir kapi acmak.

export default function KokSayfa() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-5 py-4">
        <Logo />
        <TemaDugmesi />
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="space-y-3">
            <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              Randevularınız tek yerde
            </h1>
            <p className="text-base text-muted-foreground">
              Hizmetlerinizi tanımlayın, çalışma saatlerinizi belirleyin.
              Müşterileriniz size ayrılan sayfadan uygun saati seçsin.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild className="h-10 px-5">
              <Link href="/kayit">Kayıt ol</Link>
            </Button>
            <Button asChild variant="outline" className="h-10 px-5">
              <Link href="/giris">Giriş yap</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
