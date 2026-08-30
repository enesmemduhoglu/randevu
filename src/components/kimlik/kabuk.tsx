import Link from "next/link";

import { Logo } from "@/components/marka/logo";
import { TemaDugmesi } from "@/components/tema-dugmesi";

// Giris, kayit ve kayit tamamlama ekranlarinin ortak kabugu. Uc ekranin da
// tek isi var, o yuzden tek sutun ve dar: yanina konacak her sey dikkati
// formdan alirdi.

type Props = {
  baslik: string;
  aciklama: string;
  children: React.ReactNode;
  /// Alt baglanti. Kayit tamamlama ekraninda yok: oradan gidilecek baska bir
  /// yer olmamali, kullanicinin tek isi kaydi bitirmek.
  alt?: { metin: string; baglantiMetni: string; yol: string };
};

export function KimlikKabugu({ baslik, aciklama, children, alt }: Props) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-5 py-4">
        <Link href="/" aria-label="Ana sayfa">
          <Logo />
        </Link>
        <TemaDugmesi />
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pb-16 sm:items-center">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1.5">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              {baslik}
            </h1>
            <p className="text-sm text-muted-foreground">{aciklama}</p>
          </div>

          {children}

          {alt ? (
            <p className="text-center text-sm text-muted-foreground">
              {alt.metin}{" "}
              <Link
                href={alt.yol}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {alt.baglantiMetni}
              </Link>
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
