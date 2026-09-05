import { isletmeOturumu } from "@/lib/auth";
import { gununSlotlari } from "@/lib/musaitlik-sorgu";
import { getScopedDb } from "@/lib/scoped-db";
import { tarihAyristir, tarihMetni } from "@/lib/zaman";

// Panelin musaitlik sorgusu (Faz H2).
//
// NEDEN AYRI BIR YOL, neden halka acik `/api/musaitlik` kullanilmadi: o yol
// kiraciyi SLUG'DAN cozuyor ve isletmenin kendi slug'ini istemciye tasiyip
// geri gondermek, panelin kiraci kimligini adres cubugundan gecirmek olurdu.
// Buradaki kiraci OTURUMDAN geliyor ve `getScopedDb` onu kapanis degiskeni
// olarak tutuyor (DEGISMEZ 1). Ayrica o yol hiz siniriyla korunuyor - panelde
// tarih seridinde gezinen isletmeyi 429 ile durdurmanin bir anlami yok.
//
// GET, yani durum degistirmiyor: `checkOrigin` GEREKMIYOR (DEGISMEZ 2 yalnizca
// mutasyonlar icin).
//
// Yanit ONBELLEKLENMIYOR: musaitlik yazma kararini besliyor, bir saniye bayat
// veri dolu bir sloti bos gosterir.

const ONBELLEKSIZ = { "cache-control": "no-store" };

function hata(mesaj: string, durum: number): Response {
  return Response.json({ hata: mesaj }, { status: durum, headers: ONBELLEKSIZ });
}

export async function GET(istek: Request) {
  const oturum = await isletmeOturumu();
  if (!oturum) {
    return hata("Oturum bulunamadı. Yeniden giriş yapın.", 401);
  }

  const parametreler = new URL(istek.url).searchParams;

  const hizmetId = parametreler.get("hizmet");
  const personelId = parametreler.get("personel") ?? undefined;
  const tarihHam = parametreler.get("tarih");

  if (!hizmetId || !tarihHam) return hata("Hizmet ve tarih gerekli", 400);

  const tarih = tarihAyristir(tarihHam);
  if (!tarih) return hata("Tarih 2026-09-01 biçiminde olmalı", 400);

  const db = await getScopedDb(oturum);

  const [isletme, hizmet] = await Promise.all([
    db.isletmeyiGetir(),
    // Kapsamli sorgu: baska isletmenin hizmet id'si burada bos donuyor.
    db.hizmetGetir(hizmetId),
  ]);

  if (!isletme) return hata("İşletme bulunamadı", 404);
  if (!hizmet || !hizmet.aktif) return hata("Hizmet bulunamadı", 404);

  const slotlar = await gununSlotlari({
    db,
    isletme,
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
      saatDilimi: isletme.saatDilimi,
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
