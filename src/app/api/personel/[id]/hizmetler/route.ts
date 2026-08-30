import { bulunamadi, gecersiz, panelKapisi } from "@/lib/panel-kapisi";
import { hizmetIdListesiDogrula } from "@/lib/personel-girdi";

// Personelin verdigi hizmetleri TOPLU yazar. CSRF kapisi panelKapisi'nda.
//
// PUT, PATCH degil: gonderilen liste kumeyi tamamen degistiriyor - bu bir
// yama degil, yerine koyma. Arayuz de zaten butun kutucuklari birlikte
// gonderiyor.
//
// BOS LISTE gecerli ve "hicbiri" degil "hepsi" demek (bkz. sema yorumu):
// tek kisilik isletmede bu tablo hic dolmuyor ve varsayilan davranis dogru
// kaliyor.

export async function PUT(
  istek: Request,
  ctx: RouteContext<"/api/personel/[id]/hizmetler">,
) {
  const kapi = await panelKapisi(istek);
  if ("engel" in kapi) return kapi.engel;

  const { id } = await ctx.params;

  const hizmetIdler = hizmetIdListesiDogrula(kapi.govde.hizmetIdler);
  if (!hizmetIdler.tamam) return gecersiz(hizmetIdler.hata);

  const sonuc = await kapi.db.personelHizmetleriniYaz(id, hizmetIdler.deger);

  if (sonuc.durum === "yok") return bulunamadi("Personel");

  if (sonuc.durum === "gecersiz-hizmet") {
    // Yabanci ya da silinmis bir hizmet id'si geldi. Sessizce atlamak
    // kullaniciya "kaydettim" deyip yarim bir kume birakmak olurdu.
    return gecersiz("Seçilen hizmetlerden biri bulunamadı. Sayfayı yenileyin.");
  }

  return Response.json({ tamam: true });
}
