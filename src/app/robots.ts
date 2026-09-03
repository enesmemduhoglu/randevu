import type { MetadataRoute } from "next";

import { siteKoku } from "@/lib/site";

// /robots.txt (Faz O).
//
// NE TARANMASIN, NEDEN:
//
//   /api/       - makine yollari; taranmasi hem anlamsiz hem de POST olmayan
//                 yollara bosuna istek demek.
//   /panel/     - oturum arkasinda. Zaten 401/yonlendirme donuyor ama taramaya
//                 acik birakmak, tarama butcesini hicbir sey icin harcamak.
//   /giris, /kayit - islem sayfalari; arama sonucunda gorunmelerinin degeri yok.
//   /randevularim  - kisiye ozel.
//   /r/*/randevu/  - IPTAL TOKEN'I TASIYAN ADRESLER. Sayfanin kendisinde de
//                 `noindex` var (o dosyada yazili) ama iki kapi ust uste
//                 duruyor: robots taramayi engelliyor, meta etiketi de yanlislikla
//                 taranirsa dizine girmesini engelliyor. Tek basina hicbiri
//                 yeterli degil - robots.txt bir rica, meta etiketi ise ancak
//                 sayfa TARANIRSA goruluyor.
//
// `/dizin`in SORGU PARAMETRELERI BURADA ENGELLENMIYOR ve bu bilincli. Engellemek
// istegi cazip: faceted navigation yuzlerce yinelenen adres uretiyor. Ama
// taranmasi engellenen bir sayfanin `canonical` etiketi de OKUNAMIYOR - yani
// motor "bu icerigin aslinin nerede oldugunu" hic ogrenemez ve biriken deger
// inis sayfasina akmaz. Dogru arac sayfanin kendi metadata'si (bkz.
// `src/app/dizin/page.tsx > generateMetadata`).

export default function robots(): MetadataRoute.Robots {
  const kok = siteKoku();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/panel/",
          "/giris",
          "/kayit",
          "/randevularim",
          "/r/*/randevu/",
        ],
      },
    ],
    sitemap: `${kok}/sitemap.xml`,
    host: kok,
  };
}
