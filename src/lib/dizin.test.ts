import { eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";

import { isletme } from "@/db/sema";
import { tablolariBosalt } from "@/db/test-temizlik";
import { getDb } from "@/lib/db";
import { isletmeleriAra, filtreSecenekleri, SAYFA_BOYUTU } from "@/lib/dizin";
import { ILLER, VITRIN_ILLERI } from "@/lib/dizin-girdi";
import { isletmeKaydiOlustur } from "@/lib/kayit";
import { getScopedDb, type ScopedDb } from "@/lib/scoped-db";

// Gercek Postgres'e kosuyor. Dizin bu deponun tek KIRACI-USTU sorgusu, yani
// "yanlis satir donmesin" burada bir tercih degil guvenlik kosulu -
// degismezler.test.ts dosyanin SEKLINI zorluyor, bu dosya DAVRANISINI.
//
// Kurulum uygulamanin kendi kapilarindan geciyor (kayit + scoped-db), ham `db`
// ile degil: testin uretimin gordugu yollari kullanmasi, kurulumun sessizce
// gecersiz bir durum uretmesini engelliyor.

let sayac = 0;

type Kurulum = { isletmeId: string; slug: string; db: ScopedDb };

async function isletmeKur(ad: string): Promise<Kurulum> {
  sayac += 1;
  const kayit = await isletmeKaydiOlustur({
    authUserId: `dizin-auth-${sayac}`,
    eposta: `dizin${sayac}@ornek.test`,
    adSoyad: "Test Sahibi",
    isletmeAdi: ad,
  });
  if (kayit.durum !== "tamam") throw new Error(`kurulum: ${kayit.durum}`);

  const db = await getScopedDb({
    kullaniciId: kayit.kullaniciId,
    authUserId: `dizin-auth-${sayac}`,
    isletmeId: kayit.isletmeId,
    rol: "SAHIP",
  });

  return { isletmeId: kayit.isletmeId, slug: kayit.slug, db };
}

/// Yayina cikabilecek kadar tam bir isletme: il, kategori, hizmet, personel,
/// calisma saati. `yayindaAyarla`nin on kosullarinin tamami.
async function tamKurulum(
  ad: string,
  { il = "İstanbul", kategori = "Kuaför", ilce = "Kadıköy", fiyatKurus = 30000 } = {},
): Promise<Kurulum> {
  const k = await isletmeKur(ad);
  await k.db.ayarlariGuncelle({ il, ilce, kategori });
  await k.db.hizmetEkle({ ad: "Saç kesimi", sureDk: 45, fiyatKurus });
  const [personel] = await k.db.personelleriListele();
  await k.db.calismaSaatleriniYaz(personel.id, [
    { haftaninGunu: 1, baslangicDk: 540, bitisDk: 1080 },
  ]);
  return k;
}

const slugLari = (kartlar: { slug: string }[]) => kartlar.map((k) => k.slug).sort();

beforeEach(async () => {
  await tablolariBosalt();
});

// ---- Gorunurluk kapisi -----------------------------------------------------

test("yayina alinmamis isletme dizinde GORUNMUYOR", async () => {
  await tamKurulum("Gizli Salon");

  const { kartlar, toplam } = await isletmeleriAra({});

  // Varsayilan `yayinda=false`: pazaryeri kavrami yokken kaydolmus isletmeler
  // gocten sonra sessizce listeye dusmemeli.
  expect(kartlar).toHaveLength(0);
  expect(toplam).toBe(0);
});

test("yayina alinan isletme goruluyor", async () => {
  const k = await tamKurulum("Acik Salon");
  expect(await k.db.yayindaAyarla(true)).toEqual({ durum: "tamam" });

  const { kartlar, toplam } = await isletmeleriAra({});

  expect(toplam).toBe(1);
  expect(kartlar[0].slug).toBe(k.slug);
  expect(kartlar[0].il).toBe("İstanbul");
  expect(kartlar[0].ilce).toBe("Kadıköy");
  expect(kartlar[0].kategori).toBe("Kuaför");
  expect(kartlar[0].hizmetSayisi).toBe(1);
  expect(kartlar[0].enDusukFiyatKurus).toBe(30000);
});

test("pasif isletme yayinda olsa bile GORUNMUYOR", async () => {
  const k = await tamKurulum("Kapanan Salon");
  await k.db.yayindaAyarla(true);

  // `aktif` KAPSAMLI KATMANDAN GECILMEDEN yaziliyor - bilerek. Bugun isletmeyi
  // pasiflestiren bir uygulama yolu YOK: `aktif` kolonu var ve `getHalkaAcikDb`
  // ile dizin onu okuyor ama hicbir metot false yapmiyor (ileride hesap
  // kapatma ya da yonetici islemi gelince gelecek). Yani buradaki kontrol
  // savunma amacli; sinamak icin uygulamanin ulasamadigi bir duruma elle
  // gecmek gerekiyor.
  //
  // Ham `db` kullanmak bu dosyada serbest: eslint kurali ve degismezler testi
  // yalnizca `src/app` altini kisitliyor (DEGISMEZ 1'in kapsami).
  const ham = await getDb();
  await ham
    .update(isletme)
    .set({ aktif: false })
    .where(eq(isletme.id, k.isletmeId));

  // `aktif` ve `yayinda` AYRI kavramlar; ikisinin de tutmasi gerekiyor.
  expect((await isletmeleriAra({})).kartlar).toHaveLength(0);
});

test("dizinden cikarmak kosulsuz calisiyor", async () => {
  const k = await tamKurulum("Vazgecen Salon");
  await k.db.yayindaAyarla(true);

  expect(await k.db.yayindaAyarla(false)).toEqual({ durum: "tamam" });
  expect((await isletmeleriAra({})).kartlar).toHaveLength(0);
});

// ---- Yayina cikis on kosullari ---------------------------------------------

test("eksik profil yayina cikamiyor ve NEYIN eksik oldugunu soyluyor", async () => {
  const k = await isletmeKur("Yarim Salon");

  const sonuc = await k.db.yayindaAyarla(true);

  expect(sonuc.durum).toBe("eksik");
  if (sonuc.durum !== "eksik") throw new Error("beklenmeyen");
  // Kayit varsayilan personeli kendisi olusturuyor, o yuzden personel eksik degil.
  expect(sonuc.eksikler.sort()).toEqual(
    ["calisma-saati", "hizmet", "il", "kategori"].sort(),
  );

  // Reddedilen yayin, satiri DEGISTIRMEMELI.
  expect((await isletmeleriAra({})).kartlar).toHaveLength(0);
});

test("yalnizca il eksikse yalnizca il bildiriliyor", async () => {
  const k = await tamKurulum("Ilsiz Salon");
  await k.db.ayarlariGuncelle({ il: null });

  const sonuc = await k.db.yayindaAyarla(true);

  expect(sonuc).toEqual({ durum: "eksik", eksikler: ["il"] });
});

// ---- Filtreler -------------------------------------------------------------

test("il ve kategori filtreleri daraltiyor", async () => {
  const a = await tamKurulum("Ankara Kuaforu", { il: "Ankara", kategori: "Kuaför" });
  const b = await tamKurulum("Ankara Berberi", { il: "Ankara", kategori: "Berber" });
  const c = await tamKurulum("Izmir Kuaforu", { il: "İzmir", kategori: "Kuaför" });
  for (const k of [a, b, c]) await k.db.yayindaAyarla(true);

  expect(slugLari((await isletmeleriAra({ il: "Ankara" })).kartlar)).toEqual(
    [a.slug, b.slug].sort(),
  );
  expect(
    slugLari((await isletmeleriAra({ il: "Ankara", kategori: "Kuaför" })).kartlar),
  ).toEqual([a.slug]);
  expect(slugLari((await isletmeleriAra({ kategori: "Kuaför" })).kartlar)).toEqual(
    [a.slug, c.slug].sort(),
  );
});

test("listede olmayan il filtresi YOK SAYILIYOR, bos sonuc uretmiyor", async () => {
  const k = await tamKurulum("Bir Salon");
  await k.db.yayindaAyarla(true);

  // Bozuk bir URL parametresi yuzunden bos sayfa gostermek kullaniciya hicbir
  // sey anlatmiyor; filtre dusuruluyor ve arayuz onu secili gostermiyor.
  expect((await isletmeleriAra({ il: "Atlantis" })).kartlar).toHaveLength(1);
  expect((await isletmeleriAra({ kategori: "Uzay Istasyonu" })).kartlar).toHaveLength(1);
});

test("arama isletme adinda gecen metni buluyor", async () => {
  const a = await tamKurulum("Güzellik Merkezi Nisan");
  const b = await tamKurulum("Berber Mehmet");
  for (const k of [a, b]) await k.db.yayindaAyarla(true);

  expect(slugLari((await isletmeleriAra({ arama: "berber" })).kartlar)).toEqual([b.slug]);
  // Buyuk/kucuk harf duyarsiz.
  expect(slugLari((await isletmeleriAra({ arama: "NISAN" })).kartlar)).toEqual([a.slug]);
});

test("Turkce'nin dogru kucuk yazimi da buluyor", async () => {
  // BU TESTIN SEBEBI GERCEK BIR HATA: `ilike` kucultmeyi veritabani
  // collation'iyla yapiyor ve orada "I" -> noktali "i". Yani yalnizca `ad`
  // taransaydi "Işıl Güzellik" kaydi "işıl" aramasini bulur, Turkce'de o adin
  // DOGRU kucuk yazimi olan "ışıl" aramasini bulmazdi. Elle olculdu, uc
  // yazimdan biri bos donuyordu.
  const k = await tamKurulum("Işıl Güzellik");
  await k.db.yayindaAyarla(true);

  for (const yazim of ["Işıl", "ışıl", "işıl", "isil", "ISIL"]) {
    const sonuc = await isletmeleriAra({ arama: yazim });
    expect(slugLari(sonuc.kartlar), `yazim: ${yazim}`).toEqual([k.slug]);
  }
});

test("Turkce karakter yazmayan ziyaretci de buluyor", async () => {
  // Kayit slug'i zaten ASCII'ye katlanmis duruyor (`isil-guzellik`); aramayi
  // ayni fonksiyondan gecirmek klavyesinde Turkce harf olmayan ziyaretciyi de
  // kapsiyor. Ayri bir kolon ya da `unaccent` uzantisi gerekmedi.
  const k = await tamKurulum("Çağdaş Kuaför");
  await k.db.yayindaAyarla(true);

  expect(slugLari((await isletmeleriAra({ arama: "cagdas" })).kartlar)).toEqual([k.slug]);
  expect(slugLari((await isletmeleriAra({ arama: "kuafor" })).kartlar)).toEqual([k.slug]);
  // Iki kelime arasindaki bosluk slug'da tire; arama yine tutuyor.
  expect(slugLari((await isletmeleriAra({ arama: "cagdas kuafor" })).kartlar)).toEqual([
    k.slug,
  ]);
});

test("aramadaki joker karakterler ESLESMIYOR", async () => {
  const k = await tamKurulum("Duz Salon");
  await k.db.yayindaAyarla(true);

  // Kacilmasaydi `%` her satiri eslestirirdi: sonuc sizinti degil ama sorgu
  // maliyeti ziyaretcinin denetimine gecerdi.
  expect((await isletmeleriAra({ arama: "%" })).kartlar).toHaveLength(0);
  expect((await isletmeleriAra({ arama: "_" })).kartlar).toHaveLength(0);
});

// ---- Toplama ---------------------------------------------------------------

test("kart en dusuk AKTIF hizmet fiyatini gosteriyor", async () => {
  const k = await tamKurulum("Cok Hizmetli", { fiyatKurus: 50000 });
  await k.db.hizmetEkle({ ad: "Fön", sureDk: 30, fiyatKurus: 20000 });
  const pahali = await k.db.hizmetEkle({ ad: "Boya", sureDk: 90, fiyatKurus: 10000 });
  await k.db.hizmetPasifleStir(pahali.id);
  await k.db.yayindaAyarla(true);

  const [kart] = (await isletmeleriAra({})).kartlar;

  // Pasiflenen hizmet ne sayima ne en dusuk fiyata giriyor.
  expect(kart.hizmetSayisi).toBe(2);
  expect(kart.enDusukFiyatKurus).toBe(20000);
});

test("bir isletmenin kartinda BASKA isletmenin hizmeti sayilmiyor", async () => {
  const a = await tamKurulum("A Salonu", { fiyatKurus: 40000 });
  const b = await tamKurulum("B Salonu", { fiyatKurus: 10000 });
  await b.db.hizmetEkle({ ad: "Ekstra", sureDk: 15, fiyatKurus: 5000 });
  for (const k of [a, b]) await k.db.yayindaAyarla(true);

  const kartlar = (await isletmeleriAra({})).kartlar;
  const kartA = kartlar.find((k) => k.slug === a.slug);
  const kartB = kartlar.find((k) => k.slug === b.slug);

  // Join'in gruplamasi kacsaydi iki isletmenin hizmetleri birbirine karisirdi.
  expect(kartA?.hizmetSayisi).toBe(1);
  expect(kartA?.enDusukFiyatKurus).toBe(40000);
  expect(kartB?.hizmetSayisi).toBe(2);
  expect(kartB?.enDusukFiyatKurus).toBe(5000);
});

// ---- Filtre secenekleri ----------------------------------------------------

test("filtre secenekleri yalnizca DOLU il ve kategorileri donuyor", async () => {
  const a = await tamKurulum("Bursa Salonu", { il: "Bursa", kategori: "Masaj & Spa" });
  const b = await tamKurulum("Yayinsiz", { il: "Konya", kategori: "Veteriner" });
  await a.db.yayindaAyarla(true);
  // b yayina alinmadi.

  const { iller, kategoriler } = await filtreSecenekleri();

  // 81 ilin 80'i bos bir listede kullanici tek tek deneyip bos sonuc gorurdu.
  expect(iller).toEqual(["Bursa"]);
  expect(kategoriler).toEqual(["Masaj & Spa"]);
  expect(iller).not.toContain("Konya");
  void b;
});

// ---- Vitrin kirpmasi -------------------------------------------------------

test("enCok kart sayisini kisiyor ama toplam kirpilmis sayiyi DEGIL", async () => {
  for (const ad of ["Vitrin Bir", "Vitrin Iki", "Vitrin Uc"]) {
    const k = await tamKurulum(ad, { il: "Bursa" });
    await k.db.yayindaAyarla(true);
  }

  const { kartlar, toplam } = await isletmeleriAra({ il: "Bursa", enCok: 2 });

  expect(kartlar).toHaveLength(2);
  // Toplam kirpilmadan donuyor: ana sayfadaki "N işletmenin tümü" baglantisi
  // gosterilenden fazlasi olup olmadigini bu sayidan biliyor. Kirpilmis
  // donseydi baglanti hic gorunmez ve kalan isletmelere gidilemezdi.
  expect(toplam).toBe(3);
});

test("enCok sayfa boyutunun USTUNE cikamiyor", async () => {
  // Cagiran taraf `enCok` ile sayfalama sinirini asamamali; asabilseydi tek
  // istekte butun dizini cekmek serbest olurdu.
  const k = await tamKurulum("Tek Salon", { il: "Bursa" });
  await k.db.yayindaAyarla(true);

  const { kartlar } = await isletmeleriAra({ il: "Bursa", enCok: 10_000 });

  expect(kartlar).toHaveLength(1);
  expect(kartlar.length).toBeLessThanOrEqual(SAYFA_BOYUTU);
});

test("vitrin illerinin hepsi gecerli bir il", async () => {
  // `VITRIN_ILLERI` dizin sorgusuna dogrudan filtre olarak giriyor ve gecersiz
  // bir deger sessizce YOK SAYILIYOR (dizin.ts karari) - yani yanlis yazilmis
  // bir sehir, ana sayfada butun dizini o baslik altinda listelerdi.
  for (const il of VITRIN_ILLERI) {
    expect(ILLER).toContain(il);
  }
});
