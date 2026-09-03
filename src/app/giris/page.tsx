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
  //
  // Hedef ROLE gore ayriliyor (Faz J): musterinin paneli yok ve oraya
  // gonderilse panel duzeni onu geri atardi - yani kullanici iki yonlendirme
  // arasinda bir kez bos ekran gorurdu. Ayni ayrim /api/giris'te de var;
  // ikisi de gerekli, cunku buraya form doldurmadan da dusuluyor.
  const oturum = await auth();
  if (oturum) redirect(oturum.rol === "MUSTERI" ? "/randevularim" : "/panel");

  const parametreler = await searchParams;

  // `devam` proxy tarafindan ekleniyor (korunan bir sayfaya oturumsuz girildi).
  // Burada da guvenliYol'dan geciriyoruz: forma yalnizca temiz bir deger
  // gecsin, gecersiz olan sessizce dussun.
  const devam = guvenliYol(parametreler.devam) ?? undefined;

  return (
    <KimlikKabugu
      baslik="Giriş yap"
      // ISLETMEDEN BAHSETMIYOR (Faz J): bu ekran artik iki tur hesaba birden
      // hizmet ediyor ve "panelinize erismek icin" diyen bir baslik, randevusuna
      // bakmaya gelen musteriye yanlis kapiya geldigini dusundururdu.
      aciklama="E-posta ve şifrenizle hesabınıza girin."
      alt={{
        metin: "Hesabınız yok mu?",
        // Alt baglanti MUSTERI kaydina gidiyor, isletme kaydina degil: bu
        // sayfaya gelenlerin cogu musteri olacak ve isletme yolu zaten
        // /isletmeler-icin uzerinden kendi hunisini tasiyor.
        baglantiMetni: "Üye olun",
        yol: "/uye-ol",
      }}
    >
      <GirisFormu devam={devam} />
    </KimlikKabugu>
  );
}
