// GELMEDI kisitinin tek bir musteri icin kaldirilmasi (Faz L3'un affetme
// yolu, Faz H2'de panele baglandi).
//
// Bugune kadar tek kaldirma yolu isletme ayarini (`gelmediKisitiGun`) gecici
// olarak 0 yapmakti - yani butun musterilerin kisitini birden dusurup sonra
// geri acmak. Telefonla arayip ozur dileyen tek bir musteri icin bu, kapiyi
// herkese acmak demekti.
//
// DELETE, cunku islem bir kaydin KALDIRILMASI: kisit bir alan degil bir
// durum ve "bosalt" demenin govdeye ihtiyaci yok.

import { bulunamadi, panelKapisiGovdesiz } from "@/lib/panel-kapisi";

export async function DELETE(
  istek: Request,
  ctx: RouteContext<"/api/musteriler/[id]/kisit">,
) {
  const kapi = await panelKapisiGovdesiz(istek);
  if ("engel" in kapi) return kapi.engel;

  const { id } = await ctx.params;

  const sonuc = await kapi.db.musteriKisitiniKaldir(id);

  // Yabanci bir musteri id'si de, hic olmayan bir id de ayni cevabi aliyor.
  if (sonuc.durum === "yok") return bulunamadi("Müşteri");

  // Kosullu UPDATE'in kaybeden tarafi (DEGISMEZ 3): iki sekme ayni kisiti
  // ayni anda kaldirmaya calistiysa ikincisi burada duruyor. Kullaniciya
  // gosterilecek sey bir hata degil bir DURUM - istedigi sonuc zaten olusmus.
  if (sonuc.durum === "kisit-yok") {
    return Response.json(
      { hata: "Bu müşterinin randevu kısıtı zaten yok." },
      { status: 409 },
    );
  }

  return Response.json({ tamam: true });
}
