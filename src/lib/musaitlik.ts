// Musaitlik motoru: bir personelin bir gunundeki uygun randevu saatleri.
//
// SAF FONKSIYON. Veritabanina, saate ve ortama dokunmuyor - `simdi` bile
// disaridan veriliyor. Sebep: bu urunun en yogun sinanmasi gereken yeri burasi
// ve "su an" degeri iceride okunsaydi yaz saati gecisi, gun siniri ve minimum
// bildirim suresi gibi durumlar ancak o anlari bekleyerek sinanabilirdi.
//
// TEK PERSONEL icin calisiyor. Cagiran taraf hangi personelin duzenini ve
// hangi randevularini verdiginden sorumlu; motor "bu araliklar bu kisiye ait"
// varsayimini yapiyor.
//
// Motor bir GARANTI DEGIL. Iki musteri ayni saniyede ayni sloti isterse ikisi
// de burada "bos" gorur; kesin cevabi veritabanindaki EXCLUDE kisiti veriyor
// (DEGISMEZ 8) ve cagiran taraf ihlali 409'a ceviriyor.

import { gunFarki, yerelDenUtc, yerelGun, type YerelTarih } from "@/lib/zaman";

export type Aralik = { baslangic: Date; bitis: Date };

export type CalismaAraligi = {
  haftaninGunu: number;
  baslangicDk: number;
  bitisDk: number;
};

export type MusaitlikGirdisi = {
  saatDilimi: string;
  /// Isletmenin yerel takvimindeki gun.
  tarih: YerelTarih;
  /// Hesabin yapildigi an.
  simdi: Date;
  hizmetSuresiDk: number;
  slotAraligiDk: number;
  minOnceBildirimDk: number;
  maksIleriGun: number;
  /// Personelin haftalik duzeni. Butun gunler verilebilir; motor kendi gununu
  /// seciyor.
  calismaAraliklari: CalismaAraligi[];
  /// Izin, tatil, kapali aralik.
  kapaliAraliklar: Aralik[];
  /// O personelin AKTIF randevulari (iptal ve gelmedi olanlar saati
  /// bosalttigi icin buraya girmemeli - bu ayrimi cagiran taraf yapiyor,
  /// tipki veritabanindaki kisitin WHERE kosulu gibi).
  doluRandevular: Aralik[];
};

/// Iki aralik cakisiyor mu? Yarim acik `[baslangic, bitis)`.
///
/// Veritabanindaki EXCLUDE kisiti da `'[)'` kullaniyor; ikisi ayrisirsa motor
/// "bos" dedigi bir sloti kisit reddeder ve kullanici sebebini anlamaz.
export function cakisiyorMu(a: Aralik, b: Aralik): boolean {
  return a.baslangic < b.bitis && b.baslangic < a.bitis;
}

export function uygunSaatler(girdi: MusaitlikGirdisi): Aralik[] {
  const {
    saatDilimi,
    tarih,
    simdi,
    hizmetSuresiDk,
    slotAraligiDk,
    minOnceBildirimDk,
    maksIleriGun,
    calismaAraliklari,
    kapaliAraliklar,
    doluRandevular,
  } = girdi;

  // Anlamsiz girdide bos donuyoruz. Ozellikle slotAraligi <= 0: dongu sonsuza
  // giderdi ve bu deger kullanici ayarindan geliyor.
  if (hizmetSuresiDk <= 0 || slotAraligiDk <= 0) return [];

  // --- Takvim penceresi ---------------------------------------------------
  // Gecmis gun ve pencerenin otesi bos donuyor. "Bugun" isletmenin kendi
  // takviminde: sunucu UTC'de saat 01:00'ken Istanbul'da gun coktan degismis
  // olabiliyor.
  const bugun = yerelGun(simdi, saatDilimi);
  const fark = gunFarki(bugun, tarih);
  if (fark < 0 || fark > maksIleriGun) return [];

  // --- O gunun calisma araliklari ----------------------------------------
  // Haftanin gunu takvimden hesaplaniyor, saat diliminden DEGIL: bir takvim
  // gununun hangi gune denk geldigi dilime bagli degil.
  const haftaninGunu = new Date(
    Date.UTC(tarih.yil, tarih.ay - 1, tarih.gun),
  ).getUTCDay();

  const gunun = calismaAraliklari
    .filter((a) => a.haftaninGunu === haftaninGunu)
    .sort((a, b) => a.baslangicDk - b.baslangicDk);

  if (gunun.length === 0) return [];

  const enErken = new Date(simdi.getTime() + minOnceBildirimDk * 60000);

  const uygunlar: Aralik[] = [];

  for (const calisma of gunun) {
    // Slot izgarasi ARALIGIN BASINDAN basliyor, gunun basindan degil.
    // Ogleden sonraki aralik 13:00'te basliyorsa saatler 13:00, 13:15...
    // olsun isteniyor; gun basindan sayilsaydi 12:50 gibi noktalara duserdi.
    for (
      let baslangicDk = calisma.baslangicDk;
      // Hizmet ARALIGA SIGMALI: 17:45'te baslayan 30 dakikalik bir hizmet
      // 18:00'de kapanan bir aralikta yer bulamaz. Ogle arasina tasan randevu
      // da boylece engelleniyor - iki aralik ayri ayri deneniyor.
      baslangicDk + hizmetSuresiDk <= calisma.bitisDk;
      baslangicDk += slotAraligiDk
    ) {
      const baslangic = yerelDenUtc(saatDilimi, tarih, baslangicDk);

      // Bitis GERCEK sureyle hesaplaniyor, duvar saatiyle degil: 60 dakikalik
      // bir hizmet yaz saati gecisinde de 60 dakika suruyor. Duvar saatinden
      // hesaplansaydi gecis gununde randevu bir saat uzar ya da kisalirdi ve
      // cakisma kontrolu yaniltirdi.
      const bitis = new Date(baslangic.getTime() + hizmetSuresiDk * 60000);

      // Cok yakin randevu: isletme hazirliksiz yakalanmasin.
      if (baslangic < enErken) continue;

      const aday = { baslangic, bitis };

      if (kapaliAraliklar.some((k) => cakisiyorMu(aday, k))) continue;
      if (doluRandevular.some((d) => cakisiyorMu(aday, d))) continue;

      uygunlar.push(aday);
    }
  }

  // Araliklar sirali geldi ama gun icinde ust uste binen iki calisma araligi
  // (ornegin elle duzenlenmis veri) ayni sloti iki kez uretebilir. Siralama ve
  // tekilleme, cagiran tarafin bunu dusunmek zorunda kalmamasi icin.
  uygunlar.sort((a, b) => a.baslangic.getTime() - b.baslangic.getTime());

  const tekil: Aralik[] = [];
  for (const slot of uygunlar) {
    const onceki = tekil[tekil.length - 1];
    if (onceki && onceki.baslangic.getTime() === slot.baslangic.getTime()) continue;
    tekil.push(slot);
  }

  return tekil;
}

/// Bir slotun hala alinabilir olup olmadigini kontrol eder.
///
/// Randevu yazilirken kullaniliyor: musterinin gordugu liste ile yazma ani
/// arasinda saniyeler gecmis olabiliyor. Listeyi yeniden uretip icinde
/// arayarak yapmak, ayni kurallarin iki kez yazilmasini engelliyor.
export function slotUygunMu(
  girdi: MusaitlikGirdisi,
  istenenBaslangic: Date,
): boolean {
  return uygunSaatler(girdi).some(
    (s) => s.baslangic.getTime() === istenenBaslangic.getTime(),
  );
}
