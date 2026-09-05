// Dizin filtresinin GORUNEN secenekleri ve etkin filtre ozeti.
//
// Saf: veritabani, oturum ve istek baglami yok. Kendi dosyasinda cunku iki
// cagirani var (`dizin-filtresi.tsx` ve `/dizin` sayfasinin bos durumu) ve
// ikisi de sunucu/istemci sinirinin farkli taraflarinda durabiliyor.

import { trKarsilastir } from "@/lib/dizin-girdi";

/// Secili degeri secenek listesine katar.
///
/// NEDEN GEREKIYOR: filtre kutularinin secenekleri `dizin.ts >
/// filtreSecenekleri` ile GERCEK VERIDEN geliyor - yalnizca dizinde isletmesi
/// olan il ve kategoriler. Gerekcesi saglam: 81 ilin 78'i bos bir listede
/// kullanici tek tek deneyip bos sonuc gorurdu.
///
/// Ama ana sayfadaki kategori kutucuklari SABIT dokuz kategoriden uretiliyor
/// (kapsami gostermek icin) ve ikisi carpisiyordu: "Veteriner" kutucuguna
/// basan kullanici `/dizin?kategori=Veteriner` adresine dusuyor, sonuc bos
/// geliyor ve Kategori kutusu "Tüm kategoriler" gosteriyordu - cunku secili
/// deger listede yoktu ve `defaultValue` tutmuyordu. Ekran "Filtreleri
/// gevşetip yeniden deneyin" diyordu ama gevsetilecek GORUNUR bir filtre
/// yoktu.
///
/// Cozum listenin kaynagini degistirmek degil - o gerekce hala gecerli -
/// yalnizca AKTIF SECIMI istisna tutmak. Kullanici neyi sectigini goruyor ve
/// kutudan cikarabiliyor.
///
/// Siralama `trKarsilastir` ile: eklenen deger sona yapistirilsaydi listedeki
/// alfabetik duzen bozulur ve goz onu bir hata gibi okurdu.
export function secenekleriBirlestir(
  secenekler: readonly string[],
  secili: string,
): string[] {
  if (!secili || secenekler.includes(secili)) return [...secenekler];
  return [...secenekler, secili].sort(trKarsilastir);
}

/// Bos durumda gosterilecek etkin filtre ozeti - "Veteriner · Bursa".
///
/// Sirasi kullanicinin okudugu sira: once ne aradigi, sonra nerede.
/// Bos deger atlaniyor; hicbiri yoksa `null` donuyor ve cagiran taraf satiri
/// hic cizmiyor (bos bir ayirac gostermektense).
export function etkinFiltreler(secili: {
  arama?: string;
  kategori?: string | null;
  il?: string | null;
}): string | null {
  const parcalar = [secili.arama, secili.kategori, secili.il].filter(
    (p): p is string => typeof p === "string" && p.trim() !== "",
  );
  return parcalar.length ? parcalar.join(" · ") : null;
}
