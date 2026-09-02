import { gecersiz, panelKapisi } from "@/lib/panel-kapisi";

// Isletmenin randevu dizininde (pazaryeri) gorunup gorunmemesi.
//
// CSRF kapisi ve oturum panelKapisi'nda (DEGISMEZ 2). Hedef isletme govdeden
// GELMIYOR - `yayindaAyarla` bir id parametresi almiyor, oturumun isletmesine
// kapsanmis durumda.
//
// NEDEN `/api/ayarlar`IN BIR ALANI DEGIL: yayina cikmak on kosullu (il,
// kategori, en az bir hizmet, personel ve calisma saati). Ayni sette gelseydi
// bir istek `{ ad: "…", yayinda: true }` gonderip kontrolu atlayabilirdi -
// alan yazilir, kosul bakilmazdi. Ayri route, ayri govde, tek giris.

export async function PATCH(istek: Request) {
  const kapi = await panelKapisi(istek);
  if ("engel" in kapi) return kapi.engel;

  // Kasten gevsek DEGIL: `=== true` disinda her sey "kapat" sayilsaydi bozuk
  // bir govde sessizce isletmeyi dizinden dusururdu. Iki degerden biri olmali.
  const yayinda = kapi.govde.yayinda;
  if (typeof yayinda !== "boolean") {
    return gecersiz("Dizin durumu okunamadı");
  }

  const sonuc = await kapi.db.yayindaAyarla(yayinda);

  if (sonuc.durum === "eksik") {
    // 409: istek bicimsel olarak dogru, kaydin BUGUNKU durumuyla catisiyor.
    // 400 deseydik istemci govdesini duzeltmeye calisirdi; duzeltilmesi
    // gereken govde degil isletme profili.
    //
    // Eksikler ham anahtar olarak donuyor, cumle olarak degil: metni arayuz
    // kuruyor cunku her eksigin yaninda gidilecek bir ekran var ve o baglanti
    // burada bilinmiyor.
    return Response.json(
      { hata: "İşletme profili dizin için tamamlanmadı", eksikler: sonuc.eksikler },
      { status: 409 },
    );
  }

  return Response.json({ tamam: true, yayinda });
}
