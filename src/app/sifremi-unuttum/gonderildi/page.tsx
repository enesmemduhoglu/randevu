import type { Metadata } from "next";
import Link from "next/link";

import { KimlikKabugu } from "@/components/kimlik/kabuk";

// Sabit onay ekrani, ayri bir sayfa - form icinde bir "gonderildi" durumu
// tutmak, uc kimlik formunun paylastigi kimlikGonder sozlesmesini (basaride
// hep bir yon dondurur) yalnizca bu form icin degistirmek olurdu. Sayfa
// adresi ayrica yenilemeye ve geri tusuna dayanikli.
//
// ADRES HICBIR SEY TASIMIYOR (?eposta= gibi bir parametre yok): tasisaydi
// oltalama icin kullanilabilir bir yuzey olurdu ve adres sunucu erisim
// loglarina duserdi.

export const metadata: Metadata = {
  title: "Bağlantı gönderildi",
  robots: { index: false, follow: false },
};

export default function SifremiUnuttumGonderildiSayfasi() {
  return (
    <KimlikKabugu
      baslik="Bağlantı gönderildi"
      aciklama="Bu adres kayıtlıysa şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu ve spam klasörünü kontrol edin."
    >
      <p className="text-center text-sm text-muted-foreground">
        <Link
          href="/giris"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Giriş ekranına dön
        </Link>
      </p>
    </KimlikKabugu>
  );
}
