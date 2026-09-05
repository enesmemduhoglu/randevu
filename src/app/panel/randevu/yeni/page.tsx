import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { YeniRandevuFormu } from "@/components/panel/yeni-randevu-formu";
import { isletmeOturumu } from "@/lib/auth";
import { getScopedDb } from "@/lib/scoped-db";
import { tarihAyristir, tarihMetni, yerelGun } from "@/lib/zaman";

// Panelden elle randevu ekleme (Faz H2).
//
// Veri sunucuda okunuyor, form istemcide: hizmet ve personel listeleri sayfa
// acilirken hazir gelsin, kullanici ilk secimini yapmak icin bir istek daha
// beklemesin. Musait saatler ise secime bagli, onlar istemciden cekiliyor.
//
// `?tarih=YYYY-MM-DD` takvimden geliyor: isletme bir gune tiklayip "randevu
// ekle" dediginde form o gunle aciliyor. Bozuk bir deger hata sayfasi
// uretmiyor, bugune dusuyor - takvim sayfasindaki ayni gerekce.

export const metadata: Metadata = {
  title: "Randevu ekle",
  // Panel oturum arkasinda ve robots.txt zaten /panel/ yolunu engelliyor;
  // meta etiketi ikinci kapi.
  robots: { index: false, follow: false },
};

export default async function YeniRandevuSayfasi({
  searchParams,
}: PageProps<"/panel/randevu/yeni">) {
  const oturum = await isletmeOturumu();
  if (!oturum) redirect("/giris");

  const db = await getScopedDb(oturum);
  const [isletme, hizmetler, personeller] = await Promise.all([
    db.isletmeyiGetir(),
    db.hizmetleriListele(),
    db.personelleriListele(),
  ]);
  if (!isletme) redirect("/");

  const parametreler = await searchParams;

  // ISLETMENIN bugunu, sunucunun degil (DEGISMEZ 7).
  const bugun = yerelGun(new Date(), isletme.saatDilimi);
  const tarih = tarihAyristir(parametreler.tarih) ?? bugun;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Randevu ekle</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Telefonla ya da kapıdan gelen randevuyu buradan takvime yazın.
        </p>
      </div>

      <YeniRandevuFormu
        saatDilimi={isletme.saatDilimi}
        bugun={tarihMetni(bugun)}
        baslangicTarihi={tarihMetni(tarih)}
        hizmetler={hizmetler.map((h) => ({
          id: h.id,
          ad: h.ad,
          sureDk: h.sureDk,
          fiyatKurus: h.fiyatKurus,
        }))}
        personeller={personeller
          .filter((p) => p.aktif)
          .map((p) => ({ id: p.id, ad: p.ad, unvan: p.unvan }))}
      />
    </div>
  );
}
