import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { isletme, kullanici, personel } from "@/db/sema";
import { tablolariBosalt } from "@/db/test-temizlik";
import { baglantiyiKapat, getDb } from "@/lib/db";
import { isletmeKaydiOlustur } from "@/lib/kayit";
import { slugUret } from "@/lib/slug";

// Dogrulamalar ham getDb ile yapiliyor: test, test ettigi katmana guvenmemeli.

beforeEach(async () => {
  await tablolariBosalt();
});

afterAll(async () => {
  await baglantiyiKapat();
});

describe("slugUret", () => {
  test("Turkce harfleri dogru cozuyor", () => {
    expect(slugUret("Işıl Güzellik Salonu")).toBe("isil-guzellik-salonu");
    expect(slugUret("Çağdaş Berber")).toBe("cagdas-berber");
    expect(slugUret("ŞIK Kuaför")).toBe("sik-kuafor");
    expect(slugUret("Öz Bakım & Spa")).toBe("oz-bakim-spa");
  });

  test("noktasiz i ve noktali I ayri ayri dogru", () => {
    // NFD ile aksan ayirma bu ikisini cozemiyor; tablo tam da bunun icin.
    expect(slugUret("ışık")).toBe("isik");
    expect(slugUret("İstanbul")).toBe("istanbul");
  });

  test("harf icermeyen ad bos slug uretiyor", () => {
    expect(slugUret("   ")).toBe("");
    expect(slugUret("!!!")).toBe("");
  });

  test("bas ve sondaki ayraclar temizleniyor", () => {
    expect(slugUret("  -- Ada Kuafor -- ")).toBe("ada-kuafor");
  });
});

describe("isletmeKaydiOlustur", () => {
  const temelGirdi = {
    authUserId: "auth-1",
    eposta: "sahip@ornek.com",
    adSoyad: "Ayşe Yılmaz",
    isletmeAdi: "Işıl Güzellik",
  };

  test("isletme, sahip kullanici ve varsayilan personeli birlikte olusturuyor", async () => {
    const sonuc = await isletmeKaydiOlustur(temelGirdi);
    expect(sonuc.durum).toBe("tamam");
    if (sonuc.durum !== "tamam") return;
    expect(sonuc.slug).toBe("isil-guzellik");

    const db = await getDb();

    const [i] = await db
      .select()
      .from(isletme)
      .where(eq(isletme.id, sonuc.isletmeId));
    expect(i.ad).toBe("Işıl Güzellik");
    expect(i.saatDilimi).toBe("Europe/Istanbul");

    const [k] = await db
      .select()
      .from(kullanici)
      .where(eq(kullanici.id, sonuc.kullaniciId));
    expect(k.rol).toBe("SAHIP");
    expect(k.isletmeId).toBe(sonuc.isletmeId);

    // Tek kisilik isletmede bile bir personel var: randevu bir personele
    // baglanacak ve ikinci personel eklemek sema degistirmeyecek.
    const personeller = await db
      .select()
      .from(personel)
      .where(eq(personel.isletmeId, sonuc.isletmeId));
    expect(personeller).toHaveLength(1);
    expect(personeller[0].ad).toBe("Ayşe Yılmaz");
    expect(personeller[0].kullaniciId).toBe(sonuc.kullaniciId);
  });

  test("ayni authUserId ikinci kez kayit olamiyor", async () => {
    await isletmeKaydiOlustur(temelGirdi);
    const ikinci = await isletmeKaydiOlustur({
      ...temelGirdi,
      isletmeAdi: "Baska Salon",
    });
    expect(ikinci.durum).toBe("zaten-kayitli");

    const db = await getDb();
    const hepsi = await db.select().from(isletme);
    expect(hepsi).toHaveLength(1);
  });

  test("ayni anda gelen iki kayit: ikincisi kaybediyor", async () => {
    // Transaction once "bu authUserId kayitli mi" diye BAKIYOR; iki istek ayni
    // anda gelirse ikisi de bos gorur. Kesin cevabi veren sey uygulama
    // katmanindaki o kontrol degil, kullanici_auth_user_id_idx benzersizlik
    // kisiti. Bu test tam olarak onu zorluyor.
    const [ilk, ikinci] = await Promise.all([
      isletmeKaydiOlustur({ ...temelGirdi, isletmeAdi: "Bir Salon" }),
      isletmeKaydiOlustur({ ...temelGirdi, isletmeAdi: "Iki Salon" }),
    ]);

    expect([ilk.durum, ikinci.durum].sort()).toEqual(["tamam", "zaten-kayitli"]);

    // Kaybeden taraf yarim kayit birakmamali: kendi isletmesini de geri almali.
    const db = await getDb();
    expect(await db.select().from(kullanici)).toHaveLength(1);
    expect(await db.select().from(isletme)).toHaveLength(1);
    expect(await db.select().from(personel)).toHaveLength(1);
  });

  test("ayni addaki ikinci isletme sirali slug aliyor", async () => {
    const ilk = await isletmeKaydiOlustur(temelGirdi);
    const ikinci = await isletmeKaydiOlustur({
      ...temelGirdi,
      authUserId: "auth-2",
      eposta: "baska@ornek.com",
    });

    expect(ilk.durum).toBe("tamam");
    expect(ikinci.durum).toBe("tamam");
    if (ilk.durum !== "tamam" || ikinci.durum !== "tamam") return;
    expect(ilk.slug).toBe("isil-guzellik");
    expect(ikinci.slug).toBe("isil-guzellik-2");
  });

  test("harf icermeyen isletme adi reddediliyor ve hicbir kayit birakmiyor", async () => {
    const sonuc = await isletmeKaydiOlustur({ ...temelGirdi, isletmeAdi: "!!!" });
    expect(sonuc.durum).toBe("slug-uretilemedi");

    const db = await getDb();
    expect(await db.select().from(isletme)).toHaveLength(0);
    expect(await db.select().from(kullanici)).toHaveLength(0);
  });

  test("transaction gercekten geri aliniyor: slug tukendiginde yarim kayit kalmiyor", async () => {
    const db = await getDb();
    // Slug dongusu 2..50 araliginda deneyip pes ediyor. Hepsini onceden
    // doldurunca son insert unique kisitina carpiyor ve transaction'in
    // tamaminin geri alinmasi gerekiyor.
    const dolgu = [{ ad: "Dolu", slug: "dolu-salon" }];
    for (let i = 2; i <= 50; i++) dolgu.push({ ad: "Dolu", slug: `dolu-salon-${i}` });
    await db.insert(isletme).values(dolgu);

    const oncekiIsletmeSayisi = (await db.select().from(isletme)).length;

    await expect(
      isletmeKaydiOlustur({
        ...temelGirdi,
        authUserId: "auth-3",
        isletmeAdi: "Dolu Salon",
      }),
    ).rejects.toThrow();

    // Kritik nokta: isletme eklenmis ama kullanici eklenememis olsaydi
    // sayi artardi ve kullanici hicbir ekranda ilerleyemezdi.
    expect(await db.select().from(isletme)).toHaveLength(oncekiIsletmeSayisi);
    expect(await db.select().from(kullanici)).toHaveLength(0);
    expect(await db.select().from(personel)).toHaveLength(0);
  });
});
