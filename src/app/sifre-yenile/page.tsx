import type { Metadata } from "next";
import Link from "next/link";

import { KimlikKabugu } from "@/components/kimlik/kabuk";
import { SifreYenileFormu } from "@/components/kimlik/sifre-yenile-formu";

// Mailden gelen baglantinin dustugu sayfa: `/sifre-yenile?token_hash=...&type=recovery`.
//
// TOKEN_HASH BURADA DOGRULANMIYOR, TUKETILMIYOR. Iki gerekce:
//   - Kurumsal mail tarayicilari ve onizleyiciler (Outlook SafeLinks, antiv-
//     irus) baglantiyi KULLANICI TIKLAMADAN kendileri aciyor; burada dogru-
//     lasaydik tek kullanimlik token kullanici hic gormeden yanardi.
//   - Dogrulamak (verifyOtp) linki acan HERKESE gercek bir oturum verirdi;
//     `auth()` o kisiyi normal kullanici sayar ve sifre hic degistirilmeden
//     panel acilirdi.
// Token yalnizca gizli bir degisken olarak forma geciyor; asil dogrulama
// POST /api/sifre/yenile'de, kullanici "Sifreyi guncelle"ye BASTIGINDA olur.
//
// `dynamic = "force-dynamic"`: searchParams istek anina ozel, prerender
// edilecek bir sey yok - /r/[slug] ile ayni gerekce.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Yeni şifre belirle",
  robots: { index: false, follow: false },
};

export default async function SifreYenileSayfasi({
  searchParams,
}: PageProps<"/sifre-yenile">) {
  const parametreler = await searchParams;
  const ham = parametreler.token_hash;
  const tokenHash = typeof ham === "string" ? ham : Array.isArray(ham) ? ham[0] : undefined;

  if (!tokenHash) {
    return (
      <KimlikKabugu
        baslik="Bağlantı eksik"
        aciklama="Bu adres bir sıfırlama bağlantısı üzerinden açılmalı."
      >
        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/sifremi-unuttum"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Yeni bir sıfırlama bağlantısı isteyin
          </Link>
        </p>
      </KimlikKabugu>
    );
  }

  return (
    <KimlikKabugu baslik="Yeni şifre belirle" aciklama="Hesabınız için yeni bir şifre girin.">
      <SifreYenileFormu tokenHash={tokenHash} />
    </KimlikKabugu>
  );
}
