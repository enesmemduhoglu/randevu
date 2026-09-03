// KAPI DISI DOSYA (bkz. CLAUDE.md degismez 1): kiraci filtresini enjekte eden
// tek yer burasi. Route handler'lar @/lib/db'yi degil bu dosyayi kullanir;
// bunu eslint.config.mjs icindeki no-restricted-imports kurali zorluyor.
//
// Tasarimin ozu: cagiran taraf isletmeId'yi VEREMEZ. Filtre parametre degil,
// kapanis degiskeni. Yanlis kiracinin verisini istemek icin once bu dosyayi
// degistirmek gerekiyor - unutmakla olmuyor.

import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";

import {
  bildirimKuyrugu,
  calismaSaati,
  hizmet,
  isletme,
  kapali,
  kullanici,
  musteri,
  personel,
  personelHizmet,
  randevu,
} from "@/db/sema";
import {
  sablonGecerliMi,
  type SablonKimligi,
} from "@/lib/bildirim-sablon";
import { getDb } from "@/lib/db";
import { cakismaIhlaliMi, pgHata } from "@/lib/pg-hata";
import { kaynakDurumlar, type RandevuDurumu } from "@/lib/randevu-durum";

export type Rol = "SAHIP" | "PERSONEL" | "MUSTERI";

/// Oturum sozlesmesi. DEGISMEZ 6: isletmeId duz string kalir.
export type IsletmeOturumu = {
  kullaniciId: string;
  authUserId: string;
  isletmeId: string;
  rol: "SAHIP" | "PERSONEL";
};

type YeniPersonel = {
  ad: string;
  unvan?: string | null;
  sira?: number;
};

type YeniHizmet = {
  ad: string;
  aciklama?: string | null;
  sureDk: number;
  fiyatKurus?: number;
  renk?: string | null;
  sira?: number;
};

/// Bir personelin bir gunune ait tek aralik. Ogle arasi icin ayni gune iki
/// satir gonderiliyor.
export type CalismaAraligi = {
  haftaninGunu: number;
  baslangicDk: number;
  bitisDk: number;
};

/// Panel takviminin bir randevusu. Join'li: takvim hucresinde hizmet, personel
/// ve musteri adi ayni anda gorunuyor - her hucre icin ayri sorgu acmak
/// takvimde N+1 demekti.
export type TakvimRandevusu = {
  id: string;
  baslangic: Date;
  bitis: Date;
  durum: RandevuDurumu;
  kaynak: "MUSTERI" | "ISLETME";
  not: string | null;
  personelId: string;
  personelAd: string;
  hizmetId: string;
  hizmetAd: string;
  hizmetRenk: string | null;
  hizmetSureDk: number;
  /// Randevunun alindigi ANDAKI fiyat degil, hizmetin BUGUNKU fiyati. Randevu
  /// tablosu tutar tasimiyor; gecmis randevularda fiyat degisimi geriye donuk
  /// gorunuyor. Kabul edilebilir cunku panel bunu tahsilat kaydi olarak degil
  /// "bu randevu ne kadarlik" bilgisi olarak gosteriyor - gercek tahsilat
  /// planda hic yok.
  hizmetFiyatKurus: number;
  musteriId: string;
  musteriAd: string;
  musteriTelefon: string;
  musteriEposta: string | null;
};

/// Halka acik randevu yazmanin girdisi.
///
/// `personelId` ve `bitis` istemciden DEGIL musaitlik motorundan geliyor
/// (bkz. `slotSec`): bitisi cagrildigi yerde yeniden hesaplamak, yaz saati
/// gecisinde motorunkinden farkli bir deger uretebilir ve cakisma kisiti o
/// farki gormezdi.
export type RandevuYazma = {
  personelId: string;
  hizmetId: string;
  baslangic: Date;
  bitis: Date;
  musteriAd: string;
  telefon: string;
  eposta: string | null;
  not: string | null;
  iptalToken: string;
  /// Acik randevu sinirinin "gelecek" tanimi disaridan veriliyor; bu dosya
  /// `new Date()` okumuyor ki testler zamani sabitleyebilsin.
  simdi: Date;
  enCokAcikRandevu: number;
  otomatikOnay: boolean;
};

/// 40P01 = deadlock_detected. Gerekcesi `randevuOlustur`un yaninda.
const KILITLENME = "40P01";

type Veritabani = Awaited<ReturnType<typeof getDb>>;

/// Kuyruga yazilacak tek bir mesaj. `tur` yok cunku Faz I yalnizca e-posta
/// yaziyor; SMS satirlarini Faz K ekleyecek ve o zaman burasi genisler.
export type YeniBildirim = {
  randevuId: string;
  sablon: SablonKimligi;
  /// Ne zaman GONDERILEBILIR. Anlik mesajlarda "simdi", hatirlatmada
  /// randevudan bir gun once. Gecmis bir deger "hemen gonderilebilir" demek.
  planlananZaman: Date;
};

/// Gonderim katmanina donen satir: kuyruk kaydi + sablonun ihtiyac duydugu
/// randevu verisi tek sorguda. Ayri ayri okunsaydi her mesaj icin bes sorgu
/// acilirdi ve bu kod `after()` icinde, yanit gonderildikten sonra kosuyor -
/// oradaki her ek gecikme Worker'in omrunu uzatiyor.
export type BekleyenBildirim = {
  id: string;
  sablon: SablonKimligi;
  randevuId: string;
  isletmeSlug: string;
  iptalToken: string;
  musteriEposta: string | null;
  isletmeAd: string;
  isletmeTelefon: string | null;
  saatDilimi: string;
  musteriAd: string;
  musteriTelefon: string;
  hizmetAd: string;
  personelAd: string;
  baslangic: Date;
};

/// BILDIRIM KAPISI - iki kapsamli kapida da AYNI kod.
///
/// Neden ortak fonksiyon, neden iki yere kopyalanmadi: randevuyu YAZAN yol
/// oturumsuz (`getHalkaAcikDb`), durumunu DEGISTIREN yol oturumlu
/// (`getScopedDb`), ama ikisi de ayni kuyruga yaziyor ve ayni satirlari
/// bosaltiyor. Iki kopya bir gun ayrisirdi - ornegin biri `tur = 'EPOSTA'`
/// filtresini unuturdu ve Faz K'de eklenecek SMS satirlari e-posta olarak
/// gonderilmeye calisilirdi.
///
/// DEGISMEZ 1 KORUNUYOR: `kiraci` bu fonksiyona parametre olarak geliyor ama
/// bu dosyanin ICINDEN, iki cagri yerinin de kendi kapanis degiskeninden.
/// Disari acilan yuzeyde kiraci yine verilemiyor.
function bildirimKapisi(db: Veritabani, kiraci: string) {
  return {
    /// Kuyruga toplu yazar. Bos dizi gecerli girdi: e-postasi olmayan bir
    /// musteride yazilacak satir kalmayabiliyor.
    async bildirimKuyrugunaYaz(kayitlar: YeniBildirim[]): Promise<number> {
      if (kayitlar.length === 0) return 0;

      const yazilan = await db
        .insert(bildirimKuyrugu)
        .values(
          kayitlar.map((k) => ({
            isletmeId: kiraci,
            randevuId: k.randevuId,
            tur: "EPOSTA" as const,
            sablon: k.sablon,
            planlananZaman: k.planlananZaman,
          })),
        )
        .returning({ id: bildirimKuyrugu.id });

      return yazilan.length;
    },

    /// Bir randevunun ZAMANI GELMIS, hala bekleyen e-posta satirlari.
    ///
    /// `randevuId`e bagli olmasi bilincli: Faz I'de bosaltma istegin icinden
    /// (`after`) tetikleniyor ve yalnizca o istegin dokundugu randevuyu
    /// ilgilendiriyor. Kuyrugun TAMAMINI tarayan sorgu Faz K'nin cron
    /// yolunda gelecek - orasi kiraci-ustu okuyacagi icin ayri bir tasarim
    /// karari, bu kapiya ait degil.
    async gonderilecekBildirimleriGetir(
      randevuId: string,
      simdi: Date,
    ): Promise<BekleyenBildirim[]> {
      const satirlar = await db
        .select({
          id: bildirimKuyrugu.id,
          sablon: bildirimKuyrugu.sablon,
          randevuId: bildirimKuyrugu.randevuId,
          isletmeSlug: isletme.slug,
          iptalToken: randevu.iptalToken,
          musteriEposta: musteri.eposta,
          isletmeAd: isletme.ad,
          isletmeTelefon: isletme.telefon,
          saatDilimi: isletme.saatDilimi,
          musteriAd: musteri.ad,
          musteriTelefon: musteri.telefon,
          hizmetAd: hizmet.ad,
          personelAd: personel.ad,
          baslangic: randevu.baslangic,
        })
        .from(bildirimKuyrugu)
        .innerJoin(randevu, eq(randevu.id, bildirimKuyrugu.randevuId))
        .innerJoin(isletme, eq(isletme.id, bildirimKuyrugu.isletmeId))
        .innerJoin(musteri, eq(musteri.id, randevu.musteriId))
        .innerJoin(hizmet, eq(hizmet.id, randevu.hizmetId))
        .innerJoin(personel, eq(personel.id, randevu.personelId))
        .where(
          and(
            eq(bildirimKuyrugu.isletmeId, kiraci),
            eq(bildirimKuyrugu.randevuId, randevuId),
            eq(bildirimKuyrugu.durum, "BEKLIYOR"),
            // Faz K'de kuyruga SMS satirlari da girecek; e-posta bosaltmasi
            // onlari almamali.
            eq(bildirimKuyrugu.tur, "EPOSTA"),
            lte(bildirimKuyrugu.planlananZaman, simdi),
          ),
        )
        .orderBy(asc(bildirimKuyrugu.planlananZaman));

      // `sablon` kolonu duz metin (sema orada bilerek enum kullanmadi).
      // Taninmayan bir deger COKMEK yerine ELENIYOR: bir gun silinen ya da
      // yeniden adlandirilan bir sablon, kuyrukta kalan eski satirlar
      // yuzunden butun bosaltmayi kirmasin.
      return satirlar.filter(
        (s): s is BekleyenBildirim => sablonGecerliMi(s.sablon),
      );
    },

    /// Mesaji GONDERMEDEN ONCE ustlenir: kosullu UPDATE, `BEKLIYOR` ->
    /// `GONDERILDI` (DEGISMEZ 3). 0 satir donerse baska bir kosum ayni satiri
    /// almis demektir ve cagiran taraf gondermeden geciyor.
    ///
    /// NEDEN ONCE ISARETLIYORUZ: alternatif "gonder, sonra isaretle" ve o
    /// sirada iki es zamanli bosaltma (istegin `after`'i ile Faz K'nin cron'u)
    /// ayni mesaji IKI KEZ gonderebilir. Bedeli bilinsin - isaretledikten
    /// sonra Worker olurse mesaj gonderilmeden "gonderildi" kalir. Iki riskten
    /// bunu sectik: musteriye ayni onayi iki kez yollamak, kaybolan bir onay
    /// mailinden daha gorunur ve daha guven kirici.
    async bildirimiUstlen(id: string, simdi: Date): Promise<number> {
      const sonuc = await db
        .update(bildirimKuyrugu)
        .set({ durum: "GONDERILDI", gonderimZamani: simdi })
        .where(
          and(
            eq(bildirimKuyrugu.id, id),
            eq(bildirimKuyrugu.isletmeId, kiraci),
            eq(bildirimKuyrugu.durum, "BEKLIYOR"),
          ),
        )
        .returning({ id: bildirimKuyrugu.id });

      return sonuc.length;
    },

    /// Ustlenilmis bir mesaj gonderilemedi. DEGISMEZ 5: `sebep` saglayicinin
    /// ham yaniti degil, `email.ts`in ozetledigi kisa kod.
    async bildirimiHataliIsaretle(id: string, sebep: string): Promise<void> {
      await db
        .update(bildirimKuyrugu)
        .set({ durum: "HATA", hataMetni: sebep, gonderimZamani: null })
        .where(
          and(
            eq(bildirimKuyrugu.id, id),
            eq(bildirimKuyrugu.isletmeId, kiraci),
          ),
        );
    },

    /// Sahte modda gonderilmeyen mesajin gercek HTML'i, panelde gorulebilsin
    /// diye. GERCEK MODDA YAZILMIYOR: her gonderilmis mesajin HTML'ini
    /// saklamak kuyruk tablosunu gereksiz sisirirdi ve o mesaj zaten alicinin
    /// gelen kutusunda.
    async bildirimOnizlemesiniYaz(id: string, html: string): Promise<void> {
      await db
        .update(bildirimKuyrugu)
        .set({ onizlemeHtml: html })
        .where(
          and(
            eq(bildirimKuyrugu.id, id),
            eq(bildirimKuyrugu.isletmeId, kiraci),
          ),
        );
    },

    /// Isletmeye giden bildirimlerin adresi.
    ///
    /// `kullanici` tablosundan okunuyor, `isletme`den DEGIL: isletmenin ayri
    /// bir "bildirim adresi" alani yok ve eklemek goc demekti. SAHIP rolu
    /// seciliyor cunku personelin gelen kutusuna isletmenin butun randevulari
    /// dusmemeli. Birden fazla sahip varsa EN ESKISI: kayit akisi bugun tek
    /// sahip yaziyor, yani bu dal pratikte tek satirla karsilasiyor; yine de
    /// siralama VERILDI ki secim istekten istege degismesin.
    async sahipEpostasiniGetir(): Promise<string | null> {
      const [kayit] = await db
        .select({ eposta: kullanici.eposta })
        .from(kullanici)
        .where(and(eq(kullanici.isletmeId, kiraci), eq(kullanici.rol, "SAHIP")))
        .orderBy(asc(kullanici.olusturmaTarihi))
        .limit(1);

      return kayit?.eposta ?? null;
    },

    /// Randevu iptal edildiginde BEKLEYEN satirlari dusurur.
    ///
    /// NEDEN SILME, neden "IPTAL" durumu degil: `bildirim_durum` enum'unda
    /// boyle bir deger yok ve eklemek goc demekti (Faz I'nin goc gerektirmeme
    /// sozu bilincli - bkz. sema yorumu). Silinen sey zaten hic gonderilmemis
    /// bir mesaj; gecmis kaydi degil, gelecege verilmis bir soz.
    ///
    /// GONDERILMIS satirlara dokunmuyor: musteri o maili aldi, kuyrugun onu
    /// unutmasi paneldeki izi yok etmek olurdu.
    async bekleyenBildirimleriDusur(randevuId: string): Promise<number> {
      const silinen = await db
        .delete(bildirimKuyrugu)
        .where(
          and(
            eq(bildirimKuyrugu.isletmeId, kiraci),
            eq(bildirimKuyrugu.randevuId, randevuId),
            eq(bildirimKuyrugu.durum, "BEKLIYOR"),
          ),
        )
        .returning({ id: bildirimKuyrugu.id });

      return silinen.length;
    },
  };
}

/// Isletme oturumuna bagli, kiraci filtresi enjekte edilmis veri kapisi.
export async function getScopedDb(oturum: IsletmeOturumu) {
  const db = await getDb();
  // Kapanista tutuluyor: asagidaki hicbir metot bunu disaridan almiyor.
  const kiraci = oturum.isletmeId;

  /// Takvim sorgularinin ORTAK secim listesi.
  ///
  /// Tek yerde duruyor cunku `randevulariListele` ve `randevuGetir` AYNI
  /// `TakvimRandevusu` tipini donduruyor: listede olup detayda olmayan bir alan,
  /// arayuzde ancak randevuya tiklandiginda ortaya cikan bir bosluk uretirdi.
  const takvimAlanlari = {
    id: randevu.id,
    baslangic: randevu.baslangic,
    bitis: randevu.bitis,
    durum: randevu.durum,
    kaynak: randevu.kaynak,
    not: randevu.not,
    personelId: randevu.personelId,
    personelAd: personel.ad,
    hizmetId: randevu.hizmetId,
    hizmetAd: hizmet.ad,
    hizmetRenk: hizmet.renk,
    hizmetSureDk: hizmet.sureDk,
    hizmetFiyatKurus: hizmet.fiyatKurus,
    musteriId: randevu.musteriId,
    musteriAd: musteri.ad,
    musteriTelefon: musteri.telefon,
    musteriEposta: musteri.eposta,
  };

  return {
    // Kuyruga yazma ve bosaltma metotlari (Faz I). Iki kapida da AYNI kod -
    // gerekcesi bildirimKapisi'nin basinda.
    ...bildirimKapisi(db, kiraci),

    /// Panelin gelistirici ekrani icin: kuyrugun SON satirlari.
    ///
    /// Yalnizca burada, halka acik kapida YOK: kuyrugu okumak isletmenin
    /// musteri adlarini ve telefonlarini gormek demek, oysa oteki kapi
    /// oturumsuz.
    async bildirimleriListele(enCok: number) {
      return db
        .select({
          id: bildirimKuyrugu.id,
          tur: bildirimKuyrugu.tur,
          sablon: bildirimKuyrugu.sablon,
          durum: bildirimKuyrugu.durum,
          planlananZaman: bildirimKuyrugu.planlananZaman,
          gonderimZamani: bildirimKuyrugu.gonderimZamani,
          hataMetni: bildirimKuyrugu.hataMetni,
          onizlemeHtml: bildirimKuyrugu.onizlemeHtml,
          olusturmaTarihi: bildirimKuyrugu.olusturmaTarihi,
          randevuId: bildirimKuyrugu.randevuId,
          musteriAd: musteri.ad,
          baslangic: randevu.baslangic,
        })
        .from(bildirimKuyrugu)
        .innerJoin(randevu, eq(randevu.id, bildirimKuyrugu.randevuId))
        .innerJoin(musteri, eq(musteri.id, randevu.musteriId))
        .where(eq(bildirimKuyrugu.isletmeId, kiraci))
        .orderBy(desc(bildirimKuyrugu.olusturmaTarihi))
        .limit(enCok);
    },

    async isletmeyiGetir() {
      const [kayit] = await db
        .select()
        .from(isletme)
        .where(eq(isletme.id, kiraci))
        .limit(1);
      return kayit ?? null;
    },

    async isletmeyiGuncelle(veri: { ad?: string; saatDilimi?: string }) {
      const sonuc = await db
        .update(isletme)
        .set(veri)
        .where(eq(isletme.id, kiraci))
        .returning({ id: isletme.id });
      return sonuc.length;
    },

    async personelleriListele() {
      return db
        .select()
        .from(personel)
        .where(eq(personel.isletmeId, kiraci))
        .orderBy(personel.sira);
    },

    async personelGetir(id: string) {
      const [kayit] = await db
        .select()
        .from(personel)
        // Iki kosul birlikte: id tek basina yeterli DEGIL. Baska isletmenin
        // personel id'si buraya gelirse bos donuyor, 404'e ceviriliyor.
        .where(and(eq(personel.id, id), eq(personel.isletmeId, kiraci)))
        .limit(1);
      return kayit ?? null;
    },

    async personelEkle(veri: YeniPersonel) {
      const [kayit] = await db
        .insert(personel)
        .values({ ...veri, isletmeId: kiraci })
        .returning();
      return kayit;
    },

    async personelGuncelle(id: string, veri: Partial<YeniPersonel>) {
      const sonuc = await db
        .update(personel)
        .set(veri)
        .where(and(eq(personel.id, id), eq(personel.isletmeId, kiraci)))
        .returning({ id: personel.id });
      // 0 donuyorsa kayit yok YA DA baska kiraciya ait - ikisi de cagirana
      // ayni gorunmeli, yoksa varligi sizdirmis oluruz.
      return sonuc.length;
    },

    /// Personeli pasife alir - ama SON aktif personeli almaz.
    ///
    /// Randevu bir personele baglanmak zorunda (`personelId` notNull). Son
    /// kisiyi de pasife almak, isletmeyi randevu alinamaz bir duruma sokar ve
    /// bunu kullanici ancak musterisi sikayet edince fark ederdi.
    ///
    /// Sayma ve guncelleme AYNI transaction'da: ard arda iki istek ikisini de
    /// "son degil" gorup ikisini birden pasifleyebilirdi.
    async personelPasifleStir(id: string) {
      return db.transaction(async (tx) => {
        const aktifler = await tx
          .select({ id: personel.id })
          .from(personel)
          .where(and(eq(personel.isletmeId, kiraci), eq(personel.aktif, true)))
          .for("update");

        // Hedef zaten pasifse ya da bizim degilse "yok" - IDOR'da varligi
        // sizdirmamak icin ikisi ayni cevabi aliyor.
        if (!aktifler.some((p) => p.id === id)) return { durum: "yok" as const };
        if (aktifler.length <= 1) return { durum: "son-personel" as const };

        await tx
          .update(personel)
          .set({ aktif: false })
          .where(and(eq(personel.id, id), eq(personel.isletmeId, kiraci)));

        return { durum: "tamam" as const };
      });
    },

    async kullanicilariListele() {
      return db
        .select()
        .from(kullanici)
        .where(eq(kullanici.isletmeId, kiraci));
    },

    // ---- Ayarlar ----------------------------------------------------------

    async ayarlariGuncelle(veri: {
      ad?: string;
      telefon?: string | null;
      adres?: string | null;
      hakkinda?: string | null;
      saatDilimi?: string;
      slotAraligiDk?: number;
      minOnceBildirimDk?: number;
      maksIleriGun?: number;
      otomatikOnay?: boolean;
      gelmediKisitiGun?: number;
      il?: string | null;
      ilce?: string | null;
      kategori?: string | null;
    }) {
      const sonuc = await db
        .update(isletme)
        .set(veri)
        .where(eq(isletme.id, kiraci))
        .returning({ id: isletme.id });
      return sonuc.length;
    },

    /// Isletmeyi dizine (pazaryeri) sokar ya da cikarir.
    ///
    /// NEDEN `ayarlariGuncelle`nin bir alani DEGIL: yayina cikmak on kosullu.
    /// Ayni sette gelseydi bir istek `{ ad: "...", yayinda: true }` gonderip
    /// kontrolu atlayabilirdi - alan yazilir, kosul bakilmazdi.
    ///
    /// Kapatmak kosulsuz: isletme kendini her an dizinden cekebilmeli.
    ///
    /// Eksik alanlar SAYILARAK donuyor, tek bir "olmadi" ile degil: kullaniciya
    /// neyi tamamlamasi gerektigini soylemeyen bir ret, ayarlar ekraninda
    /// tikanmis bir kullanici demek.
    async yayindaAyarla(
      yayinda: boolean,
    ): Promise<
      | { durum: "tamam" }
      | { durum: "eksik"; eksikler: string[] }
    > {
      if (!yayinda) {
        await db
          .update(isletme)
          .set({ yayinda: false })
          .where(eq(isletme.id, kiraci));
        return { durum: "tamam" };
      }

      const [profil] = await db
        .select({ il: isletme.il, kategori: isletme.kategori })
        .from(isletme)
        .where(eq(isletme.id, kiraci))
        .limit(1);

      // Randevu alinamayan bir isletme dizinde yer kaplayip tiklanamaz olurdu.
      // Kosullar `/r/[slug]` sayfasinin "randevu alinamiyor" bos durumuyla ayni
      // uc sey: hizmet, personel, calisma saati.
      const [hizmetSayisi] = await db
        .select({ adet: sql<number>`count(*)` })
        .from(hizmet)
        .where(and(eq(hizmet.isletmeId, kiraci), eq(hizmet.aktif, true)));

      const [personelSayisi] = await db
        .select({ adet: sql<number>`count(*)` })
        .from(personel)
        .where(and(eq(personel.isletmeId, kiraci), eq(personel.aktif, true)));

      const [saatSayisi] = await db
        .select({ adet: sql<number>`count(*)` })
        .from(calismaSaati)
        .where(eq(calismaSaati.isletmeId, kiraci));

      const eksikler: string[] = [];
      if (!profil?.il) eksikler.push("il");
      if (!profil?.kategori) eksikler.push("kategori");
      if (Number(hizmetSayisi?.adet ?? 0) === 0) eksikler.push("hizmet");
      if (Number(personelSayisi?.adet ?? 0) === 0) eksikler.push("personel");
      if (Number(saatSayisi?.adet ?? 0) === 0) eksikler.push("calisma-saati");

      if (eksikler.length > 0) return { durum: "eksik", eksikler };

      // DB'de de bir CHECK var (isletme_yayin_alanlari_tam). Buradaki kontrol
      // kullaniciya ANLASILIR geri bildirim icin; garanti oradaki kisit
      // (DEGISMEZ 8'in ruhu: uygulama unutabilir, kisit unutmaz).
      await db
        .update(isletme)
        .set({ yayinda: true })
        .where(eq(isletme.id, kiraci));

      return { durum: "tamam" };
    },

    // ---- Hizmetler --------------------------------------------------------

    async hizmetleriListele({ pasifDahil = false } = {}) {
      const kosul = pasifDahil
        ? eq(hizmet.isletmeId, kiraci)
        : and(eq(hizmet.isletmeId, kiraci), eq(hizmet.aktif, true));

      return db
        .select()
        .from(hizmet)
        .where(kosul)
        .orderBy(asc(hizmet.sira), asc(hizmet.ad));
    },

    async hizmetGetir(id: string) {
      const [kayit] = await db
        .select()
        .from(hizmet)
        // Iki kosul birlikte: id tek basina yeterli DEGIL.
        .where(and(eq(hizmet.id, id), eq(hizmet.isletmeId, kiraci)))
        .limit(1);
      return kayit ?? null;
    },

    async hizmetEkle(veri: YeniHizmet) {
      const [kayit] = await db
        .insert(hizmet)
        .values({ ...veri, isletmeId: kiraci })
        .returning();
      return kayit;
    },

    async hizmetGuncelle(id: string, veri: Partial<YeniHizmet>) {
      const sonuc = await db
        .update(hizmet)
        .set(veri)
        .where(and(eq(hizmet.id, id), eq(hizmet.isletmeId, kiraci)))
        .returning({ id: hizmet.id });
      // 0 donuyorsa kayit yok YA DA baska kiraciya ait - ikisi de cagirana
      // ayni gorunmeli.
      return sonuc.length;
    },

    /// Hizmet SILINMIYOR, pasifleniyor. Gecmis randevular ona bagli
    /// (`ON DELETE restrict`) ve silinen bir hizmet gecmisi de goturur.
    async hizmetPasifleStir(id: string) {
      const sonuc = await db
        .update(hizmet)
        .set({ aktif: false })
        .where(and(eq(hizmet.id, id), eq(hizmet.isletmeId, kiraci)))
        .returning({ id: hizmet.id });
      return sonuc.length;
    },

    // ---- Personel <-> hizmet ---------------------------------------------

    async personelHizmetleriniListele(personelId: string) {
      return db
        .select({ hizmetId: personelHizmet.hizmetId })
        .from(personelHizmet)
        .where(
          and(
            eq(personelHizmet.personelId, personelId),
            eq(personelHizmet.isletmeId, kiraci),
          ),
        );
    },

    /// Personelin verdigi hizmetleri TOPLU yazar (once siler, sonra ekler).
    ///
    /// Tek tek ekle/cikar yerine toplu yazma: arayuz zaten kutucuk listesi
    /// gonderiyor ve araya giren ikinci bir istek yarim bir kume birakmasin.
    /// Bos liste "hicbiri" degil "hepsi" demek - sema yorumuna bak.
    async personelHizmetleriniYaz(personelId: string, hizmetIdler: string[]) {
      return db.transaction(async (tx) => {
        // KIRACI KONTROLU. Bu satir olmadan baska isletmenin personeline
        // baglanti yazilabilirdi: asagidaki insert isletmeId'yi kendisi
        // koyuyor, yani satir "bizim" gorunur ama personel onlarin olurdu.
        const [sahiplik] = await tx
          .select({ id: personel.id })
          .from(personel)
          .where(and(eq(personel.id, personelId), eq(personel.isletmeId, kiraci)))
          .limit(1);
        if (!sahiplik) return { durum: "yok" as const };

        // Hizmetlerin de bizim olmasi gerekiyor; yabanci id sessizce
        // eklenmemeli.
        const bizimHizmetler = hizmetIdler.length
          ? await tx
              .select({ id: hizmet.id })
              .from(hizmet)
              .where(
                and(eq(hizmet.isletmeId, kiraci), inArray(hizmet.id, hizmetIdler)),
              )
          : [];

        if (bizimHizmetler.length !== hizmetIdler.length) {
          return { durum: "gecersiz-hizmet" as const };
        }

        await tx
          .delete(personelHizmet)
          .where(
            and(
              eq(personelHizmet.personelId, personelId),
              eq(personelHizmet.isletmeId, kiraci),
            ),
          );

        if (bizimHizmetler.length) {
          await tx.insert(personelHizmet).values(
            bizimHizmetler.map((h) => ({
              personelId,
              hizmetId: h.id,
              isletmeId: kiraci,
            })),
          );
        }

        return { durum: "tamam" as const };
      });
    },

    // ---- Calisma saatleri -------------------------------------------------

    async calismaSaatleriniListele(personelId?: string) {
      const kosul = personelId
        ? and(
            eq(calismaSaati.isletmeId, kiraci),
            eq(calismaSaati.personelId, personelId),
          )
        : eq(calismaSaati.isletmeId, kiraci);

      return db
        .select()
        .from(calismaSaati)
        .where(kosul)
        .orderBy(asc(calismaSaati.haftaninGunu), asc(calismaSaati.baslangicDk));
    },

    /// Bir personelin HAFTASINI komple yazar.
    ///
    /// Neden toplu: haftalik duzen kullanicinin kafasinda tek bir sey. Satir
    /// satir ekle/sil API'si, yarim uygulanmis bir haftanin ortaya cikmasina
    /// izin verirdi - pazartesi silinmis, yenisi yazilamamis gibi.
    async calismaSaatleriniYaz(personelId: string, araliklar: CalismaAraligi[]) {
      return db.transaction(async (tx) => {
        const [sahiplik] = await tx
          .select({ id: personel.id })
          .from(personel)
          .where(and(eq(personel.id, personelId), eq(personel.isletmeId, kiraci)))
          .limit(1);
        if (!sahiplik) return { durum: "yok" as const };

        await tx
          .delete(calismaSaati)
          .where(
            and(
              eq(calismaSaati.personelId, personelId),
              eq(calismaSaati.isletmeId, kiraci),
            ),
          );

        if (araliklar.length) {
          await tx.insert(calismaSaati).values(
            araliklar.map((a) => ({ ...a, personelId, isletmeId: kiraci })),
          );
        }

        return { durum: "tamam" as const };
      });
    },

    // ---- Panel takvimi ----------------------------------------------------

    /// Verilen pencereyle KESISEN randevular.
    ///
    /// Aralik semantigi kesisme, "icinde olma" DEGIL: `baslangic < ust AND
    /// bitis > alt`. Gece yarisini asan bir randevu aksi halde iki gunde de
    /// gorunmezdi - ne bittigi gunde (orada baslamiyor) ne de basladigi gunde
    /// (orada bitmiyor). Ayni gerekce `musaitlik-sorgu.ts`'te de yazili;
    /// ikisinin ayni davranmasi sart, yoksa takvimde gorunmeyen bir randevu
    /// sloti dolduruyor olurdu.
    ///
    /// Sinirlar `[)` gibi davraniyor: tam `ust` aninda baslayan ve tam `alt`
    /// aninda biten randevu DISARIDA. Bitisik randevular ustuste binmesin diye -
    /// EXCLUDE kisitinin `'[)'` araligiyla ayni kabul (DEGISMEZ 8).
    ///
    /// TUM DURUMLAR DONUYOR, IPTAL dahil. Isletme iptal edilmis randevuyu
    /// gormek istiyor ("musteri gelmedi mi, iptal mi etti"); hangisinin
    /// gosterilecegi arayuzun filtresi, verinin isi degil.
    async randevulariListele(
      alt: Date,
      ust: Date,
      secenekler?: { personelId?: string },
    ): Promise<TakvimRandevusu[]> {
      const kosul = and(
        eq(randevu.isletmeId, kiraci),
        lt(randevu.baslangic, ust),
        gt(randevu.bitis, alt),
        // Personel suzgeci kiraci filtresinin YANINA ekleniyor, yerine degil:
        // yabanci bir personel id'si geldiginde sorgu hata vermiyor, bos liste
        // donuyor - varligini da sizdirmiyor. `and` undefined'i atiyor, yani
        // suzgec yokken kosul kendiliginden kisaliyor.
        secenekler?.personelId
          ? eq(randevu.personelId, secenekler.personelId)
          : undefined,
      );

      return db
        .select(takvimAlanlari)
        .from(randevu)
        .innerJoin(hizmet, eq(hizmet.id, randevu.hizmetId))
        .innerJoin(personel, eq(personel.id, randevu.personelId))
        .innerJoin(musteri, eq(musteri.id, randevu.musteriId))
        .where(kosul)
        .orderBy(asc(randevu.baslangic));
    },

    /// Tek randevunun detayi.
    async randevuGetir(id: string): Promise<TakvimRandevusu | null> {
      const [kayit] = await db
        .select(takvimAlanlari)
        .from(randevu)
        .innerJoin(hizmet, eq(hizmet.id, randevu.hizmetId))
        .innerJoin(personel, eq(personel.id, randevu.personelId))
        .innerJoin(musteri, eq(musteri.id, randevu.musteriId))
        // Iki kosul birlikte: id tek basina yeterli DEGIL. Baska isletmenin
        // randevu id'si buraya gelirse bos donuyor, 404'e ceviriliyor.
        .where(and(eq(randevu.id, id), eq(randevu.isletmeId, kiraci)))
        .limit(1);

      return kayit ?? null;
    },

    /// DEGISMEZ 3: kosullu UPDATE. Beklenen durum `where`'de, once-oku-sonra-
    /// yaz yok. Iki sekme ayni randevuyu ayni anda karara baglarsa ikincisi
    /// 0 satir etkiliyor ve cagiran taraf 409 donuyor.
    ///
    /// KAYNAK DURUM KUMESI CAGIRANDAN ALINMIYOR, burada `kaynakDurumlar` ile
    /// uretiliyor: gecis kuralinin tek kaynagi `randevu-durum.ts` kalsin diye.
    /// Kume parametre olsaydi bir route "IPTAL -> ONAYLI"yi kendi basina
    /// mumkun kilabilirdi ve kural iki yerde yasardi.
    /// GELMEDI hedefinde ayrica musterinin randevu kisiti ileri atiliyor
    /// (Faz L3) - ayni transaction icinde, cunku kisit randevunun gercekten
    /// GELMEDI'ye gectiginin SONUCU. Iki ayri istekte yapilsaydi, kosullu
    /// UPDATE'i kaybeden ikinci sekme de kisiti bir kez daha uzatabilirdi.
    async randevuDurumunuDegistir(
      id: string,
      hedef: RandevuDurumu,
    ): Promise<number> {
      const kume = kaynakDurumlar(hedef);

      // BEKLIYOR hicbir gecisin varisi degil, yani kume bos olabiliyor.
      // Drizzle bos `inArray`'i `false` uretecek sekilde ele aliyor ama bu
      // surume bagli bir davranis; kazanamayacak sorguyu hic gondermiyoruz.
      if (kume.length === 0) return 0;

      return db.transaction(async (tx) => {
        const sonuc = await tx
          .update(randevu)
          .set({ durum: hedef })
          .where(
            and(
              eq(randevu.id, id),
              eq(randevu.isletmeId, kiraci),
              inArray(randevu.durum, kume),
            ),
          )
          // musteriId geri isteniyor: kisiti yazacak satiri bulmak icin
          // randevuyu ikinci kez okumak gerekmesin.
          .returning({ id: randevu.id, musteriId: randevu.musteriId });

        if (hedef !== "GELMEDI" || sonuc.length === 0) {
          // 0 donuyorsa kayit yok, baska kiraciya ait YA DA durumu artik
          // uygun degil - uctu de cagirana ayni gorunmeli, yoksa varligi
          // sizdiririz.
          return sonuc.length;
        }

        // Kisit suresi ISLETMENIN kendi ayarindan; cagiran taraf veremiyor.
        // Parametre olsaydi bir route kendi basina omurluk kisit yazabilirdi.
        const [ayar] = await tx
          .select({ gun: isletme.gelmediKisitiGun })
          .from(isletme)
          .where(eq(isletme.id, kiraci))
          .limit(1);

        // 0 = kisit kapali. O zaman GELMEDI isaretlemek yalnizca kayit
        // tutuyor, musteriyi kapiya koymuyor.
        if (!ayar || ayar.gun <= 0) return sonuc.length;

        await tx
          .update(musteri)
          .set({
            // Sure DB saatinden hesaplaniyor: transaction icinde `now()`
            // islemin baslangici, yani uygulama ile veritabani saati
            // arasindaki kayma kisiti uzatip kisaltamiyor.
            //
            // GREATEST: var olan bir kisit KISALTILMIYOR. Iki gelmedi
            // ust uste isaretlenirse ikincisi sureyi bastan baslatiyor ama
            // isletme bu arada ayari kucultmusse eski, daha uzun kisit
            // ayakta kaliyor - musteriye "yeniden kapandi" demek yerine.
            randevuKisitiBitis: sql`greatest(
              coalesce(${musteri.randevuKisitiBitis}, now()),
              now() + make_interval(days => ${ayar.gun})
            )`,
          })
          // Kiraci filtresi burada da var: musteriId randevudan geldi ama
          // bu dosyanin sozlesmesi "her sorguda kiraci".
          .where(
            and(
              eq(musteri.id, sonuc[0].musteriId),
              eq(musteri.isletmeId, kiraci),
            ),
          );

        return sonuc.length;
      });
    },
  };
}

export type ScopedDb = Awaited<ReturnType<typeof getScopedDb>>;

/// Oturumsuz, halka acik okumalar icin. Kiraci slug'dan cozuluyor ve yalnizca
/// AKTIF isletme donuyor - pasif bir isletmenin randevu sayfasi acilmamali.
///
/// Buradaki her metot da kapsamli: kiraci yine kapanis degiskeni ve disaridan
/// verilemiyor. Fark, kiracinin oturumdan degil slug'dan gelmesi. Halka acik
/// olmasi kapsamsiz olmasi demek DEGIL - aksi halde bir musteri baska bir
/// salonun randevularini okuyabilirdi.
export async function getHalkaAcikDb(slug: string) {
  const db = await getDb();

  const [sahip] = await db
    .select({
      id: isletme.id,
      ad: isletme.ad,
      slug: isletme.slug,
      hakkinda: isletme.hakkinda,
      adres: isletme.adres,
      telefon: isletme.telefon,
      saatDilimi: isletme.saatDilimi,
      slotAraligiDk: isletme.slotAraligiDk,
      minOnceBildirimDk: isletme.minOnceBildirimDk,
      maksIleriGun: isletme.maksIleriGun,
      otomatikOnay: isletme.otomatikOnay,
      gelmediKisitiGun: isletme.gelmediKisitiGun,
    })
    .from(isletme)
    .where(and(eq(isletme.slug, slug), eq(isletme.aktif, true)))
    .limit(1);

  if (!sahip) return null;

  const kiraci = sahip.id;

  /// Randevu yazmanin TEK denemesi; yeniden deneme dongusu `randevuOlustur`da.
  ///
  /// Ayri bir fonksiyon cunku kilitlenme sonrasi tekrar, transaction'in
  /// TAMAMINI bastan calistirmak zorunda: yarim bir tekrar, sahibi olmayan bir
  /// musteri kaydi birakirdi. Metot olarak degil kapanis fonksiyonu olarak
  /// duruyor - `kiraci` filtresi burada da disaridan verilemiyor.
  async function randevuYaz(veri: RandevuYazma) {
    try {
      return await db.transaction(async (tx) => {
        // Musteri TELEFONLA tekilleniyor (sema: musteri_isletme_telefon_idx).
        const [mevcut] = await tx
          .select({ id: musteri.id, kisitBitis: musteri.randevuKisitiBitis })
          .from(musteri)
          .where(
            and(
              eq(musteri.isletmeId, kiraci),
              eq(musteri.telefon, veri.telefon),
            ),
          )
          .limit(1);

        let musteriId = mevcut?.id;
        // Yeni musterinin kisiti olamaz; alan yalnizca mevcut kayittan gelir.
        let kisitBitis = mevcut?.kisitBitis ?? null;

        if (!musteriId) {
          // `onConflictDoNothing`: ayni numarayla ayni anda gelen ikinci
          // istek benzersizlik ihlaliyle 500 uretmesin. Ikinci istek bos
          // doner ve asagida kaydi okuyup devam eder.
          const [yeni] = await tx
            .insert(musteri)
            .values({
              isletmeId: kiraci,
              ad: veri.musteriAd,
              telefon: veri.telefon,
              eposta: veri.eposta,
            })
            .onConflictDoNothing()
            .returning({ id: musteri.id });

          if (yeni) {
            musteriId = yeni.id;
          } else {
            const [yarisiKaybeden] = await tx
              .select({
                id: musteri.id,
                kisitBitis: musteri.randevuKisitiBitis,
              })
              .from(musteri)
              .where(
                and(
                  eq(musteri.isletmeId, kiraci),
                  eq(musteri.telefon, veri.telefon),
                ),
              )
              .limit(1);
            // Buraya dusmek icin satirin insert ile select arasinda
            // SILINMIS olmasi gerekir. Sessizce "saat dolu" demek yanlis
            // olurdu: musteriye yanlis sebebi soyleyip gercek sorunu
            // gizlerdik. Beklenmeyen durum beklenmeyen hata olarak ciksin.
            if (!yarisiKaybeden) {
              throw new Error("Musteri kaydi olusturulamadi");
            }
            musteriId = yarisiKaybeden.id;
            kisitBitis = yarisiKaybeden.kisitBitis;
          }
        }
        // MEVCUT MUSTERININ ADI VE NOTU GUNCELLENMIYOR. Bu yol oturumsuz:
        // numarayi bilen herkes buraya yazabiliyor. Guncelleseydik, bir
        // yabanci isletmenin musteri kaydindaki adi degistirebilirdi.
        // Isletme farkli bir ad gormek isterse panelden kendi duzeltir.

        // GELMEDI KISITI (Faz L3). Randevusuna gelmedigi isaretlenen musteri
        // bir sure bu isletmeden randevu alamiyor.
        //
        // Kisit suresi ISLETMENIN ayarindan ve kapanis degiskeninden
        // okunuyor, `veri` ile disaridan GELMIYOR: route bir gun ayari
        // gecmeyi unutsa kisit sessizce kalkardi ve bunu hicbir test
        // gostermezdi - ayar alani hala doluyken davranis kaybolurdu.
        //
        // `gelmediKisitiGun === 0` (kisit kapali) kayitli bitis tarihini de
        // YOK SAYIYOR: isletme ayari kapattiginda mevcut kisitlarin da
        // kalkmasini bekliyor. Alanlari temizlemek yerine okumada yok saymak,
        // ayari tekrar acinca gecmisin geri gelmesi demek - "yanlislikla
        // kapattim" durumunda dogru davranis bu.
        //
        // Sinir `>`: bitis anininda kisit BITMIS sayiliyor.
        if (
          sahip.gelmediKisitiGun > 0 &&
          kisitBitis &&
          kisitBitis.getTime() > veri.simdi.getTime()
        ) {
          return { durum: "kisitli" as const, bitis: kisitBitis };
        }

        // Ayni musterinin ACIK randevu sayisi sinirli. Bot korumasi degil
        // (o Faz G2'de Turnstile ve hiz siniriyla geliyor) - takvimi elli
        // randevuyla doldurup sonra hicbirine gelmeyen kullanimi engelliyor.
        // Sayim transaction icinde ama SERIALIZABLE degil: ayni anda gelen
        // iki istek siniri bir asabilir. Kabul edildi, cunku bunun bedeli
        // fazladan bir randevu; kilitlemenin bedeli ise her randevu
        // yaziminda musteri satirini kilitlemek.
        const acikOlanlar = await tx
          .select({ id: randevu.id })
          .from(randevu)
          .where(
            and(
              eq(randevu.isletmeId, kiraci),
              eq(randevu.musteriId, musteriId),
              inArray(randevu.durum, ["BEKLIYOR", "ONAYLI"]),
              gte(randevu.baslangic, veri.simdi),
            ),
          );

        if (acikOlanlar.length >= veri.enCokAcikRandevu) {
          return { durum: "sinir" as const, acik: acikOlanlar.length };
        }

        const [olusan] = await tx
          .insert(randevu)
          .values({
            isletmeId: kiraci,
            personelId: veri.personelId,
            hizmetId: veri.hizmetId,
            musteriId,
            baslangic: veri.baslangic,
            bitis: veri.bitis,
            durum: veri.otomatikOnay ? "ONAYLI" : "BEKLIYOR",
            kaynak: "MUSTERI",
            not: veri.not,
            iptalToken: veri.iptalToken,
          })
          .returning();

        return { durum: "tamam" as const, randevu: olusan };
      });
    } catch (hata) {
      // Cakisma kisiti YA DA iki istegin ayni sloti yakalamasi. Ikisi de
      // "o saat artik bos degil" demek; cagirana ayni gorunuyorlar.
      // cakismaIhlaliMi HAM hatayi aliyor: kodu Drizzle'in sarmalayicisinin
      // altindan kendisi cikariyor (bkz. pg-hata.ts).
      if (cakismaIhlaliMi(hata)) return { durum: "dolu" as const };
      throw hata;
    }
  }

  return {
    isletme: sahip,

    // Kuyruga yazma ve bosaltma metotlari (Faz I). Panel kapisiyla AYNI kod;
    // kuyrugu OKUYAN `bildirimleriListele` burada bilerek yok.
    ...bildirimKapisi(db, kiraci),

    async personelleriListele() {
      return db
        .select({ id: personel.id, ad: personel.ad, unvan: personel.unvan })
        .from(personel)
        .where(and(eq(personel.isletmeId, kiraci), eq(personel.aktif, true)))
        .orderBy(personel.sira);
    },

    async hizmetleriListele() {
      return db
        .select({
          id: hizmet.id,
          ad: hizmet.ad,
          aciklama: hizmet.aciklama,
          sureDk: hizmet.sureDk,
          fiyatKurus: hizmet.fiyatKurus,
          renk: hizmet.renk,
        })
        .from(hizmet)
        .where(and(eq(hizmet.isletmeId, kiraci), eq(hizmet.aktif, true)))
        .orderBy(asc(hizmet.sira), asc(hizmet.ad));
    },

    async hizmetGetir(id: string) {
      const [kayit] = await db
        .select({ id: hizmet.id, ad: hizmet.ad, sureDk: hizmet.sureDk })
        .from(hizmet)
        .where(
          and(
            eq(hizmet.id, id),
            eq(hizmet.isletmeId, kiraci),
            eq(hizmet.aktif, true),
          ),
        )
        .limit(1);
      return kayit ?? null;
    },

    /// Bir hizmeti VEREBILEN aktif personeller.
    ///
    /// `personel_hizmet` bos olmasi "hepsi" demek (bkz. sema yorumu), yani
    /// eslemesi hic olmayan personel her hizmeti veriyor sayiliyor. Bu kural
    /// burada uygulaniyor ki cagiran taraf onu bilmek zorunda kalmasin.
    async hizmetiVerenPersoneller(hizmetId: string) {
      const aktifler = await db
        .select({ id: personel.id, ad: personel.ad, unvan: personel.unvan })
        .from(personel)
        .where(and(eq(personel.isletmeId, kiraci), eq(personel.aktif, true)))
        .orderBy(personel.sira);

      const eslemeler = await db
        .select({
          personelId: personelHizmet.personelId,
          hizmetId: personelHizmet.hizmetId,
        })
        .from(personelHizmet)
        .where(eq(personelHizmet.isletmeId, kiraci));

      const eslemesiOlan = new Set(eslemeler.map((e) => e.personelId));
      const buHizmeti = new Set(
        eslemeler.filter((e) => e.hizmetId === hizmetId).map((e) => e.personelId),
      );

      return aktifler.filter(
        (p) => !eslemesiOlan.has(p.id) || buHizmeti.has(p.id),
      );
    },

    async calismaSaatleriniListele(personelId: string) {
      return db
        .select({
          haftaninGunu: calismaSaati.haftaninGunu,
          baslangicDk: calismaSaati.baslangicDk,
          bitisDk: calismaSaati.bitisDk,
        })
        .from(calismaSaati)
        .where(
          and(
            eq(calismaSaati.isletmeId, kiraci),
            eq(calismaSaati.personelId, personelId),
          ),
        );
    },

    /// Verilen aralikla KESISEN kapali araliklar.
    ///
    /// Kesisme testi `baslangic < ust AND bitis > alt`: araligi tamamen
    /// kapsayan bir izin de yakalaniyor. "Baslangici pencerede olanlar" diye
    /// sorulsaydi dun baslayip yarin biten bir tatil gorunmezdi.
    async kapaliAraliklariListele(personelId: string, alt: Date, ust: Date) {
      return db
        .select({ baslangic: kapali.baslangic, bitis: kapali.bitis })
        .from(kapali)
        .where(
          and(
            eq(kapali.isletmeId, kiraci),
            lt(kapali.baslangic, ust),
            gt(kapali.bitis, alt),
            // personelId NULL ise butun isletme kapali; o satirlar herkesi
            // ilgilendiriyor.
            or(isNull(kapali.personelId), eq(kapali.personelId, personelId)),
          ),
        );
    },

    // ---- Randevu yazma ----------------------------------------------------

    /// Randevuyu ve gerekiyorsa musteri kaydini olusturur.
    ///
    /// TEK TRANSACTION: musteri yazilip randevu yazilamazsa geriye, sahibi
    /// olmayan bir musteri kaydi kalirdi. Isletme onu panelde gorur ve hic
    /// gelmemis birinin kaydi gibi durur.
    ///
    /// Cakisma kontrolu BURADA DEGIL: garanti veritabaninin `EXCLUDE USING
    /// gist` kisitinda (DEGISMEZ 8). Kisit ihlali yakalanip `durum: "dolu"`
    /// olarak donuyor - cagiran taraf onu 409'a ceviriyor. Drizzle hatayi
    /// sarmaladigi icin kod `pgHata` ile okunuyor.
    async randevuOlustur(veri: RandevuYazma) {
      // KILITLENME YENIDEN DENENIYOR (40P01).
      //
      // Iki istek CAKISAN araliklari ayni anda yazarsa Postgres 23P01
      // uretemiyor: her islem once kendi satirini yaziyor, sonra EXCLUDE
      // kisitini dogrularken digerinin islemini bekliyor. Ikisi birbirini
      // bekleyince Postgres birini kurban secip 40P01 firlatiyor - yani
      // "cakisti" degil "sirayi cozemedim" diyor. Faz G'de yarisan iki POST
      // testi bunu ortaya cikardi; yakalanmadigi surece yarisi kaybeden
      // musteri 500 goruyordu.
      //
      // Neden yeniden deneme, neden dogrudan 409 degil: kurban islem HICBIR
      // SEY yazmadan geri aliniyor. Kazanan commit ettikten sonra ikinci
      // deneme kesin bir cevap aliyor - saat gercekten doluysa 23P01 ile
      // "dolu", degilse (ornegin cakisma musteri satirindaydi) randevu
      // yaziliyor. Dogrudan 409 demek, yazilabilecek bir randevuyu
      // reddetmek olurdu.
      const EN_COK_DENEME = 3;

      for (let deneme = 1; ; deneme++) {
        try {
          return await randevuYaz(veri);
        } catch (hata) {
          if (pgHata(hata)?.kod === KILITLENME && deneme < EN_COK_DENEME) {
            continue;
          }
          // Israrli kilitlenme de "o saat artik bos degil" demek: bu
          // transaction'in paylastigi tek kaynak randevu araligi ve musteri
          // satiri. Musteriye sunucu hatasi gostermek yerine tekrar secim
          // yaptiriyoruz.
          if (pgHata(hata)?.kod === KILITLENME) return { durum: "dolu" as const };
          throw hata;
        }
      }
    },

    // ---- Iptal ------------------------------------------------------------

    /// Iptal linkinin arkasindaki randevu. Token TEK BASINA yetki tasiyor,
    /// bu yuzden yine de kiraci filtresi var: baska bir salonun sayfasindan
    /// gelen token burada bulunamiyor.
    async randevuTokenIleGetir(token: string) {
      const [kayit] = await db
        .select({
          id: randevu.id,
          baslangic: randevu.baslangic,
          bitis: randevu.bitis,
          durum: randevu.durum,
          not: randevu.not,
          hizmetAd: hizmet.ad,
          hizmetSureDk: hizmet.sureDk,
          hizmetFiyatKurus: hizmet.fiyatKurus,
          personelAd: personel.ad,
          musteriAd: musteri.ad,
        })
        .from(randevu)
        .innerJoin(hizmet, eq(hizmet.id, randevu.hizmetId))
        .innerJoin(personel, eq(personel.id, randevu.personelId))
        .innerJoin(musteri, eq(musteri.id, randevu.musteriId))
        .where(and(eq(randevu.iptalToken, token), eq(randevu.isletmeId, kiraci)))
        .limit(1);

      return kayit ?? null;
    },

    /// DEGISMEZ 3: kosullu UPDATE. Beklenen durum `where`'de, once-oku-sonra-
    /// yaz yok. Ayni linke iki kez basilirsa ikincisi 0 satir etkiliyor ve
    /// cagiran taraf 409 donuyor - "iptal edildi" mesajini iki kez gostermek
    /// yerine ne oldugunu soyluyoruz.
    ///
    /// Randevu SILINMIYOR: isletme iptali gormek istiyor. Slot da bosaliyor,
    /// cunku hem EXCLUDE kisiti hem musaitlik motoru yalnizca BEKLIYOR ve
    /// ONAYLI'yi dolu sayiyor.
    ///
    /// SATIR SAYISI DEGIL ID donuyor: cagiran taraf iptal bildirimlerini
    /// kuyruga yazmak icin randevunun kimligine ihtiyac duyuyor ve onu ikinci
    /// bir sorguyla okumak, bu arada silinmis bir kayitla yarisa girmek
    /// demekti. `null` = 0 satir etkilendi.
    async randevuIptalEt(token: string): Promise<string | null> {
      const sonuc = await db
        .update(randevu)
        .set({ durum: "IPTAL" })
        .where(
          and(
            eq(randevu.iptalToken, token),
            eq(randevu.isletmeId, kiraci),
            inArray(randevu.durum, ["BEKLIYOR", "ONAYLI"]),
          ),
        )
        .returning({ id: randevu.id });

      return sonuc[0]?.id ?? null;
    },

    /// Saati DOLU sayan randevular.
    ///
    /// Yalnizca BEKLIYOR ve ONAYLI: iptal ve gelmedi saati bosaltiyor.
    /// Veritabanindaki EXCLUDE kisitinin WHERE kosuluyla ayni kume - ikisi
    /// ayrisirsa motor "bos" dedigi bir sloti kisit reddeder.
    async doluRandevulariListele(personelId: string, alt: Date, ust: Date) {
      return db
        .select({ baslangic: randevu.baslangic, bitis: randevu.bitis })
        .from(randevu)
        .where(
          and(
            eq(randevu.isletmeId, kiraci),
            eq(randevu.personelId, personelId),
            inArray(randevu.durum, ["BEKLIYOR", "ONAYLI"]),
            lt(randevu.baslangic, ust),
            gt(randevu.bitis, alt),
          ),
        );
    },
  };
}
