// Marka sabitleri: token'larin CSS disinda kullanilabilen hali.
//
// Neden var: e-posta sablonlari CSS degiskeni ve OKLCH kullanamiyor. Outlook
// ve benzeri istemciler var() cozmuyor, oklch()'yi hic bilmiyor. Bu yuzden
// e-postada ve inline stil gereken yerlerde renk buradan okunur.
//
// DEGISMEZ 10: bilesenler bu dosyayi kullanmaz - onlar semantic token
// kullanir (bg-primary, text-muted-foreground). Burasi yalnizca CSS'in
// ulasamadigi yerler icindir.
//
// Degerler src/app/globals.css'teki primitive katmanin hex karsiligidir.
// Orasi degisirse burasi da degismeli; ikisi elle eslenir.

/// Marka adi henuz belirlenmedi. Ad netlestiginde burasi ve
/// src/components/marka/logo.tsx degisir, baska hicbir yer etkilenmez.
export const MARKA_ADI = "Randevu";

export const RENK = {
  zemin: "#FBF8F5", // tas-50
  zeminIkincil: "#F5F2EE", // tas-100
  kenar: "#EAE5E1", // tas-200
  metinSolgun: "#827B76", // tas-500
  metinIkincil: "#615C57", // tas-600
  metin: "#1C1917", // tas-900

  vurgu: "#C2643C", // terracotta-500
  vurguKoyu: "#A94F2C", // terracotta-600

  onayli: "#0B6961", // teal-700
  bekliyor: "#9D6810", // amber-700
  gelmedi: "#900E26", // kirmizi-700
} as const;

/// E-postada web fontu yuklenmez; istemcilerin cogu engelliyor. Yedek yigin
/// dogrudan sistem fontlarina duser.
export const FONT = {
  baslik:
    "Fraunces, Georgia, 'Times New Roman', serif",
  metin:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
} as const;

export const KOSE_YARICAP = "12px";
