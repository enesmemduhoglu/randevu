import { redirect } from "next/navigation";

import { AyarlarFormu } from "@/components/panel/ayarlar-formu";
import { DizinYayinKarti } from "@/components/panel/dizin-yayin-karti";
import { isletmeOturumu } from "@/lib/auth";
import { getScopedDb } from "@/lib/scoped-db";

export default async function AyarlarSayfasi() {
  const oturum = await isletmeOturumu();
  if (!oturum) redirect("/giris");

  const db = await getScopedDb(oturum);
  const isletme = await db.isletmeyiGetir();
  if (!isletme) redirect("/");

  return (
    <div className="space-y-8">
      <AyarlarFormu
        ayarlar={{
          ad: isletme.ad,
          slug: isletme.slug,
          telefon: isletme.telefon,
          adres: isletme.adres,
          hakkinda: isletme.hakkinda,
          saatDilimi: isletme.saatDilimi,
          slotAraligiDk: isletme.slotAraligiDk,
          minOnceBildirimDk: isletme.minOnceBildirimDk,
          maksIleriGun: isletme.maksIleriGun,
          otomatikOnay: isletme.otomatikOnay,
          gelmediKisitiGun: isletme.gelmediKisitiGun,
          il: isletme.il,
          ilce: isletme.ilce,
          kategori: isletme.kategori,
        }}
      />

      <DizinYayinKarti yayinda={isletme.yayinda} />
    </div>
  );
}
