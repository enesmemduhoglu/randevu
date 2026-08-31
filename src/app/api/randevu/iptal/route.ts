import { govdeOku, govdeOkunamadi } from "@/lib/govde";
import { iptalTokenGecerliMi } from "@/lib/iptal-token";
import { checkOrigin } from "@/lib/origin";
import { getHalkaAcikDb } from "@/lib/scoped-db";

// Musterinin kendi randevusunu iptal ettigi yol.
//
// OTURUMSUZ: yetkiyi iptal token'inin kendisi tasiyor (bkz. iptal-token.ts).
// Buna ragmen kiraci yine slug'dan cozuluyor ve `getHalkaAcikDb` filtreyi
// kapanis degiskeni olarak tutuyor (DEGISMEZ 1). Iki kapi ust uste: baska bir
// salonun sayfasindan gonderilen bir token burada hic bulunamiyor, yani bir
// salonun linki baska bir salonun takviminde is goremiyor.
//
// Mutasyon oldugu icin `checkOrigin` ILK SATIR (DEGISMEZ 2). Panel route'lari
// bu kapiyi `panelKapisi` uzerinden aliyor ama burada oturum yok, yani o
// yardimci kullanilamiyor - kapi elle cagriliyor.
//
// Yanit ONBELLEKLENMIYOR: istek token tasiyor ve iptal karari anlik. Bayat bir
// "iptal edildi" cevabi, iptal edilmemis bir randevuyu iptal edilmis
// gostermek demek olurdu.

const ONBELLEKSIZ = { "cache-control": "no-store" };

/// Kapali ya da hic olmayan isletme AYNI cevabi aliyor: hangi slug'larin
/// kayitli oldugunu sizdirmanin bir faydasi yok.
const SAYFA_YOK = "Randevu sayfası bulunamadı";

/// Token'a karsilik randevu yok. DEGISMEZ 5: mesaj token'in KENDISINI tasimaz
/// - hata metinleri log'lara, hata izleme araclarina ve tarayici gecmisine
/// dusuyor, oysa bu deger tek basina yetki.
const RANDEVU_YOK =
  "Randevu bulunamadı. İptal bağlantısı eksik ya da güncelliğini yitirmiş olabilir.";

/// Kosullu UPDATE 0 satir etkiledi AMA kayit duruyor: randevu artik iptal
/// edilebilir bir durumda degil. Kullaniciya "olmadi" demek yerine NEDEN
/// olmadigini soyluyoruz - yoksa ayni dugmeye tekrar basar.
const DURUM_ACIKLAMASI: Record<string, string> = {
  IPTAL: "Bu randevu zaten iptal edilmiş.",
  TAMAMLANDI: "Bu randevu tamamlanmış görünüyor, bu yüzden iptal edilemiyor.",
  GELMEDI: "Bu randevu geçmişte kaldı, bu yüzden iptal edilemiyor.",
};

function hata(mesaj: string, durum: number): Response {
  return Response.json({ hata: mesaj }, { status: durum, headers: ONBELLEKSIZ });
}

export async function POST(istek: Request) {
  // DEGISMEZ 2: CSRF kapisi ilk satirda. Yabanci origin'den gelen istek
  // veritabanina hic dokunmadan doner.
  const csrf = checkOrigin(istek);
  if (csrf) return csrf;

  const govde = await govdeOku(istek);
  if (!govde) return govdeOkunamadi();

  // Slug tipi burada eleniyor: metin olmayan bir deger `eq(isletme.slug, ...)`
  // icine girseydi Postgres tip hatasi firlatir ve istemcinin hatasi 500'e
  // donusurdu.
  const slug = typeof govde.isletme === "string" ? govde.isletme.trim() : "";
  if (!slug) return hata(SAYFA_YOK, 404);

  const db = await getHalkaAcikDb(slug);
  if (!db) return hata(SAYFA_YOK, 404);

  // Bicim kontrolu veritabanina gitmeden once: bozuk bir link her denemede
  // bir sorgu actirirdi ve token uzunlugu zamanlama farkindan okunabilirdi
  // (gerekcenin tamami iptal-token.ts icinde).
  const token = govde.token;
  if (!iptalTokenGecerliMi(token)) {
    return hata("İptal bağlantısı geçerli görünmüyor.", 400);
  }

  // DEGISMEZ 3: ONCE kosullu UPDATE. Beklenen durum (`BEKLIYOR` ya da
  // `ONAYLI`) `randevuIptalEt`'in where'inde duruyor, yani ayni linke iki kez
  // basildiginda ikinci istek 0 satir etkiliyor ve kaybediyor. Once-oku-
  // sonra-yaz yapsaydik iki istek de "aktif" gorup ikisi de basarili donerdi.
  const etkilenen = await db.randevuIptalEt(token);
  if (etkilenen > 0) {
    return Response.json({ iptal: true }, { headers: ONBELLEKSIZ });
  }

  // Buradaki okuma karari DEGISTIRMIYOR, yalnizca 0 satirin iki sebebini
  // birbirinden ayiriyor: kayit hic yok mu (404), yoksa var ama durumu artik
  // uygun degil mi (409)? Yazmadan once degil, YAZDIKTAN SONRA okuyoruz;
  // sira tersine donseydi degismez 3 bozulurdu.
  const mevcut = await db.randevuTokenIleGetir(token);
  if (!mevcut) return hata(RANDEVU_YOK, 404);

  return hata(
    DURUM_ACIKLAMASI[mevcut.durum] ?? "Bu randevu artık iptal edilemiyor.",
    409,
  );
}
