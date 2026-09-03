import { afterEach, beforeEach, expect, test } from "vitest";

import { tablolariBosalt } from "@/db/test-temizlik";
import {
  HATIRLATMA_ONCE_SAAT,
  bildirimleriBosalt,
  iptalBildirimleriniPlanla,
  randevuIptalKayitlari,
  randevuOlustuKayitlari,
} from "@/lib/bildirim";
import { isletmeKaydiOlustur } from "@/lib/kayit";
import { getHalkaAcikDb, getScopedDb, type ScopedDb } from "@/lib/scoped-db";
import { iptalTokenUret } from "@/lib/iptal-token";

// ENTEGRASYON TESTI: gercek Postgres, mock yok.
//
// Gonderim `BILDIRIM_MODU` tanimsiz oldugu icin SAHTE modda kosuyor - yani
// hicbir ag istegi acilmiyor ve hicbir adrese mail gitmiyor. Sahte modun
// "gonderdim" demesi bilincli (bkz. email.ts): kuyrugun durum makinesi gercek
// modla birebir ayni yolu izliyor, yoksa uretimde ilk kez kosan bir dal olurdu.

const ISTANBUL = "Europe/Istanbul";

type Kurulum = {
  isletmeId: string;
  slug: string;
  hizmetId: string;
  personelId: string;
  db: ScopedDb;
};

let sayac = 0;

async function isletmeKur(ad: string): Promise<Kurulum> {
  sayac += 1;
  const kayit = await isletmeKaydiOlustur({
    // DEGISMEZ 9: authUserId duz string, auth.users'a foreign key yok.
    authUserId: `bildirim-auth-${sayac}`,
    eposta: `sahip${sayac}@ornek.com`,
    adSoyad: "Zeynep Kaya",
    isletmeAdi: ad,
  });
  if (kayit.durum !== "tamam") throw new Error(`kurulum: ${kayit.durum}`);

  const db = await getScopedDb({
    kullaniciId: kayit.kullaniciId,
    authUserId: `bildirim-auth-${sayac}`,
    isletmeId: kayit.isletmeId,
    rol: "SAHIP",
  });

  await db.ayarlariGuncelle({ saatDilimi: ISTANBUL });
  const hizmet = await db.hizmetEkle({ ad: "Saç kesimi", sureDk: 60 });
  const [personel] = await db.personelleriListele();

  return {
    isletmeId: kayit.isletmeId,
    slug: kayit.slug,
    hizmetId: hizmet.id,
    personelId: personel.id,
    db,
  };
}

async function halkaAcik(slug: string) {
  const db = await getHalkaAcikDb(slug);
  if (!db) throw new Error("isletme bulunamadi");
  return db;
}

/// Randevu yazar ve kimligini doner. Musaitlik motorundan GECMIYOR: bu dosya
/// bildirim akisini sinamak icin var, slot secimini `randevu.test.ts` sinıyor.
async function randevuYaz(
  k: Kurulum,
  { eposta = "musteri@ornek.com" as string | null, saatSonra = 72 } = {},
): Promise<{ id: string; baslangic: Date }> {
  const db = await halkaAcik(k.slug);
  const simdi = new Date();
  const baslangic = new Date(simdi.getTime() + saatSonra * 60 * 60 * 1000);

  const sonuc = await db.randevuOlustur({
    personelId: k.personelId,
    hizmetId: k.hizmetId,
    baslangic,
    bitis: new Date(baslangic.getTime() + 60 * 60 * 1000),
    musteriAd: "Ayşe Yılmaz",
    telefon: `53${String(sayac).padStart(8, "0")}`,
    eposta,
    not: null,
    iptalToken: iptalTokenUret(),
    simdi,
    enCokAcikRandevu: 3,
    otomatikOnay: true,
  });

  if (sonuc.durum !== "tamam") throw new Error(`randevu: ${sonuc.durum}`);
  return { id: sonuc.randevu.id, baslangic: sonuc.randevu.baslangic };
}

beforeEach(async () => {
  await tablolariBosalt();
});

afterEach(async () => {
  await tablolariBosalt();
});

// ---- Hangi olayda ne yaziliyor ---------------------------------------------

test("randevu olusunca musteri, isletme ve hatirlatma satirlari planlaniyor", () => {
  const simdi = new Date("2026-09-01T09:00:00.000Z");
  const baslangic = new Date("2026-09-05T09:00:00.000Z");

  const kayitlar = randevuOlustuKayitlari({
    randevuId: "r1",
    baslangic,
    onayli: true,
    simdi,
  });

  expect(kayitlar.map((k) => k.sablon)).toEqual([
    "MUSTERI_RANDEVU_ONAYLANDI",
    "ISLETME_YENI_RANDEVU",
    "MUSTERI_HATIRLATMA",
  ]);

  const hatirlatma = kayitlar[2].planlananZaman.getTime();
  expect(baslangic.getTime() - hatirlatma).toBe(
    HATIRLATMA_ONCE_SAAT * 60 * 60 * 1000,
  );
});

test("otomatik onay kapaliyken musteriye 'talep alindi' yaziliyor", () => {
  // BEKLIYOR baslayan bir randevuya "onaylandi" demek, musterinin isletme onu
  // beklemezken gelmesi demekti.
  const kayitlar = randevuOlustuKayitlari({
    randevuId: "r1",
    baslangic: new Date("2026-09-05T09:00:00.000Z"),
    onayli: false,
    simdi: new Date("2026-09-01T09:00:00.000Z"),
  });

  expect(kayitlar[0].sablon).toBe("MUSTERI_RANDEVU_ALINDI");
});

test("yarindan yakin randevuya hatirlatma yazilmiyor", () => {
  // Yazilsaydi ilk bosaltmada HEMEN gonderilirdi: musteri "yarinki
  // randevunuz" mailini randevuyu aldigi dakikada alirdi.
  const simdi = new Date("2026-09-01T09:00:00.000Z");
  const kayitlar = randevuOlustuKayitlari({
    randevuId: "r1",
    baslangic: new Date("2026-09-01T13:00:00.000Z"),
    onayli: true,
    simdi,
  });

  expect(kayitlar.map((k) => k.sablon)).toEqual([
    "MUSTERI_RANDEVU_ONAYLANDI",
    "ISLETME_YENI_RANDEVU",
  ]);
});

test("iptalde iki tarafa da mesaj yaziliyor", () => {
  const kayitlar = randevuIptalKayitlari({
    randevuId: "r1",
    simdi: new Date(),
  });

  expect(kayitlar.map((k) => k.sablon)).toEqual([
    "MUSTERI_RANDEVU_IPTAL",
    "ISLETME_RANDEVU_IPTAL",
  ]);
});

// ---- Kuyruk ve bosaltma ----------------------------------------------------

test("bosaltma zamani gelmis satirlari gonderiyor, hatirlatmaya dokunmuyor", async () => {
  const k = await isletmeKur("A Salonu");
  const randevu = await randevuYaz(k);
  const db = await halkaAcik(k.slug);
  const simdi = new Date();

  await db.bildirimKuyrugunaYaz(
    randevuOlustuKayitlari({
      randevuId: randevu.id,
      baslangic: randevu.baslangic,
      onayli: true,
      simdi,
    }),
  );

  await bildirimleriBosalt(db, randevu.id, simdi);

  const kuyruk = await k.db.bildirimleriListele(10);
  const durumlar = Object.fromEntries(kuyruk.map((s) => [s.sablon, s.durum]));

  expect(durumlar.MUSTERI_RANDEVU_ONAYLANDI).toBe("GONDERILDI");
  expect(durumlar.ISLETME_YENI_RANDEVU).toBe("GONDERILDI");
  // Hatirlatmanin zamani gelmedi: uc gun sonraki randevunun hatirlatmasi iki
  // gun sonra gonderilecek.
  expect(durumlar.MUSTERI_HATIRLATMA).toBe("BEKLIYOR");
});

test("sahte modda mesajin gercek HTML'i onizleme olarak saklaniyor", async () => {
  // /panel/gelistirici/bildirimler ekraninin tek veri kaynagi bu kolon.
  const k = await isletmeKur("A Salonu");
  const randevu = await randevuYaz(k);
  const db = await halkaAcik(k.slug);
  const simdi = new Date();

  await db.bildirimKuyrugunaYaz([
    {
      randevuId: randevu.id,
      sablon: "MUSTERI_RANDEVU_ONAYLANDI",
      planlananZaman: simdi,
    },
  ]);
  await bildirimleriBosalt(db, randevu.id, simdi);

  const [kayit] = await k.db.bildirimleriListele(10);
  expect(kayit.onizlemeHtml).toContain("Randevunuz onaylandı");
  expect(kayit.onizlemeHtml).toContain("A Salonu");
});

test("ayni satir ikinci kez gonderilmiyor", async () => {
  // Ustlenme kosullu UPDATE (DEGISMEZ 3): ikinci bosaltma 0 satir aliyor.
  // Faz K'de cron devreye girdiginde istek ici bosaltmayla yarisacak.
  const k = await isletmeKur("A Salonu");
  const randevu = await randevuYaz(k);
  const db = await halkaAcik(k.slug);
  const simdi = new Date();

  await db.bildirimKuyrugunaYaz([
    {
      randevuId: randevu.id,
      sablon: "MUSTERI_RANDEVU_ONAYLANDI",
      planlananZaman: simdi,
    },
  ]);

  await bildirimleriBosalt(db, randevu.id, simdi);
  const [ilk] = await k.db.bildirimleriListele(10);

  await bildirimleriBosalt(db, randevu.id, new Date(simdi.getTime() + 1000));
  const [ikinci] = await k.db.bildirimleriListele(10);

  // Gonderim zamani DEGISMEDI: ikinci kosum satiri hic ustlenmedi.
  expect(ikinci.gonderimZamani?.getTime()).toBe(ilk.gonderimZamani?.getTime());
});

test("e-postasi olmayan musteride satir HATA olarak isaretleniyor", async () => {
  // Sessizce dusurulseydi panelde "neden mail gitmedi" sorusunun cevabi
  // olmazdi. Randevu formunda e-posta zorunlu degil - beklenen bir durum.
  const k = await isletmeKur("A Salonu");
  const randevu = await randevuYaz(k, { eposta: null });
  const db = await halkaAcik(k.slug);
  const simdi = new Date();

  await db.bildirimKuyrugunaYaz([
    {
      randevuId: randevu.id,
      sablon: "MUSTERI_RANDEVU_ONAYLANDI",
      planlananZaman: simdi,
    },
  ]);
  await bildirimleriBosalt(db, randevu.id, simdi);

  const [kayit] = await k.db.bildirimleriListele(10);
  expect(kayit.durum).toBe("HATA");
  expect(kayit.hataMetni).toBe("adres-yok");
});

test("iptal bekleyen hatirlatmayi dusuruyor, gonderilmisi birakiyor", async () => {
  // Iptal edilmis randevu icin ertesi gun "yarinki randevunuz" maili gitmesi,
  // urune duyulan guveni tek basina bitirirdi.
  const k = await isletmeKur("A Salonu");
  const randevu = await randevuYaz(k);
  const db = await halkaAcik(k.slug);
  const simdi = new Date();

  await db.bildirimKuyrugunaYaz(
    randevuOlustuKayitlari({
      randevuId: randevu.id,
      baslangic: randevu.baslangic,
      onayli: true,
      simdi,
    }),
  );
  await bildirimleriBosalt(db, randevu.id, simdi);

  await iptalBildirimleriniPlanla(db, randevu.id, simdi);

  const kuyruk = await k.db.bildirimleriListele(10);
  const sablonlar = kuyruk.map((s) => s.sablon);

  expect(sablonlar).not.toContain("MUSTERI_HATIRLATMA");
  expect(sablonlar).toContain("MUSTERI_RANDEVU_IPTAL");
  expect(sablonlar).toContain("ISLETME_RANDEVU_IPTAL");
  // Gonderilmis satirlar duruyor: musteri o maili aldi, izini silmek
  // gecmisi yeniden yazmak olurdu.
  expect(sablonlar).toContain("MUSTERI_RANDEVU_ONAYLANDI");
});

// ---- Kiraci izolasyonu (IDOR) ----------------------------------------------

test("baska isletmenin kuyruk satirina dokunulamiyor", async () => {
  // DEGISMEZ 1: kuyruk metotlarinin where'i her zaman isletmeId tasiyor.
  const a = await isletmeKur("A Salonu");
  const b = await isletmeKur("B Salonu");

  const randevu = await randevuYaz(a);
  const aDb = await halkaAcik(a.slug);
  const bDb = await halkaAcik(b.slug);
  const simdi = new Date();

  await aDb.bildirimKuyrugunaYaz([
    {
      randevuId: randevu.id,
      sablon: "MUSTERI_RANDEVU_ONAYLANDI",
      planlananZaman: simdi,
    },
  ]);

  // B'nin kapisi A'nin randevusunu HIC gormuyor.
  expect(await bDb.gonderilecekBildirimleriGetir(randevu.id, simdi)).toEqual([]);
  expect(await bDb.bekleyenBildirimleriDusur(randevu.id)).toBe(0);
  expect(await b.db.bildirimleriListele(10)).toEqual([]);

  // B'nin bosaltmasi da bir sey yapmiyor - satir A'da BEKLIYOR kaliyor.
  await bildirimleriBosalt(bDb, randevu.id, simdi);
  const [aKaydi] = await a.db.bildirimleriListele(10);
  expect(aKaydi.durum).toBe("BEKLIYOR");
});

test("zamani gelmemis satir bosaltmada alinmiyor", async () => {
  const k = await isletmeKur("A Salonu");
  const randevu = await randevuYaz(k);
  const db = await halkaAcik(k.slug);
  const simdi = new Date();

  await db.bildirimKuyrugunaYaz([
    {
      randevuId: randevu.id,
      sablon: "MUSTERI_HATIRLATMA",
      planlananZaman: new Date(simdi.getTime() + 60 * 60 * 1000),
    },
  ]);
  await bildirimleriBosalt(db, randevu.id, simdi);

  const [kayit] = await k.db.bildirimleriListele(10);
  expect(kayit.durum).toBe("BEKLIYOR");
  expect(kayit.gonderimZamani).toBeNull();
});
