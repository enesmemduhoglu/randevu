// KAPI DISI DOSYA (bkz. CLAUDE.md degismez 1): ham veritabani erisimi burada
// mesru, cunku burasi da bir KAPI - yalnizca filtresi baska bir eksende.
//
// DEGISMEZ 1'IN IKINCI EKSENI. `scoped-db.ts` her sorguya `isletmeId`
// enjekte ediyor; bu dosya `kullaniciId` enjekte ediyor. Tasarimin ozu ayni ve
// pazarlik disi: **cagiran taraf filtreyi VEREMEZ**. Kimlik parametre degil,
// `getMusteriDb`nin kapanis degiskeni. Baska birinin randevusunu istemek icin
// once bu dosyayi degistirmek gerekiyor - unutmakla olmuyor.
//
// Neden ayri bir eksen gerekti: musterinin randevulari TANIMI GEREGI cok
// kiracili. Iki ayri salondan randevu almis biri ikisini de tek listede
// gormek istiyor, yani `isletmeId` filtresi burada dogru soruyu soramiyor.
// `scoped-db`ye metot eklemek de olmazdi - o kapinin sozlesmesi "tek kiraci"
// ve onu delen bir metot, kapinin verdigi guvenceyi butun cagiranlar icin
// zayiflatirdi.
//
// KARSILIGI, DIZIN.TS'TEKI GIBI, YUZEYIN DAR TUTULMASI (DEGISMEZ 12'nin ayni
// disiplini):
//
// - Yalnizca `randevu` YAZILABILIYOR, o da iki kolonda: `durum` (iptal) ve
//   `kullaniciId` (hesaba ekleme). Baska hicbir tabloya yazma yok.
// - Okunan alanlar ELLE yazilmis ve kapali. `$inferSelect` kullanilmadi:
//   semaya yarin eklenen bir kolon buradan sessizce sizmasin.
// - `musteri.not` (isletmenin kendi musteri notu) ve `musteri.telefon`
//   DONMUYOR. Musteri kendi telefonunu zaten biliyor; not ise isletmenin ic
//   kaydi ve musteriye gosterilmesi hic istenmiyor.
// - Isletmeden yalnizca musteriye zaten gorunen alanlar okunuyor (ad, slug,
//   telefon, saat dilimi) - randevu sayfasi bunlarin hepsini oturumsuz
//   gosteriyor.
//
// ROL KONTROLU YOK, BILEREK. Filtre `kullaniciId` oldugu icin guvenlik role
// bagli degil: SAHIP rolundeki biri de bu kapidan yalnizca KENDI randevularini
// goruyor. Rol sarti koymak guvenlige hicbir sey katmaz, buna karsilik baska
// bir salondan randevu alan isletme sahibini kendi listesinden mahrum
// birakirdi - o kisi de bir musteri.

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { hizmet, isletme, personel, randevu } from "@/db/sema";
import { getDb } from "@/lib/db";
import type { RandevuDurumu } from "@/lib/randevu-durum";

/// Listenin ust siniri. Sayfalama YOK (Faz J kapsam disi): bu sinira dayanmak
/// icin yillar boyunca duzenli randevu almak gerekiyor ve o gun geldiginde
/// dogru cozum sayfalama degil "gecmisi yil yil ac" olur. Sinirsiz birakmak
/// ise tek bir sorgunun sayfayi belirsiz sureyle acmasi demekti.
const EN_COK_RANDEVU = 200;

/// Musterinin kendi randevusunda gordugu alanlar.
///
/// `iptalToken` BILEREK YOK. Musteri iptali bu kapida sahiplige bagli
/// (`randevuIptalEt`), yani token'a ihtiyac kalmiyor - ve token tek basina
/// yetki tasidigi icin (DEGISMEZ 5) onu bir sayfanin HTML'ine yeniden koymanin
/// bedeli var, karsiligi yok.
export type MusteriRandevusu = {
  id: string;
  baslangic: Date;
  bitis: Date;
  durum: RandevuDurumu;
  not: string | null;
  isletmeAd: string;
  isletmeSlug: string;
  isletmeTelefon: string | null;
  isletmeSaatDilimi: string;
  hizmetAd: string;
  hizmetSureDk: number;
  hizmetFiyatKurus: number;
  personelAd: string;
};

/// Hesaba ekleme denemesinin sonucu.
///
/// "zaten-benim" ayri bir durum, hata DEGIL: ayni linke iki kez basmak ya da
/// randevuyu alirken zaten baglanmis bir token'i tekrar gondermek olagan.
/// Kullanici acisindan is BITMIS durumda ve ona "olmadi" demek yanlis olurdu.
export type EklemeSonucu =
  | { durum: "eklendi"; randevuId: string }
  | { durum: "zaten-benim"; randevuId: string }
  | { durum: "baskasinin" }
  | { durum: "yok" };

/// Musteri kimligine bagli, `kullaniciId` filtresi enjekte edilmis veri kapisi.
export async function getMusteriDb(kullaniciId: string) {
  const db = await getDb();
  // Kapanista tutuluyor: asagidaki hicbir metot bunu disaridan almiyor.
  const sahip = kullaniciId;

  return {
    /// Hesabin butun randevulari, yeniden eskiye.
    ///
    /// Tek sorgu ve join'li: liste her satirda isletme adini, hizmeti ve
    /// personeli gosteriyor, bunlari satir basina ayri sorgularla cekmek
    /// klasik N+1 olurdu.
    ///
    /// Siralama `desc(baslangic)`: yaklasan randevu en degerli satir ve
    /// gecmis, aksine, geriye dogru uzuyor. Cagiran taraf listeyi "yaklasan"
    /// ve "gecmis" diye ikiye ayiriyor - ayrimi SQL'de yapmak iki sorgu
    /// demekti ve ikisinin arasindaki an farki, tam o anda baslayan bir
    /// randevuyu iki listeden birine birden ya da hicbirine koyabilirdi.
    async randevulariListele(): Promise<MusteriRandevusu[]> {
      return db
        .select({
          id: randevu.id,
          baslangic: randevu.baslangic,
          bitis: randevu.bitis,
          durum: randevu.durum,
          not: randevu.not,
          isletmeAd: isletme.ad,
          isletmeSlug: isletme.slug,
          isletmeTelefon: isletme.telefon,
          isletmeSaatDilimi: isletme.saatDilimi,
          hizmetAd: hizmet.ad,
          hizmetSureDk: hizmet.sureDk,
          hizmetFiyatKurus: hizmet.fiyatKurus,
          personelAd: personel.ad,
        })
        .from(randevu)
        .innerJoin(isletme, eq(isletme.id, randevu.isletmeId))
        .innerJoin(hizmet, eq(hizmet.id, randevu.hizmetId))
        .innerJoin(personel, eq(personel.id, randevu.personelId))
        .where(eq(randevu.kullaniciId, sahip))
        .orderBy(desc(randevu.baslangic))
        .limit(EN_COK_RANDEVU);
    },

    /// Iptal edilebilmesi icin gereken tek sey SAHIPLIK - token degil.
    ///
    /// DEGISMEZ 3: kosullu UPDATE. Beklenen durum (`BEKLIYOR` ya da `ONAYLI`)
    /// ve sahiplik `where`'de duruyor, yani ayni randevuya iki sekmeden
    /// basildiginda ikincisi 0 satir etkiliyor ve kaybediyor. Once-oku-sonra-
    /// yaz yapsaydik ikisi de "aktif" gorup ikisi de basarili donerdi.
    ///
    /// IDOR kapisi ayni `where` icinde: baskasinin randevu id'si buraya
    /// gelirse 0 satir etkileniyor ve cagiran taraf bunu "bulunamadi" olarak
    /// goruyor - var olmayan bir id ile baskasinin id'si disaridan AYNI
    /// gorunmeli.
    ///
    /// Slug donuyor cunku cagiran taraf iptal bildirimlerini planlamak icin
    /// randevunun kiracisina ait bir kapiya ihtiyac duyuyor (Faz I akisi
    /// kiraci kapsamli). Slug'i istemciden almak, baska bir salonun
    /// kuyruguna yazdirmanin yolu olurdu.
    async randevuIptalEt(
      randevuId: string,
    ): Promise<{ id: string; isletmeSlug: string } | null> {
      const sonuc = await db
        .update(randevu)
        .set({ durum: "IPTAL" })
        .where(
          and(
            eq(randevu.id, randevuId),
            eq(randevu.kullaniciId, sahip),
            inArray(randevu.durum, ["BEKLIYOR", "ONAYLI"]),
          ),
        )
        .returning({ id: randevu.id, isletmeId: randevu.isletmeId });

      const iptalEdilen = sonuc[0];
      if (!iptalEdilen) return null;

      const [sahibi] = await db
        .select({ slug: isletme.slug })
        .from(isletme)
        .where(eq(isletme.id, iptalEdilen.isletmeId))
        .limit(1);

      // Randevu var ama isletmesi yok: foreign key bunu imkansiz kiliyor.
      // Yine de null donuluyor ki cagiran taraf `!` yazmak zorunda kalmasin.
      if (!sahibi) return null;

      return { id: iptalEdilen.id, isletmeSlug: sahibi.slug };
    },

    /// Iptal 0 satir etkiledigindeki IKI sebebi birbirinden ayirir: randevu bu
    /// hesaba ait degil mi (404), yoksa ait ama durumu artik uygun degil mi
    /// (409)?
    ///
    /// Okuma YAZMADAN SONRA yapiliyor, once degil - sira tersine donseydi
    /// DEGISMEZ 3 bozulurdu.
    async randevuDurumunuGetir(
      randevuId: string,
    ): Promise<RandevuDurumu | null> {
      const [kayit] = await db
        .select({ durum: randevu.durum })
        .from(randevu)
        .where(and(eq(randevu.id, randevuId), eq(randevu.kullaniciId, sahip)))
        .limit(1);

      return kayit?.durum ?? null;
    },

    /// Elinde iptal linki olan randevuyu hesaba ekler.
    ///
    /// YETKIYI TOKEN TASIYOR ve tasidigi sey tam olarak "bu randevu benim".
    /// Telefon numarasi yeterli OLMAZDI: numara dogrulanmis bir kimlik degil
    /// (SMS Faz K'de) ve numaraya bakip eslestirseydik, baskasinin numarasini
    /// yazan biri o numaranin gecmisini sahiplenirdi. Token'i ise yalnizca
    /// randevuyu alan kisi gordu.
    ///
    /// DEGISMEZ 3: kosullu UPDATE, `kullanici_id IS NULL` sarti `where`'de.
    /// Iki istek ayni token'la ayni anda gelirse yalnizca biri yaziyor;
    /// ikincisi asagidaki okumada kendi kimligini gorup "zaten-benim"
    /// donuyor.
    async randevuyuHesabaEkle(iptalToken: string): Promise<EklemeSonucu> {
      const sonuc = await db
        .update(randevu)
        .set({ kullaniciId: sahip })
        .where(
          and(
            eq(randevu.iptalToken, iptalToken),
            isNull(randevu.kullaniciId),
          ),
        )
        .returning({ id: randevu.id });

      const eklenen = sonuc[0];
      if (eklenen) return { durum: "eklendi", randevuId: eklenen.id };

      // 0 satir: ya token'a karsilik randevu yok, ya da randevunun bir sahibi
      // zaten var. Ikisini ayirmak icin okunuyor - ve yalnizca KARAR icin
      // gereken iki alan aliniyor, randevunun kendisi degil. Sahibi baskasi
      // olan bir randevunun icerigi cagirana hicbir kosulda gorunmemeli.
      const [mevcut] = await db
        .select({ id: randevu.id, kullaniciId: randevu.kullaniciId })
        .from(randevu)
        .where(eq(randevu.iptalToken, iptalToken))
        .limit(1);

      if (!mevcut) return { durum: "yok" };
      if (mevcut.kullaniciId === sahip) {
        return { durum: "zaten-benim", randevuId: mevcut.id };
      }
      return { durum: "baskasinin" };
    },
  };
}

export type MusteriDb = Awaited<ReturnType<typeof getMusteriDb>>;
