import type { NextConfig } from "next";

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const nextConfig: NextConfig = {};

// Faz-farkindali: build ARTIK sirlar olmadan da ayakta kaliyor (Faz P2,
// `supabaseSunucu()` ilk satirinda `connection()`), ama ayakta kalmasi
// uretilen paketin KULLANILABILIR oldugu anlamina gelmiyor.
//
// NEDEN GURULTU CIKARIYORUZ: `NEXT_PUBLIC_*` degiskenleri DERLEME aninda
// gomuluyor - sunucu tarafinda da. Sirsiz uretilen bir `.open-next` paketi,
// workerd'de `wrangler vars` tanimli olsa bile `undefined` tasir. Yani
// duzeltmeden onceki gurultulu hata, duzeltmeden sonra sessiz bir 500'e
// donusebilirdi. Bu uyari o sessizligi engelliyor.
//
// `throw` DEGIL `warn`: bu fazin isi tam olarak build'in dusmemesi.

/// Next bu yapilandirmayi tek build icinde birden cok kez cagiriyor; uyari
/// ucer ucer basinca okunmaz hale geliyordu. Bayrak yalnizca AYNI surecteki
/// tekrari engelliyor - `next build` ayri bir surec daha actigi icin uyari
/// yine de iki kez gorunuyor (olculdu, 3 -> 2).
let uyarildi = false;

export default function yapilandirma(faz: string): NextConfig {
  if (faz === PHASE_PRODUCTION_BUILD && !uyarildi) {
    const eksik = [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ].filter((ad) => !process.env[ad]);

    if (eksik.length > 0) {
      uyarildi = true;
      console.warn(
        `\nUYARI: ${eksik.join(", ")} tanimsiz.\n` +
          "Build tamamlanacak ama URETILEN PAKET KULLANILAMAZ: NEXT_PUBLIC_*\n" +
          "degerleri derleme aninda gomuluyor, calisma aninda wrangler vars ile\n" +
          "duzeltilemez. Bu ciktiyi YAYINLAMAYIN.\n",
      );
    }
  }

  return nextConfig;
}

// `next dev` sirasinda Cloudflare binding'lerini (Hyperdrive vb.) erisilebilir
// kilar. Boylece yerel gelistirme ile Workers arasindaki fark kuculur.
initOpenNextCloudflareForDev();
