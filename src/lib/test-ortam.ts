// Testlerin ortam degiskeniyle oynamasi icin kucuk yardimci.
//
// NEDEN VAR: `wrangler types`, wrangler.jsonc'deki `vars` girdilerini
// `ProcessEnv`e ZORUNLU alan olarak yaziyor. Faz L'de `TURNSTILE_MODU` oraya
// girince `delete process.env.TURNSTILE_MODU` tip hatasi oldu (TS2790:
// "operand of a 'delete' operator must be optional").
//
// Tip DOGRU: uretimde o degisken her zaman var, cunku wrangler.jsonc'de
// tanimli. Yanlis olan testin varsayimi da degil - test bilerek degiskenin
// HIC TANIMLANMADIGI ortami (yerel gelistirme, vitest) taklit ediyor ve o
// ortam gercek. Yanlis olan yalnizca bunu ifade etme bicimiydi.
//
// Cast tek bir yerde duruyor ki her test dosyasina dagilmasin; dagilsaydi
// birinin gercek bir tip hatasini susturmak icin kullanildigini fark etmek
// imkansizlasirdi.

/// Ortam degiskenini siler. Yalnizca testlerde kullanilir.
export function ortamiSil(ad: string): void {
  delete (process.env as Record<string, string | undefined>)[ad];
}
