// Uc kimlik formunun ortak istek katmani.
//
// Tek yerde durmasinin sebebi kisalik degil, tutarlilik: "409 yanitinda `yon`
// varsa hata gosterme, oraya git" gibi kararlarin uc formda uc turlu
// yorumlanmasi kullaniciya uc farkli davranis olarak yansirdi.

export type KimlikYaniti =
  | { tamam: true; yon: string; mesaj?: string }
  | { tamam: false; hata: string };

const AG_HATASI =
  "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.";

const BEKLENMEYEN =
  "İşlem tamamlanamadı. Sayfayı yenileyip yeniden deneyin.";

function metinAl(govde: unknown, alan: string): string | undefined {
  if (typeof govde !== "object" || govde === null) return undefined;
  const deger = (govde as Record<string, unknown>)[alan];
  return typeof deger === "string" ? deger : undefined;
}

/// Kimlik route'larina POST atar ve yaniti tek bicime indirger.
export async function kimlikGonder(
  yol: string,
  govde: unknown,
): Promise<KimlikYaniti> {
  let yanit: Response;
  try {
    yanit = await fetch(yol, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(govde),
    });
  } catch {
    // fetch yalnizca ag katmani coktuguunde firlatiyor; 4xx/5xx firlatmiyor.
    return { tamam: false, hata: AG_HATASI };
  }

  const cozulen: unknown = await yanit.json().catch(() => null);
  const yon = metinAl(cozulen, "yon");

  if (yanit.ok) {
    // Sunucu her basari yanitinda bir hedef veriyor; vermediyse panele
    // dusuyoruz - kullaniciyi bos bir formda birakmaktan iyi.
    return { tamam: true, yon: yon ?? "/panel", mesaj: metinAl(cozulen, "mesaj") };
  }

  // Hata yanitinda `yon` da geliyorsa is kullanici acisindan BITMIS demektir
  // (ornegin kayit zaten tamamlanmis). Hata gostermek onu cikmaza sokardi.
  if (yon) return { tamam: true, yon };

  return { tamam: false, hata: metinAl(cozulen, "hata") ?? BEKLENMEYEN };
}
