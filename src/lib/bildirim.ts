// Bildirim akisi: hangi olayda kuyruga ne yazilir, ve kuyruk nasil bosalir.
//
// Uc parca birbirinden ayri duruyor (bkz. docs/plan.md > Bildirim kanallari):
//   1. ADAPTOR   - `email.ts > gonder()`, tek cikis noktasi (DEGISMEZ 4)
//   2. KUYRUK    - `bildirim_kuyrugu` tablosu, scoped-db uzerinden yazilir
//   3. SABLON    - `bildirim-sablon.ts`, saf metin uretimi
// Bu dosya ikisini birbirine baglayan ince katman; kendisi ne SQL yaziyor ne
// de HTML uretiyor.
//
// NEDEN KUYRUK VAR, neden dogrudan gonderilmiyor: hatirlatma zaten gelecege
// zamanlanmis bir mesaj ve bir yerde durmasi lazim. Anlik mesajlari da ayni
// yoldan gecirmek, Faz K'nin cron'unun bosaltacagi seyle bugun gonderilenin
// AYNI kod yolu olmasi demek.

import { after } from "next/server";

import { sablonUret, type SablonKimligi } from "@/lib/bildirim-sablon";
import { gonder, bildirimModu } from "@/lib/email";
import type { BekleyenBildirim, YeniBildirim } from "@/lib/scoped-db";

/// Hatirlatma randevudan KAC SAAT once gidiyor.
///
/// 24 saat: musterinin plan degistirebilecegi kadar erken, unutmayacagi kadar
/// gec. Daha erken (48 saat) hatirlatmanin kendisi unutuluyor; daha gec
/// (2 saat) iptal eden musterinin bosalttigi saati isletme dolduramiyor.
export const HATIRLATMA_ONCE_SAAT = 24;

/// Bu dosyanin veri katmanindan ihtiyaci olan YUZEY.
///
/// Somut tip (`ScopedDb`) yerine dar bir yapisal tip: hem oturumlu hem
/// oturumsuz kapi bunu kendiliginden karsiliyor ve bu dosya ikisini
/// birbirinden ayirt etmek zorunda kalmiyor. Testler de gercek kapiyi
/// veriyor - sahte bir nesne, kuyruk davranisinin kendisini sinamamak olurdu.
export type BildirimKapisi = {
  bildirimKuyrugunaYaz(kayitlar: YeniBildirim[]): Promise<number>;
  gonderilecekBildirimleriGetir(
    randevuId: string,
    simdi: Date,
  ): Promise<BekleyenBildirim[]>;
  bildirimiUstlen(id: string, simdi: Date): Promise<number>;
  bildirimiHataliIsaretle(id: string, sebep: string): Promise<void>;
  bildirimOnizlemesiniYaz(id: string, html: string): Promise<void>;
  bekleyenBildirimleriDusur(randevuId: string): Promise<number>;
  sahipEpostasiniGetir(): Promise<string | null>;
};

function isletmeyeMi(sablon: SablonKimligi): boolean {
  return sablon.startsWith("ISLETME_");
}

/// Randevu OLUSTUGUNDA yazilacak satirlar.
///
/// Musteriye giden ilk mesaj randevunun DURUMUNA bagli: otomatik onay kapali
/// olan isletmede randevu `BEKLIYOR` basliyor ve "onaylandi" demek yanlis
/// olurdu - musteri gelir, isletme onu beklemiyordur.
export function randevuOlustuKayitlari(veri: {
  randevuId: string;
  baslangic: Date;
  onayli: boolean;
  simdi: Date;
}): YeniBildirim[] {
  const kayitlar: YeniBildirim[] = [
    {
      randevuId: veri.randevuId,
      sablon: veri.onayli ? "MUSTERI_RANDEVU_ONAYLANDI" : "MUSTERI_RANDEVU_ALINDI",
      planlananZaman: veri.simdi,
    },
    {
      randevuId: veri.randevuId,
      sablon: "ISLETME_YENI_RANDEVU",
      planlananZaman: veri.simdi,
    },
  ];

  const hatirlatmaZamani = new Date(
    veri.baslangic.getTime() - HATIRLATMA_ONCE_SAAT * 60 * 60 * 1000,
  );

  // GECMISE HATIRLATMA YAZILMIYOR. Yarinden yakin bir randevuda hatirlatma
  // zamani zaten gecmis olurdu ve satir yazilsaydi ilk bosaltmada HEMEN
  // gonderilirdi - musteri "yarinki randevunuz" diyen bir maili randevuyu
  // aldigi dakikada alirdi.
  if (hatirlatmaZamani.getTime() > veri.simdi.getTime()) {
    kayitlar.push({
      randevuId: veri.randevuId,
      sablon: "MUSTERI_HATIRLATMA",
      planlananZaman: hatirlatmaZamani,
    });
  }

  return kayitlar;
}

/// Randevu IPTAL EDILDIGINDE yazilacak satirlar. Iptali kimin yaptigina
/// bakilmiyor: iki tarafin da haberi olmasi gerekiyor ve musteriye giden metin
/// bilerek fail bildirmiyor (gerekcesi sablon dosyasinda).
export function randevuIptalKayitlari(veri: {
  randevuId: string;
  simdi: Date;
}): YeniBildirim[] {
  return [
    {
      randevuId: veri.randevuId,
      sablon: "MUSTERI_RANDEVU_IPTAL",
      planlananZaman: veri.simdi,
    },
    {
      randevuId: veri.randevuId,
      sablon: "ISLETME_RANDEVU_IPTAL",
      planlananZaman: veri.simdi,
    },
  ];
}

/// Iptalde: once bekleyen satirlari dusur, sonra iptal mesajlarini yaz.
///
/// SIRA ONEMLI. Ters olsaydi az once yazdigimiz iptal mesajlari da "bekleyen"
/// sayilip silinirdi. Dusurulen sey pratikte hatirlatma: iptal edilmis bir
/// randevu icin ertesi gun "yarinki randevunuz" maili gitmesi, urune duyulan
/// guveni tek basina bitiren turden bir hata.
export async function iptalBildirimleriniPlanla(
  kapi: BildirimKapisi,
  randevuId: string,
  simdi: Date,
): Promise<void> {
  await kapi.bekleyenBildirimleriDusur(randevuId);
  await kapi.bildirimKuyrugunaYaz(randevuIptalKayitlari({ randevuId, simdi }));
}

/// Kuyrugun zamani gelmis satirlarini gonderir.
///
/// HICBIR ZAMAN THROW ETMIYOR. Yanit gonderildikten sonra (`after`) kosuyor,
/// yani buradan cikan bir hatanin gidecek yeri yok; bir mesajin
/// gonderilememesi de digerlerini durdurmamali. Basarisizlik `bildirim_kuyrugu
/// .hata_metni` kolonuna yaziliyor ve /panel/gelistirici/bildirimler
/// ekranindan gorunuyor - sessizce kaybolmuyor.
export async function bildirimleriBosalt(
  kapi: BildirimKapisi,
  randevuId: string,
  simdi: Date,
): Promise<void> {
  let bekleyenler: BekleyenBildirim[];
  try {
    bekleyenler = await kapi.gonderilecekBildirimleriGetir(randevuId, simdi);
  } catch {
    // Veritabanina ulasilamadi. Satirlar kuyrukta BEKLIYOR olarak duruyor;
    // Faz K'nin cron'u onlari bulacak.
    return;
  }

  if (bekleyenler.length === 0) return;

  // Sahip adresi mesaj basina degil BIR KEZ okunuyor: ayni sorgu her satir
  // icin tekrarlanacakti ve bu kod yanit gonderildikten sonra kosuyor, yani
  // her ek sorgu Worker'in omrunu uzatiyor.
  let sahipEpostasi: string | null = null;
  if (bekleyenler.some((b) => isletmeyeMi(b.sablon))) {
    try {
      sahipEpostasi = await kapi.sahipEpostasiniGetir();
    } catch {
      sahipEpostasi = null;
    }
  }

  const mod = await bildirimModu();
  const kok = siteKoku();

  for (const b of bekleyenler) {
    try {
      // ONCE USTLEN, sonra gonder (gerekcesi scoped-db > bildirimiUstlen).
      const ustlendi = await kapi.bildirimiUstlen(b.id, simdi);
      if (ustlendi === 0) continue;

      const alici = isletmeyeMi(b.sablon) ? sahipEpostasi : b.musteriEposta;
      if (!alici) {
        // Adressiz mesaj SESSIZCE DUSURULMUYOR, hata olarak isaretleniyor.
        // Randevu formunda e-posta zorunlu degil (telefon var, SMS Faz K'de
        // geliyor) - yani bu beklenen bir durum, ama panelde "neden mail
        // gitmedi" sorusunun cevabi gorunur olmali.
        await kapi.bildirimiHataliIsaretle(b.id, "adres-yok");
        continue;
      }

      const mesaj = sablonUret(b.sablon, {
        isletmeAd: b.isletmeAd,
        isletmeTelefon: b.isletmeTelefon,
        saatDilimi: b.saatDilimi,
        musteriAd: b.musteriAd,
        musteriTelefon: b.musteriTelefon,
        hizmetAd: b.hizmetAd,
        personelAd: b.personelAd,
        baslangic: b.baslangic,
        // Iptal baglantisi YALNIZCA musteriye gidiyor: tek basina iptal
        // yetkisi tasiyor ve isletmenin zaten paneli var.
        iptalAdresi:
          isletmeyeMi(b.sablon) || !kok
            ? null
            : `${kok}/r/${b.isletmeSlug}/randevu/${b.iptalToken}`,
      });

      // Onizleme YALNIZCA sahte modda saklaniyor (gerekcesi scoped-db'de).
      if (mod === "sahte") {
        await kapi.bildirimOnizlemesiniYaz(b.id, mesaj.html);
      }

      const sonuc = await gonder({ alici, ...mesaj });
      if (!sonuc.tamam) {
        await kapi.bildirimiHataliIsaretle(b.id, sonuc.sebep);
      }
    } catch {
      // Tek bir mesajin beklenmeyen hatasi digerlerini durdurmuyor. Satir
      // GONDERILDI olarak isaretli kalabilir (ustlenme basarili olduysa);
      // bu, ustlenme kararinin bilinen bedeli.
      continue;
    }
  }
}

/// Yanit gonderildikten SONRA bosaltir.
///
/// Neden `after`: gonderim bir ag istegi ve musteriyi "randevunuz alindi"
/// ekranina goturmeden once Resend'in cevabini beklemek, iyi giden gunde
/// yuzlerce ms, kotu giden gunde saniyeler eklerdi. Randevu zaten yazildi;
/// mailin gecikmesi musterinin bekledigi sey degil.
///
/// TEK SATIRLIK SARMALAYICI OLMASI bilincli: `after` cagrisi route'lara
/// dagilsaydi biri onu unutur ve o yolda gonderim istegi bloklardi.
export function bildirimleriYanittanSonraGonder(
  kapi: BildirimKapisi,
  randevuId: string,
  simdi: Date,
): void {
  after(() => bildirimleriBosalt(kapi, randevuId, simdi));
}

/// E-postadaki baglantilarin koku. Cagri aninda okunuyor, modul yuklenirken
/// degil: modul seviyesinde yakalanan bir env degeri Workers'ta ilk istegin
/// baglaminda donar (ayni gerekce `origin.ts`te de yazili).
///
/// Tanimsizsa baglanti HIC KONULMUYOR (`null` doner). Goreli bir adres
/// e-postada ise yaramaz, uydurulmus bir alan adi ise musteriyi olmayan bir
/// sayfaya goturur.
function siteKoku(): string | null {
  const ham = process.env.NEXT_PUBLIC_SITE_URL;
  if (!ham) return null;
  return ham.replace(/\/+$/, "");
}
