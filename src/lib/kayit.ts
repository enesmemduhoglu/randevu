// KAPI DISI DOSYA: kayit aninda henuz bir kiraci YOK - onu bu dosya yaratiyor.
// scoped-db burada kullanilamaz, cunku kapsamlayacagi isletme daha olusmamis.
//
// Faz J'de ikinci bir kayit yolu geldi: MUSTERI hesabi. Onun kiracisi hic
// olmuyor (`isletmeId` null) - yani ayni gerekce, daha da guclu.

import { eq } from "drizzle-orm";

import { isletme, kullanici, personel } from "@/db/sema";
import { getDb } from "@/lib/db";
import { benzersizIhlaliMi } from "@/lib/pg-hata";
import { slugUret } from "@/lib/slug";

export type KayitGirdisi = {
  authUserId: string;
  eposta: string;
  adSoyad: string;
  isletmeAdi: string;
  telefon?: string | null;
};

export type KayitSonucu =
  | { durum: "tamam"; isletmeId: string; slug: string; kullaniciId: string }
  | { durum: "zaten-kayitli" }
  | { durum: "slug-uretilemedi" };

/// Kayit: isletme + sahip kullanici + varsayilan personel, TEK transaction'da.
///
/// Uc kayit birlikte anlamli: isletmesi olmayan bir sahip panele giremez,
/// personeli olmayan bir isletmeye randevu alinamaz. Yarim kalan bir kayit
/// kullaniciyi hicbir ekranda ilerleyemeyecegi bir duruma birakirdi.
export async function isletmeKaydiOlustur(
  girdi: KayitGirdisi,
): Promise<KayitSonucu> {
  const temelSlug = slugUret(girdi.isletmeAdi);
  if (!temelSlug) return { durum: "slug-uretilemedi" };

  try {
    return await tekDeneme(girdi, temelSlug);
  } catch (hata) {
    // DEGISMEZ 3'un ruhu: garanti veritabaninda. Asagidaki transaction once
    // "bu authUserId kayitli mi" diye BAKIYOR, ama iki istek ayni anda
    // gelirse ikisi de bos gorur ve ikincisi unique indekse carpar. Uygulama
    // katmanindaki kontrol erken geri bildirim; kesin cevabi kisit veriyor.
    if (benzersizIhlaliMi(hata, "kullanici_auth_user_id_idx")) {
      return { durum: "zaten-kayitli" };
    }

    // Slug carpismasi BILEREK yakalanmiyor. Iki ayri isletmenin ayni adla
    // ayni milisaniyede kaydolmasi gerekir; o kadar dar bir pencere icin
    // burada bir yeniden deneme dongusu tasimak, dongunun kendisinin hicbir
    // zaman kosulmamasi demek - yani sinanmamis kod. Cagiran taraf bu durumu
    // 500 olarak gorur ve kullanici tekrar dener.
    throw hata;
  }
}

async function tekDeneme(
  girdi: KayitGirdisi,
  temelSlug: string,
): Promise<KayitSonucu> {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const [mevcut] = await tx
      .select({ id: kullanici.id })
      .from(kullanici)
      .where(eq(kullanici.authUserId, girdi.authUserId))
      .limit(1);
    if (mevcut) return { durum: "zaten-kayitli" as const };

    // Slug cakismasi: ayni adda ikinci bir salon olagan. Sayi ekleyerek
    // ilerliyoruz; benzersizlik garantisini yine de veritabanindaki unique
    // kisiti veriyor, buradaki dongu yalnizca kullaniciya guzel bir slug
    // bulmak icin.
    let slug = temelSlug;
    for (let i = 2; i <= 50; i++) {
      const [cakisan] = await tx
        .select({ id: isletme.id })
        .from(isletme)
        .where(eq(isletme.slug, slug))
        .limit(1);
      if (!cakisan) break;
      slug = `${temelSlug}-${i}`;
    }

    const [yeniIsletme] = await tx
      .insert(isletme)
      .values({ ad: girdi.isletmeAdi.trim(), slug })
      .returning({ id: isletme.id, slug: isletme.slug });

    const [yeniKullanici] = await tx
      .insert(kullanici)
      .values({
        authUserId: girdi.authUserId,
        eposta: girdi.eposta,
        ad: girdi.adSoyad.trim(),
        telefon: girdi.telefon ?? null,
        rol: "SAHIP",
        isletmeId: yeniIsletme.id,
      })
      .returning({ id: kullanici.id });

    // Varsayilan personel: tek kisilik isletmede arayuz personel secimi
    // gostermeyecek, ama randevu yine de bir personele baglanacak. Boylece
    // ikinci personel eklendiginde sema degismiyor.
    await tx.insert(personel).values({
      isletmeId: yeniIsletme.id,
      ad: girdi.adSoyad.trim(),
      kullaniciId: yeniKullanici.id,
      sira: 0,
    });

    return {
      durum: "tamam" as const,
      isletmeId: yeniIsletme.id,
      slug: yeniIsletme.slug,
      kullaniciId: yeniKullanici.id,
    };
  });
}

export type MusteriKayitGirdisi = {
  authUserId: string;
  eposta: string;
  adSoyad: string;
};

export type MusteriKayitSonucu =
  | { durum: "tamam"; kullaniciId: string }
  | { durum: "zaten-kayitli" };

/// Musteri hesabi: tek bir `kullanici` satiri, kiracisiz.
///
/// ISLETME KAYDINDAN AYRI BIR FONKSIYON, cunku ortak hicbir sey yok.
/// `isletmeKaydiOlustur` uc kaydi tek transaction'da yaziyor ve slug uretiyor;
/// burada yazilacak tek satir var, yani transaction'in koruyacagi bir butunluk
/// yok. Ikisini bir bayrakla tek fonksiyona sikistirmak, govdesinin yarisi
/// kullanilmayan bir fonksiyon uretirdi.
///
/// `isletmeId` NULL ve `rol` MUSTERI: musteri tek bir isletmeye bagli degil,
/// bircok isletmeden randevu aliyor. Bu ayrimin tip seviyesindeki karsiligi
/// `auth.ts > isletmeOturumu` - musteri oradan gecemiyor, yani panel
/// yollarina hicbir kosulda dusemiyor.
///
/// TELEFON SORULMUYOR. Randevu alirken zaten isteniyor ve orada gercek isi
/// var (isletme musteriye ulasiyor); kayit anindaki her ek alan tamamlanma
/// oranini dusuruyor. Ayrica bugun DOGRULANMIS bir alan degil - SMS Faz K'de -
/// yani hesaba yazilmis bir numara guvenilebilir bir kimlik olmazdi.
export async function musteriKaydiOlustur(
  girdi: MusteriKayitGirdisi,
): Promise<MusteriKayitSonucu> {
  const db = await getDb();

  // DEGISMEZ 3'un ruhu: once-oku-sonra-yaz YOK. "Bu authUserId kayitli mi"
  // diye bakip sonra yazsaydik, ayni anda gelen iki istek ikisi de bos gorur
  // ve ikincisi benzersizlik ihlaliyle 500 uretirdi. `onConflictDoNothing`
  // karari veritabanina birakiyor: yarisi kaybeden bos donuyor.
  const [yeni] = await db
    .insert(kullanici)
    .values({
      authUserId: girdi.authUserId,
      eposta: girdi.eposta,
      ad: girdi.adSoyad.trim(),
      rol: "MUSTERI",
      isletmeId: null,
    })
    .onConflictDoNothing({ target: kullanici.authUserId })
    .returning({ id: kullanici.id });

  if (yeni) return { durum: "tamam", kullaniciId: yeni.id };

  // Satir zaten vardi. Bu kisi ISLETME SAHIBI de olabilir: `kullanici` tablosu
  // authUserId'yi tekilliyor (kullanici_auth_user_id_idx), yani bir Supabase
  // hesabi ya isletmeye ya musteriye ait - ikisine birden degil. Cagiran taraf
  // bu durumu "giris yapin" olarak gosteriyor; hangi rolde kayitli oldugunu
  // SOYLEMIYOR, cunku bu yol oturumsuz ve cevap hesap sayimina yarar.
  return { durum: "zaten-kayitli" };
}
