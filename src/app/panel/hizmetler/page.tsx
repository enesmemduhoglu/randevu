import { redirect } from "next/navigation";

import { HizmetListesi } from "@/components/panel/hizmet-listesi";
import { isletmeOturumu } from "@/lib/auth";
import { getScopedDb } from "@/lib/scoped-db";

// Veri sunucuda okunuyor, listeleme istemciye prop olarak gidiyor. Boylece
// veritabani sorgusu istemci paketine hic inmiyor ve kiraci filtresi
// scoped-db'de kaliyor (DEGISMEZ 1).

export default async function HizmetlerSayfasi() {
  const oturum = await isletmeOturumu();
  // Duzen bu durumu zaten eliyor; buradaki kontrol tipi daraltmak icin.
  if (!oturum) redirect("/giris");

  const db = await getScopedDb(oturum);
  const hizmetler = await db.hizmetleriListele();

  return (
    <HizmetListesi
      hizmetler={hizmetler.map((h) => ({
        id: h.id,
        ad: h.ad,
        aciklama: h.aciklama,
        sureDk: h.sureDk,
        fiyatKurus: h.fiyatKurus,
        renk: h.renk,
      }))}
    />
  );
}
