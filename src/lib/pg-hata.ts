// Postgres hatasindan kod ve kisit adi cikaran tek yer.
//
// NEDEN AYRI BIR DOSYA: Drizzle, postgres.js'in hatasini kendi
// `DrizzleQueryError`'una SARIYOR. Sarmalayicida `code` alani yok - o yalnizca
// en icteki nesnede duruyor. Dogrudan `hata.code` okuyan bir kontrol bu yuzden
// HIC eslesmiyor ve sessizce yanlis dala gidiyor: benzersizlik ihlali
// "beklenmeyen hata" olarak 500'e donusuyor, oysa dogru cevap 409.
//
// Bu tam olarak Faz E'de cakisma kisiti sinanirken ortaya cikti: ham
// postgres.js ile kod goruluyor, Drizzle uzerinden gorulmuyordu.

export type PgHata = {
  kod: string;
  /// Ihlal edilen kisit ya da indeks adi. Postgres her hata icin vermiyor.
  kisit: string | null;
};

/// Hata zincirini gezip Postgres'in kendi alanlarini bulur. Bulamazsa null.
export function pgHata(hata: unknown): PgHata | null {
  let mevcut: unknown = hata;

  // Zincir uzunlugu sinirli: dongusel bir `cause` (kendini gosteren hata)
  // sonsuz donguye sokardi.
  for (let derinlik = 0; mevcut && derinlik < 5; derinlik++) {
    if (typeof mevcut === "object") {
      const alanlar = mevcut as { code?: unknown; constraint_name?: unknown };
      if (typeof alanlar.code === "string") {
        return {
          kod: alanlar.code,
          kisit:
            typeof alanlar.constraint_name === "string"
              ? alanlar.constraint_name
              : null,
        };
      }
      mevcut = (mevcut as { cause?: unknown }).cause;
    } else {
      return null;
    }
  }

  return null;
}

/// 23505 = unique_violation
export function benzersizIhlaliMi(hata: unknown, kisit: string): boolean {
  const bilgi = pgHata(hata);
  return bilgi?.kod === "23505" && bilgi.kisit === kisit;
}

/// 23P01 = exclusion_violation. DEGISMEZ 8'in yakalandigi yer: cakisma kisiti
/// ihlal edildiginde cagiran taraf bunu 409'a ceviriyor.
export function cakismaIhlaliMi(hata: unknown): boolean {
  return pgHata(hata)?.kod === "23P01";
}

/// 23514 = check_violation.
///
/// Uygulama ayni kurali zaten kontrol ediyor olabilir; bu yakalayici o
/// kontrolun yerine gecmiyor, ARKASINDA duruyor. Kisit tek gerceklik kaynagi
/// (DEGISMEZ 8'in ruhu) ve ihlali kullaniciya 500 olarak donmek, duzeltebilecegi
/// bir seyi "sunucu hatasi" diye gostermek olurdu.
export function kontrolIhlaliMi(hata: unknown, kisit: string): boolean {
  const bilgi = pgHata(hata);
  return bilgi?.kod === "23514" && bilgi.kisit === kisit;
}
