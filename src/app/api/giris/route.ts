import { kullaniciyiYukle } from "@/lib/auth";
import { epostaDogrula, guvenliYol } from "@/lib/girdi";
import { govdeOku, govdeOkunamadi } from "@/lib/govde";
import { checkOrigin } from "@/lib/origin";
import { hizSiniriMi, hizSiniriYaniti } from "@/lib/supabase/hata";
import { supabaseSunucu } from "@/lib/supabase/sunucu";

// Giris: e-posta ve sifreyle Supabase oturumu acar, sonra kullaniciyi nereye
// gonderecegimizi soyler.
//
// ADIM SIRASI BILINCLI (bkz. giris.test.ts):
//   1. checkOrigin  - DEGISMEZ 2, ilk satir
//   2. govde ayristirma
//   3. girdi dogrulama
//   4. ancak bundan SONRA Supabase / veritabani
// Ilk uc adim ag'a hic cikmadigi icin route'un bu dilimi Postgres'siz ve
// Supabase'siz sinanabiliyor. Sira degisirse test dayanagini kaybeder ve
// yabanci bir origin'den gelen istek bosuna ag turu uretmeye baslar.
//
// YANIT SOZLESMESI: hata `{ hata }`, basari `{ yon }`. Istemci `yon` degerini
// `router.replace` ile kullaniyor; burada `Response.redirect` DONULMUYOR -
// fetch ile atilan bir istekte 30x yaniti tarayici sessizce izler ve istemci
// nereye gidildigini ogrenemez.

export async function POST(istek: Request) {
  const engel = checkOrigin(istek);
  if (engel) return engel;

  const govde = await govdeOku(istek);
  if (!govde) return govdeOkunamadi();

  const eposta = epostaDogrula(govde.eposta);
  if (!eposta.tamam) return Response.json({ hata: eposta.hata }, { status: 400 });

  // GIRISTE `sifreDogrula` KULLANILMIYOR, yalnizca bosluk kontrolu var.
  //
  // Gerekce: sifreDogrula "en az 8 karakter" gibi YENI sifre kurallarini
  // uyguluyor. Var olan bir hesabin sifresi bu kurallar sikilasmadan once
  // belirlenmis olabilir; onu giriste "gecersiz" diye reddetmek sahibini kendi
  // hesabindan disari kilitler ve hata mesaji da yaniltici olur - sifre kisa
  // degil, yanlis degil, sadece eski. Sifrenin dogrulugunu tek yetkili merci
  // Supabase; biz sadece kutunun bos olup olmadigina bakiyoruz.
  const sifre = govde.sifre;
  if (typeof sifre !== "string" || sifre.length === 0) {
    return Response.json({ hata: "Şifre gerekli" }, { status: 400 });
  }

  const supabase = await supabaseSunucu();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: eposta.deger,
    password: sifre,
  });

  // Hiz siniri "sifre yanlis" DEGIL. Ayni mesaji verseydik kullanici sifresini
  // yanlis hatirladigini sanip tekrar tekrar denerdi - ve her deneme siniri
  // biraz daha uzatirdi.
  if (hizSiniriMi(error)) {
    const cevap = hizSiniriYaniti();
    return Response.json({ hata: cevap.hata }, { status: cevap.durum });
  }

  if (error || !data.user) {
    // TEK MESAJ, iki ayri durum icin. "Boyle bir hesap yok" ile "sifre yanlis"
    // ayrimini yapmak hesap sayimina (enumeration) kapi acar: saldirgan bir
    // e-posta listesini deneyip hangilerinin bizde kayitli oldugunu ogrenir.
    //
    // DEGISMEZ 5: Supabase'in hata metni govdeye KONMUYOR. Saglayici mesajlari
    // zaman zaman ic ayrinti (rate limit penceresi, saglayici adi) tasiyor ve
    // bunlarin kullaniciya bir faydasi yok.
    return Response.json({ hata: "E-posta ya da şifre hatalı" }, { status: 401 });
  }

  const kayit = await kullaniciyiYukle(data.user.id);

  if (!kayit) {
    // Supabase'de hesap var ama bizde `kullanici` satiri yok: kayit akisi
    // yarida kalmis. Panele gondermek sonsuz donguye girerdi - auth() bu kisi
    // icin null donuyor, proxy onu /giris'e atiyor, giris yine panele...
    // Tamamlama ekrani donguyu kiran tek hedef.
    return Response.json({ yon: "/kayit/tamamla" });
  }

  if (kayit.rol === "MUSTERI") {
    // Musteri hesabinin paneli yok; kendi randevu listesine gidiyor (Faz J).
    //
    // `devam` degeri kasitli olarak YOK SAYILIYOR: o parametre korunan bir
    // sayfaya oturumsuz girildiginde ekleniyor ve korunan sayfalarin hepsi
    // panel yollari. Musteriyi oraya gondermek, onu erisemeyecegi bir sayfaya
    // birakip geri attirirdi.
    return Response.json({ yon: "/randevularim" });
  }

  // `devam` kullanicinin URL'inden geliyor; guvenliYol acik yonlendirme
  // kapisi. Suphede birakilan deger null donuyor ve panele dusuyoruz.
  return Response.json({ yon: guvenliYol(govde.devam) ?? "/panel" });
}
