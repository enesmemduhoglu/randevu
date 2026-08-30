import { redirect } from "next/navigation";

import { CikisDugmesi } from "@/components/panel/cikis-dugmesi";
import { Gezinme } from "@/components/panel/gezinme";
import { HesapMenusu } from "@/components/panel/hesap-menusu";
import { MobilMenu } from "@/components/panel/mobil-menu";
import { OturumTazeleyici } from "@/components/panel/oturum-tazeleyici";
import { Logo } from "@/components/marka/logo";
import { TemaDugmesi } from "@/components/tema-dugmesi";
import { auth, authKimligi } from "@/lib/auth";
import { getScopedDb } from "@/lib/scoped-db";

// Panelin kabugu ve TEK yetki kapisi.
//
// Faz D'de bir de proxy vardi ve oturum cookie'si hic olmayani ucuzca
// ceviriyordu. Faz E'de kaldirildi (bundle maliyeti icin bkz.
// oturum-tazeleyici.tsx). Kayip yok: o kontrol zaten kesin degildi -
// cookie'nin varligi kimlik kaniti DEGIL - ve gercek karar hep buradaydi.

export default async function PanelDuzeni({ children }: LayoutProps<"/panel">) {
  const oturum = await auth();

  if (!oturum) {
    // Iki ayri durumu ayirmak sart. Supabase'de kimligi olan ama bizde
    // `kullanici` satiri olmayan kisiyi /giris'e gondermek SONSUZ DONGU
    // uretir: giris basarili olur, panel yine reddeder, giris yine basarili...
    // Donguyu kiran tek hedef tamamlama ekrani.
    const kimlik = await authKimligi();
    redirect(kimlik ? "/kayit/tamamla" : "/giris?devam=/panel");
  }

  // Musteri rolunun paneli yok (Faz J'de /randevularim geliyor). isletmeId'siz
  // bir kayit da buraya giremez: scoped-db'nin sozlesmesi duz string istiyor.
  if (oturum.rol === "MUSTERI" || !oturum.isletmeId) redirect("/");

  const db = await getScopedDb({
    kullaniciId: oturum.kullaniciId,
    authUserId: oturum.authUserId,
    isletmeId: oturum.isletmeId,
    rol: oturum.rol,
  });
  const isletme = await db.isletmeyiGetir();

  // Kayit uclusu tek transaction'da yaziliyor, yani buranin bos donmesi
  // beklenmiyor. Yine de savunmaci davraniyoruz: isletmesi silinmis bir
  // oturumla panelde cokmek yerine kok sayfaya donmek daha iyi.
  if (!isletme) redirect("/");

  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      {/* Gorunmez: erisim token'ini arka planda tazeliyor. Bu isi Faz D'de
          proxy yapiyordu; olculdu ve bundle'a 1358 KiB gzip ekliyordu. */}
      <OturumTazeleyici />

      <a
        href="#panel-icerik"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
      >
        İçeriğe geç
      </a>

      {/* Mobil ust cubuk. Masaustunde kenar cubugu ayni bilgiyi tasidigi icin
          gizleniyor. */}
      <header className="flex items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 py-2 lg:hidden">
        <MobilMenu isletmeAdi={isletme.ad} />
        <span className="min-w-0 flex-1 truncate font-heading text-base font-semibold">
          {isletme.ad}
        </span>
        <TemaDugmesi />
      </header>

      {/* sticky + h-screen: panel gun boyu acik duracak ve uzun sayfalarda
          (ayarlar, calisma saatleri) gezinme ekrandan kaymamali. Yapiskan
          olmadan kullanici menuye ulasmak icin yukari kaydirmak zorundaydi. */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3 lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div className="px-2 py-2">
          <Logo />
          <p className="mt-2 truncate text-sm text-muted-foreground">
            {isletme.ad}
          </p>
        </div>

        <div className="mt-4 flex-1">
          <Gezinme />
        </div>

        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <HesapMenusu
              ad={oturum.ad}
              eposta={oturum.eposta}
              rol={oturum.rol}
            />
          </div>
          <TemaDugmesi />
        </div>
      </aside>

      <main id="panel-icerik" className="min-w-0 flex-1 px-5 py-6 lg:px-8">
        <div className="mx-auto w-full max-w-5xl">{children}</div>

        {/* Mobilde hesap menusu kenar cubuguyla birlikte gizlendi; cekmecede de
            yok cunku cekmece gezinme icin. Cikis her ekrandan ulasilabilir
            olmali, o yuzden mobilde icerigin sonunda duruyor. */}
        <div className="mx-auto mt-10 w-full max-w-5xl border-t border-border pt-4 lg:hidden">
          <p className="mb-1 text-sm font-medium">{oturum.ad}</p>
          <p className="mb-2 text-xs text-muted-foreground">{oturum.eposta}</p>
          <CikisDugmesi />
        </div>
      </main>
    </div>
  );
}
