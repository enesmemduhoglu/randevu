import { CalendarX2Icon } from "lucide-react";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { uretimMi } from "@/lib/mod";

// Bilesen vitrini: Faz C'nin gozle dogrulanabilir ciktisi. Token'lar, tipografi
// ve bilesen durumlari tek sayfada duruyor ki bir sey bozuldugunda burada
// gorulsun. Halka acik bir sayfa degil, gelistirici araci: Faz D'de panel
// gelince /vitrin'den /panel/gelistirici/vitrin altina tasindi.
//
// URETIMDE KAPALI (Faz P). Sizinti degildi - oturum arkasindaydi ve kiraci
// verisi gostermiyordu - ama gercek bir salon sahibi panelinde "Geliştirici"
// diye bir bolum ve bir bilesen vitrini goruyordu. Silmek yerine kapatmak
// secildi: vitrin tasarim degisikliginde hala tek bakista dogrulama araci.
//
// Kapi `notFound()`, `redirect()` DEGIL: yonlendirme "burada bir sey var ama
// sana degil" der, oysa uretimde bu sayfa yok. Ayni sebeple menude de
// cizilmiyor (gezinme.tsx > yalnizcaYerel).

function Bolum({
  baslik,
  aciklama,
  children,
}: {
  baslik: string;
  aciklama?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-heading text-xl font-semibold">{baslik}</h2>
        {aciklama ? (
          <p className="text-sm text-muted-foreground">{aciklama}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Numune({ ad, sinif }: { ad: string; sinif: string }) {
  return (
    <div className="space-y-1.5">
      <div className={`h-12 rounded-md border border-border ${sinif}`} />
      <p className="font-mono text-[11px] text-muted-foreground">{ad}</p>
    </div>
  );
}

const DURUMLAR = [
  { ad: "Bekliyor", metin: "text-durum-bekliyor", zemin: "bg-durum-bekliyor-zemin" },
  { ad: "Onaylı", metin: "text-durum-onayli", zemin: "bg-durum-onayli-zemin" },
  {
    ad: "Tamamlandı",
    metin: "text-durum-tamamlandi",
    zemin: "bg-durum-tamamlandi-zemin",
  },
  { ad: "İptal", metin: "text-durum-iptal", zemin: "bg-durum-iptal-zemin" },
  { ad: "Gelmedi", metin: "text-durum-gelmedi", zemin: "bg-durum-gelmedi-zemin" },
];

const SAATLER = [
  { saat: "09:00", durum: "bos" },
  { saat: "09:30", durum: "dolu" },
  { saat: "10:00", durum: "bos" },
  { saat: "10:30", durum: "secili" },
  { saat: "11:00", durum: "bos" },
  { saat: "11:30", durum: "dolu" },
  { saat: "12:00", durum: "dolu" },
  { saat: "12:30", durum: "bos" },
] as const;

export default function VitrinSayfasi() {
  if (uretimMi()) notFound();

  return (
    <div className="w-full max-w-3xl">
      {/* Kendi basligi ve tema dugmesi yok: sayfa artik panel kabugunun
          icinde aciliyor ve ikisi de orada duruyor. */}
      <div className="space-y-12">
        <Bolum
          baslik="Tipografi"
          aciklama="Başlıklarda Fraunces, metinde Inter. Türkçe karakterler latin-ext subset'inden geliyor."
        >
          <div className="space-y-3">
            <p className="font-heading text-4xl font-bold tracking-tight">
              Çağdaş güzellik salonu
            </p>
            <p className="font-heading text-2xl font-semibold">
              Işıl Şıklaroğlu — Öğleden sonra
            </p>
            <p className="text-base leading-relaxed">
              Müşterileriniz randevu sayfanıza girip uygun saatleri görüyor ve
              hesap açmadan randevu alıyor. Siz de gelen randevuları tek
              takvimden yönetiyorsunuz.
            </p>
            <p className="text-sm text-muted-foreground">
              İkincil metin — ğ ı ş İ Ç Ö Ü karakterleri yedek fonta düşmemeli.
            </p>
          </div>
        </Bolum>

        <Separator />

        <Bolum
          baslik="Semantic renkler"
          aciklama="Bileşenler yalnızca bu katmanı kullanır; primitive'e hiç dokunmaz."
        >
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            <Numune ad="background" sinif="bg-background" />
            <Numune ad="card" sinif="bg-card" />
            <Numune ad="muted" sinif="bg-muted" />
            <Numune ad="accent" sinif="bg-accent" />
            <Numune ad="border" sinif="bg-border" />
            <Numune ad="primary" sinif="bg-primary" />
            <Numune ad="secondary" sinif="bg-secondary" />
            <Numune ad="destructive" sinif="bg-destructive" />
            <Numune ad="ring" sinif="bg-ring" />
            <Numune ad="foreground" sinif="bg-foreground" />
          </div>
        </Bolum>

        <Bolum
          baslik="Randevu durumları"
          aciklama="İptal bilerek kırmızı değil — iptal bir hata değil, normal bir sonuç. Kırmızı yalnızca müşterinin gelmediği durum için."
        >
          <div className="flex flex-wrap gap-2">
            {DURUMLAR.map((d) => (
              <span
                key={d.ad}
                className={`inline-flex items-center rounded-md px-2.5 py-1 text-sm font-medium ${d.zemin} ${d.metin}`}
              >
                {d.ad}
              </span>
            ))}
          </div>
        </Bolum>

        <Separator />

        <Bolum
          baslik="Saat seçici"
          aciklama="Ürünün en kritik bileşeni. Dokunma hedefi en az 44px, aralarında en az 8px boşluk. Dolu saatler tıklanamaz ve bunu renkle değil, devre dışı olmalarıyla da söyler."
        >
          <div className="grid grid-cols-4 gap-2">
            {SAATLER.map((s) => {
              const ortak =
                "flex items-center justify-center rounded-md border text-sm font-medium transition-colors";
              const stil =
                s.durum === "secili"
                  ? "bg-saat-secili-zemin text-saat-secili-metin border-transparent"
                  : s.durum === "dolu"
                    ? "bg-saat-dolu-zemin text-saat-dolu-metin border-transparent cursor-not-allowed line-through"
                    : "bg-saat-bos-zemin text-saat-bos-metin border-saat-bos-kenar hover:border-primary";
              return (
                <button
                  key={s.saat}
                  type="button"
                  disabled={s.durum === "dolu"}
                  aria-pressed={s.durum === "secili"}
                  className={`${ortak} ${stil} min-h-saat focus-visible:ring-ring/60 focus-visible:outline-none focus-visible:ring-2`}
                >
                  {s.saat}
                </button>
              );
            })}
          </div>
        </Bolum>

        <Bolum baslik="Düğmeler">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Randevu al</Button>
            <Button variant="secondary">Vazgeç</Button>
            <Button variant="outline">Personel ekle</Button>
            <Button variant="ghost">Detay</Button>
            <Button variant="destructive">İptal et</Button>
            <Button disabled>Kaydet</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Küçük</Button>
            <Button size="default">Normal</Button>
            <Button size="lg">Büyük</Button>
          </div>
        </Bolum>

        <Bolum
          baslik="Form"
          aciklama="Etiket her zaman görünür; yer tutucu etiketin yerini almaz."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ad">Ad soyad</Label>
              <Input id="ad" placeholder="Ayşe Yılmaz" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefon">Telefon</Label>
              <Input id="telefon" inputMode="tel" placeholder="0532 123 45 67" />
              <p className="text-xs text-muted-foreground">
                İşletme size bu numaradan ulaşacak.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hatali">E-posta</Label>
              <Input id="hatali" aria-invalid defaultValue="ayse@" />
              <p className="text-destructive text-xs">
                E-posta adresi eksik görünüyor — ayse@ornek.com gibi olmalı
              </p>
            </div>
          </div>
        </Bolum>

        <Separator />

        <Bolum baslik="Kart ve rozet">
          <Card>
            <CardHeader>
              <CardTitle>Saç kesimi</CardTitle>
              <CardDescription>45 dk · 350 ₺</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <Badge>Aktif</Badge>
              <Badge variant="secondary">2 personel</Badge>
              <Badge variant="outline">Öne çıkan</Badge>
            </CardContent>
          </Card>
        </Bolum>

        <Bolum
          baslik="Boş durum"
          aciklama="İki parça: neyin olmadığı ve tek bir eylem. Espri ve suçlama yok."
        >
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
            <CalendarX2Icon
              className="text-muted-foreground size-8"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="font-medium">Bugün randevu yok</p>
              <p className="text-sm text-muted-foreground">
                Müşterileriniz randevu sayfanızdan saat seçtiğinde burada
                görünecek.
              </p>
            </div>
            <Button variant="outline" size="sm">
              Randevu ekle
            </Button>
          </div>
        </Bolum>

        <Bolum
          baslik="Yükleniyor"
          aciklama="Yer baştan ayrılır; içerik gelince sayfa zıplamaz."
        >
          <div className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </Bolum>
      </div>
    </div>
  );
}
