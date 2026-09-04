import { auth } from "@/lib/auth";
import {
  bildirimleriYanittanSonraGonder,
  iptalBildirimleriniPlanla,
} from "@/lib/bildirim";
import { getMusteriDb } from "@/lib/musteri-db";
import { checkOrigin } from "@/lib/origin";
import { kimlikDogrula } from "@/lib/randevu-girdi";
import { CIKILAMAZ_ACIKLAMASI } from "@/lib/randevu-durum";
import { getHalkaAcikDb } from "@/lib/scoped-db";

// Musterinin kendi randevusunu HESABINDAN iptal etmesi (Faz J).
//
// `/api/randevu/iptal`IN YERINE GECMIYOR, yanina geliyor. O yol oturumsuz ve
// yetkiyi iptal token'i tasiyor - hesabi olmayan musterinin tek yolu ve oyle
// kalacak. Burasi ise sahiplige bakiyor: `/randevularim` listesindeki bir
// randevu icin kullaniciya token'ini sormak sacma olurdu, elinde zaten hesabi
// var.
//
// Iki yolun AYNI kararı vermesi onemli, o yuzden iptal edilebilir durum kumesi
// ("BEKLIYOR", "ONAYLI") tek yerde degil iki yerde ayni: ikisi de kosullu
// UPDATE'in where'inde. Ayrisirlarsa musteri linkten iptal edebildigi bir
// randevuyu hesabindan edemez (ya da tersi) ve sebebi hicbir ekranda yazmaz.
//
// Mutasyon oldugu icin `checkOrigin` ILK SATIR (DEGISMEZ 2). `panelKapisi`
// kullanilamiyor: o `isletmeOturumu` istiyor ve musteri oradan gecemiyor.
//
// Yanit ONBELLEKLENMIYOR: iptal karari anlik ve bayat bir "iptal edildi"
// cevabi, duran bir randevuyu iptal edilmis gostermek olurdu.

const ONBELLEKSIZ = { "cache-control": "no-store" };

/// Randevu bu hesaba ait DEGIL - ya da hic yok. IKISI AYNI CEVABI ALIYOR:
/// baskasinin randevu id'siyle var olmayan bir id disaridan ayirt
/// edilememeli, yoksa cagiran taraf id deneyerek hangi randevularin var
/// oldugunu ogrenirdi.
const RANDEVU_YOK = "Randevu bulunamadı.";

function hata(mesaj: string, durum: number): Response {
  return Response.json({ hata: mesaj }, { status: durum, headers: ONBELLEKSIZ });
}

export async function POST(
  istek: Request,
  ctx: RouteContext<"/api/randevularim/[id]/iptal">,
) {
  const csrf = checkOrigin(istek);
  if (csrf) return csrf;

  const oturum = await auth();
  if (!oturum) return hata("Oturum bulunamadı. Yeniden giriş yapın.", 401);

  const { id } = await ctx.params;

  // Bicim kontrolu veritabanina gitmeden once: `uuid` kolonuna "abc"
  // gonderilirse Postgres 22P02 firlatir ve bu 500'e donerdi, oysa bozuk bir
  // id istemcinin hatasi.
  const randevuId = kimlikDogrula(id, "Randevu");
  if (!randevuId.tamam) return hata(RANDEVU_YOK, 404);

  const db = await getMusteriDb(oturum.kullaniciId);

  // DEGISMEZ 3: ONCE kosullu UPDATE. Sahiplik ve beklenen durum `where`'de
  // duruyor (musteri-db.ts > randevuIptalEt), yani ayni randevuya iki sekmeden
  // basildiginda ikincisi 0 satir etkiliyor ve kaybediyor.
  //
  // IDOR kapisi ayni `where` icinde: baskasinin randevu id'si 0 satir
  // etkiliyor ve asagida "bulunamadi" olarak cikiyor.
  const iptalEdilen = await db.randevuIptalEt(randevuId.deger);

  if (iptalEdilen) {
    // BILDIRIM KARARIN ARDINDAN (Faz I akisi). Kuyruk KIRACI kapsamli, yani
    // randevunun isletmesine ait bir kapi gerekiyor; slug istemciden DEGIL
    // iptal edilen randevunun kendisinden geliyor - istemciden alsaydik baska
    // bir salonun kuyruguna yazdirmanin yolu olurdu.
    //
    // HATASI YUTULUYOR: randevu ZATEN iptal edildi. Kuyruga yazamamak
    // yuzunden 500 donseydi musteri iptalin gerceklestigini ogrenemez ve
    // tekrar denerdi - bu kez 409 alip "iptal edilemedi" sanirdi. Bildirim,
    // kararin kendisinden daha az onemli.
    const simdi = new Date();
    try {
      const kiraciKapisi = await getHalkaAcikDb(iptalEdilen.isletmeSlug);
      if (kiraciKapisi) {
        await iptalBildirimleriniPlanla(kiraciKapisi, iptalEdilen.id, simdi);
        bildirimleriYanittanSonraGonder(kiraciKapisi, iptalEdilen.id, simdi);
      }
    } catch {
      // Yukaridaki gerekce. Randevu iptal, bildirim gitmiyor - ve yazilabilmis
      // satirlari Faz K'nin cron'u yine bulur.
    }

    return Response.json({ iptal: true }, { headers: ONBELLEKSIZ });
  }

  // Buradaki okuma karari DEGISTIRMIYOR, yalnizca 0 satirin iki sebebini
  // ayiriyor: randevu bu hesabin degil mi (404), yoksa hesabin ama durumu
  // artik uygun degil mi (409)? Yazmadan once degil YAZDIKTAN SONRA
  // okunuyor - sira tersine donseydi DEGISMEZ 3 bozulurdu.
  const durum = await db.randevuDurumunuGetir(randevuId.deger);
  if (!durum) return hata(RANDEVU_YOK, 404);

  // Neden olmadigini soyluyoruz, yoksa kullanici ayni dugmeye tekrar basar.
  // Metin panelinkiyle ayni kaynaktan (randevu-durum.ts): iki ekranda ayni
  // durumun iki ayri adla anilmasi, musteriyle isletmenin telefonda farkli
  // seyler soylemesi demekti.
  return hata(CIKILAMAZ_ACIKLAMASI[durum], 409);
}
