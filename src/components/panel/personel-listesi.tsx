"use client";

import { PencilIcon, PlusIcon, UserMinusIcon, UsersIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Personel listesi, formu ve hizmet eslemesi. Uc parca tek dosyada cunku
// ucu de ayni durumu (secili personel) paylasiyor ve ayirmak, durumu bir
// ust bilesende tutup uc yere prop gecirmek demekti.

export type PersonelKaydi = {
  id: string;
  ad: string;
  unvan: string | null;
  sira: number;
  hizmetIdler: string[];
};

export type HizmetSecenegi = { id: string; ad: string };

type Props = {
  personeller: PersonelKaydi[];
  hizmetler: HizmetSecenegi[];
};

export function PersonelListesi({ personeller, hizmetler }: Props) {
  const router = useRouter();
  const [formAcik, setFormAcik] = useState(false);
  const [duzenlenen, setDuzenlenen] = useState<PersonelKaydi | null>(null);
  const [kaldirilacak, setKaldirilacak] = useState<PersonelKaydi | null>(null);
  const [hizmetleriSecilen, setHizmetleriSecilen] = useState<PersonelKaydi | null>(
    null,
  );
  const [islemde, setIslemde] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function kaldir() {
    if (!kaldirilacak || islemde) return;
    setIslemde(true);
    setHata(null);

    const sonuc = await istek(`/api/personel/${kaldirilacak.id}`, "DELETE");
    setIslemde(false);

    if (!sonuc.tamam) {
      // "Son personel" 409'u da buraya dusuyor; mesaji sunucu yaziyor ve ne
      // yapilacagini soyluyor.
      setHata(sonuc.hata);
      setKaldirilacak(null);
      return;
    }

    router.refresh();
    setKaldirilacak(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Personel
          </h1>
          <p className="text-sm text-muted-foreground">
            Randevular bir personele bağlanır. Tek kişilik işletmede müşteri
            personel seçimi görmez.
          </p>
        </div>

        <Button
          className="h-10 shrink-0"
          onClick={() => {
            setDuzenlenen(null);
            setFormAcik(true);
          }}
        >
          <PlusIcon aria-hidden="true" />
          Personel ekle
        </Button>
      </div>

      {hata ? <HataKutusu mesaj={hata} /> : null}

      {personeller.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <UsersIcon className="size-8 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium">Henüz personel yok</p>
            <p className="text-sm text-muted-foreground">
              Randevu alınabilmesi için en az bir personel gerekiyor.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setDuzenlenen(null);
              setFormAcik(true);
            }}
          >
            Personel ekle
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {personeller.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-lg border border-border px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.ad}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {p.unvan ?? "Ünvan yok"}
                </p>
              </div>

              <Badge
                variant="secondary"
                className="hidden shrink-0 sm:inline-flex"
              >
                {p.hizmetIdler.length === 0
                  ? "Tüm hizmetler"
                  : `${p.hizmetIdler.length} hizmet`}
              </Badge>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHizmetleriSecilen(p)}
              >
                Hizmetler
              </Button>
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label={`${p.ad} bilgilerini düzenle`}
                onClick={() => {
                  setDuzenlenen(p);
                  setFormAcik(true);
                }}
              >
                <PencilIcon aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label={`${p.ad} kişisini kaldır`}
                onClick={() => setKaldirilacak(p)}
              >
                <UserMinusIcon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {formAcik ? (
        <PersonelFormu
          mevcut={duzenlenen}
          onKapat={() => setFormAcik(false)}
          onKaydedildi={() => {
            router.refresh();
            setFormAcik(false);
          }}
        />
      ) : null}

      {hizmetleriSecilen ? (
        <HizmetEslemesi
          personel={hizmetleriSecilen}
          hizmetler={hizmetler}
          onKapat={() => setHizmetleriSecilen(null)}
          onKaydedildi={() => {
            router.refresh();
            setHizmetleriSecilen(null);
          }}
        />
      ) : null}

      <Dialog
        open={Boolean(kaldirilacak)}
        onOpenChange={(a) => (a ? null : setKaldirilacak(null))}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Personel kaldırılacak</DialogTitle>
            <DialogDescription>
              {kaldirilacak?.ad} listeden kalkacak ve yeni randevularda
              seçilemeyecek. Geçmiş randevular olduğu gibi kalır.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-10"
              onClick={() => setKaldirilacak(null)}
              disabled={islemde}
            >
              Vazgeç
            </Button>
            <Button
              variant="destructive"
              className="h-10"
              onClick={kaldir}
              disabled={islemde}
            >
              {islemde ? "Kaldırılıyor…" : "Kaldır"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/// Tek bir istek yardimcisi: uc yerde de ayni hata ele alma gerekiyor.
async function istek(
  yol: string,
  metot: string,
  govde?: unknown,
): Promise<{ tamam: true } | { tamam: false; hata: string }> {
  try {
    const yanit = await fetch(yol, {
      method: metot,
      headers: { "content-type": "application/json" },
      body: govde === undefined ? undefined : JSON.stringify(govde),
    });

    if (yanit.ok) return { tamam: true };

    const cevap = (await yanit.json().catch(() => null)) as { hata?: string } | null;
    return {
      tamam: false,
      hata: cevap?.hata ?? "İşlem tamamlanamadı. Sayfayı yenileyip yeniden deneyin.",
    };
  } catch {
    return {
      tamam: false,
      hata: "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
    };
  }
}

function PersonelFormu({
  mevcut,
  onKapat,
  onKaydedildi,
}: {
  mevcut: PersonelKaydi | null;
  onKapat: () => void;
  onKaydedildi: () => void;
}) {
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const duzenleme = Boolean(mevcut);

  async function gonder(olay: React.FormEvent<HTMLFormElement>) {
    olay.preventDefault();
    if (gonderiliyor) return;

    const veri = new FormData(olay.currentTarget);
    setGonderiliyor(true);
    setHata(null);

    const sonuc = await istek(
      duzenleme ? `/api/personel/${mevcut?.id}` : "/api/personel",
      duzenleme ? "PATCH" : "POST",
      { ad: veri.get("ad"), unvan: veri.get("unvan") },
    );

    setGonderiliyor(false);
    if (!sonuc.tamam) {
      setHata(sonuc.hata);
      return;
    }
    onKaydedildi();
  }

  return (
    <Dialog open onOpenChange={(a) => (a ? null : onKapat())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{duzenleme ? "Personeli düzenle" : "Personel ekle"}</DialogTitle>
          <DialogDescription>
            Ünvan isteğe bağlı; müşteri randevu sayfasında adın altında görür.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={gonder} className="space-y-4" noValidate>
          {hata ? <HataKutusu mesaj={hata} /> : null}

          <div className="space-y-2">
            <Label htmlFor="personel-ad">Ad soyad</Label>
            <Input
              id="personel-ad"
              name="ad"
              defaultValue={mevcut?.ad ?? ""}
              autoFocus
              required
              disabled={gonderiliyor}
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="personel-unvan">Ünvan</Label>
            <Input
              id="personel-unvan"
              name="unvan"
              placeholder="Kuaför"
              defaultValue={mevcut?.unvan ?? ""}
              disabled={gonderiliyor}
              className="h-10"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={onKapat}
              disabled={gonderiliyor}
            >
              Vazgeç
            </Button>
            <Button type="submit" className="h-10" disabled={gonderiliyor}>
              {gonderiliyor ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HizmetEslemesi({
  personel,
  hizmetler,
  onKapat,
  onKaydedildi,
}: {
  personel: PersonelKaydi;
  hizmetler: HizmetSecenegi[];
  onKapat: () => void;
  onKaydedildi: () => void;
}) {
  const [secili, setSecili] = useState<string[]>(personel.hizmetIdler);
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  async function kaydet() {
    if (gonderiliyor) return;
    setGonderiliyor(true);
    setHata(null);

    const sonuc = await istek(`/api/personel/${personel.id}/hizmetler`, "PUT", {
      hizmetIdler: secili,
    });

    setGonderiliyor(false);
    if (!sonuc.tamam) {
      setHata(sonuc.hata);
      return;
    }
    onKaydedildi();
  }

  return (
    <Dialog open onOpenChange={(a) => (a ? null : onKapat())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{personel.ad} hangi hizmetleri veriyor?</DialogTitle>
          <DialogDescription>
            Hiçbiri seçili değilse tüm hizmetleri veriyor sayılır.
          </DialogDescription>
        </DialogHeader>

        {hata ? <HataKutusu mesaj={hata} /> : null}

        {hizmetler.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Önce hizmet tanımlayın; sonra burada eşleyebilirsiniz.
          </p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {hizmetler.map((h) => {
              const isaretli = secili.includes(h.id);
              return (
                <li key={h.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={isaretli}
                      disabled={gonderiliyor}
                      onChange={() =>
                        setSecili((onceki) =>
                          isaretli
                            ? onceki.filter((x) => x !== h.id)
                            : [...onceki, h.id],
                        )
                      }
                      className="size-4 accent-primary"
                    />
                    <span className="text-sm">{h.ad}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            className="h-10"
            onClick={onKapat}
            disabled={gonderiliyor}
          >
            Vazgeç
          </Button>
          <Button className="h-10" onClick={kaydet} disabled={gonderiliyor}>
            {gonderiliyor ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
