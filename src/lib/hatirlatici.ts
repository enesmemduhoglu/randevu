// Hatirlatici (Faz K): kuyrugun zamani gelmis satirlarini, onlara dokunan bir
// istek beklemeden bosaltir. Cagiran `POST /api/cron/hatirlatma`; onu da
// `worker-girisi.ts > scheduled` Worker'in icinden tetikliyor.
//
// Faz I'den beri kuyruk yalnizca bir istegin `after`'inda ve yalnizca o
// istegin randevusu icin bosaliyordu. Hatirlatma ise tanimi geregi randevudan
// bir gun once ve o anda randevuya dokunan bir istek yok - yani Faz K'ye kadar
// HICBIR hatirlatma gitmedi.
//
// Bu dosya IKI KAPIYI birbirine bagliyor ve kendisi SQL yazmiyor:
//   - `kuyruk-tarama.ts` kiraci-ustu ama yalnizca `(slug, randevuId)` veriyor
//   - `getHalkaAcikDb(slug)` kiraciya kapsanmis; kisisel veriyi o okuyor
// Gonderim Faz I'deki `bildirimleriBosalt`in AYNISI: istek ici yol ile
// zamanlanmis yol ayni kodu kosuyor, ikisinin yarisi da `bildirimiUstlen`in
// kosullu UPDATE'iyle cozuluyor.

import { bildirimleriBosalt, type BildirimKapisi } from "@/lib/bildirim";
import { zamaniGelenRandevular } from "@/lib/kuyruk-tarama";
import { getHalkaAcikDb } from "@/lib/scoped-db";

/// Bir kosumda en cok kac randevunun kuyrugu bosaltiliyor.
///
/// Sinir Worker'in istek basina alt istek sinirindan geliyor: her gonderim bir
/// `fetch` ve ucretsiz planda istek basina 50 alt istek var (Cron Trigger da
/// bir istek sayiliyor ve ayni kosumda nabiz tetigi de bir alt istek
/// harciyor). Bir randevunun zamani gelmis satiri pratikte bir ya da iki
/// (hatirlatma; ya da `after`'i kosmamis bir onay + isletme mesaji) - 20
/// randevu en kotu durumda ~40 gonderim. Veritabani sorgularinin (Hyperdrive)
/// bu sinira sayilip sayilmadigi OLCULMEDI; bu yuzden sinir comert degil.
///
/// Sinir dolarsa kalanlar KAYBOLMUYOR, BEKLIYOR olarak 30 dakika sonraki
/// kosumu bekliyor ve tarama en eskiyi one aliyor. Gunde 48 kosum x 20 =
/// ~960 randevu; bugunku hacmin cok uzerinde.
export const KOSUM_BASINA_RANDEVU = 20;

/// Iki randevunun gonderimi arasindaki bekleme.
///
/// Resend istek hizini sinirliyor ve asilan istek 429 donuyor; `email.ts` onu
/// bir sebep koduyla satira yaziyor ama YENIDEN DENEMIYOR - yani sinira
/// takilan hatirlatma kayboluyor. Beklemek bunun ucuz sigortasi: 20 randevuda
/// ~10 saniye duvar saati, ve bekleme Worker'in islemci suresine sayilmiyor.
/// Istek ici yol (`after`) tek randevu gonderdigi icin bekleme orada yok.
export const RANDEVU_ARASI_MS = 500;

export type KosumOzeti = {
  /// Kuyrugu bosaltilmaya calisilan randevu sayisi.
  randevu: number;
  /// Tarama ile gonderim arasinda pasiflenen isletmelerin randevulari.
  atlanan: number;
};

/// Veritabani hatasinda FIRLATIR - cagiran route onu hata kapisina veriyor ve
/// 500 donuyor. Tek tek mesajlarin hatasi ise firlamiyor (`bildirimleriBosalt`
/// hicbir zaman firlatmaz, basarisizligi satirin `hata_metni`ne yazar).
export async function kuyruguBosalt(
  simdi: Date,
  {
    sinir = KOSUM_BASINA_RANDEVU,
    aralikMs = RANDEVU_ARASI_MS,
  }: { sinir?: number; aralikMs?: number } = {},
): Promise<KosumOzeti> {
  const adresler = await zamaniGelenRandevular(simdi, sinir);

  // Kapi slug basina BIR KEZ aciliyor. Her `getHalkaAcikDb` bir sorgu ve
  // workerd'de yeni bir istemci (bkz. db.ts > getDb); ayni isletmenin on
  // randevusu icin on kez acmak hem sorgu hem baglanti israfi.
  const kapilar = new Map<string, BildirimKapisi | null>();
  let atlanan = 0;

  // SIRAYLA, paralel degil - gerekcesi RANDEVU_ARASI_MS'te.
  for (const [sira, { slug, randevuId }] of adresler.entries()) {
    if (sira > 0 && aralikMs > 0) {
      await new Promise((coz) => setTimeout(coz, aralikMs));
    }

    if (!kapilar.has(slug)) kapilar.set(slug, await getHalkaAcikDb(slug));
    const kapi = kapilar.get(slug);

    if (!kapi) {
      atlanan += 1;
      continue;
    }

    await bildirimleriBosalt(kapi, randevuId, simdi);
  }

  return { randevu: adresler.length, atlanan };
}
