import { calismaAraliklariniDogrula } from "@/lib/calisma-girdi";
import { bulunamadi, gecersiz, panelKapisi } from "@/lib/panel-kapisi";

// Bir personelin HAFTASINI komple yazar. CSRF kapisi panelKapisi'nda
// (DEGISMEZ 2).
//
// PUT, PATCH degil: haftalik duzen kullanicinin kafasinda tek bir sey ve
// gonderilen liste onun yerine geciyor. Satir bazli bir API, yarim uygulanmis
// bir haftaya izin verirdi - pazartesi silinmis, yenisi yazilamamis gibi.

export async function PUT(
  istek: Request,
  ctx: RouteContext<"/api/personel/[id]/calisma-saatleri">,
) {
  const kapi = await panelKapisi(istek);
  if ("engel" in kapi) return kapi.engel;

  const { id } = await ctx.params;

  const araliklar = calismaAraliklariniDogrula(kapi.govde.araliklar);
  if (!araliklar.tamam) return gecersiz(araliklar.hata);

  const sonuc = await kapi.db.calismaSaatleriniYaz(id, araliklar.deger);
  if (sonuc.durum === "yok") return bulunamadi("Personel");

  return Response.json({ tamam: true });
}
