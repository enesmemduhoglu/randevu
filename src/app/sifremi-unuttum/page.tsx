import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { KimlikKabugu } from "@/components/kimlik/kabuk";
import { SifremiUnuttumFormu } from "@/components/kimlik/sifremi-unuttum-formu";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Şifremi unuttum",
};

export default async function SifremiUnuttumSayfasi() {
  // Oturumu acik olan biri bu ekrani gormemeli - /giris ile ayni gerekce.
  const oturum = await auth();
  if (oturum) redirect(oturum.rol === "MUSTERI" ? "/randevularim" : "/panel");

  return (
    <KimlikKabugu
      baslik="Şifremi unuttum"
      aciklama="E-posta adresinizi girin, size bir sıfırlama bağlantısı gönderelim."
      alt={[
        {
          metin: "Şifrenizi hatırladınız mı?",
          baglantiMetni: "Giriş yapın",
          yol: "/giris",
        },
      ]}
    >
      <SifremiUnuttumFormu />
    </KimlikKabugu>
  );
}
