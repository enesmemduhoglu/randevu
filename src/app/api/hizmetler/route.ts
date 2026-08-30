import { hizmetAlanlariniDogrula } from "@/lib/hizmet-girdi";
import { gecersiz, panelKapisi } from "@/lib/panel-kapisi";

// Hizmet ekleme.
//
// Kapi sirasi panelKapisi'nda: checkOrigin -> oturum -> govde. Buraya gelen
// istek CSRF'ten gecmis ve bir isletmeye bagli demektir; `db` de o isletmeye
// kapsamlanmis durumda - isletmeId'yi buradan VEREMIYORUZ (DEGISMEZ 1).

export async function POST(istek: Request) {
  const kapi = await panelKapisi(istek);
  if ("engel" in kapi) return kapi.engel;

  const alanlar = hizmetAlanlariniDogrula(kapi.govde);
  if (!alanlar.tamam) return gecersiz(alanlar.hata);

  const yeni = await kapi.db.hizmetEkle(alanlar.deger);

  return Response.json({ hizmet: yeni }, { status: 201 });
}
