"use client";

import { useEffect } from "react";

// Oturumu canli tutan gorunmez bilesen.
//
// Supabase erisim token'i varsayilan olarak bir saat yasiyor ve yenilenmesi
// icin cookie yazmak gerekiyor. Sunucu bilesenleri cookie yazamiyor, yani
// panelde saatlerce gezinen biri hicbir route handler'a ugramazsa oturumu
// sessizce eskir ve bir sonraki sayfada giris ekranina duser.
//
// Bu isi Faz D'de proxy yapiyordu. Olculdu (Faz E): Next 16'da proxy zorunlu
// olarak Node.js runtime'inda kosuyor ve OpenNext onun icin Next sunucu
// runtime'inin ikinci bir kopyasini paketliyor - 1358 KiB gzip, yani 3 MiB'lik
// butcenin %44'u. Ayni is burada birkac kilobayta yapiliyor.
//
// Hicbir sey CIZMIYOR: yalnizca yan etkisi olan bir bilesen.

/// 25 dakika. Token bir saat yasiyor; iki tazeleme arasinda bir saat gecmesin
/// diye yarisindan kisa bir aralik secildi. Daha sik olmasinin faydasi yok,
/// her tazeleme bir istek demek.
const ARALIK_MS = 25 * 60 * 1000;

export function OturumTazeleyici() {
  useEffect(() => {
    let iptal = false;

    async function tazele() {
      if (iptal) return;
      try {
        await fetch("/api/oturum", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // Sunucudan gelen yanit OKUNMUYOR: bu cagrinin isi yalnizca
          // cookie'lerin yenilenmesini tetiklemek. Basarisiz olursa da bir sey
          // yapmiyoruz - kullanici zaten bir sonraki gezinmede giris ekranina
          // yonlendirilir ve orada gercek durumu gorur.
        });
      } catch {
        // Ag koptuysa sessiz gec: kullaniciya gosterilecek bir sey yok.
      }
    }

    // Sekme uzun sure arka planda kaldiysa tarayici zamanlayiciyi kisiyor;
    // one geldiginde hemen tazelemek, o durumu kapatiyor.
    function odaklanildi() {
      void tazele();
    }

    void tazele();
    const zamanlayici = setInterval(() => void tazele(), ARALIK_MS);
    window.addEventListener("focus", odaklanildi);

    return () => {
      iptal = true;
      clearInterval(zamanlayici);
      window.removeEventListener("focus", odaklanildi);
    };
  }, []);

  return null;
}
