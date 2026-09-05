import { hizSiniriAsildiMi } from "@/lib/hiz-siniri";
import { gununSlotlari } from "@/lib/musaitlik-sorgu";
import { getHalkaAcikDb } from "@/lib/scoped-db";
import { istekIpsi } from "@/lib/turnstile";
import { tarihAyristir, tarihMetni } from "@/lib/zaman";

// Bir isletmenin bir gunundeki uygun randevu saatleri.
//
// OTURUMSUZ ve halka acik: musteri randevu almak icin hesap acmiyor. Kiraci
// oturumdan degil `isletme` slug'indan cozuluyor ve `getHalkaAcikDb` filtreyi
// yine kapanis degiskeni olarak tutuyor - yani buradan baska bir salonun
// verisi okunamiyor (DEGISMEZ 1).
//
// GET, yani durum degistirmiyor: `checkOrigin` GEREKMIYOR (DEGISMEZ 2 yalnizca
// mutasyonlar icin). Kotuye kullanim - baska bir salonun doluluk takvimini
// kazimak - CSRF ile degil hiz siniriyla engelleniyor (Faz L, hiz-siniri.ts).
//
// Yanit ONBELLEKLENMIYOR. Musaitlik yazma kararini besliyor: bir saniye bayat
// veri, dolu bir sloti bos gosterip musteriyi 409'a goturur. Hyperdrive'in
// sorgu onbellegi de ayni sebeple kapali (bkz. wrangler.jsonc).

const ONBELLEKSIZ = { "cache-control": "no-store" };

function hata(mesaj: string, durum: number): Response {
  return Response.json({ hata: mesaj }, { status: durum, headers: ONBELLEKSIZ });
}

export async function GET(istek: Request) {
  // Sinir EN BASTA: buradan gecemeyen istek ne URL ayristiriyor ne veritabanina
  // dokunuyor. Yazma yolundan (dakikada 5) cok daha gevsek - gun seridinde
  // gezinen mesru musteri her tikta bir istek atiyor.
  if (await hizSiniriAsildiMi("MUSAITLIK_SINIRI", istekIpsi(istek))) {
    return hata("Çok fazla istek gönderildi. Biraz bekleyin.", 429);
  }

  const parametreler = new URL(istek.url).searchParams;

  const slug = parametreler.get("isletme");
  const hizmetId = parametreler.get("hizmet");
  const tarihMetniHam = parametreler.get("tarih");
  const personelId = parametreler.get("personel") ?? undefined;

  if (!slug || !hizmetId || !tarihMetniHam) {
    return hata("İşletme, hizmet ve tarih gerekli", 400);
  }

  const tarih = tarihAyristir(tarihMetniHam);
  if (!tarih) return hata("Tarih 2026-09-01 biçiminde olmalı", 400);

  const db = await getHalkaAcikDb(slug);
  // Kapali ya da hic olmayan isletme AYNI cevabi aliyor: hangi slug'larin
  // kayitli oldugunu sizdirmanin bir faydasi yok.
  if (!db) return hata("Randevu sayfası bulunamadı", 404);

  const hizmet = await db.hizmetGetir(hizmetId);
  if (!hizmet) return hata("Hizmet bulunamadı", 404);

  const slotlar = await gununSlotlari({
    db,
    // Motor artik ayarlari `db`den okumuyor (Faz H2): panel kapisinin boyle
    // bir alani yok ve motor iki kapiyi da beslemek zorunda.
    isletme: db.isletme,
    hizmetId,
    hizmetSuresiDk: hizmet.sureDk,
    tarih,
    // `simdi` motora DISARIDAN veriliyor; burasi onu okuyan tek yer.
    simdi: new Date(),
    personelId,
  });

  return Response.json(
    {
      tarih: tarihMetni(tarih),
      saatDilimi: db.isletme.saatDilimi,
      slotlar: slotlar.map((s) => ({
        baslangic: s.baslangic.toISOString(),
        bitis: s.bitis.toISOString(),
        personelId: s.personelId,
        personelAd: s.personelAd,
      })),
    },
    { headers: ONBELLEKSIZ },
  );
}
