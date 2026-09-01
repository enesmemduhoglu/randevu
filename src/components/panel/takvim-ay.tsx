"use client";

import Link from "next/link";

import {
  DURUM_SINIFI,
  gunlereGore,
  saatiGoster,
  type TakvimKaydi,
} from "@/components/panel/takvim-gun";
import { gunKisaAdi, tarihUzun } from "@/lib/bicim";
import { ayniGunMu } from "@/lib/takvim-araligi";
import { tarihMetni, type YerelTarih } from "@/lib/zaman";

// Ay gorunumu: yedi sutunluk izgara, ayin disina tasan gunlerle birlikte.
//
// Hucre bir DUGME degil BAGLANTI. Ay gorunumunde bir randevunun ayrintisini
// acmak icin yer yok - hucreye sigan sey "kim, saat kacta"nin ilk iki satiri.
// Dogru eylem "o gune git", ve o bir adres degisikligi: baglanti olunca orta
// tikla yeni sekmede acilabiliyor, kopyalanabiliyor, tarayicinin geri tusu
// calisiyor.
//
// Randevu sayisi DEGIL, ilk randevularin kendisi gosteriliyor: "3 randevu"
// isletmeye gununun dolu mu bos mu oldugunu soyluyor ama saat 09:00'in mi
// 18:00'in mi dolu oldugunu soylemiyor - plan yapan kisinin sordugu soru bu.

/// Hucrede kac randevu gosterilecek. Ustu "+N" olarak toplaniyor.
///
/// Iki satir: ay izgarasinda hucre yuksekligi butun satirlari ayni tutmak
/// zorunda ve uc satirlik bir hucre, alti haftalik bir ayda izgarayi ekrandan
/// tasiriyor.
const HUCREDE_EN_COK = 2;

export function TakvimAy({
  gunler,
  odakAyi,
  bugun,
  randevular,
  saatDilimi,
  gunAdresi,
}: {
  /// Tam haftalara yuvarlanmis pencere (bkz. takvim-araligi > ayPenceresi).
  gunler: YerelTarih[];
  /// Izgaranin ODAKTAKI ayi. Bu ayin disinda kalan gunler soluk cizilecek.
  odakAyi: { yil: number; ay: number };
  bugun: YerelTarih;
  randevular: TakvimKaydi[];
  saatDilimi: string;
  gunAdresi: (tarih: YerelTarih) => string;
}) {
  const kume = gunlereGore(randevular, saatDilimi);

  // Sutun basliklari izgaranin KENDI ilk haftasindan uretiliyor, sabit bir
  // diziden degil: pencere pazartesiden basliyor ve bir gun bu karar degisirse
  // baslik ile hucreler birbirinden kaymasin.
  const sutunlar = gunler.slice(0, 7);

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {sutunlar.map((tarih) => (
          <div
            key={`baslik-${tarihMetni(tarih)}`}
            // Baslik satiri yalnizca gorsel bir kilavuz; her hucrenin
            // aria-label'i zaten tam tarihi tasiyor, ekran okuyucuya iki kez
            // okutmanin anlami yok.
            aria-hidden="true"
            className="px-1 text-center text-xs font-medium text-muted-foreground"
          >
            {gunKisaAdi(tarih)}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {gunler.map((tarih) => {
          const kayitlar = kume.get(tarihMetni(tarih)) ?? [];
          const bugunMu = ayniGunMu(tarih, bugun);
          const ayinIcinde =
            tarih.yil === odakAyi.yil && tarih.ay === odakAyi.ay;
          const artan = kayitlar.length - HUCREDE_EN_COK;

          return (
            <Link
              key={tarihMetni(tarih)}
              href={gunAdresi(tarih)}
              aria-current={bugunMu ? "date" : undefined}
              aria-label={
                kayitlar.length === 0
                  ? `${tarihUzun(tarih)}, randevu yok`
                  : `${tarihUzun(tarih)}, ${kayitlar.length} randevu`
              }
              className={`flex min-h-24 flex-col gap-1 rounded-lg border p-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                bugunMu ? "border-primary" : "border-border"
              } ${ayinIcinde ? "hover:bg-muted" : "opacity-55 hover:opacity-100"}`}
            >
              <span
                aria-hidden="true"
                className={`flex items-center justify-between gap-1 text-xs leading-none ${
                  bugunMu ? "font-bold text-primary" : "font-medium"
                }`}
              >
                {tarih.gun}
                {kayitlar.length > 0 ? (
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {kayitlar.length}
                  </span>
                ) : null}
              </span>

              <span aria-hidden="true" className="flex flex-col gap-0.5">
                {kayitlar.slice(0, HUCREDE_EN_COK).map((kayit) => (
                  <span
                    key={kayit.id}
                    className={`block truncate rounded px-1 py-0.5 text-[10px] leading-tight ${DURUM_SINIFI[kayit.durum]}`}
                  >
                    {saatiGoster(kayit.baslangic, saatDilimi)} {kayit.musteriAd}
                  </span>
                ))}
                {artan > 0 ? (
                  <span className="px-1 text-[10px] leading-tight text-muted-foreground">
                    +{artan} tane daha
                  </span>
                ) : null}
              </span>
            </Link>
          );
        })}
      </div>

      {randevular.length === 0 ? (
        <p className="pt-2 text-center text-sm text-muted-foreground">
          Bu ay hiç randevu yok. Bir güne dokunarak o günün görünümüne
          geçebilirsiniz.
        </p>
      ) : null}
    </div>
  );
}
