import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { KimlikKabugu } from "@/components/kimlik/kabuk";
import { KayitFormu } from "@/components/kimlik/kayit-formu";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "İşletme kaydı",
};

export default async function KayitSayfasi() {
  const oturum = await auth();
  if (oturum) redirect("/panel");

  return (
    <KimlikKabugu
      baslik="Kayıt ol"
      aciklama="İşletmenizi tanımlayın; randevu sayfanız hemen ardından hazırlanır."
      alt={[
        {
          metin: "Hesabınız var mı?",
          baglantiMetni: "Giriş yapın",
          yol: "/giris",
        },
      ]}
    >
      <KayitFormu />
    </KimlikKabugu>
  );
}
