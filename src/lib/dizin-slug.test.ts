import { expect, test } from "vitest";

import {
  ILLER,
  KATEGORILER,
  KATEGORI_COGUL,
  ilSlugu,
  kategoriSlugu,
  kategorileriAra,
  slugdanIl,
  slugdanKategori,
} from "@/lib/dizin-girdi";
import { slugUret } from "@/lib/slug";

// Inis sayfalarinin adresleri bu eslemeden uretiliyor
// (`/dizin/istanbul/kuafor`). Yani `slugUret` artik yalnizca bir yardimci
// degil, bir URL SOZLESMESI tasiyor: davranisi degisirse yayindaki adresler
// degisir ve arama motorunun bildigi her sey 404 olur.
//
// Bu dosya o sozlesmeyi sabitliyor.

test("her ilin slug'i benzersiz", () => {
  // Iki il ayni slug'a duserse birinin sayfasina ERISILEMEZ hale gelir ve bunu
  // hicbir sey haber vermez - `slugdanIl` sessizce otekini dondurur.
  const sluglar = ILLER.map(ilSlugu);
  expect(new Set(sluglar).size).toBe(ILLER.length);
});

test("her kategorinin slug'i benzersiz", () => {
  const sluglar = KATEGORILER.map(kategoriSlugu);
  expect(new Set(sluglar).size).toBe(KATEGORILER.length);
});

test("il slug'i gidip geri geliyor", () => {
  for (const il of ILLER) {
    expect(slugdanIl(ilSlugu(il))).toBe(il);
  }
});

test("kategori slug'i gidip geri geliyor", () => {
  for (const kategori of KATEGORILER) {
    expect(slugdanKategori(kategoriSlugu(kategori))).toBe(kategori);
  }
});

test("slug'lar yalnizca URL'de guvenli karakterler tasiyor", () => {
  // Turkce harf ya da bosluk kacan bir slug, adreste yuzde-kodlanmis bir
  // sayfaya donusurdu: paylasilamaz ve arama sonucunda okunamaz.
  for (const slug of [...ILLER.map(ilSlugu), ...KATEGORILER.map(kategoriSlugu)]) {
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  }
});

test("bilinen adresler sabit", () => {
  // Bu dort adres yayinda ve degistirilirse eski baglantilar 404 olur.
  // Degistirmek isteyen once yonlendirme yazmali; test o karari gorunur
  // kiliyor.
  expect(ilSlugu("İstanbul")).toBe("istanbul");
  expect(ilSlugu("Şanlıurfa")).toBe("sanliurfa");
  expect(kategoriSlugu("Kuaför")).toBe("kuafor");
  expect(kategoriSlugu("Masaj & Spa")).toBe("masaj-spa");
});

test("taninmayan slug null donuyor", () => {
  // Sayfalar bunu 404'e ceviriyor. Bos liste gostermek, arama motoruna sonsuz
  // sayida anlamsiz adres acmak olurdu.
  expect(slugdanIl("istanbull")).toBeNull();
  expect(slugdanIl("")).toBeNull();
  expect(slugdanKategori("kuafor-salonu")).toBeNull();
});

test("her kategorinin cogul yazimi var ve tekilinden farkli", () => {
  // `Record` derleme aninda eksik anahtari zaten yakaliyor; buradaki kontrol
  // birinin alani doldurup tekil hali birakmasina karsi - "İstanbul Kuaför"
  // yazan bir baslik dogru gorunmez.
  for (const kategori of KATEGORILER) {
    const cogul = KATEGORI_COGUL[kategori];
    expect(cogul.length).toBeGreaterThan(0);
    expect(cogul).not.toBe(kategori);
  }
});

// ---- Serbest arama metninden kategori (Faz P) -------------------------------
//
// `dizin.ts` aramayi kategoriye de bakacak sekilde genisletti ve eslesmeyi
// SQL'e degil buraya birakti. Gerekce fonksiyonun basinda yazili; asagidakiler
// o kararin davranisini sabitliyor. DB gerekmiyor - liste kapali ve saf.

test("kategori aramasi Turkce yazim varyantlarini buluyor", () => {
  // Ziyaretcinin Turkce karakter yazamamasi ya da yazmamasi bir hata degil.
  for (const yazim of ["kuafor", "kuaför", "KUAFÖR", "Kuaför"]) {
    expect(kategorileriAra(slugUret(yazim))).toEqual(["Kuaför"]);
  }
});

test("eslesme onek degil ICEREN", () => {
  // Ziyaretci kategorinin tam adini yazmiyor: "salon" -> "Güzellik Salonu".
  expect(kategorileriAra(slugUret("salon"))).toEqual(["Güzellik Salonu"]);
  expect(kategorileriAra(slugUret("klinigi"))).toEqual(["Diş Kliniği"]);
});

test("bir metin BIRDEN COK kategoriye uyabiliyor", () => {
  // Tek harflik bir parca cogu kategoride geciyor. Tek eslesme varsayimi
  // yapilmasin diye birden cok dondurulebildigi burada sabitleniyor - cagiran
  // taraf bu yuzden `inArray` kullaniyor, `eq` degil.
  const sonuc = kategorileriAra(slugUret("i"));
  expect(sonuc.length).toBeGreaterThan(1);
});

test("bos ve uymayan metin BOS dizi donduruyor", () => {
  // Cagiran taraf bos dizide kategori kosulunu hic eklemiyor; burasi o
  // sozlesmenin ilk yarisi.
  expect(kategorileriAra("")).toEqual([]);
  expect(kategorileriAra(slugUret("zzzqqq"))).toEqual([]);
});
