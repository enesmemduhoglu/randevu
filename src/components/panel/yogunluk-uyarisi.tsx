import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";

import {
  EN_COK_GUNLUK_YENI_MUSTERI,
  YOGUNLUK_UYARI_ESIGI,
} from "@/lib/randevu-kotasi";

// Cevrim ici yeni musteri yogunlugu (Faz Q).
//
// NEDEN VAR: gunluk yeni musteri tavani dolunca o isletmeye gelen GERCEK yeni
// musteri de reddediliyor (bilerek kabul edilen bedel, gerekce
// randevu-kotasi.ts'te). Isletme bunu ancak musteri arayip sikayet edince
// ogrenseydi bedel gorunmez olurdu. Uyari tavan DOLMADAN basliyor ki isletme
// tanimadigi kayitlari iptal edip kapinin kapanmasini onleyebilsin.
//
// Sayi gosteriliyor, halka acik yolun aksine: burasi isletmenin kendi paneli
// ve sayi onun kendi verisi.
//
// Esigin altinda HICBIR SEY cizilmiyor. "Her sey yolunda" kutusu gun boyu
// acik duran panelde gurultu olurdu (docs/marka.md: sakin).

export function YogunlukUyarisi({ sayi }: { sayi: number }) {
  if (sayi < YOGUNLUK_UYARI_ESIGI) return null;

  const doldu = sayi >= EN_COK_GUNLUK_YENI_MUSTERI;

  return (
    // `role="status"`, alert degil: sayfa acilirken zaten orada olan bir
    // bilgi, kullanicinin eylemine cevap degil. Alert her acilista ekran
    // okuyucuyu kesip araya girerdi.
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg bg-durum-bekliyor-zemin px-4 py-3 text-sm"
    >
      <TriangleAlertIcon
        className="mt-0.5 size-4 shrink-0 text-durum-bekliyor"
        aria-hidden="true"
      />
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-durum-bekliyor">
          {doldu
            ? "Yeni müşteriler şu anda çevrim içi randevu alamıyor"
            : "Çevrim içi randevularda olağan dışı bir yoğunluk var"}
        </p>
        <p className="text-foreground">
          Son 24 saatte {sayi} yeni müşteri çevrim içi randevu aldı.{" "}
          {doldu
            ? "Günlük sınır doldu; kayıtlı müşterileriniz randevu almaya devam ediyor. "
            : `Sayı ${EN_COK_GUNLUK_YENI_MUSTERI} olduğunda yeni müşteriler bir süre çevrim içi randevu alamaz. `}
          Tanımadığınız randevuları iptal edebilirsiniz.
        </p>
        {/* `min-h-11`: dokunma hedefi 44px (docs/tasarim-sistemi.md). Isletme
            paneli cogu zaman telefondan aciyor; duz metin bagi 20px'te
            kaliyordu - 390px'lik iframe'de olculdu. */}
        <Link
          href="/panel/musteriler"
          className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Müşterileri gör
        </Link>
      </div>
    </div>
  );
}
