// KAPI DISI DOSYA (bkz. CLAUDE.md degismez 1): kiraci filtresini enjekte eden
// tek yer burasi. Route handler'lar @/lib/db'yi degil bu dosyayi kullanir;
// bunu eslint.config.mjs icindeki no-restricted-imports kurali zorluyor.
//
// Tasarimin ozu: cagiran taraf isletmeId'yi VEREMEZ. Filtre parametre degil,
// kapanis degiskeni. Yanlis kiracinin verisini istemek icin once bu dosyayi
// degistirmek gerekiyor - unutmakla olmuyor.

import { and, asc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";

import {
  calismaSaati,
  hizmet,
  isletme,
  kapali,
  kullanici,
  personel,
  personelHizmet,
  randevu,
} from "@/db/sema";
import { getDb } from "@/lib/db";

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

/// Isletme oturumuna bagli, kiraci filtresi enjekte edilmis veri kapisi.
export async function getScopedDb(oturum: IsletmeOturumu) {
  const db = await getDb();
  // Kapanista tutuluyor: asagidaki hicbir metot bunu disaridan almiyor.
  const kiraci = oturum.isletmeId;

  return {
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
    }) {
      const sonuc = await db
        .update(isletme)
        .set(veri)
        .where(eq(isletme.id, kiraci))
        .returning({ id: isletme.id });
      return sonuc.length;
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
    })
    .from(isletme)
    .where(and(eq(isletme.slug, slug), eq(isletme.aktif, true)))
    .limit(1);

  if (!sahip) return null;

  const kiraci = sahip.id;

  return {
    isletme: sahip,

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
