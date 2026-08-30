import { authKimligi } from "@/lib/auth";
import { adDogrula } from "@/lib/girdi";
import { govdeOku, govdeOkunamadi } from "@/lib/govde";
import { isletmeKaydiOlustur } from "@/lib/kayit";
import { checkOrigin } from "@/lib/origin";

// Yarida kalmis kaydi tamamlar: Supabase'de hesabi olan ama bizde `kullanici`
// satiri olmayan kisi icin.
//
// Boyle bir kisi nasil olusuyor? /api/kayit once Supabase'de hesap aciyor,
// sonra isletme uclusunu yaziyor. Ikisi ayri sistem, yani aralarinda
// transaction yok: veritabani o an erisilemezse hesap acilmis, kayit
// yazilmamis olur. auth() bu kisi icin null donuyor, yani panele giremiyor.
// Bu route donguyu kiran yer.
//
// ADIM SIRASI BILINCLI (bkz. tamamla.test.ts):
//   1. checkOrigin  - DEGISMEZ 2, ilk satir
//   2. govde ayristirma
//   3. girdi dogrulama
//   4. ancak bundan SONRA kimlik / veritabani
// Ilk uc adim ag'a hic cikmiyor; bu dilim Postgres'siz ve Supabase'siz
// sinanabiliyor.
//
// YANIT SOZLESMESI: hata `{ hata }`, basari `{ yon }`.

export async function POST(istek: Request) {
  const engel = checkOrigin(istek);
  if (engel) return engel;

  const govde = await govdeOku(istek);
  if (!govde) return govdeOkunamadi();

  const isletmeAdi = adDogrula(govde.isletmeAdi, "İşletme adı");
  if (!isletmeAdi.tamam) {
    return Response.json({ hata: isletmeAdi.hata }, { status: 400 });
  }

  const adSoyad = adDogrula(govde.adSoyad, "Ad soyad");
  if (!adSoyad.tamam) return Response.json({ hata: adSoyad.hata }, { status: 400 });

  // auth() DEGIL authKimligi(): auth() bizdeki `kullanici` satirini da ariyor
  // ve bulamayinca null donuyor - tam da bu route'a gelen herkes icin. Burada
  // gereken tek sey token'daki kimlik.
  const kimlik = await authKimligi();
  if (!kimlik) {
    return Response.json(
      { hata: "Oturum bulunamadı. Yeniden giriş yapın." },
      { status: 401 },
    );
  }

  let sonuc;
  try {
    sonuc = await isletmeKaydiOlustur({
      authUserId: kimlik.authUserId,
      // E-posta token'dan geliyor, govdeden DEGIL: govdeden alsaydik kullanici
      // baskasinin adresini yazip kendi hesabini o adresle esleyebilirdi.
      eposta: kimlik.eposta,
      adSoyad: adSoyad.deger,
      isletmeAdi: isletmeAdi.deger,
    });
  } catch {
    // DEGISMEZ 5: hata nesnesi ve govde loglanmiyor.
    console.error("kayit/tamamla: isletme kaydi yazilamadi");
    return Response.json(
      {
        hata:
          "Kayıt tamamlanamadı. Bağlantıda bir sorun oldu, birkaç saniye sonra " +
          "tekrar deneyin.",
      },
      { status: 500 },
    );
  }

  if (sonuc.durum === "zaten-kayitli") {
    // DEGISMEZ 3: yarisan ikinci karar kaybeder. Kullanici sekmeyi iki kez
    // gonderdiyse ya da /api/kayit'in gec biten cagrisi araya girdiyse burasi
    // 409 doner - ama `yon` da tasiyor, cunku kullanici acisindan is BITTI:
    // kaydi zaten var, panele gitmesi gerekiyor. Hata durumu bir cikmaz
    // olmamali.
    return Response.json(
      { hata: "Kayıt zaten tamamlanmış", yon: "/panel" },
      { status: 409 },
    );
  }

  if (sonuc.durum === "slug-uretilemedi") {
    return Response.json(
      { hata: "İşletme adı en az bir harf içermeli" },
      { status: 400 },
    );
  }

  return Response.json({ yon: "/panel" });
}
