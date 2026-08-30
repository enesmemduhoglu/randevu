// UTC ile isletmenin saat dilimi arasindaki tek gecis noktasi (DEGISMEZ 7).
//
// SUNUCUNUN SAAT DILIMINE HICBIR YERDE GUVENILMIYOR. `new Date()` disinda hicbir
// yerel-zaman API'si (getHours, getDay, toLocaleString'in dilimsiz hali)
// kullanilmiyor: Worker'in dilimi UTC, gelistirici makinesininki Europe/Istanbul
// ve testlerinki bir baskasi olabilir. Ayni kod uc yerde uc farkli sonuc
// uretirse hata ancak uretimde gorunur.
//
// KUTUPHANE YOK. date-fns-tz ya da luxon eklemek Worker bundle'ina yuz
// kilobaytlarca ekliyor ve butce 3 MiB (bkz. TODOS Faz E). Ihtiyacimiz olan iki
// donusum, Intl'in zaten tasidigi IANA veritabaniyla yapilabiliyor.

export type YerelTarih = { yil: number; ay: number; gun: number };

export type YerelParcalar = YerelTarih & {
  saat: number;
  dakika: number;
  /// 0 = Pazar ... 6 = Cumartesi. Semadaki `haftaninGunu` ile ayni.
  haftaninGunu: number;
};

// Bicimleyici kurmak pahali (ICU verisine bakiyor) ve ayni dilim icin defalarca
// cagriliyor: bir gunun slotlarini uretirken yuzlerce kez. Dilim basina bir kez
// kurulup saklaniyor.
const bicimleyiciler = new Map<string, Intl.DateTimeFormat>();

function bicimleyici(saatDilimi: string): Intl.DateTimeFormat {
  let mevcut = bicimleyiciler.get(saatDilimi);
  if (!mevcut) {
    mevcut = new Intl.DateTimeFormat("en-US", {
      timeZone: saatDilimi,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    bicimleyiciler.set(saatDilimi, mevcut);
  }
  return mevcut;
}

const GUN_KISALTMALARI: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/// Bir UTC anini isletmenin saat diliminde parcalarina ayirir.
export function yerelParcalar(an: Date, saatDilimi: string): YerelParcalar {
  const parcalar = bicimleyici(saatDilimi).formatToParts(an);
  const al = (tur: string) =>
    parcalar.find((p) => p.type === tur)?.value ?? "";

  // ICU bazi surumlerde gece yarisini "24" olarak veriyor (hour12: false ile
  // h23 yerine h24 dongusu). Duzeltilmezse 00:15 randevusu bir onceki gunun
  // 24:15'i gibi gorunurdu.
  const hamSaat = Number(al("hour"));
  const saat = hamSaat === 24 ? 0 : hamSaat;

  return {
    yil: Number(al("year")),
    ay: Number(al("month")),
    gun: Number(al("day")),
    saat,
    dakika: Number(al("minute")),
    haftaninGunu: GUN_KISALTMALARI[al("weekday")] ?? 0,
  };
}

/// Verilen ANDA dilimin UTC'ye gore ofseti (dakika). Europe/Istanbul icin +180.
///
/// Ofset yila degil ANA baglidir: yaz saati uygulayan dilimlerde yilda iki kez
/// degisiyor. Bu yuzden her hesap kendi anini veriyor.
export function dilimOfsetiDk(an: Date, saatDilimi: string): number {
  const p = yerelParcalar(an, saatDilimi);
  const saniye = Number(
    bicimleyici(saatDilimi)
      .formatToParts(an)
      .find((x) => x.type === "second")?.value ?? "0",
  );

  // Yerel duvar saatini "sanki UTC'ymis gibi" epoch'a cevirip gercek epoch'tan
  // cikariyoruz; fark ofsetin ta kendisi.
  const yerelEpoch = Date.UTC(p.yil, p.ay - 1, p.gun, p.saat, p.dakika, saniye);
  const gercekEpoch = Math.floor(an.getTime() / 1000) * 1000;

  return Math.round((yerelEpoch - gercekEpoch) / 60000);
}

/// Isletmenin YEREL duvar saatini UTC anina cevirir.
///
/// `dakika` gece yarisindan itibaren dakikadir (09:00 = 540) - `calisma_saati`
/// tablosuyla ayni birim.
///
/// YAZ SAATI SINIRLARI. Bir duvar saati yilda iki kez tek bir ana karsilik
/// gelmez ve ikisinin de sessiz bir varsayilani vardir; ikisi de burada ACIKCA
/// seciliyor (ECMAScript Temporal'in "compatible" kuraliyla ayni):
///
/// - **Var olmayan saat.** Saat ileri alinirken 02:00 dogrudan 03:00 olur;
///   02:30 o gun hic yasanmaz. Sonuc ILERI kayiyor, yani 03:30 anina denk
///   geliyor. Hata firlatmiyoruz: calisma saati 02:30'da baslayan bir isletme
///   icin "o gun bir saat gec basladi" makul, "randevu alinamaz" degil.
/// - **Iki kez yasanan saat.** Saat geri alinirken 02:30 iki kez yasanir.
///   ILKI (erken olan) seciliyor - "saat 02:30 oldugunda" denince kastedilen
///   sey ilk defasidir.
///
/// Yontem: gecis her zaman bir gunden kisa surede olup bittigi icin, hedef
/// gunun bir gun oncesi ve bir gun sonrasindaki ofsetler iki adayi veriyor.
/// Istenen duvar saatine GERI DONEN adaylar gecerli sayiliyor; birden fazlaysa
/// en erkeni, hicbiri yoksa gecis oncesi ofset kullaniliyor (ileri kaydiriyor).
export function yerelDenUtc(
  saatDilimi: string,
  tarih: YerelTarih,
  dakika: number,
): Date {
  const saat = Math.floor(dakika / 60);
  const dk = dakika % 60;

  // Yerel duvar saatini once "UTC'ymis gibi" kabul ediyoruz; bu bir tahmin.
  const tahmin = Date.UTC(tarih.yil, tarih.ay - 1, tarih.gun, saat, dk);

  const GUN_MS = 86400000;
  const oncekiOfset = dilimOfsetiDk(new Date(tahmin - GUN_MS), saatDilimi);
  const sonrakiOfset = dilimOfsetiDk(new Date(tahmin + GUN_MS), saatDilimi);

  const adaylar =
    oncekiOfset === sonrakiOfset ? [oncekiOfset] : [oncekiOfset, sonrakiOfset];

  const gecerliler = adaylar
    .map((ofset) => new Date(tahmin - ofset * 60000))
    .filter((an) => {
      const p = yerelParcalar(an, saatDilimi);
      return (
        p.yil === tarih.yil &&
        p.ay === tarih.ay &&
        p.gun === tarih.gun &&
        p.saat * 60 + p.dakika === dakika
      );
    });

  if (gecerliler.length > 0) {
    return new Date(Math.min(...gecerliler.map((d) => d.getTime())));
  }

  // Var olmayan saat: gecis ONCESI ofsetle hesaplamak sonucu bosluk kadar
  // ileri kaydiriyor - istenen davranis bu.
  return new Date(tahmin - oncekiOfset * 60000);
}

/// Yerel gunun basi (00:00) - UTC olarak.
export function gunBasi(saatDilimi: string, tarih: YerelTarih): Date {
  return yerelDenUtc(saatDilimi, tarih, 0);
}

/// Bir UTC aninin isletme takvimindeki gunu.
export function yerelGun(an: Date, saatDilimi: string): YerelTarih {
  const p = yerelParcalar(an, saatDilimi);
  return { yil: p.yil, ay: p.ay, gun: p.gun };
}

/// "2026-09-01" -> tarih. Ayristiramazsa null.
///
/// `new Date("2026-09-01")` KULLANILMIYOR: o dizeyi UTC gece yarisi olarak
/// coz uyor ve sonra yerel dilime cevirince gun kayabiliyor. Tarih burada
/// dilimsiz bir takvim degeri olarak kaliyor.
export function tarihAyristir(metin: unknown): YerelTarih | null {
  if (typeof metin !== "string") return null;

  const eslesme = /^(\d{4})-(\d{2})-(\d{2})$/.exec(metin.trim());
  if (!eslesme) return null;

  const yil = Number(eslesme[1]);
  const ay = Number(eslesme[2]);
  const gun = Number(eslesme[3]);

  if (ay < 1 || ay > 12 || gun < 1 || gun > 31) return null;

  // Takvimde gercekten var mi (31 Subat gibi degerler icin). Date.UTC
  // tasirma yapiyor; geri okuyup ayni gun mu diye bakiyoruz.
  const deneme = new Date(Date.UTC(yil, ay - 1, gun));
  if (
    deneme.getUTCFullYear() !== yil ||
    deneme.getUTCMonth() !== ay - 1 ||
    deneme.getUTCDate() !== gun
  ) {
    return null;
  }

  return { yil, ay, gun };
}

/// Tarihi "2026-09-01" bicimine cevirir (URL ve API parametreleri icin).
export function tarihMetni(tarih: YerelTarih): string {
  const ay = tarih.ay.toString().padStart(2, "0");
  const gun = tarih.gun.toString().padStart(2, "0");
  return `${tarih.yil}-${ay}-${gun}`;
}

/// Tarihe gun ekler. Takvim gunu ekliyor, 24 saat DEGIL: yaz saati gecisinde
/// 24 saat eklemek gunu kaydirirdi.
export function gunEkle(tarih: YerelTarih, gun: number): YerelTarih {
  const taban = new Date(Date.UTC(tarih.yil, tarih.ay - 1, tarih.gun));
  taban.setUTCDate(taban.getUTCDate() + gun);
  return {
    yil: taban.getUTCFullYear(),
    ay: taban.getUTCMonth() + 1,
    gun: taban.getUTCDate(),
  };
}

/// Iki takvim gunu arasindaki fark (gun sayisi). Saat farki yok sayiliyor.
export function gunFarki(a: YerelTarih, b: YerelTarih): number {
  const birinci = Date.UTC(a.yil, a.ay - 1, a.gun);
  const ikinci = Date.UTC(b.yil, b.ay - 1, b.gun);
  return Math.round((ikinci - birinci) / 86400000);
}
