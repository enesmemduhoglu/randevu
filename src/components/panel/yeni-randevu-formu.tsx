"use client";

import { CalendarX2Icon, CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { paraBicimle, saatBicimle, saatiDakikayaCevir, sureBicimle } from "@/lib/bicim";
import { tarihAyristir, yerelDenUtc, yerelParcalar } from "@/lib/zaman";

// Panelden elle randevu ekleme formu (Faz H2).
//
// ZAMAN: DEGISMEZ 7 istemcide de gecerli. Isletme sahibinin tarayicisi
// isletmeyle ayni saat diliminde olmak zorunda degil - tatilde, baska sehirde
// ya da telefonun dilimi elle degistirilmis olabilir. Bu yuzden hicbir yerde
// `new Date("2026-09-05T14:00")` yok: serbest saat, isletmenin `saatDilimi`
// alaniyla `yerelDenUtc` uzerinden UTC'ye ceviriliyor.
//
// IKI SAAT MODU:
//   "musait" - motorun urettigi slotlar. Varsayilan; isletmenin cogu randevusu
//              zaten calisma saatinin icinde.
//   "serbest" - elle yazilan saat. Telefonda "yarim saat sonra geliyorum"
//              diyen musteri min bildirim suresinin disinda kaliyor ve
//              motorun listesinde hic gorunmuyor.
//
// Serbest saatte sunucu ONCE reddediyor (409 + `zorlanabilir`), form o cevabi
// bir onay adimina ceviriyor. Tek adimda yazsaydik yanlis saate dokunan bir
// tik sessizce takvime islerdi.

const SECIM_SINIFI =
  "h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30";

const ISKELET_SAYISI = 8;

type Hizmet = {
  id: string;
  ad: string;
  sureDk: number;
  fiyatKurus: number;
};

type Personel = {
  id: string;
  ad: string;
  unvan: string | null;
};

type Slot = {
  baslangic: string;
  bitis: string;
  personelId: string;
  personelAd: string;
};

type SlotDurumu = "yukleniyor" | "hazir" | "hata";

export function YeniRandevuFormu({
  saatDilimi,
  bugun,
  baslangicTarihi,
  hizmetler,
  personeller,
}: {
  saatDilimi: string;
  /// "YYYY-MM-DD". Tarih girdisinin alt siniri: gecmise randevu yazmak bir
  /// kayit tutma isi ve bu form onu kapsamiyor (bkz. TODOS, Faz H2).
  bugun: string;
  baslangicTarihi: string;
  hizmetler: Hizmet[];
  personeller: Personel[];
}) {
  const router = useRouter();

  const [hizmetId, setHizmetId] = useState(hizmetler[0]?.id ?? "");
  // Tek personelli isletmede secim diye bir sey yok; liste uzunsa isletme
  // kimin yapacagini zaten biliyor (bkz. panel-randevu-girdi.ts).
  const [personelId, setPersonelId] = useState(personeller[0]?.id ?? "");
  const [tarih, setTarih] = useState(baslangicTarihi);

  const [mod, setMod] = useState<"musait" | "serbest">("musait");
  const [seciliSlot, setSeciliSlot] = useState<string | null>(null);
  const [serbestSaat, setSerbestSaat] = useState("");

  // TEK YUK STATE'I + ANAHTAR. Randevu akisiyla ayni desen
  // (`randevu-akisi.tsx`) ve ayni iki sebeple:
  //
  //   1. YUKLENIYOR AYRI BIR STATE DEGIL. Elde tutulan yuk istenen sorguya ait
  //      degilse yukleniyoruz demektir. Ayri bir `durum` state'i tutmak,
  //      listeyi getiren kodun ilk satirinda `setDurum("yukleniyor")` demesini
  //      gerektiriyordu ve o cagri effect'ten SENKRON kosuyordu - eslint
  //      `react-hooks/set-state-in-effect` tam bunu yasakliyor.
  //   2. Bayat yanit kendiliginden duşuyor: kullanici hizmeti degistirdikten
  //      sonra gelen eski istegin anahtari tutmuyor ve ekrana yazilmiyor.
  const [yuk, setYuk] = useState<{
    anahtar: string;
    slotlar: Slot[];
    hata: boolean;
  } | null>(null);
  /// "Yeniden dene" ayni anahtarla ikinci bir istek acabilsin diye.
  const [tazeleme, setTazeleme] = useState(0);

  const [hata, setHata] = useState<string | null>(null);
  /// Sunucu "bu saat uygun degil" dedi ve kullanicinin onayini bekliyoruz.
  const [onayBekleyen, setOnayBekleyen] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const hizmet = hizmetler.find((h) => h.id === hizmetId) ?? null;

  const anahtar = `${hizmetId}|${personelId}|${tarih}|${tazeleme}`;
  const guncelYuk = yuk?.anahtar === anahtar ? yuk : null;
  const slotlar = guncelYuk?.slotlar ?? [];
  const slotDurumu: SlotDurumu = guncelYuk
    ? guncelYuk.hata
      ? "hata"
      : "hazir"
    : "yukleniyor";

  useEffect(() => {
    if (!hizmetId || !personelId || !tarih) return;

    const kontrol = new AbortController();

    void (async () => {
      const parametreler = new URLSearchParams({
        hizmet: hizmetId,
        personel: personelId,
        tarih,
      });

      try {
        const yanit = await fetch(
          `/api/randevular/musaitlik?${parametreler.toString()}`,
          {
            signal: kontrol.signal,
            cache: "no-store",
            headers: { accept: "application/json" },
          },
        );

        const cevap = (await yanit.json().catch(() => null)) as {
          slotlar?: Slot[];
        } | null;

        setYuk({
          anahtar,
          slotlar: yanit.ok ? (cevap?.slotlar ?? []) : [],
          hata: !yanit.ok,
        });
      } catch (aksama) {
        // Iptal edilen istek hata DEGIL: kullanici secimi degistirdi, yeni
        // istek zaten yolda.
        if (aksama instanceof DOMException && aksama.name === "AbortError") {
          return;
        }
        setYuk({ anahtar, slotlar: [], hata: true });
      }
    })();

    return () => kontrol.abort();
  }, [anahtar, hizmetId, personelId, tarih]);

  /// Hizmet, personel ya da tarih degisince SECILI SAAT DUSUYOR.
  ///
  /// Effect'te degil burada: secili saati effect'te sifirlamak, listeyi
  /// getiren istekle ayni turda ikinci bir cizim tetikliyordu (eslint
  /// react-hooks/set-state-in-effect). Ustelik dogru yer de burasi - saati
  /// gecersiz kilan sey verinin gelmesi degil, KULLANICININ secim
  /// degistirmesi. 10:00 bir hizmette bos, otekinde dolu olabiliyor; secili
  /// kalsaydi kullanici gormeden yanlis saati gonderirdi.
  function secimiTazele(uygula: () => void) {
    uygula();
    setSeciliSlot(null);
    setOnayBekleyen(false);
    // Eski liste ayrica dusurulmuyor: anahtar degistigi an `guncelYuk` null
    // oluyor ve ekran kendiliginden iskelete donuyor.
  }

  /// Formun gonderecegi AN - iki modda iki ayri kaynaktan.
  function secilenAn(): Date | null {
    if (mod === "musait") {
      return seciliSlot ? new Date(seciliSlot) : null;
    }

    const dakika = saatiDakikayaCevir(serbestSaat);
    const gun = tarihAyristir(tarih);
    if (dakika === null || !gun) return null;

    // DEGISMEZ 7: duvar saati isletmenin dilimiyle UTC'ye ceviriliyor,
    // tarayicininkiyle degil.
    return yerelDenUtc(saatDilimi, gun, dakika);
  }

  async function gonder(olay: React.FormEvent<HTMLFormElement>) {
    olay.preventDefault();
    if (gonderiliyor) return;

    const an = secilenAn();
    if (!an) {
      setHata(
        mod === "musait"
          ? "Bir saat seçin."
          : "Saati 14:30 biçiminde yazın.",
      );
      return;
    }

    const veri = new FormData(olay.currentTarget);
    setGonderiliyor(true);
    setHata(null);

    const govde = {
      hizmetId,
      personelId,
      baslangic: an.toISOString(),
      ad: veri.get("ad"),
      telefon: veri.get("telefon"),
      eposta: veri.get("eposta"),
      not: veri.get("not"),
      // Onay adimindan geciyorsak istisna BILINCLI.
      zorla: onayBekleyen,
    };

    try {
      const yanit = await fetch("/api/randevular", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(govde),
      });

      if (!yanit.ok) {
        const cevap = (await yanit.json().catch(() => null)) as {
          hata?: string;
          zorlanabilir?: boolean;
        } | null;

        setHata(
          cevap?.hata ?? "Randevu eklenemedi. Sayfayı yenileyip tekrar deneyin.",
        );
        // Sunucu "istersen yine de yazabilirim" dediyse dugme metni degisiyor
        // ve ikinci gonderim `zorla: true` tasiyor.
        setOnayBekleyen(cevap?.zorlanabilir === true);
        setGonderiliyor(false);
        return;
      }
    } catch {
      setHata("Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.");
      setGonderiliyor(false);
      return;
    }

    // Takvim sunucu bileseninde; yeni randevunun gorunmesi icin refresh sart.
    router.refresh();
    router.push(`/panel/takvim?tarih=${tarih}`);
  }

  if (hizmetler.length === 0 || personeller.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <CalendarX2Icon
          className="mx-auto size-8 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="mt-3 text-sm text-muted-foreground">
          Randevu yazabilmek için önce en az bir hizmet ve bir personel
          tanımlayın.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={gonder} className="space-y-6" noValidate>
      {hata ? <HataKutusu mesaj={hata} id="randevu-hatasi" /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="hizmet">Hizmet</Label>
          <select
            id="hizmet"
            value={hizmetId}
            onChange={(o) => secimiTazele(() => setHizmetId(o.target.value))}
            disabled={gonderiliyor}
            className={SECIM_SINIFI}
          >
            {hizmetler.map((h) => (
              <option key={h.id} value={h.id}>
                {h.ad} · {sureBicimle(h.sureDk)}
                {h.fiyatKurus > 0 ? ` · ${paraBicimle(h.fiyatKurus)}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="personel">Personel</Label>
          <select
            id="personel"
            value={personelId}
            onChange={(o) => secimiTazele(() => setPersonelId(o.target.value))}
            disabled={gonderiliyor}
            className={SECIM_SINIFI}
          >
            {personeller.map((p) => (
              <option key={p.id} value={p.id}>
                {p.ad}
                {p.unvan ? ` · ${p.unvan}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tarih">Tarih</Label>
        <Input
          id="tarih"
          type="date"
          value={tarih}
          min={bugun}
          onChange={(o) => secimiTazele(() => setTarih(o.target.value))}
          disabled={gonderiliyor}
          className="h-10 sm:max-w-xs"
        />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Saat</legend>

        <div className="flex gap-2" role="tablist" aria-label="Saat seçimi">
          <ModDugmesi
            secili={mod === "musait"}
            onSec={() => {
              setMod("musait");
              setOnayBekleyen(false);
            }}
          >
            Uygun saatler
          </ModDugmesi>
          <ModDugmesi
            secili={mod === "serbest"}
            onSec={() => {
              setMod("serbest");
              setSeciliSlot(null);
              setOnayBekleyen(false);
            }}
          >
            Başka saat
          </ModDugmesi>
        </div>

        {mod === "musait" ? (
          <SaatSecimi
            slotlar={slotlar}
            durum={slotDurumu}
            secili={seciliSlot}
            saatDilimi={saatDilimi}
            onSec={(iso) => {
              setSeciliSlot(iso);
              setOnayBekleyen(false);
            }}
            onYenile={() => setTazeleme((n) => n + 1)}
          />
        ) : (
          <div className="space-y-2">
            <Label htmlFor="serbest-saat" className="sr-only">
              Saat
            </Label>
            <Input
              id="serbest-saat"
              type="time"
              value={serbestSaat}
              onChange={(o) => {
                setSerbestSaat(o.target.value);
                setOnayBekleyen(false);
              }}
              disabled={gonderiliyor}
              className="h-10 sm:max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              Çalışma saatlerinizin dışında bir saat de yazabilirsiniz.
              {hizmet
                ? ` Randevu ${sureBicimle(hizmet.sureDk)} sürecek.`
                : ""}
            </p>
          </div>
        )}
      </fieldset>

      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium">Müşteri</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="telefon">Telefon</Label>
            <Input
              id="telefon"
              name="telefon"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              required
              disabled={gonderiliyor}
              className="h-10"
            />
            {/* Musteri kaydi (isletme, telefon) ile tekilleniyor: ayni numara
                ikinci kez girildiginde yeni kayit acilmiyor, mevcut musteriye
                bagalaniyor. */}
            <p className="text-xs text-muted-foreground">
              Daha önce gelmiş bir numaraysa mevcut müşteri kaydına eklenir.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ad">Ad soyad</Label>
            <Input
              id="ad"
              name="ad"
              autoComplete="off"
              required
              disabled={gonderiliyor}
              className="h-10"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="eposta">E-posta (isteğe bağlı)</Label>
          <Input
            id="eposta"
            name="eposta"
            type="email"
            autoComplete="off"
            disabled={gonderiliyor}
            className="h-10"
          />
          <p className="text-xs text-muted-foreground">
            Yazarsanız müşteriye onay ve hatırlatma e-postası gider.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="not">Not (isteğe bağlı)</Label>
          <Input
            id="not"
            name="not"
            autoComplete="off"
            disabled={gonderiliyor}
            className="h-10"
          />
        </div>
      </div>

      <Button type="submit" disabled={gonderiliyor} className="w-full sm:w-auto">
        {onayBekleyen ? "Yine de ekle" : "Randevuyu ekle"}
      </Button>
    </form>
  );
}

function ModDugmesi({
  secili,
  onSec,
  children,
}: {
  secili: boolean;
  onSec: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={secili}
      onClick={onSec}
      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        secili
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input text-muted-foreground hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}

function SaatSecimi({
  slotlar,
  durum,
  secili,
  saatDilimi,
  onSec,
  onYenile,
}: {
  slotlar: Slot[];
  durum: SlotDurumu;
  secili: string | null;
  saatDilimi: string;
  onSec: (iso: string) => void;
  onYenile: () => void;
}) {
  if (durum === "yukleniyor") {
    return (
      <div
        aria-busy="true"
        aria-label="Uygun saatler yükleniyor"
        className="grid grid-cols-3 gap-2 sm:grid-cols-6"
      >
        {Array.from({ length: ISKELET_SAYISI }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (durum === "hata") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Uygun saatler getirilemedi.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onYenile}>
          Yeniden dene
        </Button>
      </div>
    );
  }

  if (slotlar.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Bu gün için uygun saat yok. &quot;Başka saat&quot; ile elle
        yazabilirsiniz.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {slotlar.map((slot) => {
        // Saat ISLETMENIN diliminde yaziliyor (DEGISMEZ 7).
        const p = yerelParcalar(new Date(slot.baslangic), saatDilimi);
        const secildi = secili === slot.baslangic;

        return (
          <button
            key={slot.baslangic}
            type="button"
            aria-pressed={secildi}
            onClick={() => onSec(slot.baslangic)}
            className={`flex h-10 items-center justify-center gap-1 rounded-lg border text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              secildi
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input hover:bg-accent"
            }`}
          >
            {secildi ? (
              <CheckIcon className="size-3.5" aria-hidden="true" />
            ) : null}
            {saatBicimle(p.saat * 60 + p.dakika)}
          </button>
        );
      })}
    </div>
  );
}
