import {
  bildirimleriYanittanSonraGonder,
  iptalBildirimleriniPlanla,
} from "@/lib/bildirim";
import {
  CIKILAMAZ_ACIKLAMASI,
  hedefDurumDogrula,
  gecisMumkunMu,
} from "@/lib/randevu-durum";
import { bulunamadi, gecersiz, panelKapisi } from "@/lib/panel-kapisi";

// Panelden randevu durumu degistirme.
//
// YOL ADI: halka acik randevu yollari `/api/randevu` (tekil, oturumsuz),
// panelin yollari `/api/randevular` (cogul, oturumlu). Ayrimi adreste
// tutmak, bir gun bu iki sinifin yanlislikla ayni kapiyi paylasmasini
// zorlastiriyor - `/api/randevu/[id]/durum` yazsaydik oturumsuz bir yolun
// altina oturumlu bir yol asilamis olurduk.
//
// CSRF kapisi (DEGISMEZ 2) panelKapisi'nin ilk satirinda.
//
// IDOR: `id` kullanicidan geliyor ama scoped-db'nin where'i her zaman
// isletmeId'yi de tasiyor.

export async function PATCH(
  istek: Request,
  ctx: RouteContext<"/api/randevular/[id]/durum">,
) {
  const kapi = await panelKapisi(istek);
  if ("engel" in kapi) return kapi.engel;

  const { id } = await ctx.params;

  const hedef = hedefDurumDogrula(kapi.govde.durum);
  if (!hedef.tamam) return gecersiz(hedef.hata);

  // DEGISMEZ 3: ONCE kosullu UPDATE. Hangi durumlardan bu hedefe gecilebilecegi
  // `where`'de duruyor (randevu-durum.ts > kaynakDurumlar), yani iki sekme ayni
  // randevuyu ayni anda onaylarsa ikincisi 0 satir etkiliyor ve kaybediyor.
  // Once-oku-sonra-yaz yapsaydik ikisi de kaydi uygun gorup ikisi de basarili
  // donerdi.
  const etkilenen = await kapi.db.randevuDurumunuDegistir(id, hedef.deger);
  if (etkilenen > 0) {
    // BILDIRIM KARARIN ARDINDAN (Faz I) ve YALNIZCA iki hedefte:
    //
    // ONAYLI - musteri bekliyordu, cevabi hak ediyor.
    // IPTAL  - musterinin plani degisti; ayrica bekleyen hatirlatma
    //          dusuruluyor, yoksa iptal edilmis randevu icin "yarinki
    //          randevunuz" maili giderdi.
    //
    // TAMAMLANDI ve GELMEDI'de mesaj YOK: ikisi de randevu saatinden SONRA
    // isaretleniyor ve isletmenin kendi kaydi. Musteriye "gelmediniz" diyen
    // bir mail atmak, kisiti zaten uygulanmis birine ikinci kez soylemek
    // olurdu.
    const simdi = new Date();
    try {
      if (hedef.deger === "IPTAL") {
        await iptalBildirimleriniPlanla(kapi.db, id, simdi);
        bildirimleriYanittanSonraGonder(kapi.db, id, simdi);
      } else if (hedef.deger === "ONAYLI") {
        await kapi.db.bildirimKuyrugunaYaz([
          {
            randevuId: id,
            sablon: "MUSTERI_RANDEVU_ONAYLANDI",
            planlananZaman: simdi,
          },
        ]);
        bildirimleriYanittanSonraGonder(kapi.db, id, simdi);
      }
    } catch {
      // Durum ZATEN degisti. Bildirim yazilamadi diye 500 donmek, panelde
      // dogru gorunen bir karari kullaniciya "olmadi" diye gostermek olurdu.
    }

    return Response.json({ tamam: true });
  }

  // Buradaki okuma karari DEGISTIRMIYOR, yalnizca 0 satirin iki sebebini
  // ayiriyor: kayit hic yok mu (404), yoksa var ama durumu artik uygun degil
  // mi (409)? Yazmadan once degil, YAZDIKTAN SONRA okuyoruz; sira tersine
  // donseydi degismez 3 bozulurdu. Ayni desen randevu iptal yolunda da var.
  const mevcut = await kapi.db.randevuGetir(id);
  if (!mevcut) return bulunamadi("Randevu");

  // Buraya dustugumuzde randevu var ama mevcut durumundan hedefe gecis yok.
  // Cogu zaman sebep bayat bir ekran: kullanici ayni dugmeye iki kez ya da
  // baska bir sekmede degismis bir kayda basmis. Yine 409, cunku "oldu" demek
  // yanlis olurdu - onun
  // gordugu ekran gercegi yansitmiyor ve yenilenmesi gerekiyor.
  // Ilk dal BUGUN ULASILAMAZ ve bilerek duruyor: gecis kurallarina gore
  // mumkun gorunen bir hedefin 0 satir etkilemesi, randevunun UPDATE ile
  // okuma arasinda gecerli bir kaynak duruma GERI donmesini gerektirir - uc
  // durum da terminal oldugu icin bu su an imkansiz. Faz H2 "iptali geri ac"
  // getirdiginde imkansiz olmaktan cikacak; o gun burada yanlis mesaj degil
  // dogru mesaj bulunsun.
  const aciklama = gecisMumkunMu(mevcut.durum, hedef.deger)
    ? "Randevu bu sırada değişti. Sayfayı yenileyip yeniden deneyin."
    : CIKILAMAZ_ACIKLAMASI[mevcut.durum];

  return Response.json({ hata: aciklama }, { status: 409 });
}
