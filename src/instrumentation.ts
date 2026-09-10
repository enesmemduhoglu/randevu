import type { Instrumentation } from "next";

import { hataBildir } from "@/lib/hata";

// Yakalanmamis sunucu hatalarinin kapiya baglandigi yer. Route handler'da,
// sunucu bileseninde ya da server action'da firlayip `catch` gormeyen her hata
// buraya dusuyor. Kendi `catch`'i olan yollar hata kapisini dogrudan cagiriyor.
//
// Kaynak olarak `routePath` (route'un DOSYA yolu, or. `/r/[slug]/iptal`)
// kullaniliyor, istegin kendisi degil: `istek.path` sorgu dizesini tasiyor ve
// iptal baglantisinin jetonu, sifre sifirlamanin `token_hash`'i orada;
// `istek.headers` ise oturum cookie'sini tasiyor. DEGISMEZ 5 - ikisi de kapiya
// hic verilmiyor.
//
// OpenNext bu dosyayi workerd icin statik `require`'a ceviriyor (Next onu calisma
// aninda hesaplanan bir yoldan yukluyor ve workerd bunu desteklemiyor) - yani
// bu kanca uretimde de kosuyor; `cf:onizle` ile olculdu (TODOS.md > Faz P2).

export const onRequestError: Instrumentation.onRequestError = async (
  hata,
  _istek,
  baglam,
) => {
  await hataBildir(`${baglam.routeType} ${baglam.routePath}`, hata);
};
