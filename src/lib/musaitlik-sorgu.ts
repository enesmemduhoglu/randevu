// Musaitlik sorgusunun kurulmasi: veriyi toplayip motoru cagiran katman.
//
// Route ile motor arasinda duruyor cunku ayni is UC yerde gerekiyor:
// GET /api/musaitlik listeyi gosteriyor, POST /api/randevu yazmadan hemen once
// ayni hesabi tekrarlayip slotun hala bos oldugunu dogruluyor, Faz H2'den beri
// panel de ayni listeyi isletmeye gosteriyor. Ayni is icin iki farkli hesap,
// gosterilen liste ile kabul edilen randevunun ayrismasi demekti.

import { uygunSaatler, type Aralik, type CalismaAraligi } from "@/lib/musaitlik";
import { gunBasi, gunEkle, yerelGun, type YerelTarih } from "@/lib/zaman";

export type PersonelSloti = Aralik & {
  personelId: string;
  personelAd: string;
};

/// Motorun ihtiyac duydugu ISLETME AYARLARI.
///
/// Girdide `db`den AYRI duruyorlar cunku iki kapi bu ayarlari farkli anda
/// biliyor: `getHalkaAcikDb` isletmeyi slug'dan cozerken zaten okuyor ve
/// `db.isletme` olarak tasiyor, `getScopedDb` ise yalnizca oturumun
/// isletmeId'sini biliyor - ayarlari okumak icin ek bir sorgu gerekiyor ve
/// panelin ayarla ilgilenmeyen her sayfasina o sorguyu odetmek istemiyoruz.
export type MusaitlikAyarlari = {
  saatDilimi: string;
  slotAraligiDk: number;
  minOnceBildirimDk: number;
  maksIleriGun: number;
};

/// Motorun veriyi OKUDUGU yuzey.
///
/// Somut bir kapi tipi degil, iki kapinin da karsiladigi DAR bir arayuz.
/// Neden boyle: motor `getHalkaAcikDb`nin donus tipine baglanmisti ve panel
/// tarafi ayni hesabi yapamiyordu - Faz H2'nin ilk isi bu bagi cozmek oldu.
/// Arayuz dar tutuluyor cunku genisledigi olcude iki kapinin da tasimasi
/// gereken yuk artar; burada yalnizca "kim, ne zaman calisiyor, nesi dolu"
/// sorulari var.
///
/// DEGISMEZ 1 KORUNUYOR: bu bir tip, veri kaynagi degil. Cagiran taraf yine
/// kiraci veremiyor - metotlarin arkasindaki filtre her iki kapida da kendi
/// kapanis degiskeni.
export type MusaitlikKapisi = {
  hizmetiVerenPersoneller(
    hizmetId: string,
  ): Promise<{ id: string; ad: string }[]>;
  calismaSaatleriniListele(personelId: string): Promise<CalismaAraligi[]>;
  kapaliAraliklariListele(
    personelId: string,
    alt: Date,
    ust: Date,
  ): Promise<Aralik[]>;
  doluRandevulariListele(
    personelId: string,
    alt: Date,
    ust: Date,
  ): Promise<Aralik[]>;
};

export type SorguGirdisi = {
  db: MusaitlikKapisi;
  isletme: MusaitlikAyarlari;
  hizmetSuresiDk: number;
  hizmetId: string;
  tarih: YerelTarih;
  simdi: Date;
  /// Verilmezse hizmeti verebilen TUM personeller deneniyor ("farketmez").
  personelId?: string;
};

/// Istenen ANIN hala alinabilir olup olmadigini sinar; alinabiliyorsa
/// randevunun yazilacagi personeli doner.
///
/// Neden listeyi yeniden uretiyoruz: musterinin sayfayi actigi an ile "onayla"
/// dedigi an arasinda dakikalar gecebiliyor. O arada baskasi ayni sloti
/// almis, isletme calisma saatini degistirmis ya da min bildirim suresi
/// gecmis olabilir. Ayni hesabi tekrarlamak, iki farkli kural kumesi
/// yazmaktan guvenli - motor tek.
///
/// Bu bir GARANTI DEGIL, erken geri bildirim: gercek koruma veritabanindaki
/// EXCLUDE kisiti (DEGISMEZ 8). Buradan gecen bir istek yine 409 alabilir.
export async function slotSec(
  girdi: Omit<SorguGirdisi, "tarih"> & { baslangic: Date },
): Promise<PersonelSloti | null> {
  const { isletme, baslangic } = girdi;

  // Gun, istenen anin ISLETMENIN dilimindeki karsiligi. Sunucunun dilimine
  // bakilmiyor (DEGISMEZ 7): UTC bir Worker'da 22:00'daki bir randevu ertesi
  // gune dusuyor ve o gunun calisma saatleriyle sinanirdi.
  const tarih = yerelGun(baslangic, isletme.saatDilimi);

  const slotlar = await gununSlotlari({ ...girdi, tarih });

  return (
    slotlar.find((s) => s.baslangic.getTime() === baslangic.getTime()) ?? null
  );
}

/// Bir gunun uygun saatlerini, hangi personelle olduguyla birlikte doner.
export async function gununSlotlari(
  girdi: SorguGirdisi,
): Promise<PersonelSloti[]> {
  const { db, isletme, hizmetSuresiDk, hizmetId, tarih, simdi, personelId } =
    girdi;

  const adaylar = await db.hizmetiVerenPersoneller(hizmetId);
  const secilenler = personelId
    ? adaylar.filter((p) => p.id === personelId)
    : adaylar;

  if (secilenler.length === 0) return [];

  // Sorgu penceresi: yerel gunun basindan ertesi gunun basina. Randevu ve izin
  // araliklari bu pencereyle KESISENLER olarak cekiliyor, "icinde olanlar"
  // olarak degil - gece yarisini asan bir randevu ya da bir haftalik tatil
  // aksi halde gorunmezdi.
  const alt = gunBasi(isletme.saatDilimi, tarih);
  const ust = gunBasi(isletme.saatDilimi, gunEkle(tarih, 1));

  const hepsi: PersonelSloti[] = [];

  for (const p of secilenler) {
    const [calismaAraliklari, kapaliAraliklar, doluRandevular] =
      await Promise.all([
        db.calismaSaatleriniListele(p.id),
        db.kapaliAraliklariListele(p.id, alt, ust),
        db.doluRandevulariListele(p.id, alt, ust),
      ]);

    const slotlar = uygunSaatler({
      saatDilimi: isletme.saatDilimi,
      tarih,
      simdi,
      hizmetSuresiDk,
      slotAraligiDk: isletme.slotAraligiDk,
      minOnceBildirimDk: isletme.minOnceBildirimDk,
      maksIleriGun: isletme.maksIleriGun,
      calismaAraliklari,
      kapaliAraliklar,
      doluRandevular,
    });

    for (const slot of slotlar) {
      hepsi.push({ ...slot, personelId: p.id, personelAd: p.ad });
    }
  }

  hepsi.sort((a, b) => a.baslangic.getTime() - b.baslangic.getTime());

  // Ayni saatte birden fazla personel musaitse musteriye TEK secenek
  // gosteriliyor. "Farketmez" diyen musteri icin iki ayni saat iki ayri
  // secenek gibi gorunurdu; personel secimi zaten ayri bir adim.
  // Sirali listede ilk gelen kazaniyor, yani personel siralamasi belirleyici.
  const tekil: PersonelSloti[] = [];
  for (const slot of hepsi) {
    const onceki = tekil[tekil.length - 1];
    if (onceki && onceki.baslangic.getTime() === slot.baslangic.getTime()) {
      continue;
    }
    tekil.push(slot);
  }

  return tekil;
}
