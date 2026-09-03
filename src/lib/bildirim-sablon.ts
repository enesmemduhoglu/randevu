// Bildirim sablonlari: kuyruktaki bir satiri gonderilebilir mesaja cevirir.
//
// SAF DOSYA: veritabanina, ag'a ve ortam degiskenine dokunmuyor. Butun girdi
// parametreden geliyor ki sablon metni testte tek basina sinanabilsin -
// Turkce metin hatalari (yanlis ek, kayan saat) ancak boyle yakalaniyor.
//
// Renkler `marka.ts`'ten (DEGISMEZ 10). E-posta istemcileri CSS degiskeni
// cozmuyor ve `oklch()`'yi hic bilmiyor, o yuzden burada hex ve inline stil
// var - bilesenlerdeki semantic token kurali buraya UYGULANMIYOR, sebebi
// marka.ts'in basinda yazili.

import { saatBicimle, tarihUzun, telefonBicimle } from "@/lib/bicim";
import { FONT, KOSE_YARICAP, MARKA_ADI, RENK } from "@/lib/marka";
import { yerelParcalar } from "@/lib/zaman";

/// Sablon kimlikleri `bildirim_kuyrugu.sablon` kolonunda DUZ METIN olarak
/// duruyor (sema orada bilerek enum kullanmadi). Onek alicidir: MUSTERI_* ->
/// randevuyu alan kisi, ISLETME_* -> isletme sahibi. Gonderim katmani alici
/// adresini bu onekten seciyor, ayri bir kolon tutmadan.
export const SABLONLAR = [
  "MUSTERI_RANDEVU_ALINDI",
  "MUSTERI_RANDEVU_ONAYLANDI",
  "MUSTERI_RANDEVU_IPTAL",
  "MUSTERI_HATIRLATMA",
  "ISLETME_YENI_RANDEVU",
  "ISLETME_RANDEVU_IPTAL",
] as const;

export type SablonKimligi = (typeof SABLONLAR)[number];

export function sablonGecerliMi(ham: string): ham is SablonKimligi {
  return (SABLONLAR as readonly string[]).includes(ham);
}

/// Panelin gelistirici ekraninda gorunen adlar. Kayit `Record` olarak yazildi
/// ki yeni bir sablon eklendiginde derleyici burayi da istesin - ekranda
/// "MUSTERI_HATIRLATMA" gibi ham bir sabit gormek istemiyoruz.
export const SABLON_ADLARI: Record<SablonKimligi, string> = {
  MUSTERI_RANDEVU_ALINDI: "Müşteri · talep alındı",
  MUSTERI_RANDEVU_ONAYLANDI: "Müşteri · onaylandı",
  MUSTERI_RANDEVU_IPTAL: "Müşteri · iptal edildi",
  MUSTERI_HATIRLATMA: "Müşteri · hatırlatma",
  ISLETME_YENI_RANDEVU: "İşletme · yeni randevu",
  ISLETME_RANDEVU_IPTAL: "İşletme · iptal edildi",
};

/// Sablonun ihtiyac duydugu her sey. Randevu satirindan ve iliskilerinden
/// gonderim aninda okunuyor - kuyruk kaydinda saklanmiyor.
///
/// NEDEN SAKLANMIYOR: hatirlatma kaydi randevudan bir gun once gonderilmek
/// uzere olusturuluyor, yani yazilmasiyla gonderilmesi arasinda saatler var.
/// Metni yazma aninda dondursaydik, arada personeli degisen bir randevu icin
/// yanlis ismi tasiyan bir hatirlatma giderdi.
export type SablonVerisi = {
  isletmeAd: string;
  isletmeTelefon: string | null;
  saatDilimi: string;
  musteriAd: string;
  musteriTelefon: string;
  hizmetAd: string;
  personelAd: string;
  baslangic: Date;
  /// Musteriye giden mesajlarda iptal baglantisinin TAM adresi. Isletmeye
  /// giden mesajlarda null: o link tek basina iptal yetkisi tasiyor ve
  /// isletmenin zaten paneli var.
  iptalAdresi: string | null;
};

export type Mesaj = { konu: string; html: string; metin: string };

/// "1 Eylül 2026, Salı — 14:30"
///
/// DEGISMEZ 7: cevrim yalnizca `zaman.ts` uzerinden ve ISLETMENIN dilimiyle.
/// Sunucunun dilimine gore yazilsaydi gece yarisina yakin randevular
/// musterinin gozunde bir gun kaymis gorunurdu.
function zamanYazisi(baslangic: Date, saatDilimi: string): string {
  const p = yerelParcalar(baslangic, saatDilimi);
  return `${tarihUzun(p)} — ${saatBicimle(p.saat * 60 + p.dakika)}`;
}

/// HTML'e gomulen her deger buradan geciyor.
///
/// Musteri adi ve isletme adi KULLANICI GIRDISI: `<` iceren bir ad kacilmadan
/// gomulseydi mesajin duzenini bozar, HTML'i e-posta istemcisinde okunamaz
/// hale getirirdi. Istemcilerde script calismadigi icin bu bir XSS degil ama
/// duzeltmesi de ayni satir.
function kac(deger: string): string {
  return deger
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Satir = { etiket: string; deger: string };

/// Ortak kabuk: tablo yerlesimi ve inline stil.
///
/// NEDEN TABLO: e-posta istemcilerinin buyuk kismi (Outlook'un Word tabanli
/// isleyicisi basta) flexbox ve grid tanimiyor. 2026'da bile tek guvenli
/// yerlesim ic ice tablo.
function kabuk(baslik: string, giris: string, satirlar: Satir[], alt: string): string {
  const satirHtml = satirlar
    .map(
      (s) => `
        <tr>
          <td style="padding:6px 0;font-size:14px;color:${RENK.metinSolgun};width:120px;vertical-align:top;">${kac(s.etiket)}</td>
          <td style="padding:6px 0;font-size:14px;color:${RENK.metin};font-weight:600;">${kac(s.deger)}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="tr">
<body style="margin:0;padding:24px 12px;background:${RENK.zeminIkincil};font-family:${FONT.metin};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;margin:0 auto;background:${RENK.zemin};border:1px solid ${RENK.kenar};border-radius:${KOSE_YARICAP};">
    <tr>
      <td style="padding:24px 24px 0 24px;">
        <p style="margin:0;font-family:${FONT.baslik};font-size:18px;font-weight:600;color:${RENK.vurgu};">${kac(MARKA_ADI)}</p>
        <h1 style="margin:12px 0 0 0;font-family:${FONT.baslik};font-size:22px;line-height:1.3;color:${RENK.metin};">${kac(baslik)}</h1>
        <p style="margin:12px 0 0 0;font-size:15px;line-height:1.6;color:${RENK.metinIkincil};">${kac(giris)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px 0 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${satirHtml}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px 24px 24px;">
        <p style="margin:0;font-size:13px;line-height:1.6;color:${RENK.metinSolgun};border-top:1px solid ${RENK.kenar};padding-top:16px;">${alt}</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/// HTML'siz istemciler icin ayni bilgi.
function duzMetin(baslik: string, giris: string, satirlar: Satir[], alt: string): string {
  const govde = satirlar.map((s) => `${s.etiket}: ${s.deger}`).join("\n");
  return `${baslik}\n\n${giris}\n\n${govde}\n\n${alt}\n\n— ${MARKA_ADI}`;
}

/// Randevu kartinin ortak satirlari. Musteriye giden mesajda "kim" satiri
/// personel; isletmeye giden mesajda ayrica musterinin adi ve numarasi var
/// (asagida ekleniyor) - isletme musteriye ulasabilmeli.
function randevuSatirlari(v: SablonVerisi): Satir[] {
  return [
    { etiket: "Hizmet", deger: v.hizmetAd },
    { etiket: "Tarih", deger: zamanYazisi(v.baslangic, v.saatDilimi) },
    { etiket: "Kim", deger: v.personelAd },
    { etiket: "İşletme", deger: v.isletmeAd },
  ];
}

/// Musteriye giden mesajlarin alt notu: iptal baglantisi ve isletmenin
/// telefonu. Baglantiyi metnin icine gommek yerine ayri satir - e-posta
/// istemcilerinin bir kismi uzun URL'leri kirpiyor.
function musteriAltNotu(v: SablonVerisi): string {
  const parcalar: string[] = [];
  if (v.iptalAdresi) {
    parcalar.push(
      `Randevunuzu görüntülemek ya da iptal etmek için: <a href="${kac(v.iptalAdresi)}" style="color:${RENK.vurgu};">${kac(v.iptalAdresi)}</a>`,
    );
  }
  if (v.isletmeTelefon) {
    parcalar.push(`İşletmeye ulaşmak için: ${kac(telefonBicimle(v.isletmeTelefon))}`);
  }
  return parcalar.join("<br />");
}

function musteriAltNotuDuz(v: SablonVerisi): string {
  const parcalar: string[] = [];
  if (v.iptalAdresi) {
    parcalar.push(`Randevunuzu görüntülemek ya da iptal etmek için: ${v.iptalAdresi}`);
  }
  if (v.isletmeTelefon) {
    parcalar.push(`İşletmeye ulaşmak için: ${telefonBicimle(v.isletmeTelefon)}`);
  }
  return parcalar.join("\n");
}

/// Konu satirinda isletme adi TIREDEN SONRA duruyor, ek almiyor.
///
/// "Çağdaş Berber'deki randevunuz" yazmak isterdik ama Turkce'de bu ek unlu
/// uyumuna gore degisiyor ("Berber'deki" ama "Salon'daki", "Kuaför'deki");
/// isletme adini kullanici yaziyor ve dogru eki uretmek kelime sonundaki
/// unluye, kalinlik-inceligine ve sessiz harfe bakmak demek. Yanlis ek her
/// mesajda gorunur bir hata olurdu. Ayni karar Faz N'de sehir basliklari icin
/// de verildi (bkz. TODOS.md).
function konuYaz(ozet: string, isletmeAd: string): string {
  return `${ozet} — ${isletmeAd}`;
}

export function sablonUret(sablon: SablonKimligi, v: SablonVerisi): Mesaj {
  const zaman = zamanYazisi(v.baslangic, v.saatDilimi);
  const musteriSatirlari = randevuSatirlari(v);
  const isletmeSatirlari: Satir[] = [
    ...randevuSatirlari(v),
    { etiket: "Müşteri", deger: v.musteriAd },
    { etiket: "Telefon", deger: telefonBicimle(v.musteriTelefon) },
  ];

  switch (sablon) {
    // Otomatik onay KAPALI olan isletmede randevu BEKLIYOR olarak basliyor.
    // "Onaylandi" demek yanlis olurdu; musteri gelir ve isletme onu beklemiyor
    // olurdu.
    case "MUSTERI_RANDEVU_ALINDI":
      return mesaj(
        konuYaz("Randevu talebiniz alındı", v.isletmeAd),
        "Randevu talebiniz alındı",
        `Merhaba ${v.musteriAd}, talebiniz işletmeye iletildi. İşletme onayladığında size ayrıca haber vereceğiz.`,
        musteriSatirlari,
        musteriAltNotu(v),
        musteriAltNotuDuz(v),
      );

    case "MUSTERI_RANDEVU_ONAYLANDI":
      return mesaj(
        konuYaz("Randevunuz onaylandı", v.isletmeAd),
        "Randevunuz onaylandı",
        `Merhaba ${v.musteriAd}, randevunuz ${zaman} için onaylandı. Görüşmek üzere!`,
        musteriSatirlari,
        musteriAltNotu(v),
        musteriAltNotuDuz(v),
      );

    // ISLETME DE IPTAL EDEBILIYOR (panelden), yani metin "iptal ettiniz"
    // DEMIYOR: ayni sablon iki yonde de kullaniliyor ve musteriye kimin iptal
    // ettigini soylemek, panelden yapilan iptalde yanlis bilgi olurdu.
    case "MUSTERI_RANDEVU_IPTAL":
      return mesaj(
        konuYaz("Randevunuz iptal edildi", v.isletmeAd),
        "Randevunuz iptal edildi",
        `Merhaba ${v.musteriAd}, ${zaman} tarihli randevunuz iptal edildi. Yeni bir randevu almak isterseniz sayfamız açık.`,
        musteriSatirlari,
        v.isletmeTelefon
          ? `İşletmeye ulaşmak için: ${kac(telefonBicimle(v.isletmeTelefon))}`
          : "",
        v.isletmeTelefon
          ? `İşletmeye ulaşmak için: ${telefonBicimle(v.isletmeTelefon)}`
          : "",
      );

    case "MUSTERI_HATIRLATMA":
      return mesaj(
        konuYaz("Yarınki randevunuz", v.isletmeAd),
        "Yarın randevunuz var",
        `Merhaba ${v.musteriAd}, ${zaman} tarihli randevunuzu hatırlatmak istedik.`,
        musteriSatirlari,
        musteriAltNotu(v),
        musteriAltNotuDuz(v),
      );

    case "ISLETME_YENI_RANDEVU":
      return mesaj(
        konuYaz("Yeni randevu", v.isletmeAd),
        "Yeni bir randevu var",
        `${v.musteriAd} ${zaman} için randevu aldı.`,
        isletmeSatirlari,
        "Randevuyu panelden görebilir, onaylayabilir ya da iptal edebilirsiniz.",
        "Randevuyu panelden görebilir, onaylayabilir ya da iptal edebilirsiniz.",
      );

    case "ISLETME_RANDEVU_IPTAL":
      return mesaj(
        konuYaz("Randevu iptal edildi", v.isletmeAd),
        "Bir randevu iptal edildi",
        `${v.musteriAd} adına alınan ${zaman} tarihli randevu iptal edildi. Saat yeniden randevuya açık.`,
        isletmeSatirlari,
        "Bu saat artık müsait görünüyor.",
        "Bu saat artık müsait görünüyor.",
      );
  }
}

function mesaj(
  konu: string,
  baslik: string,
  giris: string,
  satirlar: Satir[],
  altHtml: string,
  altMetin: string,
): Mesaj {
  return {
    konu,
    html: kabuk(baslik, giris, satirlar, altHtml),
    metin: duzMetin(baslik, giris, satirlar, altMetin),
  };
}
