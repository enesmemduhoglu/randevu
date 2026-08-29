import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";

import { TemaSaglayici } from "@/components/tema-saglayici";

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

export const metadata: Metadata = {
  title: "Randevu",
  description:
    "Küçük işletmeler için randevu yönetimi. Hizmetlerinizi tanımlayın, " +
    "çalışma saatlerinizi belirleyin, randevularınızı tek takvimden yönetin.",
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
