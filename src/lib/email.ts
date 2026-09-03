// KAPI DISI DOSYA (bkz. CLAUDE.md degismez 4): e-postanin TEK cikis noktasi.
//
// Neden tek kapi: gonderimin basarisiz oldugunu ogrenmenin baska yolu yok.
// Resend'in SDK'si API hatasinda THROW ETMIYOR, `{ data, error }` donuyor -
// donusu okumayan bir cagri reddedilen gonderimi iz birakmadan yutar. Kural
// bu yuzden "SDK'yi dogrudan cagirma" degil, "donusu okuyan tek bir yerden
// gec": asagidaki `gonder` yaniti okumak ZORUNDA, cunku donus tipi basari ile
// hatayi ayirt ediyor ve cagiran taraf ikisini birden ele almadan derlenmiyor.
//
// NEDEN SDK YOK, DUZ `fetch` VAR: `resend` paketi bundle'a giriyor ve bu
// deponun sert bir sinirla yasadigi olculdu (bugun 1635 KiB / 3 MiB gzip,
// bkz. docs/plan.md > workerd'in dayattigi uc kisit). Kullandigimiz yuzey tek
// bir POST; ayni isi yapan bir bagimliligi tasimanin karsiligi yok. Ayrica
// warden kapisinin bloklayacagi cagri bicimi (`resend.emails.send`) burada
// hic olusmuyor.

import { MARKA_ADI } from "@/lib/marka";
import { modCoz, type Mod } from "@/lib/mod";

const RESEND_UCU = "https://api.resend.com/emails";

/// Gonderen ALAN ADI degil KIMLIK secimi (bkz. docs/plan.md > Bildirim
/// kanallari): platform onde, isletme adi konunun icinde. Pazaryeri yuzu olan
/// bir urunde musteri once bizi taniyor; saf SaaS olsaydi tersi dogru olurdu.
const GONDEREN = `${MARKA_ADI} <bildirim@randevu.enesmemduhoglu.tech>`;

export type EpostaMesaji = {
  alici: string;
  konu: string;
  html: string;
  /// Duz metin ALTERNATIFI her mesajda var. Yalnizca HTML gonderen mail
  /// istenmeyen posta puanini yukseltiyor, ve bazi istemciler (saat kulesi
  /// bildirimleri, akilli saatler) HTML'i hic gostermiyor.
  metin: string;
};

/// `sebep` YALNIZCA sunucu tarafi kayit icin ve DEGISMEZ 5 geregi ozetlenmis:
/// saglayicinin ham yaniti anahtar ya da baglanti dizesi tasiyabilir, oysa bu
/// deger `bildirim_kuyrugu.hata_metni` kolonuna yaziliyor ve panelde
/// gorunuyor.
export type GonderimSonucu =
  | { tamam: true }
  | { tamam: false; sebep: string };

/// `sahte` = hicbir sey gonderilmiyor. Yerel gelistirme ve vitest icin:
/// ikisinde de Resend anahtari yok, ve testlerin gercek adrese mail atmasi
/// kabul edilebilir bir yan etki degil. Modun nasil secildigi `mod.ts`te -
/// yerelde `wrangler.jsonc`in uretim degeri OKUNMUYOR, gerekcesi orada.

/// Anahtar once Cloudflare binding'inden, sonra `process.env`'den okunuyor.
/// Uretimde `wrangler secret` ile giriliyor ve workerd'de `process.env`'de
/// GORUNMUYOR; yerelde ise `.env` disinda bir yer yok. Ayni sirayi
/// `turnstile.ts` ve `db.ts > hyperdriveDizesi` de izliyor.
async function ayar(): Promise<{ mod: Mod; anahtar: string | undefined }> {
  let cfAnahtar: string | undefined;
  let cfMod: string | undefined;

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const cf = env as unknown as {
      RESEND_API_KEY?: string;
      BILDIRIM_MODU?: string;
    };
    cfAnahtar = cf.RESEND_API_KEY;
    cfMod = cf.BILDIRIM_MODU;
  } catch {
    // Cloudflare baglami yok: vitest ya da duz node betigi.
  }

  const mod = modCoz(cfMod, process.env.BILDIRIM_MODU);

  return { mod, anahtar: cfAnahtar ?? process.env.RESEND_API_KEY };
}

/// Modun ne oldugunu SORAN cagiranlar icin. Gonderim karari burada verilir;
/// bu yalnizca "onizleme HTML'ini saklayayim mi" gibi yan kararlar icin.
export async function bildirimModu(): Promise<Mod> {
  return (await ayar()).mod;
}

/// E-postanin TEK cikis noktasi (DEGISMEZ 4).
export async function gonder(mesaj: EpostaMesaji): Promise<GonderimSonucu> {
  const { mod, anahtar } = await ayar();

  // Sahte modda AG ISTEGI HIC ACILMIYOR. "Gonderdim" demesi bilincli: cagiran
  // taraf kuyruk kaydini GONDERILDI isaretliyor ve akisin geri kalani gercek
  // modla birebir ayni yolu izliyor. Sahte modda farkli bir dal isleseydi,
  // uretimde ilk kez kosan kod yolu olurdu.
  if (mod === "sahte") return { tamam: true };

  if (!anahtar) {
    // Gercek moda gecilmis ama anahtar yok: sessizce sahteye DUSMUYORUZ.
    // Dusseydik uretimde hicbir mail gitmez ve kuyruk "gonderildi" derdi -
    // Faz L'de Turnstile'in uretimde sessizce kapali kalmasiyla ayni hata.
    return { tamam: false, sebep: "anahtar-yok" };
  }

  let yanit: Response;
  try {
    yanit = await fetch(RESEND_UCU, {
      method: "POST",
      headers: {
        authorization: `Bearer ${anahtar}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: GONDEREN,
        to: [mesaj.alici],
        subject: mesaj.konu,
        html: mesaj.html,
        text: mesaj.metin,
      }),
    });
  } catch {
    // Ag hatasi. Hatanin kendisi disari tasinmiyor: `fetch`in mesaji istegin
    // URL'ini ve bazi calisma zamanlarinda basliklarini tasiyabiliyor,
    // basliklarda ise Bearer anahtari var (DEGISMEZ 5).
    return { tamam: false, sebep: "ulasilamadi" };
  }

  if (yanit.ok) return { tamam: true };

  // DONUS OKUNUYOR - bu dosyanin var olma sebebi. Yalnizca durum kodu ve
  // saglayicinin hata SINIFI aliniyor; `message` alani alinmiyor, cunku
  // gonderilen adresi ve bazi hatalarda anahtarin bir parcasini tasiyor.
  let sinif = "bilinmeyen";
  try {
    const govde = (await yanit.json()) as { name?: unknown };
    if (typeof govde.name === "string") sinif = govde.name;
  } catch {
    // Govde JSON degil (gecit hatasi, HTML hata sayfasi). Durum kodu yeter.
  }

  return { tamam: false, sebep: `resend-${yanit.status}-${sinif}` };
}
