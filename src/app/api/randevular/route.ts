import {
  bildirimleriYanittanSonraGonder,
  elleRandevuKayitlari,
} from "@/lib/bildirim";
import { iptalTokenUret } from "@/lib/iptal-token";
import { slotSec } from "@/lib/musaitlik-sorgu";
import { panelRandevuAlanlariniDogrula } from "@/lib/panel-randevu-girdi";
import { bulunamadi, gecersiz, panelKapisi } from "@/lib/panel-kapisi";

// PANELDEN elle randevu ekleme (Faz H2).
//
// Urunun isletme tarafindaki en buyuk fonksiyonel boslugunu kapatiyor:
// telefonla gelen randevu bugune kadar panele girilemiyordu.
//
// YOL ADI: halka acik yollar `/api/randevu` (tekil, oturumsuz), panelin
// yollari `/api/randevular` (cogul, oturumlu) - ayrim `[id]/durum`
// route'unda anlatiliyor.
//
// CSRF kapisi (DEGISMEZ 2) panelKapisi'nin ilk satirinda.
//
// TURNSTILE VE HIZ SINIRI YOK, halka acik yolun aksine. Ikisi de oturumsuz
// yolun kotuye kullanimina karsiydi; buraya gelen istek zaten bir isletme
// oturumu tasiyor ve kendi takvimini dolduran isletmeye karsi korunacak bir
// sey yok.

/// Motorun uygun bulmadigi saatte donen govde bunu tasiyor: istemci
/// kullaniciya "yine de eklensin mi" diye soruyor ve ikinci istegi
/// `zorla: true` ile gonderiyor.
const ZORLANABILIR = { zorlanabilir: true };

export async function POST(istek: Request) {
  const kapi = await panelKapisi(istek);
  if ("engel" in kapi) return kapi.engel;

  const alanlar = panelRandevuAlanlariniDogrula(kapi.govde);
  if (!alanlar.tamam) return gecersiz(alanlar.hata);

  const isletme = await kapi.db.isletmeyiGetir();
  // Kayit uclusu tek transaction'da yaziliyor, yani bos donmesi beklenmiyor.
  if (!isletme) return bulunamadi("İşletme");

  // Hizmet KAPSAMLI sorguyla getiriliyor: baska isletmenin hizmet id'si burada
  // bos donuyor ve "bulunamadi" olarak cikiyor. Pasif hizmet de reddediliyor -
  // artik verilmeyen bir hizmete randevu yazmak, takvimde aciklanamayan bir
  // satir birakirdi.
  const hizmet = await kapi.db.hizmetGetir(alanlar.deger.hizmetId);
  if (!hizmet || !hizmet.aktif) return bulunamadi("Hizmet");

  // `simdi` BIR KEZ okunuyor: musaitlik penceresi ile bildirim zamanlamasi
  // ayni ana bakmali.
  const simdi = new Date();

  // Motor ONCE deneniyor - serbest saat istisna, kural degil. Uygun bulursa
  // bitis ve dogrulanmis personel oradan geliyor; bulamazsa istemcinin
  // bilincli onayi (`zorla`) araniyor.
  const slot = await slotSec({
    db: kapi.db,
    isletme,
    hizmetId: hizmet.id,
    hizmetSuresiDk: hizmet.sureDk,
    baslangic: alanlar.deger.baslangic,
    simdi,
    personelId: alanlar.deger.personelId,
  });

  if (!slot && !alanlar.deger.zorla) {
    return Response.json(
      {
        hata:
          "Bu saat çalışma saatlerinin dışında ya da dolu görünüyor. " +
          "Yine de eklemek istiyor musunuz?",
        ...ZORLANABILIR,
      },
      { status: 409 },
    );
  }

  // Bitis GERCEK sureyle hesaplaniyor, duvar saatiyle degil: 60 dakikalik bir
  // hizmet yaz saati gecisinde de 60 dakika suruyor. Motor da ayni hesabi
  // yapiyor (musaitlik.ts > uygunSaatler) - ikisi ayrisirsa cakisma kisiti
  // motorun gormedigi bir araligi reddederdi.
  const bitis =
    slot?.bitis ??
    new Date(alanlar.deger.baslangic.getTime() + hizmet.sureDk * 60000);

  const iptalToken = iptalTokenUret();

  const sonuc = await kapi.db.randevuElleOlustur({
    personelId: alanlar.deger.personelId,
    hizmetId: hizmet.id,
    baslangic: alanlar.deger.baslangic,
    bitis,
    musteriAd: alanlar.deger.musteriAd,
    telefon: alanlar.deger.telefon,
    eposta: alanlar.deger.eposta,
    not: alanlar.deger.not,
    iptalToken,
  });

  if (sonuc.durum === "yok") {
    // Personel ya da hizmet baska kiraciya ait, pasif, ya da hic yok - ucu de
    // cagirana AYNI gorunmeli, yoksa kaydin varligi sizar.
    return bulunamadi("Personel");
  }

  if (sonuc.durum === "dolu") {
    // Cakisma kisiti reddetti (DEGISMEZ 8). `zorla` bunu ASMIYOR ve asmamali:
    // serbestlik calisma saatine karsi, ayni personelin ustuste iki randevusuna
    // karsi degil.
    return Response.json(
      { hata: "Bu personelin o saatte başka bir randevusu var." },
      { status: 409 },
    );
  }

  // BILDIRIM (Faz I). Musteriye onay ve hatirlatma gidiyor, isletmeye bir sey
  // gitmiyor - gerekcesi `elleRandevuKayitlari`nin yaninda.
  //
  // HATASI YUTULUYOR: randevu ZATEN yazildi ve slot tutuldu. Kuyruga
  // yazamamak yuzunden 500 donmek, isletmeye "olmadi" deyip takvimde duran bir
  // randevu birakmak olurdu - isletme tekrar dener, bu kez "dolu" alir ve
  // sebebini anlamaz.
  try {
    await kapi.db.bildirimKuyrugunaYaz(
      elleRandevuKayitlari({
        randevuId: sonuc.randevu.id,
        baslangic: sonuc.randevu.baslangic,
        simdi,
      }),
    );
    bildirimleriYanittanSonraGonder(kapi.db, sonuc.randevu.id, simdi);
  } catch {
    // Yukaridaki gerekce. Randevu duruyor, bildirim gitmiyor.
  }

  return Response.json(
    {
      randevu: {
        id: sonuc.randevu.id,
        baslangic: sonuc.randevu.baslangic.toISOString(),
        bitis: sonuc.randevu.bitis.toISOString(),
        durum: sonuc.randevu.durum,
      },
      // Saatin motor disinda oldugu istemciye SOYLENIYOR: onay ekrani
      // "çalışma saatleri dışına eklendi" diyebilsin, isletme yanlislikla
      // yazdiysa hemen gorsun.
      serbestSaat: slot === null,
    },
    { status: 201 },
  );
}
