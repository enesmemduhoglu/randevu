// Musteri kaydinin duzeltilmesi (Faz H2, ikinci yari).
//
// NEDEN AYRI BIR UC: elle randevu yazan yol (`POST /api/randevular`) mevcut
// musterinin adini ve notunu BILEREK guncellemiyor - isletme "Ahmet" diye
// kayitli birini "Ahmet Yilmaz" yazarak aradiginda kaydin sessizce yeniden
// adlandirilmasi surpriz olurdu. Ad duzeltmek ayri ve ACIK bir is; burasi o
// acik yol.

import { musteriAlanlariniDogrula } from "@/lib/musteri-girdi";
import { bulunamadi, gecersiz, panelKapisi } from "@/lib/panel-kapisi";

export async function PATCH(
  istek: Request,
  ctx: RouteContext<"/api/musteriler/[id]">,
) {
  const kapi = await panelKapisi(istek);
  if ("engel" in kapi) return kapi.engel;

  const { id } = await ctx.params;

  const alanlar = musteriAlanlariniDogrula(kapi.govde);
  if (!alanlar.tamam) return gecersiz(alanlar.hata);

  // DEGISMEZ 3: once-oku-sonra-yaz yok; kiraci kosulu `where`'de ve etkilenen
  // satir sayisi karari veriyor. 0 satir "kayit yok" ile "baska isletmenin
  // kaydi" arasinda ayrim YAPMIYOR - ikisi de 404, yoksa yabanci bir id'nin
  // varligini sizdirirdik.
  const etkilenen = await kapi.db.musteriGuncelle(id, alanlar.deger);
  if (etkilenen === 0) return bulunamadi("Müşteri");

  return Response.json({ tamam: true });
}
