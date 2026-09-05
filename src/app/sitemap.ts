import type { MetadataRoute } from "next";

import { sitemapKayitlari } from "@/lib/dizin";
import {
  ilSlugu,
  kategoriSlugu,
  type Il,
  type Kategori,
  ILLER,
  KATEGORILER,
} from "@/lib/dizin-girdi";
import { siteKoku } from "@/lib/site";

// /sitemap.xml (Faz O).
//
// UC KUME VAR:
//
//   1. Sabit sayfalar - kok, dizin, isletmelere tanitim.
//   2. INIS SAYFALARI - ama 81 il x 9 kategori = 729 adresin TAMAMI DEGIL.
//      Yalnizca gercekten yayinda isletmesi olan il ve il+kategori
//      kombinasyonlari giriyor. Bos sayfalari sitemap'e koymak, arama motoruna
//      "bunlar onemli" deyip icerigi olmayan sayfalara goturmek olurdu; tarama
//      butcesi orada harcanir ve dizinin geneli zayif gorunur. Bos sayfalar
//      erisilebilir olmaya devam ediyor (il sayfasindan baglanti var), yalnizca
//      one surulmuyorlar.
//   3. Isletmelerin randevu sayfalari (`/r/<slug>`) - urunun asil icerigi.
//
// `lastModified` ISLETMENIN kendi guncelleme tarihinden geliyor; uydurma bir
// "bugun" degeri her taramada her sayfayi degismis gosterirdi ve sinyali
// tumden degersizlestirirdi.
//
// ONBELLEKSIZ: dizine yeni giren bir isletmenin sitemap'te gorunmesi icin
// yeniden dagitim beklemek istemiyoruz.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const kok = siteKoku();
  const kayitlar = await sitemapKayitlari();

  // Il ve il+kategori kumeleri kayitlardan TURETILIYOR, sabit listeden degil.
  // Kapali listeye karsi da dogrulaniyor: veritabaninda gecersiz bir il degeri
  // olsa (DB kisiti yok, bkz. sema yorumu) sitemap'e 404 veren bir adres
  // girerdi.
  const iller = new Set<Il>();
  const ilKategoriler = new Set<string>();
  let enSonGuncelleme = new Date(0);

  for (const kayit of kayitlar) {
    if (kayit.guncelleme > enSonGuncelleme) enSonGuncelleme = kayit.guncelleme;

    const il = (ILLER as readonly string[]).includes(kayit.il ?? "")
      ? (kayit.il as Il)
      : null;
    if (!il) continue;

    iller.add(il);

    const kategori = (KATEGORILER as readonly string[]).includes(
      kayit.kategori ?? "",
    )
      ? (kayit.kategori as Kategori)
      : null;
    if (kategori) ilKategoriler.add(`${ilSlugu(il)}/${kategoriSlugu(kategori)}`);
  }

  // Dizin hic bos oldugunda "en son guncelleme" diye bir sey yok; o gun sabit
  // sayfalar tarih tasimiyor. Uydurulmus bir tarih koymaktan durust.
  const dizinTarihi =
    enSonGuncelleme.getTime() === 0 ? undefined : enSonGuncelleme;

  const sabitler: MetadataRoute.Sitemap = [
    { url: `${kok}/`, changeFrequency: "daily", priority: 1 },
    {
      url: `${kok}/dizin`,
      lastModified: dizinTarihi,
      changeFrequency: "daily",
      priority: 0.9,
    },
    { url: `${kok}/isletmeler-icin`, changeFrequency: "monthly", priority: 0.5 },
    // Aranan bir sayfa degil ama bulunabilir olmasi gerekiyor: KVKK metnine
    // dogrudan adresten ulasmak isteyen biri cikabilir. Dusuk oncelik, cunku
    // tarama butcesinin buraya harcanmasini istemiyoruz.
    { url: `${kok}/gizlilik`, changeFrequency: "yearly", priority: 0.3 },
  ];

  const ilSayfalari: MetadataRoute.Sitemap = [...iller]
    .map((il) => ilSlugu(il))
    .sort()
    .map((slug) => ({
      url: `${kok}/dizin/${slug}`,
      lastModified: dizinTarihi,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

  const kategoriSayfalari: MetadataRoute.Sitemap = [...ilKategoriler]
    .sort()
    .map((yol) => ({
      url: `${kok}/dizin/${yol}`,
      lastModified: dizinTarihi,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  const isletmeSayfalari: MetadataRoute.Sitemap = kayitlar.map((kayit) => ({
    url: `${kok}/r/${kayit.slug}`,
    lastModified: kayit.guncelleme,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [
    ...sabitler,
    ...ilSayfalari,
    ...kategoriSayfalari,
    ...isletmeSayfalari,
  ];
}
