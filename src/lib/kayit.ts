// KAPI DISI DOSYA: kayit aninda henuz bir kiraci YOK - onu bu dosya yaratiyor.
// scoped-db burada kullanilamaz, cunku kapsamlayacagi isletme daha olusmamis.

import { eq } from "drizzle-orm";

import { isletme, kullanici, personel } from "@/db/sema";
import { getDb } from "@/lib/db";
import { benzersizIhlaliMi } from "@/lib/pg-hata";

const TURKCE_HARFLER: Record<string, string> = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i",
  ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
};

/// Isletme adindan URL'de kullanilabilir slug uretir.
///
/// Turkce harfleri ELLE esliyoruz: normalize("NFD") ile aksan ayirma yontemi
/// i-noktasiz ve I-noktali harfleri dogru cozmuyor - noktasiz i tek kod
/// noktasi, ayrilabilir bir aksani yok. Kutuphanesiz ve dogru olan yol bu tablo.
///
/// NFD adimi yine de duruyor: Turkce olmayan aksanli adlar icin (ornegin
/// "Cafe Nero" yazilisi "Café Nero" ise) harfin kendisi korunuyor, yoksa
/// tamamen dusup slug'i bozardi.
export function slugUret(ad: string): string {
  return ad
    .split("")
    .map((h) => TURKCE_HARFLER[h] ?? h)
    .join("")
    .toLowerCase()
    .normalize("NFD")
    // U+0300-U+036F: birlesik aksan isaretleri. Acik kacis dizisiyle
    // yaziliyor cunku gorunmez karakterler kaynakta kirilgan.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

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
