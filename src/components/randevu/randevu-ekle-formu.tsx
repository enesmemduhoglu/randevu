"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { HataKutusu } from "@/components/kimlik/hata-kutusu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Uye olmadan once alinmis bir randevuyu hesaba ekleme.
//
// NEDEN TELEFON NUMARASI SORULMUYOR: numara bugun dogrulanmis bir kimlik degil
// (SMS Faz K'de) ve numaraya bakip eslestirmek, baskasinin numarasini yazan
// birine o numaranin gecmisini acardi. Gerekcenin tamami
// `/api/randevularim/ekle` route'unun basinda.
//
// KUTUYA TOKEN DEGIL BAGLANTI ISTENIYOR. Kullanicinin elindeki sey bir link -
// e-postasinda ya da tarayici gecmisinde duruyor. Ondan 32 karakterlik son
// parcayi ayiklamasini istemek, ise yaramayan bir ev odevi olurdu. Ayiklamayi
// burada yapiyoruz; yapistirilan sey duz token ise o da calisiyor.

/// Baglantinin son yol parcasini alir. Sorgu dizesi ve cirpi (#) atiliyor:
/// e-posta istemcileri linke izleme parametresi ekleyebiliyor ve sondaki egik
/// cizgi de olagan.
///
/// DOGRULAMA YAPMIYOR - bicim kontrolu sunucuda (`iptalTokenGecerliMi`).
/// Burada ikinci bir kural yazmak, istemcinin sunucudan daha SIKI olmasi ve
/// gecerli bir linki sebepsiz reddetmesi riskini getirirdi.
function tokenAyikla(ham: string): string {
  const temiz = ham.trim().split("?")[0].split("#")[0].replace(/\/+$/, "");
  const parcalar = temiz.split("/");
  return parcalar[parcalar.length - 1] ?? "";
}

export function RandevuEkleFormu() {
  const router = useRouter();
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  async function gonder(olay: React.FormEvent<HTMLFormElement>) {
    olay.preventDefault();
    if (gonderiliyor) return;

    const form = olay.currentTarget;
    const veri = new FormData(form);
    const ham = veri.get("baglanti");
    setGonderiliyor(true);
    setHata(null);

    try {
      const yanit = await fetch("/api/randevularim/ekle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: tokenAyikla(typeof ham === "string" ? ham : ""),
        }),
      });

      if (!yanit.ok) {
        const cevap = (await yanit.json().catch(() => null)) as {
          hata?: string;
        } | null;
        setHata(
          cevap?.hata ??
            "Randevu eklenemedi. Sayfayı yenileyip yeniden deneyin.",
        );
        setGonderiliyor(false);
        return;
      }
    } catch {
      setHata(
        "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
      );
      setGonderiliyor(false);
      return;
    }

    // Kutu temizleniyor: eklenen randevu artik listede ve ayni linkin kutuda
    // durmasi, kullanicinin tekrar gondermesine davetiye olurdu.
    form.reset();
    router.refresh();
    setGonderiliyor(false);
  }

  return (
    <form onSubmit={gonder} className="space-y-3" noValidate>
      {hata ? <HataKutusu mesaj={hata} id="ekle-hatasi" /> : null}

      <div className="space-y-2">
        <Label htmlFor="baglanti">Randevu bağlantısı</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="baglanti"
            name="baglanti"
            required
            disabled={gonderiliyor}
            placeholder="https://…/randevu/…"
            aria-describedby={hata ? "ekle-hatasi" : "ekle-yardim"}
            className="h-10"
          />
          <Button
            type="submit"
            variant="secondary"
            className="h-10 shrink-0"
            disabled={gonderiliyor}
          >
            {gonderiliyor ? "Ekleniyor…" : "Ekle"}
          </Button>
        </div>
        <p id="ekle-yardim" className="text-xs text-muted-foreground">
          Randevu aldığınızda size verilen bağlantıyı yapıştırın; randevu
          listenize eklenir.
        </p>
      </div>
    </form>
  );
}
