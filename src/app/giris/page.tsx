import { redirect } from "next/navigation";

import { GirisFormu } from "@/components/kimlik/giris-formu";
import { KimlikKabugu } from "@/components/kimlik/kabuk";
import { auth } from "@/lib/auth";
import { guvenliYol } from "@/lib/girdi";

export default async function GirisSayfasi({
  searchParams,
}: PageProps<"/giris">) {
  // Oturumu acik olan biri giris ekranini gormemeli; geri dugmesiyle buraya
  // dusenler de dahil.
  const oturum = await auth();
  if (oturum) redirect("/panel");

  const parametreler = await searchParams;

  // `devam` proxy tarafindan ekleniyor (korunan bir sayfaya oturumsuz girildi).
  // Burada da guvenliYol'dan geciriyoruz: forma yalnizca temiz bir deger
  // gecsin, gecersiz olan sessizce dussun.
  const devam = guvenliYol(parametreler.devam) ?? undefined;

  return (
    <KimlikKabugu
      baslik="Giriş yap"
      aciklama="Panelinize erişmek için e-posta ve şifrenizi girin."
      alt={{
        metin: "Hesabınız yok mu?",
        baglantiMetni: "Kayıt olun",
        yol: "/kayit",
      }}
    >
      <GirisFormu devam={devam} />
    </KimlikKabugu>
  );
}
