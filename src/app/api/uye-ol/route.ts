import { adDogrula, epostaDogrula, sifreDogrula } from "@/lib/girdi";
import { govdeOku, govdeOkunamadi } from "@/lib/govde";
import { musteriKaydiOlustur } from "@/lib/kayit";
import { checkOrigin } from "@/lib/origin";
import { kayitHatasi, zatenKayitliMi } from "@/lib/supabase/hata";
import { supabaseSunucu } from "@/lib/supabase/sunucu";

// Musteri hesabi acma (Faz J).
//
// `/api/kayit`IN IKIZI DEGIL. O yol isletme aciyor: uc kayit, slug uretimi,
// yarim kalan kaydi kurtaran ayri bir tamamlama ekrani. Burada yazilacak tek
// satir var ve isletme adi hic sorulmuyor, yani o akisin karmasikliginin
// karsiligi yok. Ikisini tek route'ta bir bayrakla toplamak, her okuyanin
// "bu dal hangi kullanici icin" diye izlemek zorunda kalacagi bir govde
// uretirdi.
//
// ADIM SIRASI BILINCLI (`/api/kayit` ile ayni, bkz. uye-ol.test.ts):
//   1. checkOrigin  - DEGISMEZ 2, ilk satir
//   2. govde ayristirma
//   3. girdi dogrulama
//   4. ancak bundan SONRA Supabase / veritabani
// Ilk uc adim ag'a hic cikmiyor; bu dilim Postgres'siz ve Supabase'siz
// sinanabiliyor. Dogrulamanin hesap acmadan ONCE bitmesi ayrica onemli:
// gecersiz bir adla acilan Supabase hesabi geri alinamaz, sahipsiz kalirdi.
//
// YANIT SOZLESMESI: hata `{ hata }`, basari `{ yon }` (+ gerekiyorsa `mesaj`).

/// Hesap sayimini (enumeration) engelleyen TEK metin. "Bu adres musteri olarak
/// kayitli" ile "isletme olarak kayitli" ayrimi yapmak, bir e-posta listesini
/// deneyip kimin nerede kayitli oldugunu ogrenmeye kapi acardi.
const ZATEN_VAR = "Bu e-posta ile bir hesap zaten var. Giriş yapın.";

export async function POST(istek: Request) {
  const engel = checkOrigin(istek);
  if (engel) return engel;

  const govde = await govdeOku(istek);
  if (!govde) return govdeOkunamadi();

  const adSoyad = adDogrula(govde.adSoyad, "Ad soyad");
  if (!adSoyad.tamam) return Response.json({ hata: adSoyad.hata }, { status: 400 });

  const eposta = epostaDogrula(govde.eposta);
  if (!eposta.tamam) return Response.json({ hata: eposta.hata }, { status: 400 });

  // Yeni sifre belirleniyor, yani TAM kural gecerli. (Giriste ayni kontrol
  // yapilmiyor; gerekcesi src/app/api/giris/route.ts'te.)
  const sifre = sifreDogrula(govde.sifre);
  if (!sifre.tamam) return Response.json({ hata: sifre.hata }, { status: 400 });

  const supabase = await supabaseSunucu();
  const { data, error } = await supabase.auth.signUp({
    email: eposta.deger,
    password: sifre.deger,
    options: { data: { ad: adSoyad.deger } },
  });

  if (error) {
    if (zatenKayitliMi(error)) {
      return Response.json({ hata: ZATEN_VAR }, { status: 409 });
    }
    const cevap = kayitHatasi(error);
    return Response.json({ hata: cevap.hata }, { status: cevap.durum });
  }

  const authKullanici = data.user;
  if (!authKullanici) {
    return Response.json(
      {
        hata:
          "Kayıt tamamlanamadı. Bağlantıda bir sorun oldu, birkaç saniye sonra " +
          "tekrar deneyin.",
      },
      { status: 502 },
    );
  }

  // IKINCI "zaten kayitli" YOLU - gerekcesi /api/kayit'te uzun uzun yazili:
  // Supabase'in "hesap sayimini engelle" ayari acikken signUp var olan bir
  // adres icin hata DONMUYOR, tek isareti `identities` dizisinin bos olmasi.
  if (Array.isArray(authKullanici.identities) && authKullanici.identities.length === 0) {
    return Response.json({ hata: ZATEN_VAR }, { status: 409 });
  }

  let sonuc;
  try {
    sonuc = await musteriKaydiOlustur({
      authUserId: authKullanici.id,
      eposta: eposta.deger,
      adSoyad: adSoyad.deger,
    });
  } catch {
    // DEGISMEZ 5: ne hata nesnesi ne govde loglaniyor - ikisi de e-posta ve
    // sifre tasiyor.
    console.error("uye-ol: musteri kaydi yazilamadi");
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
    // Supabase hesabi yeni acildi ama bizde o authUserId'ye ait bir satir
    // zaten vardi. Pratikte tek sebebi ayni formun iki kez gonderilmesi -
    // DEGISMEZ 3'un bu yoldaki karsiligi, yarisan ikinci istek kaybediyor.
    // `yon` da tasiyor cunku kullanici acisindan is BITTI.
    return Response.json(
      { hata: "Hesabınız zaten açılmış", yon: "/randevularim" },
      { status: 409 },
    );
  }

  if (!data.session) {
    // Supabase'de "Confirm email" ACIK: hesap olustu, oturum yok.
    return Response.json({
      yon: "/giris",
      mesaj:
        "Hesabınız oluşturuldu. E-posta adresinize gönderilen bağlantıya " +
        "tıklayıp giriş yapın.",
    });
  }

  return Response.json({ yon: "/randevularim" });
}
