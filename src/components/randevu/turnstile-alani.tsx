"use client";

import Script from "next/script";
import { useEffect } from "react";

// Turnstile widget'i. Formun icinde duruyor ve jetonu `cf-turnstile-response`
// adli gizli bir alana kendisi yaziyor - bu yuzden `FormData` ile okunabiliyor
// ve ayri bir state'e gerek kalmiyor.
//
// ORTUK (implicit) RENDER: script `.cf-turnstile` sinifini kendisi buluyor.
// Acik render (`turnstile.render()`) daha fazla denetim verirdi ama script'in
// yuklenmesini beklemek, iki kez calismamasini saglamak ve React'in
// yeniden ciziminde widget'i temizlemek bize dusuyordu. Uc ayri hata kaynagi,
// karsiliginda ihtiyacimiz olmayan bir esneklik.

/// Site anahtari HALKA ACIK - tarayiciya gitmek uzere tasarlandi. Gizli olan
/// `TURNSTILE_SECRET` ve o yalnizca sunucuda (bkz. src/lib/turnstile.ts).
const SITE_ANAHTARI = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

declare global {
  interface Window {
    turnstile?: { reset: (widget?: string) => void };
  }
}

export function TurnstileAlani({ hata }: { hata: string | null }) {
  // Basarisiz gonderimden sonra widget SIFIRLANIYOR. Turnstile jetonu TEK
  // KULLANIMLIK: sunucu 403 ya da 409 dondugunde eldeki jeton harcanmis
  // oluyor ve musteri "tekrar dene" dedigi anda ayni jetonu gonderirdi -
  // ikinci deneme, sebebi gorunmeyen bir sekilde her zaman basarisiz olurdu.
  useEffect(() => {
    if (hata) window.turnstile?.reset();
  }, [hata]);

  // Anahtar tanimsizsa widget HIC cizilmiyor. Yerel gelistirmede ve testte
  // durum bu; sunucu tarafi da ayni kosulda `sahte` moda dusuyor, yani iki
  // taraf ayni anda aciliyor ve ayni anda kapaniyor.
  if (!SITE_ANAHTARI) return null;

  return (
    <div>
      {/* `afterInteractive`: widget gonderim aninda gerekiyor, ilk boyamada
          degil. `beforeInteractive` sayfanin acilisini Cloudflare'in
          script'ine bagimli kilardi. */}
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />
      <div
        className="cf-turnstile"
        data-sitekey={SITE_ANAHTARI}
        // Widget metni sayfanin diliyle ayni olsun; varsayilan tarayici
        // diline bakiyor ve musteri Turkce bir sayfada Ingilizce bir kutu
        // goruyordu.
        data-language="tr"
        // Tema token'lardan degil, Turnstile'in kendi listesinden geliyor -
        // "auto" isletim sistemi tercihini izliyor, sayfanin tema dugmesini
        // degil. Ikisinin ayrisabildigi kabul edildi: alternatif, tema
        // degisiminde widget'i yeniden cizmek olurdu ve o da jetonu
        // dusururdu.
        data-theme="auto"
      />
    </div>
  );
}
