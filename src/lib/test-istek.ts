// YALNIZCA TESTLERDE kullanilan yardimci. Uygulama kodu buraya hic bakmiyor,
// yani uretim paketine de girmiyor.
//
// Dort kimlik route'u ayni bicimde istek kuruyor ve bu bicimin AYRINTISI
// onemli: checkOrigin kendi origin'ini `host` basligindan uretiyor, yani
// `host` yoksa mesru bir istek bile 403 alir ve test yanlis sebeple gecer.
// Kurallari tek yerde tutmak, o tuzagi dort kez kurmaktan iyi.

export const TEST_HOST = "randevu.test";
export const TEST_ORIGIN = `https://${TEST_HOST}`;

type Secenekler = {
  /// `null` verilirse Origin basligi HIC gonderilmiyor - checkOrigin'in
  /// "eksik bilgide durdur" davranisini sinamak icin.
  origin?: string | null;
  govde?: unknown;
  /// Bozuk JSON sinamak icin: govde oldugu gibi gonderiliyor.
  hamGovde?: string;
};

export function sahteIstek(
  yol: string,
  { origin = TEST_ORIGIN, govde, hamGovde }: Secenekler = {},
): Request {
  const basliklar: Record<string, string> = {
    host: TEST_HOST,
    "content-type": "application/json",
  };
  if (origin) basliklar.origin = origin;

  return new Request(`${TEST_ORIGIN}${yol}`, {
    method: "POST",
    headers: basliklar,
    body: hamGovde ?? JSON.stringify(govde ?? {}),
  });
}

export async function hataMetni(yanit: Response): Promise<string> {
  const govde = (await yanit.json()) as { hata?: string };
  return govde.hata ?? "";
}
