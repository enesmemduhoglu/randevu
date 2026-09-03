import { authKimligi } from "@/lib/auth";
import { adDogrula } from "@/lib/girdi";
import { govdeOku, govdeOkunamadi } from "@/lib/govde";
import { musteriKaydiOlustur } from "@/lib/kayit";
import { checkOrigin } from "@/lib/origin";

// Yarida kalmis MUSTERI kaydini tamamlar.
//
// NEDEN AYRI BIR YOL GEREKTI. `/kayit/tamamla` Faz D'den beri var ve yaptigi
// sey bir ISLETME acmak. Faz J ikinci bir kayit yolu ekleyince o ekran sessizce
// yanlis hale geldi: musteri olmak icin uye olan birinin `kullanici` satiri
// yazilamazsa (Supabase'de hesap acildi, veritabani o an erisilemezdi),
// /api/giris onu /kayit/tamamla'ya gonderiyor ve orada karsisina "Isletme adi"
// kutusu cikiyordu. Doldurursa MUSTERI degil SAHIP oluyor - randevu almaya
// gelen kisi kendini bir isletme panelinde buluyor ve `kullanici_auth_user_id`
// tekil oldugu icin bunu geri almanin yolu da yok.
//
// Iki yolu tek route'ta birlestirmek ("hesapTuru" bayragi) denenmedi cunku
// ayrim govdeden gelen bir degere dusurulurdu; oysa hangi hesabin acilacagi
// kullanicinin ekranda VERDIGI karar ve iki ayri ucun iki ayri govdesi var.
//
// ADIM SIRASI BILINCLI (bkz. uye-ol-tamamla.test.ts):
//   1. checkOrigin  - DEGISMEZ 2, ilk satir
//   2. govde ayristirma
//   3. girdi dogrulama
//   4. ancak bundan SONRA kimlik / veritabani
//
// YANIT SOZLESMESI: hata `{ hata }`, basari `{ yon }`.

export async function POST(istek: Request) {
  const engel = checkOrigin(istek);
  if (engel) return engel;

  const govde = await govdeOku(istek);
  if (!govde) return govdeOkunamadi();

  const adSoyad = adDogrula(govde.adSoyad, "Ad soyad");
  if (!adSoyad.tamam) return Response.json({ hata: adSoyad.hata }, { status: 400 });

  // auth() DEGIL authKimligi(): auth() bizdeki `kullanici` satirini da ariyor
  // ve bulamayinca null donuyor - tam da bu route'a gelen herkes icin.
  const kimlik = await authKimligi();
  if (!kimlik) {
    return Response.json(
      { hata: "Oturum bulunamadı. Yeniden giriş yapın." },
      { status: 401 },
    );
  }

  let sonuc;
  try {
    sonuc = await musteriKaydiOlustur({
      authUserId: kimlik.authUserId,
      // E-posta token'dan geliyor, govdeden DEGIL: govdeden alsaydik kullanici
      // baskasinin adresini yazip kendi hesabini o adresle esleyebilirdi.
      eposta: kimlik.eposta,
      adSoyad: adSoyad.deger,
    });
  } catch {
    // DEGISMEZ 5: hata nesnesi ve govde loglanmiyor.
    console.error("uye-ol/tamamla: musteri kaydi yazilamadi");
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
    // DEGISMEZ 3: yarisan ikinci karar kaybediyor. Kullanici sekmeyi iki kez
    // gonderdiyse ya da /api/uye-ol'un gec biten cagrisi araya girdiyse burasi
    // 409 doner - ama `yon` da tasiyor, cunku kullanici acisindan is BITTI.
    //
    // NOT: bu dala ISLETME SAHIBI de dusebilir (ayni authUserId ile zaten bir
    // satir var). Onu da randevu listesine gonderiyoruz; orasi bos gorunse
    // bile ust bardan panele gecebiliyor. Rolu soyleyip ayri bir mesaj
    // vermenin karsiligi yok - kisi kendi hesabinda, sasiracagi bir sey degil.
    return Response.json(
      { hata: "Hesabınız zaten açılmış", yon: "/randevularim" },
      { status: 409 },
    );
  }

  return Response.json({ yon: "/randevularim" });
}
