import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";

import { TemaSaglayici } from "@/components/tema-saglayici";
import { siteKoku } from "@/lib/site";

import "./globals.css";

// latin-ext SART: Turkce'nin g-breve, dotless-i, s-cedilla ve buyuk I-nokta
// karakterleri latin subset'inde yok. Eksik olsaydi bu harfler yedek fonta
// duser ve basliklarda gorunur bir karisiklik olusurdu.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

// Fraunces degisken bir font; yalnizca kullandigimiz agirlik araligi aliniyor.
// Bundle 3 MiB'lik Worker sinirina giriyor, her kilobayt sayiliyor.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700"],
  display: "swap",
});

// Metadata MUSTERIYE konusuyor. Faz N'e kadar isletmeye konusuyordu ("Küçük
// işletmeler için randevu yönetimi") - yani arama sonucunda gorunen cumle
// urunu bir yazilim gibi tanitiyordu. Urun kimligi karariyla (TODOS.md > Urun
// kimligi) burasi da cevrildi: siteye giren kisi randevu almaya geliyor.
//
// `title.template`: alt sayfalar kendi basligini yaziyor ve marka adi sonuna
// kendiliginden ekleniyor; `default` ise yalnizca kok sayfa icin.
export const metadata: Metadata = {
  // Faz O: goreli `canonical` degerlerinin cozulecegi kok. Olmadan Next
  // uyari veriyor ve etiketi localhost'a gore uretiyor - yayinda yanlis
  // adresi gosteren bir canonical, hic olmamasindan kotu.
  metadataBase: new URL(siteKoku()),
  title: {
    default: "Randevu — kuaför, berber ve güzellik salonu randevusu",
    template: "%s · Randevu",
  },
  description:
    "Yakınınızdaki kuaför, berber ve güzellik salonlarını bulun. Uygun saati " +
    "görün, hesap açmadan randevunuzu alın.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes tema sinifini istemcide <html>'e
    // yaziyor, sunucu ciktisiyla kacinilmaz olarak farkli oluyor.
    <html
      lang="tr"
      suppressHydrationWarning
      className={`${inter.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TemaSaglayici>{children}</TemaSaglayici>
      </body>
    </html>
  );
}
