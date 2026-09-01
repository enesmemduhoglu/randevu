// Panel takviminin gorunum penceresi: "hangi gunler cizilecek".
//
// SAF MODUL. Veritabani, saat dilimi ve `new Date()` yok - girdisi de cikisi
// da `YerelTarih`, yani dilimsiz bir takvim degeri. Dilime cevirme isi tek bir
// yerde, cagiran taraftaki `gunBasi()` cagrisinda kaliyor (DEGISMEZ 7).
//
// NEDEN AYRI DOSYA: zaman.ts UTC ile dilim arasindaki gecisi tutuyor ve
// urunun en kirilgan yeri orasi; "hafta pazartesiden baslar" gibi bir ARAYUZ
// karari oraya karismasin. Buradaki her sey takvim aritmetigi, saat degil.
//
// Hafta PAZARTESIDEN basliyor: bicim.ts'teki HAFTA_SIRASI ile ayni karar,
// calisma saatleri ekrani da haftayi oyle diziyor. Veritabanindaki
// `haftaninGunu` yine 0 = Pazar - bu dosya o donusumu yapan yer.

import { gunEkle, type YerelTarih } from "@/lib/zaman";
import { haftaninGunu } from "@/lib/bicim";

export type Gorunum = "gun" | "hafta" | "ay";

export const GORUNUMLER = ["gun", "hafta", "ay"] as const;

export const GORUNUM_ETIKETLERI: Record<Gorunum, string> = {
  gun: "Gün",
  hafta: "Hafta",
  ay: "Ay",
};

/// URL'den gelen gorunum. Taninmayan deger sessizce "gun"e dusuyor: takvim
/// adresi elle duzenlenebilir bir sey ve bozuk bir parametre yuzunden hata
/// sayfasi gostermek, isletmeyi gununu goremez birakirdi.
export function gorunumAyristir(ham: unknown): Gorunum {
  return (GORUNUMLER as readonly string[]).includes(ham as string)
    ? (ham as Gorunum)
    : "gun";
}

/// Cizilecek pencere: ilk gun ve kac gun.
///
/// Gun sayisi donuyor, son gun DEGIL: cagiran taraf gunleri zaten `gunEkle`
/// ile uretiyor ve iki ucu ayri tasimak, birinin dahil digerinin haric olmasi
/// karisikligini geri getirirdi.
export type Pencere = { ilkGun: YerelTarih; gunSayisi: number };

export function haftaBasi(tarih: YerelTarih): YerelTarih {
  // 0 = Pazar oldugu icin pazartesiye olan mesafe (gun + 6) % 7: pazar 6 gun
  // geride, pazartesi 0, sali 1...
  return gunEkle(tarih, -((haftaninGunu(tarih) + 6) % 7));
}

export function ayBasi(tarih: YerelTarih): YerelTarih {
  return { yil: tarih.yil, ay: tarih.ay, gun: 1 };
}

/// Ayin gun sayisi. `Date.UTC` ile: 0. gun bir onceki ayin sonu demek ve artik
/// yil kurali boylece bize dusmuyor.
export function ayGunSayisi(yil: number, ay: number): number {
  return new Date(Date.UTC(yil, ay, 0)).getUTCDate();
}

/// Ay gorunumunun penceresi TAM HAFTALARA yuvarlaniyor.
///
/// Ay izgarasi 7 sutun; ayin ilk gunu carsambaysa satirin ilk uc hucresi bos
/// kalir. O hucreleri onceki ayin gunleriyle doldurmak, "1 Eylul haftasi"na
/// bakan birinin 31 Agustos randevusunu da gormesi demek - takvimlerin
/// hepsinin boyle davranmasinin sebebi bu. Bos birakmak, isletmenin pazartesi
/// gunku randevusunu gormeden hafta plani yapmasina yol acardi.
export function ayPenceresi(tarih: YerelTarih): Pencere {
  const ilkGun = haftaBasi(ayBasi(tarih));
  const ayinSonu = { ...ayBasi(tarih), gun: ayGunSayisi(tarih.yil, tarih.ay) };
  const sonHaftaBasi = haftaBasi(ayinSonu);

  // Ayin son gununun haftasi da tam cizilsin: son hafta basindan 7 gun.
  const gunSayisi = gunFarkiKaba(ilkGun, sonHaftaBasi) + 7;
  return { ilkGun, gunSayisi };
}

/// Iki takvim gunu arasindaki fark. zaman.ts'teki `gunFarki` de ayni isi
/// yapiyor ama bu dosya oradan yalnizca `gunEkle` aliyor; ay penceresi
/// hesabinda ikinci bir import zinciri acmamak icin yerel tutuldu.
function gunFarkiKaba(a: YerelTarih, b: YerelTarih): number {
  const ms =
    Date.UTC(b.yil, b.ay - 1, b.gun) - Date.UTC(a.yil, a.ay - 1, a.gun);
  return Math.round(ms / 86_400_000);
}

export function pencere(gorunum: Gorunum, tarih: YerelTarih): Pencere {
  if (gorunum === "gun") return { ilkGun: tarih, gunSayisi: 1 };
  if (gorunum === "hafta") return { ilkGun: haftaBasi(tarih), gunSayisi: 7 };
  return ayPenceresi(tarih);
}

/// Pencerenin gunleri, sirayla. Izgarayi cizen bilesen bunu dogrudan map'liyor.
export function pencereGunleri(p: Pencere): YerelTarih[] {
  return Array.from({ length: p.gunSayisi }, (_, i) => gunEkle(p.ilkGun, i));
}

/// "Onceki" ve "sonraki" oklari.
///
/// Ay gorunumunde pencereyi degil AYI kaydiriyoruz: pencere tam haftalara
/// yuvarlandigi icin gun sayisi 35 ya da 42 olabiliyor ve pencere kadar
/// kaydirmak bazi aylari atlar, bazilarini iki kez gosterirdi.
export function kaydir(
  gorunum: Gorunum,
  tarih: YerelTarih,
  yon: 1 | -1,
): YerelTarih {
  if (gorunum === "gun") return gunEkle(tarih, yon);
  if (gorunum === "hafta") return gunEkle(tarih, 7 * yon);

  const hedefAy = tarih.ay + yon;
  const yil = tarih.yil + Math.floor((hedefAy - 1) / 12);
  const ay = ((((hedefAy - 1) % 12) + 12) % 12) + 1;
  // Ayin gunu tasabilir: 31 Mart'tan bir ay geri gitmek 31 Subat demek.
  // Ayin son gunune kirpiliyor.
  return { yil, ay, gun: Math.min(tarih.gun, ayGunSayisi(yil, ay)) };
}

export function ayniGunMu(a: YerelTarih, b: YerelTarih): boolean {
  return a.yil === b.yil && a.ay === b.ay && a.gun === b.gun;
}
