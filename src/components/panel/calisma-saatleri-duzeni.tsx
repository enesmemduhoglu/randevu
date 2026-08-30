"use client";

import { CopyIcon, PlusIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { gunAdi, HAFTA_SIRASI, saatBicimle, saatiDakikayaCevir } from "@/lib/bicim";

// Haftalik calisma duzeni editoru.
//
// Veri modeli ekranda oldugu gibi duruyor: gun -> araliklar. Ogle arasi ayri
// bir kavram DEGIL, ikinci bir aralik - sema da boyle. Arayuzu semadan farkli
// kurmak (ornegin "ara baslangic/bitis" alanlari), ucuncu bir ara gerektiginde
// hem arayuzu hem donusumu yeniden yazdirirdi.

export type PersonelSecenegi = { id: string; ad: string };

export type Aralik = { baslangicDk: number; bitisDk: number };
export type HaftalikDuzen = Record<number, Aralik[]>;

const VARSAYILAN: Aralik = { baslangicDk: 540, bitisDk: 1080 }; // 09:00-18:00

function bosHafta(): HaftalikDuzen {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

type Props = {
  personeller: PersonelSecenegi[];
  seciliPersonelId: string;
  baslangicDuzeni: HaftalikDuzen;
};

export function CalismaSaatleriDuzeni({
  personeller,
  seciliPersonelId,
  baslangicDuzeni,
}: Props) {
  const router = useRouter();
  const [duzen, setDuzen] = useState<HaftalikDuzen>({
    ...bosHafta(),
    ...baslangicDuzeni,
  });
  const [hata, setHata] = useState<string | null>(null);
  const [kaydedildi, setKaydedildi] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  function gunuDegistir(gun: number, araliklar: Aralik[]) {
    setDuzen((onceki) => ({ ...onceki, [gun]: araliklar }));
    setKaydedildi(false);
  }

  function gunuAc(gun: number) {
    gunuDegistir(gun, [{ ...VARSAYILAN }]);
  }

  function gunuKapat(gun: number) {
    gunuDegistir(gun, []);
  }

  /// Ilk dolu gunu butun haftaya kopyalar. Cogu isletmede hafta ici ayni
  /// saatler; yedi gunu tek tek doldurmak bu ekranin en yorucu kismiydi.
  function haftayaKopyala(kaynakGun: number) {
    const kaynak = duzen[kaynakGun] ?? [];
    setDuzen((onceki) => {
      const yeni = { ...onceki };
      for (const gun of HAFTA_SIRASI) {
        // Kapali gunler kapali KALIYOR: pazar tatilini bozmak, kolaylik degil
        // surpriz olurdu.
        if ((onceki[gun] ?? []).length > 0 || gun === kaynakGun) {
          yeni[gun] = kaynak.map((a) => ({ ...a }));
        }
      }
      return yeni;
    });
    setKaydedildi(false);
  }

  async function kaydet() {
    if (gonderiliyor) return;
    setGonderiliyor(true);
    setHata(null);

    const araliklar = HAFTA_SIRASI.flatMap((gun) =>
      (duzen[gun] ?? []).map((a) => ({
        haftaninGunu: gun,
        baslangicDk: a.baslangicDk,
        bitisDk: a.bitisDk,
      })),
    );

    try {
      const yanit = await fetch(
        `/api/personel/${seciliPersonelId}/calisma-saatleri`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ araliklar }),
        },
      );

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
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Çalışma saatleri
        </h1>
        <p className="text-sm text-muted-foreground">
          Müşteriler yalnızca bu saatler içinde randevu alabilir. Öğle arası için
          aynı güne iki aralık ekleyin.
        </p>
      </div>

      {personeller.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {personeller.map((p) => (
            <Button
              key={p.id}
              variant={p.id === seciliPersonelId ? "default" : "outline"}
              size="sm"
              onClick={() => router.push(`/panel/calisma-saatleri?personel=${p.id}`)}
            >
              {p.ad}
            </Button>
          ))}
        </div>
      ) : null}

      {hata ? <HataKutusu mesaj={hata} /> : null}

      <ul className="space-y-2">
        {HAFTA_SIRASI.map((gun) => {
          const araliklar = duzen[gun] ?? [];
          const acik = araliklar.length > 0;

          return (
            <li key={gun} className="rounded-lg border border-border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{gunAdi(gun)}</span>

                {acik ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => haftayaKopyala(gun)}
                    >
                      <CopyIcon aria-hidden="true" />
                      Haftaya uygula
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => gunuKapat(gun)}>
                      Kapalı yap
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => gunuAc(gun)}>
                    Açık yap
                  </Button>
                )}
              </div>

              {acik ? (
                <div className="mt-3 space-y-2">
                  {araliklar.map((aralik, sira) => (
                    <div key={sira} className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <Label
                          htmlFor={`bas-${gun}-${sira}`}
                          className="text-xs text-muted-foreground"
                        >
                          Başlangıç
                        </Label>
                        <SaatAlani
                          id={`bas-${gun}-${sira}`}
                          dakika={aralik.baslangicDk}
                          onDegis={(dk) =>
                            gunuDegistir(
                              gun,
                              araliklar.map((a, i) =>
                                i === sira ? { ...a, baslangicDk: dk } : a,
                              ),
                            )
                          }
                        />
                      </div>

                      <div className="space-y-1">
                        <Label
                          htmlFor={`bit-${gun}-${sira}`}
                          className="text-xs text-muted-foreground"
                        >
                          Bitiş
                        </Label>
                        <SaatAlani
                          id={`bit-${gun}-${sira}`}
                          dakika={aralik.bitisDk}
                          onDegis={(dk) =>
                            gunuDegistir(
                              gun,
                              araliklar.map((a, i) =>
                                i === sira ? { ...a, bitisDk: dk } : a,
                              ),
                            )
                          }
                        />
                      </div>

                      {araliklar.length > 1 ? (
                        <Button
                          variant="ghost"
                          size="icon-lg"
                          aria-label={`${gunAdi(gun)} ${sira + 1}. aralığı kaldır`}
                          onClick={() =>
                            gunuDegistir(
                              gun,
                              araliklar.filter((_, i) => i !== sira),
                            )
                          }
                        >
                          <XIcon aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                  ))}

                  {araliklar.length < 4 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const son = araliklar[araliklar.length - 1];
                        gunuDegistir(gun, [
                          ...araliklar,
                          {
                            // Yeni aralik oncekinin bitisinden bir saat sonra
                            // basliyor: cakisma uretmeyen makul bir tahmin.
                            baslangicDk: Math.min(son.bitisDk + 60, 1380),
                            bitisDk: Math.min(son.bitisDk + 240, 1440),
                          },
                        ]);
                      }}
                    >
                      <PlusIcon aria-hidden="true" />
                      Aralık ekle
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-3">
        <Button className="h-10" onClick={kaydet} disabled={gonderiliyor}>
          {gonderiliyor ? "Kaydediliyor…" : "Kaydet"}
        </Button>
        {kaydedildi ? (
          <span role="status" className="text-sm text-durum-onayli">
            Çalışma saatleri kaydedildi
          </span>
        ) : null}
      </div>
    </div>
  );
}

/// Saat alani. `type="time"` kullaniliyor: mobilde yerel saat secici aciliyor
/// ve bicimi tarayici garanti ediyor. Deger "HH:MM" olarak geliyor, dakikaya
/// cevirme bicim.ts'te - iki yerde iki farkli ayristirma olmasin.
function SaatAlani({
  id,
  dakika,
  onDegis,
}: {
  id: string;
  dakika: number;
  onDegis: (dakika: number) => void;
}) {
  return (
    <Input
      id={id}
      type="time"
      className="h-10 w-32"
      // 24:00 HTML time alaninda gecersiz; gece yarisi kapanisi 23:59 olarak
      // gosteriliyor. Veritabani 1440'i kabul ediyor, yalnizca bu alan
      // gosteremiyor.
      value={saatBicimle(Math.min(dakika, 1439))}
      onChange={(olay) => {
        const cevrilen = saatiDakikayaCevir(olay.target.value);
        if (cevrilen !== null) onDegis(cevrilen);
      }}
    />
  );
}
