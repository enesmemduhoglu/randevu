// KAPI DISI DOSYA - ve depodaki EN TEHLIKELI dosya. Dikkatle oku.
//
// Bu deponun merkezi degismezi "her sorgu bir kiraciya kapsanir" (DEGISMEZ 1):
// `getScopedDb(oturum)` ve `getHalkaAcikDb(slug)` kiraciyi bir KAPANIS
// degiskeninde tutuyor, cagiran taraf onu veremiyor. Pazaryeri dizini ise
// TANIMI GEREGI kiraci-ustu: amaci butun isletmeleri listelemek.
//
// Yani burada kapsama YOK. Karsiligi olarak, sizabilecek yuzey mumkun oldugunca
// daraltildi:
//
//   1. Yalnizca `isletme` ve `hizmet` okunuyor. `randevu`, `musteri`,
//      `kullanici`, `bildirim_kuyrugu` bu dosyada GECMIYOR - yani kisisel veri
//      buradan cikamaz. Bunu `degismezler.test.ts` metin tarayarak zorluyor.
//   2. `hizmet` yalnizca TOPLAMA olarak okunuyor (adet, en dusuk fiyat). Tek
//      tek hizmet satiri donmuyor; kart "4 hizmet, 300 TL'den baslayan" diyor,
//      isletmenin hizmet listesini dizine kopyalamiyor.
//   3. Donen tip `DizinKarti` ELLE yazilmis ve kapali. `isletme.$inferSelect`
//      kullanilmadi: semaya yarin eklenen bir kolon buradan sessizce disari
//      sizmasin. Yeni bir alan gorunmek istiyorsa bu tipe elle yazilmali.
//   4. Cagiran taraf tablo ya da kolon adi VEREMIYOR; filtre alanlari sabit ve
//      il/kategori kapali listeye karsi dogrulaniyor.
//   5. Yalnizca `yayinda = true AND aktif = true` satirlar donuyor. Ikisi ayri
//      kavram: `aktif=false` randevu sayfasini tumden kapatiyor, `yayinda=false`
//      yalnizca dizinden gizliyor.
//
// SALT OKUNUR. Bu dosyaya asla bir yazma metodu eklenmeyecek - yazma yollari
// kiracisiz calisamaz.

import { and, asc, eq, ilike, min, sql } from "drizzle-orm";

import { hizmet, isletme } from "@/db/sema";
import { getDb } from "@/lib/db";
import { ILLER, KATEGORILER } from "@/lib/dizin-girdi";

/// Dizin kartinin TAM icerigi. Kapali tip; genisletmek bilincli bir karar
/// olmali (bkz. dosya basligi, madde 3).
export type DizinKarti = {
  slug: string;
  ad: string;
  il: string | null;
  ilce: string | null;
  kategori: string | null;
  hakkinda: string | null;
  hizmetSayisi: number;
  enDusukFiyatKurus: number | null;
};

export type DizinFiltresi = {
  arama?: string;
  il?: string;
  kategori?: string;
  sayfa?: number;
};

export const SAYFA_BOYUTU = 24;

/// Derin sayfalama Postgres'te `OFFSET` ile pahalilasiyor ve dizinde binlerce
/// sayfa gezmenin mesru bir kullanimi yok. Ust sinir, kaziyicinin maliyetini
/// de sabitliyor.
export const EN_COK_SAYFA = 200;

/// LIKE'in joker karakterleri kacisiliyor. Kacilmasaydi `%` yazan bir ziyaretci
/// butun satirlari eslestirebilirdi - sonuc sizinti degil ama sorgu maliyeti
/// ziyaretcinin denetiminde olurdu.
function jokerKacir(ham: string): string {
  return ham.replace(/[%_\\]/g, (k) => `\\${k}`);
}

/// Arama metni: kirpiliyor ve uzunlugu siniriliyor. Cok uzun bir desen
/// eslesmeden once tarama maliyeti uretiyor.
const ARAMA_EN_COK = 60;

/// Yayindaki isletmeleri arar.
///
/// `hizmet` toplamasi LEFT JOIN ile: hizmeti olmayan bir isletme de listede
/// kaliyor (yayina cikis kontrolu en az bir hizmet istiyor, ama hizmet
/// sonradan pasiflenebilir ve o an isletmenin dizinden dusmesi surpriz olurdu).
export async function isletmeleriAra(filtre: DizinFiltresi): Promise<{
  kartlar: DizinKarti[];
  toplam: number;
}> {
  const db = await getDb();

  const sayfa = Math.min(Math.max(1, Math.trunc(filtre.sayfa ?? 1)), EN_COK_SAYFA);

  const arama = (filtre.arama ?? "").trim().slice(0, ARAMA_EN_COK);

  // Il ve kategori KAPALI LISTEYE karsi kontrol ediliyor. Listede olmayan bir
  // deger filtreyi uygulamamak yerine BOS SONUC uretmeli miydi? Hayir: bozuk
  // bir URL parametresi yuzunden bos sayfa gostermek, kullaniciya hicbir sey
  // anlatmayan bir hata. Gecersiz deger yok sayiliyor ve arayuz secili filtreyi
  // gostermiyor - yani kullanici ne oldugunu goruyor.
  const il =
    filtre.il && (ILLER as readonly string[]).includes(filtre.il)
      ? filtre.il
      : undefined;
  const kategori =
    filtre.kategori && (KATEGORILER as readonly string[]).includes(filtre.kategori)
      ? filtre.kategori
      : undefined;

  const kosul = and(
    eq(isletme.aktif, true),
    eq(isletme.yayinda, true),
    il ? eq(isletme.il, il) : undefined,
    kategori ? eq(isletme.kategori, kategori) : undefined,
    arama ? ilike(isletme.ad, `%${jokerKacir(arama)}%`) : undefined,
  );

  const [satirlar, sayim] = await Promise.all([
    db
      .select({
        slug: isletme.slug,
        ad: isletme.ad,
        il: isletme.il,
        ilce: isletme.ilce,
        kategori: isletme.kategori,
        hakkinda: isletme.hakkinda,
        // Toplama: tek tek hizmet satiri DONMUYOR (bkz. baslik, madde 2).
        hizmetSayisi: sql<number>`count(${hizmet.id})`,
        enDusukFiyatKurus: min(hizmet.fiyatKurus),
      })
      .from(isletme)
      .leftJoin(
        hizmet,
        and(eq(hizmet.isletmeId, isletme.id), eq(hizmet.aktif, true)),
      )
      .where(kosul)
      .groupBy(
        isletme.id,
        isletme.slug,
        isletme.ad,
        isletme.il,
        isletme.ilce,
        isletme.kategori,
        isletme.hakkinda,
      )
      // Ada gore siralama gecici. Gercek siralama (yakinlik, doluluk, puan)
      // urun karari ve henuz verilmedi; rastgele ya da id sirasi ise ayni
      // sorgunun iki cagrisinda farkli sira uretip sayfalamayi bozardi.
      .orderBy(asc(isletme.ad))
      .limit(SAYFA_BOYUTU)
      .offset((sayfa - 1) * SAYFA_BOYUTU),

    // Sayim AYRI sorgu ve join'siz: join'li sorguda `count(*)` gruplama
    // yuzunden satir sayisini degil grup sayisini dondururdu.
    db
      .select({ adet: sql<number>`count(*)` })
      .from(isletme)
      .where(kosul),
  ]);

  return {
    kartlar: satirlar.map((s) => ({
      ...s,
      // `count` ve `min` Postgres'ten string olarak gelebiliyor (bigint ve
      // numeric donusu); tipin sayi oldugunu iddia edip string sizdirmayalim.
      hizmetSayisi: Number(s.hizmetSayisi ?? 0),
      enDusukFiyatKurus:
        s.enDusukFiyatKurus === null ? null : Number(s.enDusukFiyatKurus),
    })),
    toplam: Number(sayim[0]?.adet ?? 0),
  };
}

/// Filtre kutularinin secenekleri: DIZINDE GERCEKTEN ISLETMESI OLAN il ve
/// kategoriler.
///
/// Neden sabit listenin tamami degil: 81 ilin 78'i bos bir dizinde, kullanici
/// tek tek deneyip bos sonuc goruyor. Dolu olanlari gostermek listeyi hem
/// kisaltiyor hem durust kiliyor.
export async function filtreSecenekleri(): Promise<{
  iller: string[];
  kategoriler: string[];
}> {
  const db = await getDb();
  const kosul = and(eq(isletme.aktif, true), eq(isletme.yayinda, true));

  const [ilSatirlari, kategoriSatirlari] = await Promise.all([
    db
      .selectDistinct({ deger: isletme.il })
      .from(isletme)
      .where(kosul)
      .orderBy(asc(isletme.il)),
    db
      .selectDistinct({ deger: isletme.kategori })
      .from(isletme)
      .where(kosul)
      .orderBy(asc(isletme.kategori)),
  ]);

  const ayikla = (satirlar: { deger: string | null }[]) =>
    satirlar
      .map((s) => s.deger)
      .filter((d): d is string => d !== null && d !== "");

  return {
    iller: ayikla(ilSatirlari),
    kategoriler: ayikla(kategoriSatirlari),
  };
}
