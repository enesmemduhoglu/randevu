import { adDogrula, epostaDogrula, sifreDogrula } from "@/lib/girdi";
import { govdeOku, govdeOkunamadi } from "@/lib/govde";
import { isletmeKaydiOlustur } from "@/lib/kayit";
import { checkOrigin } from "@/lib/origin";
import { supabaseSunucu } from "@/lib/supabase/sunucu";

// Kayit: Supabase'de hesap acar, ardindan isletme + sahip + varsayilan personel
// uclusunu tek transaction'da yazar.
//
// ADIM SIRASI BILINCLI (bkz. kayit.test.ts):
//   1. checkOrigin  - DEGISMEZ 2, ilk satir
//   2. govde ayristirma
//   3. girdi dogrulama
//   4. ancak bundan SONRA Supabase / veritabani
// Ilk uc adim ag'a hic cikmiyor; bu dilim Postgres'siz ve Supabase'siz
// sinanabiliyor. Ayrica dogrulamanin hesap acmadan ONCE bitmesi onemli:
// gecersiz bir isletme adiyla acilan Supabase hesabi geri alinamaz, sahipsiz
// kalirdi.
//
// YANIT SOZLESMESI: hata `{ hata }`, basari `{ yon }` (+ gerekiyorsa `mesaj`).

/// Supabase "bu e-posta zaten kayitli" diyor mu?
///
/// Tip bildirimi yerine alan kontrolu: AuthError'in `code` alani surumle
/// birlikte geldi, eski surumlerde yalnizca `message` vardi. Iki yolu da
/// okumak, SDK yukseltmesinde bu dalin sessizce olmesini engelliyor.
function zatenKayitliHatasi(hata: unknown): boolean {
  if (typeof hata !== "object" || hata === null) return false;

  const alanlar = hata as { code?: unknown; message?: unknown };
  if (alanlar.code === "user_already_exists") return true;

  return (
    typeof alanlar.message === "string" &&
    alanlar.message.toLowerCase().includes("already registered")
  );
}

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

  const eposta = epostaDogrula(govde.eposta);
  if (!eposta.tamam) return Response.json({ hata: eposta.hata }, { status: 400 });

  // Burada TAM sifre kurali gecerli: kullanici yeni bir sifre belirliyor, yani
  // uzunluk sinirini simdi koymanin bedeli yok. (Giriste ayni kontrol yapilmaz;
  // gerekcesi src/app/api/giris/route.ts'te.)
  const sifre = sifreDogrula(govde.sifre);
  if (!sifre.tamam) return Response.json({ hata: sifre.hata }, { status: 400 });

  const supabase = await supabaseSunucu();
  const { data, error } = await supabase.auth.signUp({
    email: eposta.deger,
    password: sifre.deger,
    // `ad` kullanici meta verisine yaziliyor. Tek isi kayit yarida kalirsa
    // /kayit/tamamla formunu on doldurmak; guvenilir bir alan degil, kaydin
    // kendisi her zaman bizim `kullanici` tablomuzdan okunuyor.
    options: { data: { ad: adSoyad.deger } },
  });

  if (error) {
    if (zatenKayitliHatasi(error)) {
      return Response.json(
        { hata: "Bu e-posta ile bir hesap zaten var. Giriş yapın." },
        { status: 409 },
      );
    }
    // DEGISMEZ 5: saglayicinin hata metni govdeye girmiyor.
    return Response.json(
      {
        hata:
          "Kayıt tamamlanamadı. Bağlantıda bir sorun oldu, birkaç saniye sonra " +
          "tekrar deneyin.",
      },
      { status: 502 },
    );
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

  // IKINCI "zaten kayitli" YOLU. Supabase'in "hesap sayimini engelle" ayari
  // acikken signUp var olan bir adres icin HATA DONMUYOR: sahte bir kullanici
  // nesnesi doner ve tek isareti `identities` dizisinin bos olmasidir. Ayar
  // kapaliyken ise yukaridaki hata dali calisir. Hangi ayarin acik oldugunu
  // uygulama bilmedigi icin iki yol da ele aliniyor.
  if (Array.isArray(authKullanici.identities) && authKullanici.identities.length === 0) {
    return Response.json(
      { hata: "Bu e-posta ile bir hesap zaten var. Giriş yapın." },
      { status: 409 },
    );
  }

  let sonuc;
  try {
    sonuc = await isletmeKaydiOlustur({
      authUserId: authKullanici.id,
      eposta: eposta.deger,
      adSoyad: adSoyad.deger,
      isletmeAdi: isletmeAdi.deger,
    });
  } catch {
    // KRITIK DURUM: Supabase'de hesap acildi ama bizde satir olusmadi, yani
    // ortada kiracisi olmayan bir kimlik kaldi. Hesabi silemiyoruz (anon
    // anahtar buna yetkili degil), o yuzden yapilabilecek en iyi sey oturumu
    // kapatip kullaniciyi tamamlama akisina birakmak: bir sonraki giriste
    // /api/giris bu kisiyi /kayit/tamamla'ya gonderiyor ve kayit oradan devam
    // ediyor.
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Cikis da basarisizsa akisi kesmiyoruz; kullaniciya donen cevap ayni.
    }

    // DEGISMEZ 5: ne hata nesnesi ne govde loglaniyor - ikisi de e-posta ve
    // sifre tasiyor. Sabit metin, kaydin hangi asamada koptugunu soylemeye
    // yetiyor; ayrintiyi Postgres'in kendi loglari zaten tutuyor.
    console.error("kayit: isletme kaydi yazilamadi");

    return Response.json(
      {
        hata:
          "Kayıt tamamlanamadı. Hesabınız açıldı ama işletme bilgileri " +
          "kaydedilemedi, giriş yaptığınızda kayıt kaldığı yerden devam edecek.",
      },
      { status: 500 },
    );
  }

  if (sonuc.durum === "zaten-kayitli") {
    return Response.json(
      { hata: "Bu hesap için kayıt zaten tamamlanmış. Giriş yapın." },
      { status: 409 },
    );
  }

  if (sonuc.durum === "slug-uretilemedi") {
    // Ad yalnizca noktalama ya da emoji ise slug bos cikiyor; isletmenin
    // randevu sayfasi adresi bu slug'dan uretildigi icin bos kabul edilemez.
    return Response.json(
      { hata: "İşletme adı en az bir harf içermeli" },
      { status: 400 },
    );
  }

  if (!data.session) {
    // Supabase'de "Confirm email" ACIK: hesap olustu ama oturum yok. Kullaniciyi
    // panele gondermek anlamsiz - orada oturumsuz karsilanip geri atilirdi.
    return Response.json({
      yon: "/giris",
      mesaj:
        "Hesabınız oluşturuldu. E-posta adresinize gönderilen bağlantıya " +
        "tıklayıp giriş yapın.",
    });
  }

  return Response.json({ yon: "/panel" });
}
