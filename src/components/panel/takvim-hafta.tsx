"use client";

import Link from "next/link";

import {
  BosGun,
  DURUM_SINIFI,
  RandevuSatiri,
  gunlereGore,
  kayitEtiketi,
  saatiGoster,
  type TakvimKaydi,
} from "@/components/panel/takvim-gun";
import { gunKisaAdi, gunVeAy, tarihUzun } from "@/lib/bicim";
import { ayniGunMu } from "@/lib/takvim-araligi";
import { tarihMetni, type YerelTarih } from "@/lib/zaman";

// Hafta gorunumu IKI AYRI DUZEN, ayni verinin uzerinde.
//
// Masaustunde yedi sutun; telefonda gune gore gruplanmis dikey liste.
// Responsive bir izgarayla tek duzeni her ekrana sigdirmayi DENEMIYORUZ:
// 360 piksellik bir ekranda yedi sutun demek sutun basina ~48 piksel demek ve
// icine ne musteri adi ne de 44 piksellik bir dokunma hedefi siginca kalan tek
// cikis yatay kaydirma oluyor - yani isletme sahibinin haftasini gormek icin
// her seferinde saga sola surtmesi. Hedef kitle telefondan giriyor; onlarin
// duzeni ikinci sinif olmamali.
//
// Iki duzen de AYNI kayitlari cizip ayni `onSec` cagrisini yapiyor, yani
// davranis tek. Ayrisan yalnizca yerlesim.

export function TakvimHafta({
  gunler,
  bugun,
  randevular,
  saatDilimi,
  gunAdresi,
  onSec,
}: {
  gunler: YerelTarih[];
  bugun: YerelTarih;
  randevular: TakvimKaydi[];
  saatDilimi: string;
  /// Gun basligina tiklayinca gidilecek adres (gun gorunumu). Adresi ureten
  /// kod kabukta; burasi mevcut gorunumu ve personel suzgecini bilmiyor.
  gunAdresi: (tarih: YerelTarih) => string;
  onSec: (kayit: TakvimKaydi) => void;
}) {
  const kume = gunlereGore(randevular, saatDilimi);
  const gunKayitlari = (tarih: YerelTarih) => kume.get(tarihMetni(tarih)) ?? [];

  return (
    <>
      {/* MASAUSTU — yedi sutun */}
      <div className="hidden gap-2 sm:grid sm:grid-cols-7">
        {gunler.map((tarih) => {
          const kayitlar = gunKayitlari(tarih);
          const bugunMu = ayniGunMu(tarih, bugun);

          return (
            <div key={tarihMetni(tarih)} className="min-w-0 space-y-1.5">
              <Link
                href={gunAdresi(tarih)}
                aria-label={`${tarihUzun(tarih)} — gün görünümü`}
                aria-current={bugunMu ? "date" : undefined}
                className={`block rounded-md px-1.5 py-1 text-center transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                  bugunMu
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-accent"
                }`}
              >
                <span aria-hidden="true" className="block text-[11px] leading-none">
                  {gunKisaAdi(tarih)}
                </span>
                <span
                  aria-hidden="true"
                  className="block text-sm leading-tight font-semibold"
                >
                  {tarih.gun}
                </span>
              </Link>

              {kayitlar.length === 0 ? (
                <p
                  aria-hidden="true"
                  className="pt-1 text-center text-xs text-muted-foreground"
                >
                  —
                </p>
              ) : (
                <ul className="space-y-1">
                  {kayitlar.map((kayit) => (
                    <li key={kayit.id}>
                      <button
                        type="button"
                        onClick={() => onSec(kayit)}
                        aria-label={kayitEtiketi(kayit, saatDilimi)}
                        // Dar sutunda durum RENGI tasiyor: rozet yazisi
                        // sigmiyor ama kutunun kendisi zaten durumu gosteriyor.
                        // Renk tek isaret degil - ekran okuyucu ayni bilgiyi
                        // aria-label'dan aliyor.
                        className={`block min-h-saat w-full rounded-md px-1.5 py-1 text-left transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${DURUM_SINIFI[kayit.durum]}`}
                      >
                        <span className="block text-[11px] leading-tight font-semibold tabular-nums">
                          {saatiGoster(kayit.baslangic, saatDilimi)}
                        </span>
                        <span className="block truncate text-[11px] leading-tight">
                          {kayit.musteriAd}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* MOBIL — gune gore gruplanmis dikey liste */}
      <div className="space-y-5 sm:hidden">
        {gunler.map((tarih) => {
          const kayitlar = gunKayitlari(tarih);
          const bugunMu = ayniGunMu(tarih, bugun);

          return (
            <section key={tarihMetni(tarih)} className="space-y-2">
              {/* Baslik gercek bir h3: ekran okuyucu kullanicisi hafta icinde
                  basliktan basliga atlayarak gezebilsin. */}
              <h3 className="flex items-baseline gap-2 border-b border-border pb-1">
                <Link
                  href={gunAdresi(tarih)}
                  aria-label={`${tarihUzun(tarih)} — gün görünümü`}
                  aria-current={bugunMu ? "date" : undefined}
                  className="rounded-sm text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {gunKisaAdi(tarih)} · {gunVeAy(tarih)}
                </Link>
                {bugunMu ? (
                  <span className="text-xs font-medium text-primary">Bugün</span>
                ) : null}
                {kayitlar.length > 0 ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {kayitlar.length} randevu
                  </span>
                ) : null}
              </h3>

              {kayitlar.length === 0 ? (
                <BosGun kisa />
              ) : (
                <ul className="space-y-2">
                  {kayitlar.map((kayit) => (
                    <li key={kayit.id}>
                      <RandevuSatiri
                        kayit={kayit}
                        saatDilimi={saatDilimi}
                        onSec={onSec}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
