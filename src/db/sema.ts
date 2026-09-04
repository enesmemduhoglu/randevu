// Veritabani semasi. Tablo ve alan adlari Turkce - depo sozlesmesi (CLAUDE.md).

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const rolEnum = pgEnum("rol", ["SAHIP", "PERSONEL", "MUSTERI"]);

/// Kiraci koku. Kiraciya bagli her tablo isletmeId tasir ve sorgular yalnizca
/// src/lib/scoped-db.ts uzerinden, o filtre enjekte edilerek gider.
export const isletme = pgTable(
  "isletme",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    ad: text("ad").notNull(),

    telefon: text("telefon"),
    adres: text("adres"),
    hakkinda: text("hakkinda"),

    // Randevu zamanlari DB'de UTC durur; yerel saate cevirme bu alanla yapilir.
    saatDilimi: text("saat_dilimi").notNull().default("Europe/Istanbul"),

    // Musaitlik izgarasinin adimi. 15 dakika, hizmet suresinden BAGIMSIZ:
    // 45 dakikalik bir hizmet 09:00, 09:15, 09:30... noktalarinda baslayabilir.
    // Hizmet suresine esitlenseydi gunun ortasindaki bosluklar dolduralamazdi.
    slotAraligiDk: integer("slot_araligi_dk").notNull().default(15),

    // "En erken ne kadar sonrasina randevu alinabilir." Musteri saat 14:58'de
    // 15:00 randevusu alip isletmeyi hazirliksiz yakalamasin diye.
    minOnceBildirimDk: integer("min_once_bildirim_dk").notNull().default(120),

    // Takvimin ne kadar ilerisi acik. Sinirsiz birakmak, alti ay sonrasina
    // alinip unutulan randevular uretiyor.
    maksIleriGun: integer("maks_ileri_gun").notNull().default(60),

    // Acikken randevu dogrudan ONAYLI baslar; kapaliyken BEKLIYOR ve isletme
    // onaylar. Varsayilan acik: kucuk isletmede her randevuyu elle onaylamak
    // is yuku, ve musteri "onaylandi mi" diye beklemek istemiyor.
    otomatikOnay: boolean("otomatik_onay").notNull().default(true),

    // Randevusuna gelmeyen musteri kac gun boyunca bu isletmeden yeni randevu
    // alamiyor. 0 = kisit kapali.
    //
    // Neden isletme ayari ve neden sabit degil: kaporasi olmayan kucuk
    // isletmede gelmeyen musterinin tek maliyeti bos kalan saat, ve o saatin
    // degeri isletmeden isletmeye degisiyor. Varsayilan 30 gun: bir kez
    // gelmeyen musteriyi kalici olarak kaybetmeyecek kadar kisa, bos saatin
    // tekrarini engelleyecek kadar uzun.
    gelmediKisitiGun: integer("gelmedi_kisiti_gun").notNull().default(30),

    // --- Dizin (pazaryeri) alanlari, Faz M ---
    //
    // NEDEN pgEnum ya da ayri tablo DEGIL, duz `text`: bu bir durum makinesi
    // degil (randevu_durum oyle), `saatDilimi` gibi bir REFERANS alani. Depoda
    // ayni ihtiyac zaten cozulmus - `ayar-girdi.ts > SAAT_DILIMLERI` duz text
    // kolonu + kapali bir TS listesine karsi dogrulama kullaniyor. Ayni ailede
    // ayni cozum.
    //
    // Bedeli bilinsin: gecersiz bir il ya da kategori DB tarafindan
    // engellenmiyor, yazma yolundaki dogrulamaya guveniliyor. Kazanci: yeni bir
    // kategori eklemek pgEnum'da `ALTER TYPE ... ADD VALUE` gocu (ve o degerin
    // ayni transaction'da kullanilamamasi tuzagi) demekti; burada tek satirlik
    // dizi degisikligi.
    il: text("il"),
    ilce: text("ilce"),
    kategori: text("kategori"),

    // Dizinde GORUNUYOR mu. Varsayilan FALSE: bu alan eklendiginde depoda
    // zaten kayitli isletmeler vardi ve onlar pazaryeri diye bir kavram
    // yokken kaydoldu. Sessizce herkese acik bir listeye dusmek surpriz olurdu.
    //
    // `aktif`ten AYRI: `aktif=false` isletmenin randevu sayfasini tumden
    // kapatiyor, `yayinda=false` ise yalnizca dizinden gizliyor - dogrudan
    // linki olan musteri randevu almaya devam ediyor. Ikisini tek alana
    // sikistirmak, "Instagram'dan gelenler girebilsin ama dizinde olmayayim"
    // diyen isletmeyi imkansiz kilardi.
    yayinda: boolean("yayinda").notNull().default(false),

    aktif: boolean("aktif").notNull().default(true),
    olusturmaTarihi: timestamp("olusturma_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow(),
    guncellemeTarihi: timestamp("guncelleme_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("isletme_aktif_idx").on(t.aktif),
    // Dizin sorgusunun tek indeksi. Kismi: yalnizca yayindaki ve aktif
    // isletmeler dizinde gorunuyor, yani indeksin geri kalanini tasimasi
    // gereksiz. Kolon sirasi filtrelerin secicilik sirasi: il once daraltiyor,
    // kategori sonra.
    index("isletme_dizin_idx")
      .on(t.il, t.kategori)
      .where(sql`${t.yayinda} = true and ${t.aktif} = true`),
  ],
);

/// Kimligi Supabase Auth sagliyor, veriyi biz tutuyoruz.
///
/// DEGISMEZ 9: auth.users'a foreign key YOK. authUserId duz bir uuid string
/// olarak duruyor. Boylece migration'lar tum semaya tek basina sahip oluyor,
/// yerel Postgres'te auth semasi olmadan kosuyor ve testler kendi JWT'lerini
/// imzalayabiliyor.
export const kullanici = pgTable(
  "kullanici",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authUserId: text("auth_user_id").notNull(),
    eposta: text("eposta").notNull(),
    ad: text("ad").notNull(),
    telefon: text("telefon"),
    rol: rolEnum("rol").notNull(),

    // Musteri rolunde null: musteri tek bir isletmeye bagli degil, bircok
    // isletmeden randevu alabilir.
    isletmeId: uuid("isletme_id").references(() => isletme.id, {
      onDelete: "cascade",
    }),

    olusturmaTarihi: timestamp("olusturma_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow(),
    guncellemeTarihi: timestamp("guncelleme_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Her istekte bu indeks uzerinden tek satir okunuyor: auth.ts token'daki
    // sub degerini burada arayip isletmeId ve rolu buluyor.
    uniqueIndex("kullanici_auth_user_id_idx").on(t.authUserId),
    index("kullanici_isletme_id_idx").on(t.isletmeId),
  ],
);

/// Randevunun bagli oldugu kisi. Tek kisilik isletmede de bir personel var:
/// kayit sirasinda otomatik olusturuluyor ve arayuz personel secimi hic
/// gostermiyor. Boylece ikinci personel eklemek migration gerektirmiyor.
export const personel = pgTable(
  "personel",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    isletmeId: uuid("isletme_id")
      .notNull()
      .references(() => isletme.id, { onDelete: "cascade" }),
    ad: text("ad").notNull(),
    unvan: text("unvan"),

    // Personelin giris hesabi olmayabilir; isletme sahibi onun adina yonetir.
    kullaniciId: uuid("kullanici_id").references(() => kullanici.id, {
      onDelete: "set null",
    }),

    sira: integer("sira").notNull().default(0),
    aktif: boolean("aktif").notNull().default(true),
    olusturmaTarihi: timestamp("olusturma_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow(),
    guncellemeTarihi: timestamp("guncelleme_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("personel_isletme_id_idx").on(t.isletmeId),
    index("personel_kullanici_id_idx").on(t.kullaniciId),
  ],
);

/// Musterinin sectigi sey. Sure ve fiyat burada; randevu olustugunda ikisi de
/// randevuya KOPYALANMIYOR - fiyat degisince gecmis randevunun tutari da
/// degisir. Bu bilincli bir sadelestirme: Faz E'de fatura ve gecmis raporu yok.
/// Ihtiyac dogunca randevuya `fiyatKurusAnlik` eklenir.
export const hizmet = pgTable(
  "hizmet",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    isletmeId: uuid("isletme_id")
      .notNull()
      .references(() => isletme.id, { onDelete: "cascade" }),
    ad: text("ad").notNull(),
    aciklama: text("aciklama"),

    sureDk: integer("sure_dk").notNull(),

    // Para KURUS cinsinden tam sayi. Ondalik sayi tutulsaydi 0.1 + 0.2
    // problemi tutara sizardi; Postgres numeric ise JS tarafinda string olarak
    // gelir ve her yerde donusum gerektirir.
    fiyatKurus: integer("fiyat_kurus").notNull().default(0),

    // Takvimdeki blok rengi. DEGISMEZ 10'a aykiri DEGIL: bu bir tasarim
    // karari degil, isletmenin kendi verisi - hizmetlerini renkle ayirt
    // ediyor. Arayuz secenekleri token'lardan uretiyor.
    renk: text("renk"),

    sira: integer("sira").notNull().default(0),
    aktif: boolean("aktif").notNull().default(true),
    olusturmaTarihi: timestamp("olusturma_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow(),
    guncellemeTarihi: timestamp("guncelleme_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("hizmet_isletme_id_idx").on(t.isletmeId)],
);

/// Hangi personel hangi hizmeti veriyor.
///
/// BOS OLMASI "hicbiri" degil "hepsi" demek. Tek kisilik isletmede bu tablo
/// hic dolmuyor ve arayuz personel secimi gostermiyor; ikinci personel
/// eklendiginde de varsayilan davranis dogru kaliyor. Alternatifi, her yeni
/// hizmet icin her personele satir yazmakti - unutuldugunda hizmet gorunmez
/// olurdu.
export const personelHizmet = pgTable(
  "personel_hizmet",
  {
    personelId: uuid("personel_id")
      .notNull()
      .references(() => personel.id, { onDelete: "cascade" }),
    hizmetId: uuid("hizmet_id")
      .notNull()
      .references(() => hizmet.id, { onDelete: "cascade" }),

    // Kiraci kimligi burada da duruyor: scoped-db bu tabloyu tek basina
    // sorgulayabilsin diye. Iki foreign key uzerinden join ederek bulmak
    // mumkun ama her sorguya join eklemek, bir gun birinin atlamasi demek.
    isletmeId: uuid("isletme_id")
      .notNull()
      .references(() => isletme.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.personelId, t.hizmetId] }),
    index("personel_hizmet_isletme_id_idx").on(t.isletmeId),
    index("personel_hizmet_hizmet_id_idx").on(t.hizmetId),
  ],
);

/// Haftalik calisma duzeni.
///
/// Neden timestamp DEGIL de gun + dakika: bunlar tekrar eden duvar saati
/// kurallari. "Pazartesi 09:00-18:00" yaz saati gecisinde de 09:00'dur;
/// timestamp olarak saklansaydi yilda iki kez bir saat kayardi.
///
/// Ogle arasi icin AYNI GUNE IKI SATIR yaziliyor (09:00-12:00 ve 13:00-18:00).
/// Ayri bir "ara" kavrami getirmek, ucuncu bir araya ihtiyac duyulunca yeniden
/// yazilacak bir modeldi.
export const calismaSaati = pgTable(
  "calisma_saati",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    isletmeId: uuid("isletme_id")
      .notNull()
      .references(() => isletme.id, { onDelete: "cascade" }),
    personelId: uuid("personel_id")
      .notNull()
      .references(() => personel.id, { onDelete: "cascade" }),

    // 0 = Pazar ... 6 = Cumartesi. JavaScript'in Date.getDay() degeriyle
    // BIREBIR ayni: musaitlik motoru gunu hesaplarken donusum yapmasin.
    // Arayuz haftayi pazartesiden baslatarak gosteriyor, sirasi orada
    // dizilirken veriliyor.
    haftaninGunu: integer("haftanin_gunu").notNull(),

    // Gece yarisindan itibaren dakika. 09:00 = 540, 18:30 = 1110.
    baslangicDk: integer("baslangic_dk").notNull(),
    bitisDk: integer("bitis_dk").notNull(),

    olusturmaTarihi: timestamp("olusturma_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("calisma_saati_isletme_id_idx").on(t.isletmeId),
    index("calisma_saati_personel_gun_idx").on(t.personelId, t.haftaninGunu),
  ],
);

/// Izin, tatil, kapali gun. Calisma saatinin ustune biner ve onu deler.
///
/// `personelId` NULL ise butun isletme kapali (resmi tatil gibi); doluysa
/// yalnizca o kisi izinli.
export const kapali = pgTable(
  "kapali",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    isletmeId: uuid("isletme_id")
      .notNull()
      .references(() => isletme.id, { onDelete: "cascade" }),
    personelId: uuid("personel_id").references(() => personel.id, {
      onDelete: "cascade",
    }),

    // DEGISMEZ 7: timestamptz, yani UTC. Calisma saatinin aksine bunlar
    // TEK SEFERLIK araliklar - tekrar etmedikleri icin yaz saati sorunu yok.
    baslangic: timestamp("baslangic", { withTimezone: true }).notNull(),
    bitis: timestamp("bitis", { withTimezone: true }).notNull(),

    aciklama: text("aciklama"),
    olusturmaTarihi: timestamp("olusturma_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("kapali_isletme_id_idx").on(t.isletmeId),
    index("kapali_aralik_idx").on(t.isletmeId, t.baslangic, t.bitis),
  ],
);

/// Randevu alan kisi. Hesap acmasi GEREKMIYOR - `kullaniciId` cogu zaman null.
///
/// Kimligi telefon numarasi: ayni isletmede ayni numara tek bir musteri.
/// E-posta degil, cunku musterilerin bir kismi e-posta vermiyor ve telefon
/// zaten hatirlatma icin sart.
export const musteri = pgTable(
  "musteri",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    isletmeId: uuid("isletme_id")
      .notNull()
      .references(() => isletme.id, { onDelete: "cascade" }),
    ad: text("ad").notNull(),

    // Yalnizca rakam saklaniyor (docs/marka.md bicim kurali); gosterim
    // katmani "0532 123 45 67" olarak biciimlendiriyor.
    telefon: text("telefon").notNull(),
    eposta: text("eposta"),

    // Isletmenin kendi notu ("kisa sac sever", "kirmizi boyaya alerjik").
    // Musteri bunu gormuyor.
    not: text("not"),

    kullaniciId: uuid("kullanici_id").references(() => kullanici.id, {
      onDelete: "set null",
    }),

    // Bu ana kadar musteri BU isletmeden yeni randevu alamiyor. NULL = kisit
    // yok. Randevusuna gelmedigi isaretlendiginde ileri atiliyor.
    //
    // DEGISMEZ 7: timestamptz. Kisit "30 gun sonra" gibi bir sure, tekrar eden
    // bir duvar saati kurali degil - saat dilimi cevrimi gerektirmiyor,
    // yalnizca gosterirken isletmenin dilimine ceviriliyor.
    //
    // Neden `musteri` tablosunda ve sayilan bir alan degil: kisit KIRACIYA
    // OZEL. Ayni telefon numarasi baska bir salonda ayri bir musteri satiri
    // (musteri_isletme_telefon_idx), yani bir isletmedeki kisit digerine
    // sizmiyor. "Gelmedi randevularini say" seklinde turetilseydi isletme
    // affetmek istedigi bir musteriyi affedemezdi - gecmisi silmesi gerekirdi.
    randevuKisitiBitis: timestamp("randevu_kisiti_bitis", {
      withTimezone: true,
    }),

    olusturmaTarihi: timestamp("olusturma_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow(),
    guncellemeTarihi: timestamp("guncelleme_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Ayni numara ayni isletmede iki kez olamaz. BASKA isletmede olabilir:
    // musteri iki ayri salona gidiyorsa iki ayri kayit, cunku notlar ve
    // gecmis kiraciya ait.
    uniqueIndex("musteri_isletme_telefon_idx").on(t.isletmeId, t.telefon),
    index("musteri_kullanici_id_idx").on(t.kullaniciId),
  ],
);

export const randevuDurumEnum = pgEnum("randevu_durum", [
  "BEKLIYOR",
  "ONAYLI",
  "IPTAL",
  "TAMAMLANDI",
  "GELMEDI",
]);

/// Randevunun kim tarafindan olusturuldugu. Iptal kurallari ve bildirim metni
/// buna gore degisiyor: isletmenin actigi randevu icin musteriye "randevunuz
/// alindi" demek yanlis olurdu.
export const randevuKaynakEnum = pgEnum("randevu_kaynak", [
  "MUSTERI",
  "ISLETME",
]);

/// Urunun kalbi.
///
/// DEGISMEZ 8: ayni personelin cakisan iki AKTIF randevusu veritabani
/// seviyesinde imkansiz. Kisit Drizzle'in ifade edemedigi `EXCLUDE USING gist`
/// oldugu icin migration'a elle yazildi (bkz. drizzle/0002_*.sql). Uygulama
/// katmanindaki kontrol kullaniciya erken geri bildirim icin; garanti degil.
export const randevu = pgTable(
  "randevu",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    isletmeId: uuid("isletme_id")
      .notNull()
      .references(() => isletme.id, { onDelete: "cascade" }),
    personelId: uuid("personel_id")
      .notNull()
      .references(() => personel.id, { onDelete: "restrict" }),
    hizmetId: uuid("hizmet_id")
      .notNull()
      .references(() => hizmet.id, { onDelete: "restrict" }),
    musteriId: uuid("musteri_id")
      .notNull()
      .references(() => musteri.id, { onDelete: "restrict" }),

    // DEGISMEZ 7: timestamptz. Yerel saate cevirme yalnizca src/lib/zaman.ts
    // uzerinden ve isletmenin saatDilimi alaniyla.
    baslangic: timestamp("baslangic", { withTimezone: true }).notNull(),
    bitis: timestamp("bitis", { withTimezone: true }).notNull(),

    durum: randevuDurumEnum("durum").notNull().default("BEKLIYOR"),
    kaynak: randevuKaynakEnum("kaynak").notNull().default("MUSTERI"),

    // Musterinin randevu alirken yazdigi not.
    not: text("not"),

    // Hesapsiz musterinin randevusunu iptal edebilmesi icin. Tahmin
    // edilemez olmali: bagimsiz bir rastgele deger, id'den TURETILMIYOR.
    iptalToken: text("iptal_token").notNull(),

    // Randevuyu HESABINDA goren kisi (Faz J). NULL = misafir randevusu; bugun
    // randevularin cogu boyle ve oyle kalacak - hesap acmak hicbir zaman sart
    // olmayacak.
    //
    // NEDEN `musteri.kullaniciId` DEGIL DE BURADA. `musteri` satiri kiraci
    // basina ve TELEFONLA tekilleniyor; sahiplik orada tutulsaydi "bu numara
    // benim" diyen herkes o numaranin o salondaki tum gecmisini gorurdu.
    // Telefon bugun DOGRULANMIS bir kimlik degil - SMS Faz K'de. Randevu
    // basina sahiplikte ise kanit randevunun kendi iptal token'i: kisi
    // yalnizca elinde linki olan randevuyu hesabina ekleyebiliyor, yani
    // baskasinin numarasiyla randevu alan biri yine yalnizca KENDI
    // randevusunu goruyor.
    //
    // `set null`: hesap silinirse randevu duruyor. Randevu isletmenin
    // takviminde de bir kayit ve musterinin hesabiyla birlikte silinmesi,
    // isletmenin gecmisinden habersizce satir goturmek olurdu.
    kullaniciId: uuid("kullanici_id").references(() => kullanici.id, {
      onDelete: "set null",
    }),

    olusturmaTarihi: timestamp("olusturma_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow(),
    guncellemeTarihi: timestamp("guncelleme_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("randevu_iptal_token_idx").on(t.iptalToken),
    // Panelin en sik sorgusu: "bu isletmenin su tarih araligindaki
    // randevulari". Kiraci once geliyor cunku her sorguda esitlik olarak var.
    index("randevu_isletme_baslangic_idx").on(t.isletmeId, t.baslangic),
    index("randevu_personel_baslangic_idx").on(t.personelId, t.baslangic),
    index("randevu_musteri_id_idx").on(t.musteriId),
    // `/randevularim`in TEK sorgusu: "bu hesabin randevulari, yeniden eskiye".
    // Kismi indeks: satirlarin cogunda `kullanici_id` NULL (misafir randevusu)
    // ve NULL'lari indekste tasimanin bu sorguya faydasi yok.
    index("randevu_kullanici_baslangic_idx")
      .on(t.kullaniciId, t.baslangic)
      .where(sql`${t.kullaniciId} is not null`),
  ],
);

export const bildirimTuruEnum = pgEnum("bildirim_turu", ["EPOSTA", "SMS"]);

export const bildirimDurumEnum = pgEnum("bildirim_durum", [
  "BEKLIYOR",
  "GONDERILDI",
  "HATA",
]);

/// Gonderilecek her mesaj once buraya yaziliyor, gonderim ayri bir adim.
///
/// Kuyruk BILDIRIM MODUNDAN BAGIMSIZ gerekli: hatirlatmalar zaten gelecege
/// zamanlanmis kayitlar ve bir yerde durmalari lazim. Gonderim katmani
/// Faz I'de geliyor; tablo simdi olusturuluyor ki o faz migration
/// gerektirmesin.
export const bildirimKuyrugu = pgTable(
  "bildirim_kuyrugu",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    isletmeId: uuid("isletme_id")
      .notNull()
      .references(() => isletme.id, { onDelete: "cascade" }),
    randevuId: uuid("randevu_id")
      .notNull()
      .references(() => randevu.id, { onDelete: "cascade" }),

    tur: bildirimTuruEnum("tur").notNull(),
    sablon: text("sablon").notNull(),

    planlananZaman: timestamp("planlanan_zaman", { withTimezone: true }).notNull(),
    gonderimZamani: timestamp("gonderim_zamani", { withTimezone: true }),

    durum: bildirimDurumEnum("durum").notNull().default("BEKLIYOR"),

    // DEGISMEZ 5: buraya saglayicinin ham yaniti degil, ozetlenmis bir sebep
    // yaziliyor - baglanti dizesi ve anahtar tasiyabilir.
    hataMetni: text("hata_metni"),

    // /panel/gelistirici/bildirimler ekrani bunu gosteriyor: sahte modda
    // gonderilmeyen mesajin gercek HTML'i tarayicida gorulebilsin.
    onizlemeHtml: text("onizleme_html"),

    olusturmaTarihi: timestamp("olusturma_tarihi", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Cron'un sorgusu: "zamani gelmis, hala bekleyen mesajlar".
    index("bildirim_kuyrugu_planlanan_idx").on(t.durum, t.planlananZaman),
    index("bildirim_kuyrugu_randevu_id_idx").on(t.randevuId),
  ],
);

export const isletmeIliskileri = relations(isletme, ({ many }) => ({
  kullanicilar: many(kullanici),
  personeller: many(personel),
  hizmetler: many(hizmet),
  musteriler: many(musteri),
  randevular: many(randevu),
}));

export const kullaniciIliskileri = relations(kullanici, ({ one }) => ({
  isletme: one(isletme, {
    fields: [kullanici.isletmeId],
    references: [isletme.id],
  }),
}));

export const personelIliskileri = relations(personel, ({ one }) => ({
  isletme: one(isletme, {
    fields: [personel.isletmeId],
    references: [isletme.id],
  }),
  kullanici: one(kullanici, {
    fields: [personel.kullaniciId],
    references: [kullanici.id],
  }),
}));

export const hizmetIliskileri = relations(hizmet, ({ one, many }) => ({
  isletme: one(isletme, {
    fields: [hizmet.isletmeId],
    references: [isletme.id],
  }),
  personeller: many(personelHizmet),
}));

export const personelHizmetIliskileri = relations(personelHizmet, ({ one }) => ({
  personel: one(personel, {
    fields: [personelHizmet.personelId],
    references: [personel.id],
  }),
  hizmet: one(hizmet, {
    fields: [personelHizmet.hizmetId],
    references: [hizmet.id],
  }),
}));

export const calismaSaatiIliskileri = relations(calismaSaati, ({ one }) => ({
  personel: one(personel, {
    fields: [calismaSaati.personelId],
    references: [personel.id],
  }),
}));

export const musteriIliskileri = relations(musteri, ({ one, many }) => ({
  isletme: one(isletme, {
    fields: [musteri.isletmeId],
    references: [isletme.id],
  }),
  randevular: many(randevu),
}));

export const randevuIliskileri = relations(randevu, ({ one, many }) => ({
  isletme: one(isletme, {
    fields: [randevu.isletmeId],
    references: [isletme.id],
  }),
  personel: one(personel, {
    fields: [randevu.personelId],
    references: [personel.id],
  }),
  hizmet: one(hizmet, {
    fields: [randevu.hizmetId],
    references: [hizmet.id],
  }),
  musteri: one(musteri, {
    fields: [randevu.musteriId],
    references: [musteri.id],
  }),
  bildirimler: many(bildirimKuyrugu),
}));

export const bildirimKuyruguIliskileri = relations(bildirimKuyrugu, ({ one }) => ({
  randevu: one(randevu, {
    fields: [bildirimKuyrugu.randevuId],
    references: [randevu.id],
  }),
}));
