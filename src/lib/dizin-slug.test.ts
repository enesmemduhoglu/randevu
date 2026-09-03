import { expect, test } from "vitest";

import {
  ILLER,
  KATEGORILER,
  KATEGORI_COGUL,
  ilSlugu,
  kategoriSlugu,
  slugdanIl,
  slugdanKategori,
} from "@/lib/dizin-girdi";

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
