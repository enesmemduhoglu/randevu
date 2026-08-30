// Istek govdesini guvenle okuyan tek yer.
//
// Uc kimlik route'u ayni ihtiyaci tasiyordu ve ucunde de ayni kopya duruyordu.
// Tek kopya olmasi yalnizca kisalik meselesi degil: "bozuk govde 400 uretir,
// 500 degil" karari route'a degil bu katmana ait ve bir route'ta unutulursa
// kullanici sunucunun bozuk oldugunu sanir.

/// Govdeyi nesne olarak cozer. Cozemezse `null` - FIRLATMAZ.
///
/// Firlatan bir ayristirma, ele alinmadigi her yerde 500 uretir; oysa gecersiz
/// govde istemcinin hatasi, sunucunun degil.
export async function govdeOku(
  istek: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const cozulen: unknown = await istek.json();

    // JSON'un kendisi gecerli olsa bile dizi ya da duz deger olabilir; alan
    // okumadan once nesne oldugundan emin oluyoruz.
    if (
      typeof cozulen !== "object" ||
      cozulen === null ||
      Array.isArray(cozulen)
    ) {
      return null;
    }

    return cozulen as Record<string, unknown>;
  } catch {
    return null;
  }
}

/// Bozuk govde icin ortak yanit. Metin ne olduguna degil, kullanicinin ne
/// yapabilecegine bakiyor - "JSON ayristirilamadi" kimseye yardim etmez.
export function govdeOkunamadi(): Response {
  return Response.json(
    { hata: "İstek okunamadı. Sayfayı yenileyip yeniden deneyin." },
    { status: 400 },
  );
}
