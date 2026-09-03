// Dizini gosterilebilir hale getiren DEMO tohumu.
//
// Neden var: pazaryeri on kapisi (Faz N) bos bir dizinde bos gorunuyor ve
// bos bir pazaryeri ne gosterilebiliyor ne de denenebiliyor. Bu betik
// dizinde birkac isletme olmasini sagliyor.
//
// UC SOZLESME:
//
//   1. Yazma yollari UYGULAMANIN KENDI KAPILARINDAN geciyor
//      (`isletmeKaydiOlustur`, `getScopedDb`). Ham INSERT yazilmadi: yayina
//      cikis on kosullari (il, kategori, hizmet, personel, calisma saati)
//      boylece atlanamiyor ve tohum, uretimin gordugu yollarin ayni.
//   2. IDEMPOTENT. `authUserId` her isletme icin sabit bir dize; ikinci kosum
//      `zaten-kayitli` alip o kaydi ATLIYOR. Betigi iki kez kosmak dizini
//      ikiye katlamiyor.
//   3. PROD'a yazmak kazara olmuyor: `--onayla` yoksa calismiyor ve hangi
//      host'a bagladigini sifreyi basmadan soyluyor (prod-goc.ts emsali).
//
// Kullanim:
//   node scripts/tohum-demo.ts --onayla            # .env > DATABASE_URL (yerel)
//   node scripts/tohum-demo.ts --prod --onayla     # .env > SUPABASE_DB_URL
//
// Geri alma (bu betigin yazdigi her sey tek sorguyla gider):
//   delete from isletme where id in (
//     select isletme_id from kullanici where auth_user_id like 'demo-tohum-%'
//   );

import { config } from "dotenv";
import { eq } from "drizzle-orm";

import { isletme, kullanici } from "@/db/sema";
import { baglantiyiKapat, type Db, getDb } from "@/lib/db";
import { isletmeKaydiOlustur } from "@/lib/kayit";
import { getScopedDb } from "@/lib/scoped-db";

config();

const prod = process.argv.includes("--prod");

if (prod) {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL tanimli degil. .env.example'a bak.");
  // getDb'nin Node yolu DATABASE_URL okuyor; prod hedefi buraya kopyalaniyor.
  process.env.DATABASE_URL = url;
}

const hedefUrl = process.env.DATABASE_URL;
if (!hedefUrl) throw new Error("DATABASE_URL tanimli degil.");

const hedef = new URL(hedefUrl);
console.log(
  `hedef: ${hedef.hostname}:${hedef.port}${hedef.pathname}` +
    (prod ? " (PROD)" : " (yerel)"),
);

if (!process.argv.includes("--onayla")) {
  console.error("\nBu betik veritabanina YAZAR. Emin isen --onayla ekle.");
  process.exit(1);
}

/// Pazartesi-Cumartesi 09:00-13:00 ve 14:00-18:00; Pazar kapali.
/// (0 = Pazar ... 6 = Cumartesi, bkz. bicim.ts > GUN_ADLARI.)
const HAFTA = [1, 2, 3, 4, 5, 6].flatMap((gun) => [
  { haftaninGunu: gun, baslangicDk: 9 * 60, bitisDk: 13 * 60 },
  { haftaninGunu: gun, baslangicDk: 14 * 60, bitisDk: 18 * 60 },
]);

type Hizmet = { ad: string; sureDk: number; fiyatKurus: number };

type Tohum = {
  /// Var olan kayitlar icin slug, yeni kayitlar icin uretilecek olan.
  slug: string;
  ad: string;
  il: string;
  ilce: string;
  kategori: string;
  hakkinda: string;
  personeller: string[];
  hizmetler: Hizmet[];
};

/// Uretimde ZATEN DURAN kayitlar. Bunlar yeniden olusturulmuyor; yalnizca
/// dizinde gorunmek icin eksikleri tamamlaniyor. Faz M gocu `yayinda`yi
/// `DEFAULT false` ile eklemisti - pazaryeri kavrami yokken kaydolmus
/// isletmeler haberleri olmadan listeye dusmesin diye.
const MEVCUTLAR: Tohum[] = [
  {
    slug: "demo-guzellik-salonu",
    ad: "Demo Güzellik Salonu",
    il: "İstanbul",
    ilce: "Kadıköy",
    kategori: "Güzellik Salonu",
    hakkinda:
      "Saç, cilt ve bakım hizmetleri. Uygun saati seçin, randevunuzu hemen alın.",
    personeller: [],
    hizmetler: [],
  },
  {
    slug: "berber",
    ad: "berber",
    il: "Bursa",
    ilce: "Nilüfer",
    kategori: "Berber",
    hakkinda: "Saç kesimi, sakal ve bakım.",
    personeller: [],
    // Bu kaydin hic aktif hizmeti ve calisma saati yok; ikisi de eklenmezse
    // yayina cikamiyor (yayindaAyarla eksikleri sayarak reddediyor).
    hizmetler: [
      { ad: "Saç kesimi", sureDk: 30, fiyatKurus: 25000 },
      { ad: "Sakal düzeltme", sureDk: 20, fiyatKurus: 15000 },
    ],
  },
];

/// Yeni olusturulacak demo isletmeler. Iller BILEREK yalnizca Bursa ve
/// Istanbul: ana sayfanin sehir bolumleri o iki ili gosteriyor
/// (`VITRIN_ILLERI`), baska bir il yalnizca `/dizin`de gorunurdu.
const YENILER: Tohum[] = [
  {
    slug: "ada-kuafor",
    ad: "Ada Kuaför",
    il: "İstanbul",
    ilce: "Beşiktaş",
    kategori: "Kuaför",
    hakkinda:
      "Kesim, boya ve bakım. Randevunuzu seçtiğiniz uzmanla oluşturun.",
    personeller: ["Ada", "Selin"],
    hizmetler: [
      { ad: "Saç kesimi", sureDk: 45, fiyatKurus: 45000 },
      { ad: "Saç boyama", sureDk: 120, fiyatKurus: 140000 },
      { ad: "Fön", sureDk: 30, fiyatKurus: 25000 },
    ],
  },
  {
    slug: "mavi-tirnak-studyosu",
    ad: "Mavi Tırnak Stüdyosu",
    il: "İstanbul",
    ilce: "Şişli",
    kategori: "Tırnak Stüdyosu",
    hakkinda: "Manikür, pedikür ve kalıcı oje.",
    personeller: ["Ece"],
    hizmetler: [
      { ad: "Manikür", sureDk: 45, fiyatKurus: 35000 },
      { ad: "Pedikür", sureDk: 60, fiyatKurus: 45000 },
      { ad: "Kalıcı oje", sureDk: 75, fiyatKurus: 60000 },
    ],
  },
  {
    slug: "yesil-vadi-spa",
    ad: "Yeşil Vadi Spa",
    il: "Bursa",
    ilce: "Osmangazi",
    kategori: "Masaj & Spa",
    hakkinda: "Klasik ve bölgesel masaj; seans süresini randevuda seçiyorsunuz.",
    personeller: ["Kerem", "Deniz"],
    hizmetler: [
      { ad: "Klasik masaj (50 dk)", sureDk: 50, fiyatKurus: 90000 },
      { ad: "Sırt ve boyun masajı", sureDk: 30, fiyatKurus: 55000 },
    ],
  },
  {
    slug: "nilufer-berber-evi",
    ad: "Nilüfer Berber Evi",
    il: "Bursa",
    ilce: "Nilüfer",
    kategori: "Berber",
    hakkinda: "Saç, sakal ve cilt bakımı.",
    personeller: ["Emre"],
    hizmetler: [
      { ad: "Saç kesimi", sureDk: 30, fiyatKurus: 25000 },
      { ad: "Saç + sakal", sureDk: 45, fiyatKurus: 35000 },
    ],
  },
  {
    slug: "beyaz-dis-klinigi",
    ad: "Beyaz Diş Kliniği",
    il: "Bursa",
    ilce: "Nilüfer",
    kategori: "Diş Kliniği",
    hakkinda: "Kontrol, temizlik ve dolgu randevuları.",
    personeller: ["Dt. Burak"],
    hizmetler: [
      { ad: "Kontrol", sureDk: 20, fiyatKurus: 30000 },
      { ad: "Diş taşı temizliği", sureDk: 40, fiyatKurus: 80000 },
    ],
  },
];

// TOP-LEVEL AWAIT YOK: `package.json`da `type: module` yok, yani tsx bu
// dosyayi CJS olarak derliyor ve modul govdesinde `await` derlenmiyor. Is
// `main()` icinde.

/// Bir isletmenin SAHIP oturumunu kurar. Yazmalarin tamami bu oturum
/// uzerinden gidiyor, yani kiraci kapsamasi (DEGISMEZ 1) tohumda da gecerli.
async function sahipOturumu(db: Db, isletmeId: string) {
  const [sahip] = await db
    .select({ id: kullanici.id, authUserId: kullanici.authUserId })
    .from(kullanici)
    .where(eq(kullanici.isletmeId, isletmeId))
    .limit(1);

  if (!sahip) throw new Error(`sahip kullanici yok: ${isletmeId}`);

  return getScopedDb({
    kullaniciId: sahip.id,
    authUserId: sahip.authUserId,
    isletmeId,
    rol: "SAHIP",
  });
}

/// Tohumun geri kalanini uygular: ayarlar, hizmetler, personel, calisma
/// saatleri ve yayina cikis. Var olan kayitlarda da yeni kayitlarda da ayni.
async function tamamla(db: Db, isletmeId: string, tohum: Tohum) {
  const scoped = await sahipOturumu(db, isletmeId);

  await scoped.ayarlariGuncelle({
    il: tohum.il,
    ilce: tohum.ilce,
    kategori: tohum.kategori,
    hakkinda: tohum.hakkinda,
  });

  // Ayni adli hizmeti ikinci kez eklemiyoruz: betik iki kez kosarsa kartta
  // "6 hizmet" yazan bir isletme olusurdu.
  const varOlanHizmetler = new Set(
    (await scoped.hizmetleriListele({ pasifDahil: true })).map((h) => h.ad),
  );
  for (const h of tohum.hizmetler) {
    if (varOlanHizmetler.has(h.ad)) continue;
    await scoped.hizmetEkle(h);
  }

  const varOlanPersoneller = await scoped.personelleriListele();
  const adlar = new Set(varOlanPersoneller.map((p) => p.ad));
  for (const ad of tohum.personeller) {
    if (adlar.has(ad)) continue;
    await scoped.personelEkle({ ad });
  }

  // Calisma saati OLMAYAN personele yaziliyor; olanin takvimi eziliyor degil.
  // Uretimde elle duzenlenmis bir takvimi tohum bozmamali.
  for (const p of await scoped.personelleriListele()) {
    const mevcut = await scoped.calismaSaatleriniListele(p.id);
    if (mevcut.length > 0) continue;
    await scoped.calismaSaatleriniYaz(p.id, HAFTA);
  }

  const sonuc = await scoped.yayindaAyarla(true);
  if (sonuc.durum !== "tamam") {
    console.error(`  ! yayina cikamadi, eksik: ${sonuc.eksikler.join(", ")}`);
    return false;
  }
  return true;
}

async function main() {
  const db = await getDb();

  let tamamlanan = 0;
  let olusturulan = 0;
  let atlanan = 0;

  for (const tohum of MEVCUTLAR) {
    const [kayit] = await db
      .select({ id: isletme.id })
      .from(isletme)
      .where(eq(isletme.slug, tohum.slug))
      .limit(1);

    if (!kayit) {
      console.log(`atlandi (kayit yok): ${tohum.slug}`);
      atlanan += 1;
      continue;
    }

    console.log(`tamamlaniyor: ${tohum.slug}`);
    if (await tamamla(db, kayit.id, tohum)) tamamlanan += 1;
  }

  for (const tohum of YENILER) {
    // Sabit authUserId idempotensin dayanagi: ikinci kosumda kayit
    // "zaten-kayitli" donuyor ve o isletme yeniden olusturulmuyor.
    const authUserId = `demo-tohum-${tohum.slug}`;

    const kayit = await isletmeKaydiOlustur({
      authUserId,
      eposta: `${tohum.slug}@demo.randevu.local`,
      adSoyad: `${tohum.ad} yöneticisi`,
      isletmeAdi: tohum.ad,
    });

    if (kayit.durum === "zaten-kayitli") {
      console.log(`atlandi (zaten var): ${tohum.slug}`);
      atlanan += 1;
      continue;
    }
    if (kayit.durum !== "tamam") {
      console.error(`! olusturulamadi (${kayit.durum}): ${tohum.slug}`);
      continue;
    }

    console.log(`olusturuldu: ${kayit.slug}`);
    // `isletmeKaydiOlustur` varsayilan bir personel de yaratiyor; tohumdaki
    // adlar onun YANINA ekleniyor.
    if (await tamamla(db, kayit.isletmeId, tohum)) olusturulan += 1;
  }

  console.log(
    `\nbitti — tamamlanan: ${tamamlanan}, olusturulan: ${olusturulan}, ` +
      `atlanan: ${atlanan}`,
  );

  await baglantiyiKapat();
}

main().catch(async (hata) => {
  console.error(hata);
  await baglantiyiKapat();
  process.exit(1);
});
