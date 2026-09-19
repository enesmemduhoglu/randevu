import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { POST } from "@/app/api/cron/hatirlatma/route";
import { bildirimKuyrugu, isletme } from "@/db/sema";
import { tablolariBosalt } from "@/db/test-temizlik";
import { HATIRLATMA_ONCE_SAAT } from "@/lib/bildirim";
import { getDb } from "@/lib/db";
import { gonder } from "@/lib/email";
import { kuyruguBosalt } from "@/lib/hatirlatici";
import { iptalTokenUret } from "@/lib/iptal-token";
import { isletmeKaydiOlustur } from "@/lib/kayit";
import { zamaniGelenRandevular } from "@/lib/kuyruk-tarama";
import { getHalkaAcikDb, getScopedDb, type ScopedDb } from "@/lib/scoped-db";

// ENTEGRASYON TESTI: gercek Postgres. Tek taklit `gonder`in SAYILMASI - sahte
// mod zaten hicbir ag istegi acmiyor, ama "ayni mesaj iki kez gitmedi"
// iddiasini satir durumundan degil CAGRI SAYISINDAN okumak istiyoruz: iki
// kosum ayni satiri ustlenip ikisi de gonderse durum yine GONDERILDI olurdu.
//
// Route testi de burada, `src/app` altinda degil: senaryolar pasif isletme ve
// SMS satiri icin ham veritabanina dokunuyor ve `src/app` altinda `@/lib/db`
// yasak (DEGISMEZ 1, testler dahil).

vi.mock("@/lib/email", async (orijinal) => {
  const gercek = await orijinal<typeof import("@/lib/email")>();
  return { ...gercek, gonder: vi.fn(gercek.gonder) };
});

const SIR = "cron-test-siri-sizmamali";
const SAAT = 60 * 60 * 1000;

type Kurulum = {
  slug: string;
  isletmeId: string;
  hizmetId: string;
  personelId: string;
  db: ScopedDb;
};

let sayac = 0;

async function isletmeKur(ad: string): Promise<Kurulum> {
  sayac += 1;
  const kayit = await isletmeKaydiOlustur({
    // DEGISMEZ 9: authUserId duz string.
    authUserId: `hatirlatici-auth-${sayac}`,
    eposta: `sahip${sayac}@ornek.com`,
    adSoyad: "Zeynep Kaya",
    isletmeAdi: ad,
  });
  if (kayit.durum !== "tamam") throw new Error(`kurulum: ${kayit.durum}`);

  const db = await getScopedDb({
    kullaniciId: kayit.kullaniciId,
    authUserId: `hatirlatici-auth-${sayac}`,
    isletmeId: kayit.isletmeId,
    rol: "SAHIP",
  });
  const hizmet = await db.hizmetEkle({ ad: "Saç kesimi", sureDk: 60 });
  const [personel] = await db.personelleriListele();

  return {
    slug: kayit.slug,
    isletmeId: kayit.isletmeId,
    hizmetId: hizmet.id,
    personelId: personel.id,
    db,
  };
}

/// Randevu ve ZAMANI GELMIS hatirlatma satiri. `saatSonra` randevunun
/// baslangici; hatirlatma her zaman ondan 24 saat once planlaniyor, yani
/// 24'ten kucuk her deger "hatirlatmanin zamani geldi" demek.
async function hatirlatmaliRandevu(
  k: Kurulum,
  saatSonra: number,
): Promise<{ randevuId: string }> {
  const db = await getHalkaAcikDb(k.slug);
  if (!db) throw new Error("isletme bulunamadi");

  const simdi = new Date();
  const baslangic = new Date(simdi.getTime() + saatSonra * SAAT);
  sayac += 1;

  const sonuc = await db.randevuOlustur({
    personelId: k.personelId,
    hizmetId: k.hizmetId,
    baslangic,
    bitis: new Date(baslangic.getTime() + SAAT),
    musteriAd: "Ayşe Yılmaz",
    telefon: `53${String(sayac).padStart(8, "0")}`,
    eposta: "musteri@ornek.com",
    not: null,
    iptalToken: iptalTokenUret(),
    simdi,
    enCokAcikRandevu: 100,
    enCokGunlukRandevu: 100,
    enCokGunlukYeniMusteri: 100,
    otomatikOnay: true,
  });
  if (sonuc.durum !== "tamam") throw new Error(`randevu: ${sonuc.durum}`);

  await db.bildirimKuyrugunaYaz([
    {
      randevuId: sonuc.randevu.id,
      sablon: "MUSTERI_HATIRLATMA",
      planlananZaman: new Date(baslangic.getTime() - HATIRLATMA_ONCE_SAAT * SAAT),
    },
  ]);

  return { randevuId: sonuc.randevu.id };
}

function cronIstegi(yetki?: string): Request {
  const basliklar: Record<string, string> = {};
  if (yetki !== undefined) basliklar.authorization = yetki;
  return new Request("https://randevu.test/api/cron/hatirlatma", {
    method: "POST",
    headers: basliklar,
  });
}

beforeEach(async () => {
  await tablolariBosalt();
  vi.mocked(gonder).mockClear();
  vi.stubEnv("CRON_SIRRI", SIR);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await tablolariBosalt();
});

// ---- Kapi -------------------------------------------------------------------

test("sir tanimsizken 503 - yapilandirma eksik, kuyruga dokunulmuyor", async () => {
  const k = await isletmeKur("A Salonu");
  await hatirlatmaliRandevu(k, 10);
  vi.stubEnv("CRON_SIRRI", "");

  const yanit = await POST(cronIstegi(`Bearer ${SIR}`));

  expect(yanit.status).toBe(503);
  const [satir] = await k.db.bildirimleriListele(10);
  expect(satir.durum).toBe("BEKLIYOR");
});

test("sirsiz ya da yanlis sirla 401, kuyruga dokunulmuyor", async () => {
  // Oturumsuz 401'in makine yolundaki karsiligi.
  const k = await isletmeKur("A Salonu");
  await hatirlatmaliRandevu(k, 10);

  for (const yetki of [undefined, "", SIR, `Bearer ${SIR}x`, `Bearer ${SIR.slice(1)}`, "Bearer "]) {
    const yanit = await POST(cronIstegi(yetki));
    expect(yanit.status).toBe(401);
    // DEGISMEZ 5: govde ne beklenen ne de gelen siri tasiyor.
    expect(await yanit.text()).not.toContain(SIR.slice(0, 8));
  }

  const [satir] = await k.db.bildirimleriListele(10);
  expect(satir.durum).toBe("BEKLIYOR");
  expect(gonder).not.toHaveBeenCalled();
});

// ---- Mutlu yol ve kiracilar arasi -------------------------------------------

test("iki isletmenin zamani gelmis hatirlatmasi da gidiyor, her biri kendi verisiyle", async () => {
  // Kiraci-ustu tarama yalnizca ADRES veriyor, gonderim her isletmenin kendi
  // kapisindan. IDOR'un bu yoldaki karsiligi: A'nin mesaji B'nin adini
  // tasimamali.
  const a = await isletmeKur("A Salonu");
  const b = await isletmeKur("B Berber");
  await hatirlatmaliRandevu(a, 10);
  await hatirlatmaliRandevu(b, 12);

  const yanit = await POST(cronIstegi(`Bearer ${SIR}`));

  expect(yanit.status).toBe(200);
  expect(await yanit.json()).toEqual({ randevu: 2, atlanan: 0 });

  const [aSatiri] = await a.db.bildirimleriListele(10);
  const [bSatiri] = await b.db.bildirimleriListele(10);
  expect(aSatiri.durum).toBe("GONDERILDI");
  expect(bSatiri.durum).toBe("GONDERILDI");
  expect(aSatiri.onizlemeHtml).toContain("A Salonu");
  expect(aSatiri.onizlemeHtml).not.toContain("B Berber");
  expect(bSatiri.onizlemeHtml).toContain("B Berber");
  expect(bSatiri.onizlemeHtml).not.toContain("A Salonu");

  expect(gonder).toHaveBeenCalledTimes(2);
});

test("zamani gelmemis hatirlatma alinmiyor", async () => {
  const k = await isletmeKur("A Salonu");
  await hatirlatmaliRandevu(k, 72);

  expect(await zamaniGelenRandevular(new Date(), 20)).toEqual([]);
  await kuyruguBosalt(new Date(), { aralikMs: 0 });

  const [satir] = await k.db.bildirimleriListele(10);
  expect(satir.durum).toBe("BEKLIYOR");
});

// ---- Yaris (DEGISMEZ 3) -------------------------------------------------------

test("es zamanli iki kosum ayni mesaji bir kez gonderiyor", async () => {
  // Uretimde bu yaris gercek: cron kosumu, ayni randevuya dokunan bir istegin
  // `after`'iyle ya da elle tetiklemeyle cakisabilir. Kosullu ustlenme ikinciyi
  // bosa cikariyor.
  const a = await isletmeKur("A Salonu");
  const b = await isletmeKur("B Berber");
  for (const saat of [3, 5, 7]) await hatirlatmaliRandevu(a, saat);
  for (const saat of [4, 6]) await hatirlatmaliRandevu(b, saat);

  const simdi = new Date();
  await Promise.all([
    kuyruguBosalt(simdi, { aralikMs: 0 }),
    kuyruguBosalt(simdi, { aralikMs: 0 }),
  ]);

  expect(gonder).toHaveBeenCalledTimes(5);
  const satirlar = [
    ...(await a.db.bildirimleriListele(10)),
    ...(await b.db.bildirimleriListele(10)),
  ];
  expect(satirlar.map((s) => s.durum)).toEqual(Array(5).fill("GONDERILDI"));
});

// ---- Tarama suzgecleri ------------------------------------------------------

test("pasif isletmenin satirlari taranmiyor", async () => {
  // Pasif isletme `getHalkaAcikDb`de bulunamiyor. Taramaya girseydi her
  // kosumda listenin basini isgal eder ve siniri bosalmayan satirlarla
  // doldururdu.
  const aktif = await isletmeKur("A Salonu");
  const pasif = await isletmeKur("B Berber");
  const { randevuId } = await hatirlatmaliRandevu(aktif, 10);
  await hatirlatmaliRandevu(pasif, 5);

  const db = await getDb();
  await db.update(isletme).set({ aktif: false }).where(eq(isletme.id, pasif.isletmeId));

  expect(await zamaniGelenRandevular(new Date(), 20)).toEqual([
    { slug: aktif.slug, randevuId },
  ]);
});

test("SMS satiri e-posta taramasina girmiyor", async () => {
  // Faz K'nin ikinci yarisi kuyruga SMS yazacak. E-posta bosaltmasi onlari
  // almiyor (`gonderilecekBildirimleriGetir` de ayni suzgeci tasiyor);
  // tarama alsaydi hic bosalmayan satirlar listenin basinda kalirdi.
  const k = await isletmeKur("A Salonu");
  const { randevuId } = await hatirlatmaliRandevu(k, 10);

  const db = await getDb();
  await db.update(bildirimKuyrugu).set({ tur: "SMS" }).where(eq(bildirimKuyrugu.randevuId, randevuId));

  expect(await zamaniGelenRandevular(new Date(), 20)).toEqual([]);
});

test("sinir dolunca en eski bekleyen once, kalan sonraki kosuma", async () => {
  // Kalanlar kaybolmuyor: BEKLIYOR kaliyor ve bir sonraki kosum onlari aliyor.
  const k = await isletmeKur("A Salonu");
  const gec = await hatirlatmaliRandevu(k, 20); // hatirlatmasi 4 saat once
  const erken = await hatirlatmaliRandevu(k, 2); // hatirlatmasi 22 saat once

  const ilk = await kuyruguBosalt(new Date(), { sinir: 1, aralikMs: 0 });
  expect(ilk).toEqual({ randevu: 1, atlanan: 0 });

  const durum = async () =>
    Object.fromEntries(
      (await k.db.bildirimleriListele(10)).map((s) => [s.randevuId, s.durum]),
    );
  expect(await durum()).toEqual({
    [erken.randevuId]: "GONDERILDI",
    [gec.randevuId]: "BEKLIYOR",
  });

  await kuyruguBosalt(new Date(), { sinir: 1, aralikMs: 0 });
  expect(await durum()).toEqual({
    [erken.randevuId]: "GONDERILDI",
    [gec.randevuId]: "GONDERILDI",
  });
});

test("baslamis randevunun bekleyen hatirlatmasi gitmiyor, bir daha taranmiyor", async () => {
  // Uretimdeki iki satirin senaryosu (bkz. bildirim.ts >
  // randevuOncesiMesajBayatMi). Isaretlenen satir BEKLIYOR'dan ciktigi icin
  // sonraki kosumlarda listeyi isgal etmiyor.
  const k = await isletmeKur("A Salonu");
  await hatirlatmaliRandevu(k, -30);

  await kuyruguBosalt(new Date(), { aralikMs: 0 });

  const [satir] = await k.db.bildirimleriListele(10);
  expect(satir.durum).toBe("HATA");
  expect(satir.hataMetni).toBe("randevu-basladi");
  expect(gonder).not.toHaveBeenCalled();
  expect(await zamaniGelenRandevular(new Date(), 20)).toEqual([]);
});
