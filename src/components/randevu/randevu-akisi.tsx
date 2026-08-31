"use client";

import { useEffect, useState } from "react";

import {
  AdimGostergesi,
  type AdimTanimi,
} from "@/components/randevu/adim-gostergesi";
import {
  BilgiFormu,
  type MusteriBilgileri,
} from "@/components/randevu/bilgi-formu";
import { HizmetSecimi } from "@/components/randevu/hizmet-secimi";
import {
  OnayEkrani,
  type AlinanRandevu,
} from "@/components/randevu/onay-ekrani";
import {
  hizmetBilgisi,
  type HizmetOzeti,
  type IsletmeOzeti,
  type PersonelOzeti,
  type Slot,
} from "@/components/randevu/ortak";
import { PersonelSecimi } from "@/components/randevu/personel-secimi";
import { ZamanSecimi } from "@/components/randevu/zaman-secimi";
import { tarihMetni, type YerelTarih } from "@/lib/zaman";

// Musterinin randevu akisi: hizmet -> personel -> gun/saat -> bilgiler -> onay.
//
// Butun durum BURADA duruyor, adim bilesenleri sunum yapiyor. Sebep: adimlar
// birbirinin secimine bagli (hizmet degisince personel ve saat dusuyor) ve bu
// bagimliligi her bilesene dagitmak, yalnizca bir tanesinin temizlenmeyi
// unuttugu durumlar uretirdi - musteri, sectigi hizmetin verilmedigi bir saate
// randevu almis olurdu.
//
// SUNUCU SORGUSU YOK. Veri sunucu bileseninden prop olarak geliyor
// (DEGISMEZ 1), musaitlik ve yazma ise API yollarindan.

type Adim = "hizmet" | "personel" | "zaman" | "bilgiler" | "onay";

type Props = {
  isletme: IsletmeOzeti;
  hizmetler: HizmetOzeti[];
  personeller: PersonelOzeti[];
  /// Isletmenin takvimindeki bugun. Tarayicinin dilimine GUVENILMIYOR
  /// (DEGISMEZ 7): musteri baska bir dilimdeyse kendi bugununu gorur ve
  /// isletmenin dunune ya da yarinina randevu almaya calisirdi.
  bugun: YerelTarih;
};

export function RandevuAkisi({
  isletme,
  hizmetler,
  personeller,
  bugun,
}: Props) {
  const [adim, setAdim] = useState<Adim>("hizmet");
  const [hizmet, setHizmet] = useState<HizmetOzeti | null>(null);
  /// null = "farketmez".
  const [personelId, setPersonelId] = useState<string | null>(null);
  const [tarih, setTarih] = useState<YerelTarih>(bugun);
  const [slot, setSlot] = useState<Slot | null>(null);

  // Musaitlik yuku TEK PARCA tutuluyor ve icinde hangi sorguya ait oldugunu
  // soyleyen bir anahtar tasiyor.
  //
  // Neden boyle: "yukleniyor" ayri bir durum degil, TUREVI - elde tutulan yuk
  // istenen sorguya ait degilse zaten yukleniyoruzdur. Ayri bayrakla
  // yapildiginda hem efektin ilk satirinda senkron setState gerekiyor (React
  // derleyicisi bunu zincirleme render diye isaretliyor) hem de gec donen eski
  // bir yanit yeni gunun listesinin uzerine yazabiliyordu.
  const [yuk, setYuk] = useState<{
    anahtar: string;
    slotlar: Slot[];
    saatDilimi: string;
    hata: string | null;
  } | null>(null);
  // Listeyi ELDE tazelemek icin sayac: 409 sonrasi ve "tekrar dene"de artiyor.
  const [tazeleme, setTazeleme] = useState(0);
  const [zamanUyarisi, setZamanUyarisi] = useState<string | null>(null);

  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [gonderimHatasi, setGonderimHatasi] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<{
    randevu: AlinanRandevu;
    iptalYolu: string;
  } | null>(null);

  // Personel adimi yalnizca SECILEN HIZMETI veren birden fazla kisi varsa
  // anlamli. Hizmeti vermeyen birini secmek "bu gun uygun saat yok" gibi
  // gorunen bir cikmaz sokak uretiyordu; esleme sunucuda cozulup geliyor.
  const uygunPersoneller = hizmet
    ? personeller.filter((p) => hizmet.personelIdler.includes(p.id))
    : personeller;
  const personelAdimiVar = uygunPersoneller.length > 1;

  const hizmetId = hizmet?.id ?? null;
  // Efektin bagimliligi NESNE DEGIL metin: `tarih` her secimde yeni bir nesne
  // ve ayni gune yeniden dokunmak gereksiz bir istek acardi.
  const tarihAnahtari = tarihMetni(tarih);
  const anahtar = `${hizmetId ?? ""}|${personelId ?? ""}|${tarihAnahtari}|${tazeleme}`;

  // Elde tutulan yuk istenen sorguya ait degilse yukleniyoruz demektir.
  const guncelYuk = yuk?.anahtar === anahtar ? yuk : null;
  const slotlar = guncelYuk?.slotlar ?? [];
  const slotHatasi = guncelYuk?.hata ?? null;
  const slotDurumu = guncelYuk
    ? guncelYuk.hata
      ? ("hata" as const)
      : ("hazir" as const)
    : ("yukleniyor" as const);
  // Saat dilimi YANITTAN okunuyor (DEGISMEZ 7); yanit gelene kadar sunucu
  // bileseninin verdigi deger kullaniliyor.
  const saatDilimi = guncelYuk?.saatDilimi ?? isletme.saatDilimi;

  useEffect(() => {
    if (adim !== "zaman" || !hizmetId) return;

    const kontrol = new AbortController();

    const parametreler = new URLSearchParams({
      isletme: isletme.slug,
      hizmet: hizmetId,
      tarih: tarihAnahtari,
    });
    // "Farketmez" ise parametre HIC gonderilmiyor. Bos deger gondermek
    // sunucuda "personel secildi" gibi okunur ve hicbir personele eslesmeyen
    // bos bir liste donerdi.
    if (personelId) parametreler.set("personel", personelId);

    void (async () => {
      try {
        const yanit = await fetch(`/api/musaitlik?${parametreler.toString()}`, {
          signal: kontrol.signal,
          cache: "no-store",
          headers: { accept: "application/json" },
        });

        const cevap = (await yanit.json().catch(() => null)) as {
          saatDilimi?: string;
          slotlar?: Slot[];
          hata?: string;
        } | null;

        if (!yanit.ok) {
          setYuk({
            anahtar,
            slotlar: [],
            saatDilimi: isletme.saatDilimi,
            hata: cevap?.hata ?? "Uygun saatler getirilemedi.",
          });
          return;
        }

        const gelenler = cevap?.slotlar ?? [];
        setYuk({
          anahtar,
          slotlar: gelenler,
          saatDilimi: cevap?.saatDilimi ?? isletme.saatDilimi,
          hata: null,
        });
        // Secili saat listeden dustuyse secim de dusuyor: ekranda vurgulu
        // duran ama artik alinamayan bir saat musteriyi dogrudan 409'a
        // goturur.
        setSlot((onceki) =>
          onceki && gelenler.some((s) => s.baslangic === onceki.baslangic)
            ? onceki
            : null,
        );
      } catch (aksama) {
        // Iptal edilen istek hata DEGIL: kullanici gunu degistirdi ya da
        // adimdan cikti, yeni istek zaten yolda.
        if (aksama instanceof DOMException && aksama.name === "AbortError") {
          return;
        }
        setYuk({
          anahtar,
          slotlar: [],
          saatDilimi: isletme.saatDilimi,
          hata: "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
        });
      }
    })();

    return () => kontrol.abort();
  }, [
    adim,
    anahtar,
    hizmetId,
    personelId,
    tarihAnahtari,
    isletme.slug,
    isletme.saatDilimi,
  ]);

  function hizmetiSec(secilen: HizmetOzeti) {
    setHizmet(secilen);
    // Hizmet degisince personel ve saat DUSUYOR: eski personel yeni hizmeti
    // vermiyor olabilir, eski saat de yeni surede bitmiyor olabilir.
    setPersonelId(null);
    setSlot(null);
    setZamanUyarisi(null);
    setGonderimHatasi(null);

    const verenler = personeller.filter((p) =>
      secilen.personelIdler.includes(p.id),
    );
    setAdim(verenler.length > 1 ? "personel" : "zaman");
  }

  function personeliSec(id: string | null) {
    setPersonelId(id);
    setSlot(null);
    setZamanUyarisi(null);
    setAdim("zaman");
  }

  async function randevuyuGonder(bilgiler: MusteriBilgileri) {
    // Cift gonderim engeli. Dugme de kilitli ama klavyeyle iki kez "enter"
    // basmak ayni anda iki istek acabiliyordu.
    if (gonderiliyor || !hizmet || !slot) return;

    setGonderiliyor(true);
    setGonderimHatasi(null);

    try {
      const yanit = await fetch("/api/randevu", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          isletme: isletme.slug,
          hizmetId: hizmet.id,
          // "Farketmez"de personel GONDERILMIYOR. Slotun personeli o arada
          // dolmus olsa bile sunucu ayni saatte bos olan baskasini secebilir;
          // id'yi gondermek musteriye gereksiz bir 409 verirdi.
          personelId: personelId ?? undefined,
          baslangic: slot.baslangic,
          ad: bilgiler.ad,
          telefon: bilgiler.telefon,
          eposta: bilgiler.eposta || undefined,
          not: bilgiler.not || undefined,
        }),
      });

      const cevap = (await yanit.json().catch(() => null)) as {
        randevu?: AlinanRandevu;
        iptalYolu?: string;
        hata?: string;
      } | null;

      if (yanit.status === 409) {
        // Yaris kaybedildi (DEGISMEZ 8: garanti veritabaninda). Musteri
        // BASTAN BASLAMIYOR: hizmet ve personel secimi duruyor, yalnizca saat
        // adimina donup liste tazeleniyor.
        //
        // Mesaj sunucunun degil bizim: ne oldugunu soylemek yetmiyor, ne
        // yapilacagini da soylemek gerekiyor ve o cumle arayuze ait.
        setSlot(null);
        setTazeleme((n) => n + 1);
        setZamanUyarisi(
          "Bu saat az önce alındı. Listeyi tazeledik, aşağıdan başka bir saat seçin.",
        );
        setAdim("zaman");
        return;
      }

      if (!yanit.ok || !cevap?.randevu || !cevap.iptalYolu) {
        // 429 dahil butun hatalar: sunucunun mesaji OLDUGU GIBI gosteriliyor.
        // Hiz siniri mesaji ne kadar beklenecegini soyluyor ve onu burada
        // yeniden yazmak bilgiyi kaybetmek olurdu.
        setGonderimHatasi(
          cevap?.hata ?? "Randevu oluşturulamadı. Biraz sonra tekrar deneyin.",
        );
        return;
      }

      setSonuc({ randevu: cevap.randevu, iptalYolu: cevap.iptalYolu });
      setAdim("onay");
    } catch {
      setGonderimHatasi(
        "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
      );
    } finally {
      setGonderiliyor(false);
    }
  }

  function yenidenBasla() {
    setSonuc(null);
    setHizmet(null);
    setPersonelId(null);
    setTarih(bugun);
    setSlot(null);
    setZamanUyarisi(null);
    setGonderimHatasi(null);
    // Liste de tazeleniyor: ayni hizmet ve gunle devam eden musteri, az once
    // KENDI aldigi saati hala bos gorurdu.
    setTazeleme((n) => n + 1);
    setAdim("hizmet");
  }

  // Gostergedeki adim sayisi: hizmet secilmeden once isletmenin tamamina,
  // sonra secilen hizmeti verenlere bakiyor.
  const gostergedePersonel = hizmet ? personelAdimiVar : personeller.length > 1;
  const adimlar: AdimTanimi[] = [
    { anahtar: "hizmet", etiket: "Hizmet" },
    ...(gostergedePersonel
      ? [{ anahtar: "personel", etiket: "Personel" }]
      : []),
    { anahtar: "zaman", etiket: "Gün ve saat" },
    { anahtar: "bilgiler", etiket: "Bilgiler" },
  ];

  const seciliPersonelAdi = personelId
    ? (personeller.find((p) => p.id === personelId)?.ad ?? "Farketmez")
    : "Farketmez";

  return (
    <div className="space-y-6">
      {adim !== "onay" ? (
        <AdimGostergesi adimlar={adimlar} mevcut={adim} />
      ) : null}

      {adim === "hizmet" ? (
        <HizmetSecimi
          hizmetler={hizmetler}
          secili={hizmet}
          onSec={hizmetiSec}
        />
      ) : null}

      {adim === "personel" ? (
        <PersonelSecimi
          personeller={uygunPersoneller}
          secili={personelId}
          onSec={personeliSec}
          onGeri={() => setAdim("hizmet")}
        />
      ) : null}

      {adim === "zaman" && hizmet ? (
        <ZamanSecimi
          bugun={bugun}
          tarih={tarih}
          maksIleriGun={isletme.maksIleriGun}
          slotlar={slotlar}
          seciliSlot={slot}
          saatDilimi={saatDilimi}
          durum={slotDurumu}
          hata={slotHatasi}
          uyari={zamanUyarisi}
          geriEtiketi={personelAdimiVar ? "Personeli değiştir" : "Hizmeti değiştir"}
          onTarihSec={(yeni) => {
            setTarih(yeni);
            setZamanUyarisi(null);
          }}
          onSlotSec={setSlot}
          onYenile={() => setTazeleme((n) => n + 1)}
          onGeri={() => {
            setZamanUyarisi(null);
            setAdim(personelAdimiVar ? "personel" : "hizmet");
          }}
          onDevam={() => setAdim("bilgiler")}
        />
      ) : null}

      {adim === "bilgiler" && hizmet && slot ? (
        <BilgiFormu
          ozet={{
            hizmetAd: hizmet.ad,
            hizmetBilgisi: hizmetBilgisi(hizmet),
            // Randevu olusmadan once personel BELLI DEGIL: "farketmez" diyen
            // musteriye bir isim yazmak, tutmayabilecegimiz bir soz olurdu.
            // Gercek ad onay ekraninda, sunucunun yanitindan geliyor.
            personelAd: seciliPersonelAdi,
            baslangic: slot.baslangic,
            bitis: slot.bitis,
            saatDilimi,
          }}
          gonderiliyor={gonderiliyor}
          hata={gonderimHatasi}
          onGeri={() => setAdim("zaman")}
          onGonder={randevuyuGonder}
        />
      ) : null}

      {adim === "onay" && sonuc ? (
        <OnayEkrani
          randevu={sonuc.randevu}
          iptalYolu={sonuc.iptalYolu}
          saatDilimi={saatDilimi}
          onYeniden={yenidenBasla}
        />
      ) : null}
    </div>
  );
}
