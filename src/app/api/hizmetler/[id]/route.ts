import { hizmetAlanlariniDogrula } from "@/lib/hizmet-girdi";
import {
  bulunamadi,
  gecersiz,
  panelKapisi,
  panelKapisiGovdesiz,
} from "@/lib/panel-kapisi";

// Hizmet guncelleme ve pasifleme.
//
// CSRF kapisi (DEGISMEZ 2) panelKapisi'nin ilk satirinda; oradan gecmeyen
// istek buraya hic ulasmiyor.
//
// IDOR: `id` kullanicidan geliyor ama scoped-db'nin where'i her zaman
// isletmeId'yi de tasiyor. Etkilenen satir 0 ise "yok" diyoruz - baska
// kiraciya ait bir kaydi istemekle hic olmayan bir kaydi istemek cagirana
// AYNI gorunmeli, yoksa kaydin varligi sizar.

export async function PATCH(istek: Request, ctx: RouteContext<"/api/hizmetler/[id]">) {
  const kapi = await panelKapisi(istek);
  if ("engel" in kapi) return kapi.engel;

  const { id } = await ctx.params;

  const alanlar = hizmetAlanlariniDogrula(kapi.govde);
  if (!alanlar.tamam) return gecersiz(alanlar.hata);

  // DEGISMEZ 3: once-oku-sonra-yaz YOK. Beklenen durum where'de ve etkilenen
  // satir sayisi karari veriyor.
  const etkilenen = await kapi.db.hizmetGuncelle(id, alanlar.deger);
  if (etkilenen === 0) return bulunamadi("Hizmet");

  return Response.json({ tamam: true });
}

export async function DELETE(
  istek: Request,
  ctx: RouteContext<"/api/hizmetler/[id]">,
) {
  const kapi = await panelKapisiGovdesiz(istek);
  if ("engel" in kapi) return kapi.engel;

  const { id } = await ctx.params;

  // Hizmet SILINMIYOR, pasifleniyor: gecmis randevular ona bagli ve silinen
  // bir hizmet o gecmisi de goturur. Kullaniciya "kaldirildi" diyoruz, cunku
  // onun icin fark yok - listede gorunmuyor.
  const etkilenen = await kapi.db.hizmetPasifleStir(id);
  if (etkilenen === 0) return bulunamadi("Hizmet");

  return Response.json({ tamam: true });
}
