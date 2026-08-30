import {
  bulunamadi,
  gecersiz,
  panelKapisi,
  panelKapisiGovdesiz,
} from "@/lib/panel-kapisi";
import { personelAlanlariniDogrula } from "@/lib/personel-girdi";

// Personel guncelleme ve pasifleme. CSRF kapisi panelKapisi'nda (DEGISMEZ 2).

export async function PATCH(istek: Request, ctx: RouteContext<"/api/personel/[id]">) {
  const kapi = await panelKapisi(istek);
  if ("engel" in kapi) return kapi.engel;

  const { id } = await ctx.params;

  const alanlar = personelAlanlariniDogrula(kapi.govde);
  if (!alanlar.tamam) return gecersiz(alanlar.hata);

  // DEGISMEZ 3: once-oku-sonra-yaz yok; kiraci kosulu where'de ve etkilenen
  // satir sayisi karari veriyor.
  const etkilenen = await kapi.db.personelGuncelle(id, alanlar.deger);
  if (etkilenen === 0) return bulunamadi("Personel");

  return Response.json({ tamam: true });
}

export async function DELETE(istek: Request, ctx: RouteContext<"/api/personel/[id]">) {
  const kapi = await panelKapisiGovdesiz(istek);
  if ("engel" in kapi) return kapi.engel;

  const { id } = await ctx.params;

  const sonuc = await kapi.db.personelPasifleStir(id);

  if (sonuc.durum === "yok") return bulunamadi("Personel");

  if (sonuc.durum === "son-personel") {
    // 409: istek kendi basina gecerli ama mevcut durumla catisiyor. Mesaj ne
    // yapilacagini soyluyor - "silinemez" demek kullaniciyi cikmazda birakirdi.
    return Response.json(
      {
        hata:
          "Son personel kaldırılamaz. Randevular bir personele bağlanıyor; " +
          "önce yeni bir personel ekleyin.",
      },
      { status: 409 },
    );
  }

  return Response.json({ tamam: true });
}
