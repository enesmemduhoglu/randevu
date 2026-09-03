import { auth } from "@/lib/auth";
import { govdeOku, govdeOkunamadi } from "@/lib/govde";
import { iptalTokenGecerliMi } from "@/lib/iptal-token";
import { getMusteriDb } from "@/lib/musteri-db";
import { checkOrigin } from "@/lib/origin";

// Elde iptal linki olan randevuyu hesaba ekler (Faz J).
//
// NEDEN TELEFONLA DEGIL. Plandaki cumle "misafir randevusunu telefon/e-posta
// eslesmesiyle hesaba baglama" idi; o yol bilerek SECILMEDI. `musteri` satiri
// kiraci basina ve telefonla tekilleniyor, telefon ise bugun dogrulanmis bir
// kimlik degil (SMS Faz K'de). Numaraya bakip eslestirseydik, baskasinin
// numarasini yazan biri o numaranin salondaki tum gecmisini sahiplenirdi.
//
// Token ise tam olarak dogru seyi kanitliyor: "bu randevu benim". Onu yalnizca
// randevuyu alan kisi gordu - e-postasinda ya da randevu ekraninda.
//
// IKI CAGIRAN YERI VAR ve ikisi de ayni ucu kullaniyor:
//   1. Randevu alirken oturumu acik olan kisi (randevu-formu, 201 yanitindaki
//      token'la hemen cagiriyor).
//   2. Sonradan giris yapip elindeki eski linki ekleyen kisi.
// Ikisini ayirmanin gerekcesi olmadigi icin tek yol var - ve tek yol olmasi,
// sahiplenmenin TEK kuralinin ("token'i gosteren sahiplenir") tek yerde
// durmasi demek.
//
// Mutasyon oldugu icin `checkOrigin` ILK SATIR (DEGISMEZ 2). `panelKapisi`
// kullanilamiyor: o yardimci `isletmeOturumu` istiyor ve musteri oradan
// gecemiyor - tam da gecmemesi gerektigi icin.
//
// Yanit ONBELLEKLENMIYOR: istek token tasiyor ve sonuc oturuma ozel.

const ONBELLEKSIZ = { "cache-control": "no-store" };

function hata(mesaj: string, durum: number): Response {
  return Response.json({ hata: mesaj }, { status: durum, headers: ONBELLEKSIZ });
}

export async function POST(istek: Request) {
  const csrf = checkOrigin(istek);
  if (csrf) return csrf;

  const govde = await govdeOku(istek);
  if (!govde) return govdeOkunamadi();

  // Bicim kontrolu KIMLIKTEN ONCE degil, SONRA olsaydi da olurdu - ama once
  // olmasi bozuk bir linkin oturum sorgusu actirmasini engelliyor ve zamanlama
  // farkindan token uzunlugunu okumayi zorlastiriyor (gerekcenin tamami
  // iptal-token.ts icinde).
  const token = govde.token;
  if (!iptalTokenGecerliMi(token)) {
    return hata("Randevu bağlantısı geçerli görünmüyor.", 400);
  }

  // ROL KOSULU YOK, bilerek: filtre `kullaniciId` oldugu icin guvenlik role
  // bagli degil (gerekcesi musteri-db.ts'in basinda).
  const oturum = await auth();
  if (!oturum) {
    return hata("Oturum bulunamadı. Yeniden giriş yapın.", 401);
  }

  const db = await getMusteriDb(oturum.kullaniciId);
  const sonuc = await db.randevuyuHesabaEkle(token);

  if (sonuc.durum === "eklendi" || sonuc.durum === "zaten-benim") {
    // IKISI AYNI YANITI ALIYOR. "Zaten eklenmisti" demek kullaniciya hicbir
    // sey katmiyor - istedigi sey randevunun listesinde olmasi ve o saglandi.
    // Ayri bir mesaj vermek, ayni linke iki kez basmayi bir hata gibi
    // gosterirdi.
    return Response.json(
      { eklendi: true, randevuId: sonuc.randevuId },
      { headers: ONBELLEKSIZ },
    );
  }

  if (sonuc.durum === "baskasinin") {
    // 409, 403 DEGIL. Randevu var ve baska bir hesaba bagli; bu bir yetki
    // reddi degil, cakisan bir durum - ve kullanicinin yapabilecegi bir sey
    // var (yanlis linki actiysa dogru olani acmak).
    //
    // Mesaj randevu hakkinda HICBIR SEY soylemiyor: hangi isletme, hangi
    // saat, kime bagli. Token'i eline gecirmis biri, buradan doneni okuyarak
    // randevunun varligindan otesini ogrenememeli.
    return hata(
      "Bu randevu başka bir hesaba bağlı. Randevuyu alırken kullandığınız " +
        "hesapla giriş yapın.",
      409,
    );
  }

  // DEGISMEZ 5: mesaj token'in KENDISINI tasimiyor - hata metinleri log'lara
  // ve tarayici gecmisine dusuyor, oysa bu deger tek basina yetki.
  return hata(
    "Randevu bulunamadı. Bağlantı eksik ya da güncelliğini yitirmiş olabilir.",
    404,
  );
}
