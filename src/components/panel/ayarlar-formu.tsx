"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sureBicimle, telefonBicimle } from "@/lib/bicim";
import { SAAT_DILIMLERI, SLOT_ARALIKLARI } from "@/lib/ayar-girdi";

export type AyarKaydi = {
  ad: string;
  slug: string;
  telefon: string | null;
  adres: string | null;
  hakkinda: string | null;
  saatDilimi: string;
  slotAraligiDk: number;
  minOnceBildirimDk: number;
  maksIleriGun: number;
  otomatikOnay: boolean;
  gelmediKisitiGun: number;
};

// Ayarlar formu. Sunucudan gelen degerler `defaultValue` ile veriliyor, yani
// bilesen "kontrolsuz": her tusa basista React durumu guncellemek bu ekranda
// hicbir sey kazandirmaz ve her alan icin bir useState demektir.

export function AyarlarFormu({ ayarlar }: { ayarlar: AyarKaydi }) {
  const router = useRouter();
  const [hata, setHata] = useState<string | null>(null);
  const [kaydedildi, setKaydedildi] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  async function gonder(olay: React.FormEvent<HTMLFormElement>) {
    olay.preventDefault();
    if (gonderiliyor) return;

    const veri = new FormData(olay.currentTarget);
    setGonderiliyor(true);
    setHata(null);
    setKaydedildi(false);

    const govde = {
      ad: veri.get("ad"),
      telefon: veri.get("telefon"),
      adres: veri.get("adres"),
      hakkinda: veri.get("hakkinda"),
      saatDilimi: veri.get("saatDilimi"),
      slotAraligiDk: veri.get("slotAraligiDk"),
      minOnceBildirimDk: veri.get("minOnceBildirimDk"),
      maksIleriGun: veri.get("maksIleriGun"),
      gelmediKisitiGun: veri.get("gelmediKisitiGun"),
      // Isaretli degilse FormData alani hic tasimiyor.
      otomatikOnay: veri.get("otomatikOnay") === "on",
    };

    try {
      const yanit = await fetch("/api/ayarlar", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(govde),
      });

      if (!yanit.ok) {
        const cevap = (await yanit.json().catch(() => null)) as { hata?: string } | null;
        setHata(cevap?.hata ?? "Kaydedilemedi. Sayfayı yenileyip yeniden deneyin.");
        setGonderiliyor(false);
        return;
      }
    } catch {
      setHata("Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.");
      setGonderiliyor(false);
      return;
    }

    setGonderiliyor(false);
    setKaydedildi(true);
    router.refresh();
  }

  return (
    <form onSubmit={gonder} className="space-y-8" noValidate>
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Ayarlar</h1>
        <p className="text-sm text-muted-foreground">
          İşletme bilgileriniz ve randevu kuralları.
        </p>
      </div>

      {hata ? <HataKutusu mesaj={hata} /> : null}

      <section className="space-y-4">
        <h2 className="font-heading text-lg font-semibold">İşletme bilgileri</h2>

        <div className="space-y-2">
          <Label htmlFor="ad">İşletme adı</Label>
          <Input
            id="ad"
            name="ad"
            defaultValue={ayarlar.ad}
            required
            disabled={gonderiliyor}
            className="h-10"
          />
          <p className="text-xs text-muted-foreground">
            Randevu sayfanızın adresi değişmez: randevu.enesmemduhoglu.tech/r/
            {ayarlar.slug}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="telefon">Telefon</Label>
          <Input
            id="telefon"
            name="telefon"
            inputMode="tel"
            placeholder="0532 123 45 67"
            // Veritabaninda yalnizca rakam duruyor; kullaniciya okunur
            // bicimde gosteriliyor. Sunucu geri gelen degeri yine rakama
            // indirgiyor, yani gidis-donus guvenli.
            defaultValue={telefonBicimle(ayarlar.telefon)}
            disabled={gonderiliyor}
            className="h-10"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="adres">Adres</Label>
          <Input
            id="adres"
            name="adres"
            defaultValue={ayarlar.adres ?? ""}
            disabled={gonderiliyor}
            className="h-10"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hakkinda">Hakkında</Label>
          <textarea
            id="hakkinda"
            name="hakkinda"
            rows={3}
            defaultValue={ayarlar.hakkinda ?? ""}
            disabled={gonderiliyor}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
          />
          <p className="text-xs text-muted-foreground">
            Randevu sayfanızda müşterilerinize görünür.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-lg font-semibold">Randevu kuralları</h2>

        <div className="space-y-2">
          <Label htmlFor="saatDilimi">Saat dilimi</Label>
          <select
            id="saatDilimi"
            name="saatDilimi"
            defaultValue={ayarlar.saatDilimi}
            disabled={gonderiliyor}
            className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
          >
            {SAAT_DILIMLERI.map((s) => (
              <option key={s.deger} value={s.deger}>
                {s.ad}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Bütün saatler bu dilime göre gösterilir.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="slotAraligiDk">Randevu aralığı</Label>
          <select
            id="slotAraligiDk"
            name="slotAraligiDk"
            defaultValue={ayarlar.slotAraligiDk}
            disabled={gonderiliyor}
            className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
          >
            {SLOT_ARALIKLARI.map((dk) => (
              <option key={dk} value={dk}>
                {sureBicimle(dk)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Randevular bu aralıklarla başlar — 15 dk seçilirse 09:00, 09:15,
            09:30 gibi.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="minOnceBildirimDk">En erken randevu (dakika)</Label>
          <Input
            id="minOnceBildirimDk"
            name="minOnceBildirimDk"
            inputMode="numeric"
            defaultValue={ayarlar.minOnceBildirimDk}
            disabled={gonderiliyor}
            className="h-10"
          />
          <p className="text-xs text-muted-foreground">
            Şu andan en az bu kadar sonrasına randevu alınabilir. 0 yazarsanız
            sınır yok.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="maksIleriGun">Takvim penceresi (gün)</Label>
          <Input
            id="maksIleriGun"
            name="maksIleriGun"
            inputMode="numeric"
            defaultValue={ayarlar.maksIleriGun}
            disabled={gonderiliyor}
            className="h-10"
          />
          <p className="text-xs text-muted-foreground">
            Müşteriler en fazla bu kadar gün sonrasına randevu alabilir.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gelmediKisitiGun">Gelmedi kısıtı (gün)</Label>
          <Input
            id="gelmediKisitiGun"
            name="gelmediKisitiGun"
            inputMode="numeric"
            defaultValue={ayarlar.gelmediKisitiGun}
            disabled={gonderiliyor}
            className="h-10"
          />
          <p className="text-xs text-muted-foreground">
            Randevusuna gelmediğini işaretlediğiniz müşteri bu kadar gün
            boyunca sizden yeni randevu alamaz. 0 yazarsanız kısıt uygulanmaz.
          </p>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-border px-4 py-3">
          <input
            type="checkbox"
            name="otomatikOnay"
            defaultChecked={ayarlar.otomatikOnay}
            disabled={gonderiliyor}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium">Randevuları otomatik onayla</span>
            <span className="block text-sm text-muted-foreground">
              Kapalıysa her randevu önce onayınızı bekler.
            </span>
          </span>
        </label>
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" className="h-10" disabled={gonderiliyor}>
          {gonderiliyor ? "Kaydediliyor…" : "Kaydet"}
        </Button>
        {kaydedildi ? (
          <span role="status" className="text-sm text-durum-onayli">
            Ayarlar kaydedildi
          </span>
        ) : null}
      </div>
    </form>
  );
}
