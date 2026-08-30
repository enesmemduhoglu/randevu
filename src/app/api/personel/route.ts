import { gecersiz, panelKapisi } from "@/lib/panel-kapisi";
import { personelAlanlariniDogrula } from "@/lib/personel-girdi";

// Personel ekleme. CSRF kapisi ve oturum panelKapisi'nda (DEGISMEZ 2).

export async function POST(istek: Request) {
  const kapi = await panelKapisi(istek);
  if ("engel" in kapi) return kapi.engel;

  const alanlar = personelAlanlariniDogrula(kapi.govde);
  if (!alanlar.tamam) return gecersiz(alanlar.hata);

  const yeni = await kapi.db.personelEkle(alanlar.deger);

  return Response.json({ personel: yeni }, { status: 201 });
}
