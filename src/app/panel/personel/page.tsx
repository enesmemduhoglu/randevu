import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PersonelListesi } from "@/components/panel/personel-listesi";
import { isletmeOturumu } from "@/lib/auth";
import { getScopedDb } from "@/lib/scoped-db";

export const metadata: Metadata = {
  title: "Personel",
  // Panel oturum arkasinda ve robots.txt zaten /panel/ yolunu
  // engelliyor; meta etiketi ikinci kapi (bkz. /saglik ve /r/*/randevu/).
  robots: { index: false, follow: false },
};

export default async function PersonelSayfasi() {
  const oturum = await isletmeOturumu();
  if (!oturum) redirect("/giris");

  const db = await getScopedDb(oturum);

  const [personeller, hizmetler] = await Promise.all([
    db.personelleriListele(),
    db.hizmetleriListele(),
  ]);

  const aktifler = personeller.filter((p) => p.aktif);

  // Her personelin hizmet kumesi ayri bir sorgu. Personel sayisi kucuk (tek
  // haneli) oldugu icin N+1 burada gercek bir maliyet degil; tek sorguya
  // indirmek scoped-db'ye join'li bir metot eklemeyi gerektirirdi ve o metot
  // yalnizca bu ekran icin var olurdu.
  const eslemeler = await Promise.all(
    aktifler.map(async (p) => ({
      id: p.id,
      hizmetIdler: (await db.personelHizmetleriniListele(p.id)).map(
        (x) => x.hizmetId,
      ),
    })),
  );

  return (
    <PersonelListesi
      personeller={aktifler.map((p) => ({
        id: p.id,
        ad: p.ad,
        unvan: p.unvan,
        sira: p.sira,
        hizmetIdler: eslemeler.find((e) => e.id === p.id)?.hizmetIdler ?? [],
      }))}
      hizmetler={hizmetler.map((h) => ({ id: h.id, ad: h.ad }))}
    />
  );
}
