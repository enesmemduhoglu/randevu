import { Badge } from "@/components/ui/badge";
import type { RandevuDurumu } from "@/lib/randevu-durum";

// Randevu durumunun MUSTERIYE gorunen yuzu.
//
// NEDEN `randevu-durum.ts > DURUM_ETIKETLERI` KULLANILMIYOR. O liste PANELIN
// dili: isletme kendi kaydina bakiyor ve "Onaylı" dogru yazim. Musteri ise
// kendi randevusuna bakiyor ve orada "Onaylandı" dogru - ona bir sey OLDU.
// Ayni ayrim "Gelmedi" (isletmenin isaretledigi durum) ile "Gelinmedi"
// (musteriye soylenen) arasinda da var. Iki listeyi tek listeye indirmek,
// iki taraftan birine oteki tarafin cumlesini okutmak demekti.
//
// Faz J'de bu bilesene CIKARILDI: ayni harita `/r/[slug]/randevu/[token]`
// sayfasinda gomuluydu ve `/randevularim` ikinci bir musteri ekrani getirdi.
// Kopyalansaydi bir gun birinde eklenen bir durum otekinde eksik kalirdi -
// ve eksik kalan dal `undefined` rozet olarak, yani sessizce cikardi.
//
// DEGISMEZ 10: renk degeri kodda sabit yazilmiyor. `--durum-*` semantic
// token'lari hem acik hem koyu temada tanimli.

const GORUNUM: Record<RandevuDurumu, { etiket: string; sinif: string }> = {
  BEKLIYOR: {
    etiket: "Onay bekliyor",
    sinif: "bg-durum-bekliyor-zemin text-durum-bekliyor",
  },
  ONAYLI: {
    etiket: "Onaylandı",
    sinif: "bg-durum-onayli-zemin text-durum-onayli",
  },
  IPTAL: {
    etiket: "İptal edildi",
    sinif: "bg-durum-iptal-zemin text-durum-iptal",
  },
  TAMAMLANDI: {
    etiket: "Tamamlandı",
    sinif: "bg-durum-tamamlandi-zemin text-durum-tamamlandi",
  },
  GELMEDI: {
    etiket: "Gelinmedi",
    sinif: "bg-durum-gelmedi-zemin text-durum-gelmedi",
  },
};

export function DurumRozeti({ durum }: { durum: RandevuDurumu }) {
  const gorunum = GORUNUM[durum];
  return <Badge className={gorunum.sinif}>{gorunum.etiket}</Badge>;
}
