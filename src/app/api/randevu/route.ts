import { saatBicimle, tarihUzun } from "@/lib/bicim";
import {
  bildirimleriYanittanSonraGonder,
  randevuOlustuKayitlari,
} from "@/lib/bildirim";
import { govdeOku, govdeOkunamadi } from "@/lib/govde";
import { hizSiniriAsildiMi } from "@/lib/hiz-siniri";
import { iptalTokenUret } from "@/lib/iptal-token";
import { slotSec } from "@/lib/musaitlik-sorgu";
import { checkOrigin } from "@/lib/origin";
import { randevuAlanlariniDogrula } from "@/lib/randevu-girdi";
import { getHalkaAcikDb } from "@/lib/scoped-db";
import { istekIpsi, turnstileDogrula } from "@/lib/turnstile";
import { yerelParcalar } from "@/lib/zaman";

// Halka acik randevu yazma.
//
// OTURUMSUZ: musteri hesap acmiyor, kiraci `isletme` slug'indan cozuluyor ve
// `getHalkaAcikDb` filtreyi kapanis degiskeni olarak tutuyor (DEGISMEZ 1).
// Halka acik olmasi kapsamsiz olmasi demek degil - baska bir salonun hizmet
// id'siyle buraya randevu yazilamiyor, o istek 404 aliyor.
//
// Mutasyon oldugu icin `checkOrigin` ILK SATIR (DEGISMEZ 2). Panel route'lari
// bunu `panelKapisi` uzerinden aliyor ama burada oturum yok, yani o yardimci
// kullanilamiyor: kapi elle cagriliyor.
//
// Yanit ONBELLEKLENMIYOR: 201 govdesi iptal token'ini tasiyor ve araya giren
// hicbir katmanin onu saklamasi istenmiyor.

const ONBELLEKSIZ = { "cache-control": "no-store" };

/// Ayni musterinin ayni isletmede acik tutabilecegi randevu sayisi.
///
/// Neden bir sinir var: bu yol oturumsuz, yani numarayi yazan herkes takvime
/// yazabiliyor. Sinirsiz birakmak, gunu elli randevuyla doldurup hicbirine
/// gelmeyen kullanimi mumkun kilardi ve isletme bunu ancak gun sonunda fark
/// ederdi. Neden 3: kucuk isletmede mesru musteri en fazla birkac randevuyu
/// ayni anda acik tutuyor (kesim + boya + esinin randevusu gibi); dorduncusu
/// artik olagan degil. Bot korumasi DEGIL - o Faz G2'de Turnstile ve hiz
/// siniriyla geliyor.
const EN_COK_ACIK_RANDEVU = 3;

/// Kapali ya da hic olmayan isletme AYNI cevabi aliyor: hangi slug'larin
/// kayitli oldugunu sizdirmanin bir faydasi yok.
const SAYFA_YOK = "Randevu sayfası bulunamadı";

function hata(mesaj: string, durum: number): Response {
  return Response.json({ hata: mesaj }, { status: durum, headers: ONBELLEKSIZ });
}

export async function POST(istek: Request) {
  // DEGISMEZ 2: CSRF kapisi ilk satirda. Yabanci origin'den gelen istek
  // veritabanina hic dokunmadan doner.
  const csrf = checkOrigin(istek);
  if (csrf) return csrf;

  // Hiz siniri TURNSTILE'DAN ONCE: sinirlayici bir binding cagrisi, Turnstile
  // ise Cloudflare'e giden bir ag istegi. Ucuz kapi once.
  //
  // Turnstile'in YERINE GECMIYOR: gecerli bir jetonu dongude yeniden kullanan
  // betik o kapidan gecer, buradan gecemez.
  const ip = istekIpsi(istek);
  if (await hizSiniriAsildiMi("RANDEVU_SINIRI", ip)) {
    // 429 govdesi sinirin ne oldugunu SOYLEMIYOR. Mesru kullaniciya sayilar
    // yardim etmiyor, betige ise tam olarak ne kadar bekleyecegini ogretiyor.
    return hata("Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.", 429);
  }

  const govde = await govdeOku(istek);
  if (!govde) return govdeOkunamadi();

  // Bot kapisi SLUG COZUMUNDEN ONCE: buradan gecemeyen istek veritabanina tek
  // sorgu bile actirmiyor. Kapinin degeri zaten ucuz olmasinda - bir betigin
  // saniyede yuzlerce istek atmasi Postgres'e degil Cloudflare'e maliyet
  // yaziyor.
  //
  // Acik randevu siniri (asagida, 429) bunun YERINE GECMIYOR: o sinir
  // numaraya bagli ve numarayi her istekte degistiren bir betik onu hic
  // gormeden gecer.
  const kapi = await turnstileDogrula(govde.turnstile, ip);
  if (!kapi.gecti) {
    // Uc sebep de kullaniciya AYNI metni gosteriyor. "Sunucu Cloudflare'e
    // ulasamadi" demek mesru musteriye yardim etmiyor, botun ise hangi dalda
    // oldugunu ogretiyor. Yapilabilecek tek sey her durumda ayni: yenile,
    // tekrar dene.
    return hata(
      "Doğrulama tamamlanamadı. Sayfayı yenileyip yeniden deneyin.",
      403,
    );
  }

  // Slug tipi burada eleniyor: metin olmayan bir deger `eq(isletme.slug, ...)`
  // icine girseydi Postgres tip hatasi firlatir ve istemcinin hatasi 500'e
  // donusurdu (ayni gerekce: randevu-girdi.ts > kimlikDogrula).
  const slug = typeof govde.isletme === "string" ? govde.isletme.trim() : "";
  if (!slug) return hata(SAYFA_YOK, 404);

  const db = await getHalkaAcikDb(slug);
  if (!db) return hata(SAYFA_YOK, 404);

  const alanlar = randevuAlanlariniDogrula(govde);
  if (!alanlar.tamam) return hata(alanlar.hata, 400);

  // Hizmet KAPSAMLI sorguluyla getiriliyor: baska isletmenin hizmet id'si
  // burada bos donuyor ve "bulunamadi" olarak cikiyor. IDOR'un goruntusu de bu
  // olmali - var olmayan id ile baskasinin id'si cagirana ayni gorunsun.
  const hizmet = await db.hizmetGetir(alanlar.deger.hizmetId);
  if (!hizmet) return hata("Hizmet bulunamadı", 404);

  // `simdi` BIR KEZ okunuyor ve iki yere birden veriliyor: musaitlik penceresi
  // ile acik randevu sayimi ayni ana bakmali. Iki ayri `new Date()` arasinda
  // gecen milisaniyeler bugun bir sey bozmuyor ama iki farkli "su an" tasiyan
  // bir akis, ileride sinirdaki bir durumu aciklanamaz hale getirir.
  const simdi = new Date();

  // Musterinin sayfayi actigi an ile "onayla" dedigi an arasinda dakikalar
  // gecmis olabilir; ayni motor tekrar kosuyor. Bu bir GARANTI DEGIL, erken
  // geri bildirim - kesin cevabi asagidaki kisit veriyor (DEGISMEZ 8).
  const slot = await slotSec({
    db,
    hizmetId: hizmet.id,
    hizmetSuresiDk: hizmet.sureDk,
    baslangic: alanlar.deger.baslangic,
    simdi,
    // "Farketmez" secildiyse motor hizmeti verebilen personeller arasindan
    // kendisi seciyor.
    personelId: alanlar.deger.personelId ?? undefined,
  });
  if (!slot) {
    return hata("Bu saat artık uygun değil. Lütfen başka bir saat seçin.", 409);
  }

  const iptalToken = iptalTokenUret();

  const sonuc = await db.randevuOlustur({
    // Personel ve bitis MOTORDAN geliyor, istemciden degil: bitisi burada
    // yeniden hesaplamak, yaz saati gecisinde motorunkinden farkli bir deger
    // uretebilirdi ve cakisma kisiti o farki gormezdi.
    personelId: slot.personelId,
    hizmetId: hizmet.id,
    baslangic: slot.baslangic,
    bitis: slot.bitis,
    musteriAd: alanlar.deger.musteriAd,
    telefon: alanlar.deger.telefon,
    eposta: alanlar.deger.eposta,
    not: alanlar.deger.not,
    iptalToken,
    simdi,
    enCokAcikRandevu: EN_COK_ACIK_RANDEVU,
    otomatikOnay: db.isletme.otomatikOnay,
  });

  if (sonuc.durum === "kisitli") {
    // KISITIN SEBEBI SOYLENMIYOR - "randevunuza gelmediginiz icin" cumlesi
    // bilerek yok. Bu yol OTURUMSUZ: kimligini dogrulamamis herhangi biri bir
    // telefon numarasi yazip 429 alarak o numaranin sahibinin bu isletmeye
    // gelmedigini ogrenirdi. Kisitin varligini gizlemek mumkun degil (mesru
    // musteriye ne zaman tekrar deneyecegini soylemek zorundayiz), ama
    // SEBEBINI gizlemek mumkun ve maliyeti yok: musteri zaten isletmeyi
    // ariyor, konusma orada aciliyor.
    //
    // Tarih ISLETMENIN saat diliminde (DEGISMEZ 7): sunucununkine gore
    // yazilsaydi gece yarisina yakin bitisler bir gun kaymis gorunurdu.
    const p = yerelParcalar(sonuc.bitis, db.isletme.saatDilimi);
    const neZaman = `${tarihUzun(p)} ${saatBicimle(p.saat * 60 + p.dakika)}`;

    return hata(
      `Bu numarayla ${neZaman} tarihine kadar yeni randevu alınamıyor. ` +
        "Daha erken bir randevu için işletmeyi arayabilirsiniz.",
      429,
    );
  }

  if (sonuc.durum === "sinir") {
    return hata(
      `Bu numarayla en fazla ${EN_COK_ACIK_RANDEVU} açık randevu ` +
        "tutulabiliyor. Yeni bir randevu için önce mevcut birini iptal edin.",
      429,
    );
  }

  if (sonuc.durum === "tamam") {
    // BILDIRIM YAZMA (Faz I). Kuyruk satirlari YANIT ONCESINDE yaziliyor
    // (tek INSERT), gonderim ise yanittan sonra: satirin var olmasi garanti
    // olsun ki `after` hic kosmasa bile Faz K'nin cron'u mesaji bulabilsin.
    //
    // HATASI YUTULUYOR: randevu ZATEN yazildi ve slot tutuldu. Kuyruga
    // yazamamak yuzunden 500 donmek, musteriye "olmadi" deyip takvimde
    // duran bir randevu birakmak olurdu - musteri tekrar dener, bu kez
    // "saat dolu" alir ve neden oldugunu anlamaz.
    const bildirimZamani = new Date();
    try {
      await db.bildirimKuyrugunaYaz(
        randevuOlustuKayitlari({
          randevuId: sonuc.randevu.id,
          baslangic: sonuc.randevu.baslangic,
          // Otomatik onay kapaliyken randevu BEKLIYOR basliyor ve musteriye
          // "onaylandi" demek yanlis olurdu; sablon secimi bu bayraga bakiyor.
          onayli: sonuc.randevu.durum === "ONAYLI",
          simdi: bildirimZamani,
        }),
      );
      bildirimleriYanittanSonraGonder(db, sonuc.randevu.id, bildirimZamani);
    } catch {
      // Yukaridaki gerekce. Randevu duruyor, bildirim gitmiyor.
    }

    return Response.json(
      {
        randevu: {
          id: sonuc.randevu.id,
          baslangic: sonuc.randevu.baslangic.toISOString(),
          bitis: sonuc.randevu.bitis.toISOString(),
          durum: sonuc.randevu.durum,
          personelAd: slot.personelAd,
          hizmetAd: hizmet.ad,
        },
        // DEGISMEZ 5: token'in gorundugu TEK yer burasi. Hata metinlerine ve
        // console'a girmiyor - tek basina iptal yetkisi tasiyor.
        //
        // Slug istemcinin gonderdigi ham deger degil, veritabanindaki kanonik
        // hali: istemci onu farkli yazmis olabilir ve link o haliyle
        // paylasilacak.
        iptalYolu: `/r/${db.isletme.slug}/randevu/${iptalToken}`,
      },
      { status: 201, headers: ONBELLEKSIZ },
    );
  }

  // Geriye "dolu" kaliyor: ya cakisma kisiti reddetti ya da ayni sloti iki
  // istek yakaladi. Ikisi de musteri icin ayni sey - o saat artik bos degil.
  return hata(
    "Bu saat az önce doldu. Lütfen başka bir saat seçin.",
    409,
  );
}
