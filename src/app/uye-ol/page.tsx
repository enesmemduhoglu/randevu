import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { KimlikKabugu } from "@/components/kimlik/kabuk";
import { UyeOlFormu } from "@/components/kimlik/uye-ol-formu";
import { auth } from "@/lib/auth";

// Musteri uyeligi (Faz J). `/kayit` isletme aciyor, burasi randevu alan kisiyi
// aciyor - iki ayri adres, cunku ikisinin vaadi ve formu farkli.

export const metadata: Metadata = {
  title: "Üye ol",
  description:
    "Randevularınızı tek yerde görmek ve iptal etmek için hesap açın.",
};

export default async function UyeOlSayfasi() {
  const oturum = await auth();
  if (oturum) redirect(oturum.rol === "MUSTERI" ? "/randevularim" : "/panel");

  return (
    <KimlikKabugu
      baslik="Üye ol"
      // Vaat ACIK YAZILIYOR: hesap acmak randevu almanin SARTI degil ve bunu
      // sayfada soylemezsek, uye olmak istemeyen kullanici randevu
      // alamayacagini sanip geri doner. Randevu almak icin uye olmak hicbir
      // zaman gerekmeyecek - hesabin verdigi tek sey liste ve tek tikla iptal.
      aciklama="Randevularınızı tek yerde görün. Randevu almak için üyelik gerekmiyor."
      alt={{
        metin: "Hesabınız var mı?",
        baglantiMetni: "Giriş yapın",
        yol: "/giris",
      }}
    >
      <UyeOlFormu />
    </KimlikKabugu>
  );
}
