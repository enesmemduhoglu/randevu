import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { KimlikKabugu } from "@/components/kimlik/kabuk";
import { TamamlaFormu } from "@/components/kimlik/tamamla-formu";
import { auth, authKimligi } from "@/lib/auth";

// Yarida kalmis kaydin tek cikis kapisi.
//
// Boyle bir durum su zincirle olusuyor: /api/kayit once Supabase'de hesap
// aciyor, sonra isletme uclusunu yaziyor. Iki ayri sistem, aralarinda
// transaction yok - veritabani o an erisilemezse hesap acilmis ama kayit
// yazilmamis olur. O kisi icin auth() null donuyor, yani panele giremiyor;
// /giris'e gonderilse giris basarili olur ve dongu bir daha baslardi.

export const metadata: Metadata = {
  title: "Kaydı tamamlayın",
};

export default async function TamamlaSayfasi() {
  // Kaydi zaten tam olan buraya dusmemeli. Hedef ROLE gore ayriliyor (Faz J):
  // musterinin paneli yok.
  const oturum = await auth();
  if (oturum) redirect(oturum.rol === "MUSTERI" ? "/randevularim" : "/panel");

  const kimlik = await authKimligi();
  if (!kimlik) redirect("/giris"); // Supabase kimligi de yok

  return (
    <KimlikKabugu
      baslik="Kaydı tamamlayın"
      // "Isletme bilgileriniz" DEMIYOR (Faz J): bu ekrana artik musteri
      // kaydi yarida kalan biri de dusebiliyor ve ona isletmeden bahsetmek,
      // formun altindaki "musteri olarak tamamlayin" secenegini gormeden
      // yanlis kutuyu doldurmasina yol acardi.
      aciklama="Hesabınız açıldı ama kaydınız yarıda kalmış. Tek adım kaldı."
    >
      <p className="rounded-lg bg-muted px-3 py-2.5 text-sm">
        <span className="text-muted-foreground">Hesap: </span>
        <span className="break-all">{kimlik.eposta}</span>
      </p>

      <TamamlaFormu onAd={kimlik.ad ?? ""} />
    </KimlikKabugu>
  );
}
