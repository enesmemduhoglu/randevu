// Panel mutasyon route'larinin ortak girisi.
//
// Her panel route'u ayni uc adimla basliyordu: CSRF kapisi, oturum, govde.
// Uc adimin SIRASI da onemli ve her route'ta yeniden yazilmasi, bir gun
// birinin sirayi bozmasi demekti - ornegin oturumu govdeden once cozmek,
// yabanci origin'den gelen istege bosuna veritabani sorgusu yaptirirdi.
//
// Donus tipi ayristirilmis birlesim: cagiran taraf `"engel" in sonuc` diye
// bakmak ZORUNDA, yani oturumu kontrol etmeyi unutamiyor.

import { isletmeOturumu } from "@/lib/auth";
import { govdeOku, govdeOkunamadi } from "@/lib/govde";
import { checkOrigin } from "@/lib/origin";
import { getScopedDb, type IsletmeOturumu, type ScopedDb } from "@/lib/scoped-db";

export type PanelBaglami = {
  oturum: IsletmeOturumu;
  db: ScopedDb;
  govde: Record<string, unknown>;
};

export type KapiSonucu = { engel: Response } | PanelBaglami;

/// Govde OKUYAN mutasyonlar icin (POST, PATCH, PUT).
export async function panelKapisi(istek: Request): Promise<KapiSonucu> {
  const temel = await kimlikKapisi(istek);
  if ("engel" in temel) return temel;

  const govde = await govdeOku(istek);
  if (!govde) return { engel: govdeOkunamadi() };

  return { ...temel, govde };
}

/// Govdesi olmayan mutasyonlar icin (DELETE).
export async function panelKapisiGovdesiz(
  istek: Request,
): Promise<{ engel: Response } | Omit<PanelBaglami, "govde">> {
  return kimlikKapisi(istek);
}

async function kimlikKapisi(
  istek: Request,
): Promise<{ engel: Response } | Omit<PanelBaglami, "govde">> {
  // DEGISMEZ 2: ilk satir.
  const csrf = checkOrigin(istek);
  if (csrf) return { engel: csrf };

  // isletmeOturumu(), auth()'un daraltilmis hali: musteri rolu ve isletmesiz
  // kayit buradan gecemiyor, yani scoped-db'nin `isletmeId: string`
  // sozlesmesi tip seviyesinde garanti.
  const oturum = await isletmeOturumu();
  if (!oturum) {
    return {
      engel: Response.json(
        { hata: "Oturum bulunamadı. Yeniden giriş yapın." },
        { status: 401 },
      ),
    };
  }

  return { oturum, db: await getScopedDb(oturum) };
}

/// Kayit bulunamadi. IDOR'un goruntusu de bu: baska kiraciya ait bir kaydi
/// istemek ile hic olmayan bir kaydi istemek cagirana AYNI gorunmeli, yoksa
/// kaydin varligi sizar.
export function bulunamadi(ne: string): Response {
  return Response.json({ hata: `${ne} bulunamadı` }, { status: 404 });
}

export function gecersiz(hata: string): Response {
  return Response.json({ hata }, { status: 400 });
}
