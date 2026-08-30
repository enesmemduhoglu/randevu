import { redirect } from "next/navigation";

import {
  CalismaSaatleriDuzeni,
  type HaftalikDuzen,
} from "@/components/panel/calisma-saatleri-duzeni";
import { isletmeOturumu } from "@/lib/auth";
import { getScopedDb } from "@/lib/scoped-db";

export default async function CalismaSaatleriSayfasi({
  searchParams,
}: PageProps<"/panel/calisma-saatleri">) {
  const oturum = await isletmeOturumu();
  if (!oturum) redirect("/giris");

  const db = await getScopedDb(oturum);
  const personeller = (await db.personelleriListele()).filter((p) => p.aktif);

  if (personeller.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Çalışma saatleri
        </h1>
        <p className="text-sm text-muted-foreground">
          Çalışma saatleri personele tanımlanıyor. Önce personel ekleyin.
        </p>
      </div>
    );
  }

  const parametreler = await searchParams;
  const istenen = parametreler.personel;

  // Istenen personel bizim degilse ya da hic yoksa ilk personele dusuyoruz.
  // `personelleriListele` zaten kiraci filtresinden geciyor, yani buradaki
  // arama baska isletmenin id'sini bulamaz - IDOR yolu kapali.
  const secili =
    personeller.find((p) => typeof istenen === "string" && p.id === istenen) ??
    personeller[0];

  const satirlar = await db.calismaSaatleriniListele(secili.id);

  const duzen: HaftalikDuzen = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const satir of satirlar) {
    duzen[satir.haftaninGunu].push({
      baslangicDk: satir.baslangicDk,
      bitisDk: satir.bitisDk,
    });
  }

  return (
    <CalismaSaatleriDuzeni
      // key: personel degisince bilesen sifirdan kuruluyor. Olmasa useState
      // ilk personelin duzenini tutmaya devam ederdi ve kullanici baskasinin
      // saatlerini duzenledigini sanirdi.
      key={secili.id}
      personeller={personeller.map((p) => ({ id: p.id, ad: p.ad }))}
      seciliPersonelId={secili.id}
      baslangicDuzeni={duzen}
    />
  );
}
