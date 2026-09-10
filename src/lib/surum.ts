// Istegi karsilayan Worker SURUMUNUN kimligi - `wrangler.jsonc > version_metadata`.
//
// NEDEN GEREKLI: deploy sonrasi duman testi (`scripts/duman.ts`) `/api/saglik`
// 200 dondu diye yesil yanarsa, o 200'u YENI surum mu yoksa henuz yerini
// birakmamis ESKI surum mu verdi bilemez. Kirik bir yayin, eski surum birkac
// saniye daha trafik tasidigi icin "saglikli" gecebilirdi. Kimlik yanitla
// birlikte donunce betik `wrangler deployments status`'un soyledigi surumu
// gorene kadar bekleyebiliyor.
//
// Sir degil: opak bir uuid, Cloudflare hesabina ya da koda dair bir sey
// soylemiyor. Yine de govdeye degil BASLIGA konuyor - kamu govdesinin anahtar
// kumesi `saglik.test.ts`'te kilitli ve bu alan saglik bilgisi degil.

type SurumBilgisi = { id: string };

/// Cloudflare baglami yoksa (vitest, `next dev`) `null`.
export async function workerSurumu(): Promise<string | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const aday = (env as unknown as Record<string, unknown>).SURUM as SurumBilgisi | undefined;
    return typeof aday?.id === "string" && aday.id !== "" ? aday.id : null;
  } catch {
    return null;
  }
}
