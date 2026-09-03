# Randevu — Uygulama Planı

> Bu dosya ürünün **tek gerçek kaynağıdır**: ne yaptığımız, kime yaptığımız ve neden böyle
> yaptığımız. Günlük karar kaydı `TODOS.md`'de, yayın hattı `docs/yayin.md`'de.
>
> **3 Eylül 2026'da baştan yazıldı.** Önceki sürüm saf bir SaaS anlatıyordu, Prisma'yı
> anlatıyordu (Faz B'de Drizzle'a geçildi) ve Faz K'de bitiyordu. Üçü de artık doğru değil.

## Bağlam

**Randevu, insanların işini halletmek için randevu aldığı bir yerdir.** Kuaför, berber,
güzellik salonu, tırnak, cilt bakımı, masaj, diş, veteriner — kullanıcı işletmeyi bulur,
uygun saati görür, hesap açmadan randevusunu alır.

Aynı zamanda işletme için tam bir randevu yazılımıdır: hizmetler, personel, çalışma
saatleri, takvim, müşteri geçmişi. **Pazaryeri hiç olmasa bile tek başına değerlidir** — bu
cümle bir slogan değil, ürünün kurucu kısıtı (bkz. İlke 2).

Dağıtım Cloudflare Workers üzerinde, `randevu.enesmemduhoglu.tech` adresinde.

### Kurucu ilkeler

Bunlar 3 Eylül 2026'daki ürün kimliği tartışmasının çıktısı; gerekçeleri `TODOS.md > Ürün
kimliği` bölümünde uzun uzun yazılı.

**1. `/` bir arama yüzeyidir.** Siteye gelen kişi bir randevu sitesiyle karşılaşır: arama
kutusu, kategoriler, şehirler. İşletme yolu (`/isletmeler-icin`) görünür ama ikincildir.
Örnek alınan mimari Booksy: *"Discover and book beauty & wellness professionals near you"* —
kategori kutucukları, şehir listesi, üstte küçük bir "List your business".

**2. `/r/<slug>` kalır ve kritiktir.** İşletme kendi müşterisini kendi linkiyle
getirebilmeli. Buna "tek-oyunculu mod" deniyor ve pazaryerlerinin soğuk başlangıcı
aşmasının tek yolu bu: Booksy abonelikli SaaS olarak başladı, Fresha işletmelere bedava
yazılım verip arzı topladı, tüketici pazaryerini **sonra** ekledi. Dizin dolmadan hiçbir
salon kaydolmaz; dizinin dolması `/r/<slug>`in tek başına faydalı olmasına bağlıdır.

**3. Bursa ve İstanbul ile başlanır.** 81 il açık ama boş bir ülke listesi, dolu tek bir
şehirden kötüdür. Yoğunluk yerel kurulur; sektörün ortak dersi coğrafi yoğunlaşma.

**4. İşletmeye şimdilik bedava.** Fresha oyun kitabı. Karşılaştırma için 2026 fiyatları:
Fresha $19.95/ay + pazaryerinden gelen **yeni** müşteride %20; Booksy $29.99/ay, komisyon
yalnızca "Boost" açıksa %30; Treatwell abonelik + ilk randevuda %35. **Üçünde de dönen
müşteriden hiçbir şey alınmıyor** — pazaryeri *keşfi* paraya çeviriyor, *kullanımı* değil.
Bizde de para modeli, dizinden gerçek müşteri akmaya başladığında konuşulacak; o güne kadar
alınacak bir şey yok.

**5. Şehir + kategori sayfaları bir üründür**, sitemap detayı değil. Pazaryeri büyümesinin
motoru "Bursa kuaför", "Kadıköy berber" gibi yüksek niyetli aramaları karşılayan ayrı
sayfalardır. Faz O'nun tamamı bu.

### Rekabet konumu

Türkiye'deki rakiplerin neredeyse tamamı **işletmeye yazılım satıyor**: Kolay Randevu
("randevu programı"), Salon Randevu (URL'i literally `/isletmeler-icin`), RandevuKur,
Hızlıappy, EnRandevu, Kuaförüm Yanımda. Tüketiciye konuşan tek örnek Online Güzellik.
Yani tüketici-önce konum büyük ölçüde boş — ilkelerin tamamı bu boşluğa oynuyor.

### Planın yaslandığı dış gerçekler

1. **Dağıtım Cloudflare'de**, Vercel yok.
2. **Domain `enesmemduhoglu.tech` ve zaten Cloudflare'de.** Kök alan adında **başka bir
   proje** ve Cloudflare Email Routing var (MX + SPF). Bu yüzden hem uygulama hem e-posta
   **alt alan adında** durur; köke dokunulmaz.
3. **Resend doğrulaması tamam** (3 Eylül 2026). Faz I'nin ön koşulu kalktı.
4. **Marka adı hâlâ yer tutucu.** Tasarım dili addan bağımsız; ad netleşince `logo.tsx` ve
   `marka.ts` değişir, başka hiçbir yer etkilenmez.
5. **warden eklentileri açık.** `PreToolUse` kapısı route handler'da ham `db` ve doğrudan
   `resend.emails.send` çağrısını bloklar; `Stop` hook'u karar günlüğü güncellenmediğinde
   uyarır.

## Kararlar

| Konu | Karar | Gerekçe |
|---|---|---|
| **İş modeli** | Pazaryeri yüzü + SaaS ekonomisi. İşletmeye şimdilik bedava | Komisyon ancak dizin müşteri getirdiğinde meşru; o zamana kadar alınacak bir şey yok |
| **Coğrafi kapsam** | Bursa + İstanbul | Yoğunluk yerel kurulur; boş 81 il, dolu bir şehirden kötü |
| **Kategori kapsamı** | Mevcut dokuz kategori | Doldurulamayacak kadar çok boş kategoriyle açılan dizin boş görünür; talep geldikçe büyür, göç gerektirmiyor |
| Çatı | Next.js 16 App Router + TypeScript | `@opennextjs/cloudflare` Next 16'yı tam destekliyor |
| Dağıtım | Cloudflare Workers, custom domain `randevu.enesmemduhoglu.tech` | Zone zaten Cloudflare'de; kökteki projeye dokunmaz |
| Veritabanı | Supabase Postgres 17, Workers'ta **Hyperdrive** binding'i | Gerçek transaction + `EXCLUDE` kısıtı; yerelde Docker Postgres birebir aynı motor |
| Bağlantı | **Supavisor session mode** (`aws-0-eu-central-1.pooler.supabase.com:5432`) | Direct connection (`db.<ref>.supabase.co`) IPv6-only ve erişilemiyor |
| ORM | **Drizzle + postgres.js** | Prisma 7'nin sorgu derleyicisi WASM; workerd çalışma anında WASM derlemeyi yasaklıyor. Drizzle saf TypeScript — bundle 2734 → 1634 KiB |
| Kimlik | Supabase Auth (JWT) + `@supabase/ssr`, `jose` ile doğrulama | Kayıt, şifre sıfırlama, OTP hazır; müşteri hesabı da aynı sistemde |
| Kiracı izolasyonu | `getScopedDb(session)` — uygulama katmanı, **RLS kapalı** | Tek izolasyon mekanizması, tek yerde denetlenebilir. ESLint + `degismezler.test.ts` zorluyor |
| Bot koruması | Cloudflare Turnstile + Worker rate limiting | Aynı hesapta, ücretsiz |
| E-posta | Resend, `randevu.enesmemduhoglu.tech` alt alan adı | Kökteki Email Routing MX/SPF'ine dokunmaz |
| Randevu URL'i | `randevu.enesmemduhoglu.tech/r/<slug>` | Tek Worker, tek sertifika |
| Estetik | Sıcak ve davetkâr | Baskın segmentler kuaför/berber/güzellik; müşterinin gördüğü sayfada sıcaklık güven veriyor |
| Dil | Kod, commit, PR, yorum ve UI **Türkçe** | warden `faz` sözleşmesi |

## Mimari

### Katmanlar

```
Cloudflare Worker (OpenNext)  →  randevu.enesmemduhoglu.tech
  └── Next.js 16 App Router
        ├── /                    arama + keşif  (müşteri ön kapısı)
        ├── /dizin[/il[/kat]]    dizin ve SEO iniş sayfaları
        ├── /r/[slug]            halka açık randevu akışı
        ├── /isletmeler-icin     işletmeye tanıtım → /kayit
        ├── /panel/*             işletme yönetim paneli
        ├── /randevularim        müşteri hesabı            (Faz J)
        └── /api/*               route handler'lar
              ├── src/lib/scoped-db.ts   ← kiracıya bağlı TEK veri kapısı
              └── src/lib/dizin.ts       ← kiracı-üstü TEK okuma (bkz. DEĞİŞMEZ 12)
                    └── Drizzle + postgres.js
                          └── Hyperdrive binding
                                └── Supabase Postgres (Supavisor session mode)
```

### Kritik altyapı dosyaları

Kapı dışı dosyalar; ham `db` ve dış SDK çağrıları **yalnızca** burada:

| Dosya | Sorumluluk |
|---|---|
| `src/lib/db.ts` | Bağlantıyı kurar. workerd'de Hyperdrive, yerelde `DATABASE_URL` |
| `src/lib/scoped-db.ts` | `getScopedDb(session)`, `getHalkaAcikDb(slug)` — her sorguya kiracı filtresi enjekte eder |
| `src/lib/dizin.ts` | **Deponun tek kiracı-üstü okuması.** Salt okunur, dar yüzeyli, testle zorlanıyor |
| `src/lib/auth.ts` | Supabase access token'ını doğrular, `Kullanici`'yı yükler, `session` üretir |
| `src/lib/kayit.ts` | İşletme + kullanıcı + varsayılan personel tek transaction'da |
| `src/lib/panel-kapisi.ts` | `checkOrigin` → oturum → gövde, bu sırayla. Panel route'larının tek girişi |
| `src/lib/origin.ts` | `checkOrigin(req)` — CSRF ikinci katmanı |
| `src/lib/pg-hata.ts` | Drizzle'ın sardığı Postgres hatasından kod ve kısıt adı çıkarır |
| `src/lib/musaitlik.ts` | Saf fonksiyon: çalışma saati + randevu + kapalı aralık → uygun slotlar |
| `src/lib/zaman.ts` | UTC ↔ işletme saat dilimi dönüşümlerinin tek yeri |
| `src/lib/slug.ts` | Türkçe metin → ASCII slug. Saf; hem `kayit.ts` hem `dizin.ts` kullanıyor |
| `src/lib/turnstile.ts`, `hiz-siniri.ts` | Bot ve hız kalkanı |
| `src/lib/email.ts`, `sms.ts` | `gonder()` — bildirimlerin tek çıkış noktası (Faz I, K) |
| `src/lib/marka.ts` | Renk/tipografi sabitleri; e-posta şablonları buradan okur |

### workerd'in dayattığı üç kısıt

Bunlar üç kez sert öğrenildi; her biri kodda yorumla işaretli:

1. **Çalışma anında WASM yok** → Prisma bırakıldı, Drizzle'a geçildi.
2. **ICU derlemesi tam değil** → `Intl.supportedValuesOf`, `Intl.NumberFormat` ve
   `localeCompare(…, "tr")` kullanılmıyor. Kapalı listeler ve elle yazılmış Türkçe
   sıralayıcı var (`ayar-girdi.ts`, `bicim.ts`, `dizin-girdi.ts`). Sebep yalnızca eksiklik
   değil: sunucu ile tarayıcı farklı sıralarsa React hidrasyonda uyuşmazlık görür.
3. **Bundle 3 MiB (gzip) sınırı** → font ekseni kısıtlı, `proxy.ts` kaldırıldı, her fazda
   ölçülüyor. Bugün **1634 KiB**.

### Kimlik akışı

Supabase Auth yalnızca **kimlik** için; veri modelinin tamamı bizim.

1. `@supabase/ssr` httpOnly cookie'de access + refresh token tutar.
2. `auth()` token'ı `jose` ile doğrular → `sub` = `authUserId`.
3. `kullanici` tablosundan tek indeksli lookup → `isletmeId`, `rol`.
4. Session: `{ kullaniciId, authUserId, isletmeId, rol }` — `isletmeId` **düz string**
   (DEĞİŞMEZ 6).

**`auth.users`'a foreign key yok** (DEĞİŞMEZ 9). Bedeli bir tutarlılık garantisi; karşılığı
migration'ların tek başına tüm şemaya sahip olması ve testlerin kendi JWT'lerini
imzalayabilmesi.

### Bildirim kanalları

Resend doğrulandı, yani gerçek gönderim açılabilir. Üç parçalı desen yine de korunuyor:
testler gerçek mail atmamalı ve SMS sağlayıcısı henüz yok.

1. **Adaptör** — `email.ts > gonder()` ve `sms.ts > gonder()` tek çıkış noktası.
   `BILDIRIM_MODU=sahte|gercek`. Test ve yerel her zaman `sahte`.
2. **Kuyruk** — `bildirim_kuyrugu` tablosu (Faz E'de kuruldu, göç gerektirmiyor).
   Hatırlatmalar zamanlanmış kayıtlar olduğu için bu tablo moddan bağımsız gerekli.
3. **Önizleme** — `/panel/gelistirici/bildirimler`: kuyruktaki mesajın gerçek HTML'i.

**Gönderen kimliği ürün kimliğine bağlı ve artık netleşti.** Platform önde:
`Randevu <bildirim@randevu.enesmemduhoglu.tech>`, işletme adı konunun içinde
("Çağdaş Berber'deki randevunuz onaylandı"). Saf SaaS seçilseydi tersi olurdu — bu yüzden
Faz I, ürün kimliği kararından **sonraya** bırakıldı.

## Tasarım dili

`/design` yolu: `brand` → `design-system` → `ui-styling`, randevu akışı için `ui-ux-pro-max`.
Çıktı: `docs/marka.md`, `docs/tasarim-sistemi.md`, `src/app/globals.css`, `src/lib/marka.ts`.

### Palet ve tipografi (yön: sıcak ve davetkâr)

```
Zemin    #FAF8F5   sıcak beyaz        Başlık   Fraunces
Metin    #1C1917   koyu taş           Metin    Inter
Vurgu    #C2643C   terracotta         Köşe     12px, yumuşak gölge
İkincil  #2A9D8F   yumuşak teal
```

Bunlar **primitive** katman. Bileşenler primitive rengi doğrudan kullanmaz, semantic token
üzerinden gider (DEĞİŞMEZ 10). Açık ve koyu tema aynı semantic isimleri farklı
primitive'lere bağlar.

**Vurgu rengi seyrek kullanılır.** Panel günde saatlerce açık duracak; terracotta yalnızca
birincil eylem, aktif durum ve seçili slot için.

**`latin-ext` subset'i şart** — Türkçe'nin `ğ ı ş İ` karakterleri `latin` subset'inde yok.

### Tasarlanacak yüzeyler

| Yüzey | Not |
|---|---|
| **`/` ön kapı** | Booksy modeli: arama + kategori kutucukları + şehir bölümleri. Ürünün ne olduğunu ilk üç saniyede anlatır |
| **`/r/[slug]` randevu akışı** | **Mobil öncelikli.** Müşterilerin çoğunun göreceği tek sayfa; ürünün gerçek yüzü |
| Saat seçici | En kritik bileşen. Dolu/boş/seçili, dokunma hedefi ≥44px, gün bazlı gruplama |
| Dizin kartı ve filtre | Yoğun liste; kart "4 hizmet, 300 ₺'den başlıyor" der, fiyat listesini kopyalamaz |
| Panel takvimi | Gün/hafta/ay; yoğun bilgi, düşük görsel gürültü |
| Boş / yükleniyor / hata | Üçü de baştan tasarlanır; sonradan eklenen boş durum her zaman kötü görünür |
| E-posta şablonları | `marka.ts` token'larıyla inline CSS |

Erişilebilirlik hedefi: kontrast AA, görünür odak halkası, klavyeyle tam gezinilebilir
randevu akışı.

## Veri modeli

`src/db/sema.ts`, göçler `drizzle/`. Kiracıya bağlı her tabloda `isletmeId` var.

- **`isletme`** — `slug` (unique), ad, telefon, adres, hakkinda, `saatDilimi`
  (`Europe/Istanbul`), `slotAraligiDk` (15), `minOnceBildirimDk` (120), `maksIleriGun` (60),
  `otomatikOnay`, `gelmediKisitiGun` (30), aktif
  — **dizin alanları:** `il`, `ilce`, `kategori`, `yayinda` (varsayılan **false**)
- **`kullanici`** — `authUserId` (unique), eposta, ad, telefon, `rol`, `isletmeId?`
- **`personel`** — isletmeId, ad, unvan, `kullaniciId?`, sira, aktif
- **`hizmet`** — isletmeId, ad, aciklama, `sureDk`, `fiyatKurus`, renk, sira, aktif
- **`personelHizmet`** — çoka-çok (boşsa personel tüm hizmetleri verir)
- **`calismaSaati`** — isletmeId, personelId, `haftaninGunu` (0–6), `baslangicDk`,
  `bitisDk` — öğle arası için aynı güne iki satır
- **`kapali`** — izin/tatil aralıkları
- **`musteri`** — isletmeId, ad, telefon, eposta, not, `kullaniciId?`,
  `gelmediSayisi`, `sonGelmediTarihi`; unique `(isletmeId, telefon)`
- **`randevu`** — isletmeId, personelId, hizmetId, musteriId, baslangic, bitis,
  `durum` (`BEKLIYOR` | `ONAYLI` | `IPTAL` | `TAMAMLANDI` | `GELMEDI`), not,
  `iptalToken` (unique), `kaynak` (`MUSTERI` | `ISLETME`)
- **`bildirimKuyrugu`** — randevuId, `tur` (`EPOSTA` | `SMS`), sablon, `planlananZaman`,
  `gonderimZamani?`, durum, `hataMetni`, `onizlemeHtml?`

**`aktif` ile `yayinda` ayrı kavramlar.** `aktif=false` randevu sayfasını tümden kapatır;
`yayinda=false` yalnızca dizinden gizler — doğrudan linki olan müşteri randevu almaya devam
eder. Tek alana sıkıştırmak, "Instagram'dan gelenler girsin ama dizinde olmayayım" diyen
işletmeyi imkânsız kılardı.

### Çakışma engeli — veritabanı seviyesinde

Ürünün tek gerçek doğruluk problemi ve uygulama katmanında çözülmüyor
(`drizzle/0002_*.sql`):

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE randevu ADD CONSTRAINT randevu_cakisma_yok
  EXCLUDE USING gist (
    personel_id WITH =,
    tstzrange(baslangic, bitis, '[)') WITH &&
  ) WHERE (durum IN ('BEKLIYOR', 'ONAYLI'));
```

Aralık `'[)'`: bitişik randevular çakışma **değil**. `WHERE`: iptal edilen saat boşalıyor.
Drizzle `EXCLUDE`'u ifade edemiyor, kısıt göçe elle yazıldı. Uygulama katmanı kısıtı tekrar
etmez; ihlali yakalayıp **409** döner — hata kodu `pg-hata.ts` ile okunur, çünkü Drizzle
hatayı sarmalıyor ve `hata.code` sarmalayıcıda yok.

## Değişmezler

`CLAUDE.md` ile birebir aynı liste. Zorlayıcıları parantezde.

1. **`src/app` altında ham `db` yok** → `scoped-db.ts` üzerinden *(ESLint `no-restricted-imports`)*
2. **Mutasyon route'unda `checkOrigin`** — makine yolları muaf *(`degismezler.test.ts`)*
3. **Karar değiştiren yollarda koşullu UPDATE** → etkilenen satır 0 ise 409
4. **E-posta yalnızca `email.ts > gonder()`, SMS yalnızca `sms.ts > gonder()`** *(warden kapısı)*
5. **Sırlar log'a ve hata metinlerine girmez**
6. **`session.isletmeId` düz string kalır**
7. **Randevu zamanları DB'de `timestamptz` (UTC).** Yerel saate çevirme yalnızca `zaman.ts`
   üzerinden ve işletmenin `saatDilimi` alanıyla. Sunucu saat dilimine güvenilmez
8. **Çakışma engeli DB'de.** Uygulama kontrolü erken geri bildirim içindir, garanti değil
9. **`auth.users`'a FK yok**; `kullanici.authUserId` düz string
10. **Renk değeri kodda sabit yazılmaz** — semantic token, e-posta `marka.ts`
11. **Cookie'lerin `Domain` niteliği köke genişletilmez** — oturum yalnızca
    `randevu.enesmemduhoglu.tech` host'una bağlı
12. **Kiracı-üstü okuma yalnızca `dizin.ts`'te ve dar.** Yalnızca `isletme` + `hizmet`;
    hizmet yalnızca toplama; dönen tip elle yazılı ve kapalı; çağıran tablo/kolon adı
    veremez; salt okunur *(`degismezler.test.ts` dosya metnini tarıyor)*

## Fazlar

warden `faz` sözleşmesi: her faz `faz-<harf>/<slug>` dalında, kendi PR'ıyla, `TODOS.md`'ye
bir satır bırakarak kapanır. **Commit ve push kullanıcı onayı olmadan atılmaz.** Ayrıntılı
karar kaydı `TODOS.md`'de.

### Tamamlananlar

| Faz | İçerik |
|---|---|
| **A** — iskele | Next 16 + TS + Tailwind v4, Docker Postgres, Vitest, değişmezler |
| **B** — Cloudflare zemini | OpenNext, Hyperdrive, Supabase; **Prisma → Drizzle geçişi** |
| **C** — tasarım dili | Üç katmanlı token, açık/koyu tema, shadcn/ui, wordmark, vitrin |
| **D** — kimlik ve kiracı | Supabase Auth, `scoped-db.ts`, kayıt akışı, ilk IDOR testleri |
| **E** — şema ve panel CRUD | Tüm tablolar + `EXCLUDE` göçü, panel ekranları |
| **F** — müsaitlik motoru | `musaitlik.ts` saf fonksiyon; DST, öğle arası, gün sınırı testleri |
| **G** — halka açık randevu | `/r/[slug]` akışı, `POST /api/randevu`, iptal token'ı |
| **G2** — bot koruması | Turnstile |
| **H** — panel takvimi | Gün/hafta/ay, durum değiştirme, müşteri geçmişi |
| **CI/CD** | `dogrula` + `yayinla`; merge anı yayın anı |
| **L** — kalkan | Worker rate limiting; Turnstile'ın üretimde sessizce kapalı olduğu bulundu |
| **L3** — "gelmedi" kısıtı | Gelmeyen müşteriye randevu kısıtı, işletme ayarlı |
| **M** — pazaryeri dizini | Dizin şeması, `dizin.ts`, panelde yayına çıkma, `/dizin` |

### Sıradakiler

**Faz N — ön kapı** *(kapandı)*
Paylaşılan genel layout (logo · arama · Randevularım · "İşletme misiniz?"). `/` ters çevrilir:
arama kutusu + dokuz kategori kutucuğu + Bursa/İstanbul bölümleri. Bugünkü kök sayfa
içeriği `/isletmeler-icin`'e taşınır ve genişletilir. `layout.tsx` metadata'sı müşteri
diline geçer.
**Yapmaz:** SEO iniş sayfaları (Faz O), müşteri hesabı (Faz J).

**Faz I — bildirim altyapısı** *(sıradaki)*
`email.ts > gonder()`, kuyruğa yazma (oluşturma, iptal, hatırlatma), şablonlar,
`/panel/gelistirici/bildirimler`. Ön koşul kalktı: Resend doğrulandı, gönderen kimliği
netleşti. Resend'in `{ data, error }` dönüşü **okunur** — warden kapısının doğrudan çağrıyı
bloklamasının sebebi tam olarak bu.

**Faz O — keşfedilebilirlik**
`/dizin/[il]` ve `/dizin/[il]/[kategori]` iniş sayfaları (slug eşlemesi `slug.ts` ile),
`app/robots.ts`, `app/sitemap.ts`, `/r/<slug>` sayfalarının sitemap'e girmesi.
**Kritik:** `/dizin`in filtre parametreleri indekslenmemeli — faceted navigation'ın
ürettiği yinelenen içerik pazaryeri SEO'sunun bir numaralı ölüm sebebi. Canonical
etiketi ve `robots` kuralı birlikte konur.

**Faz J — müşteri hesabı**
`/randevularim`, misafir randevusunu telefon/e-posta eşleşmesiyle hesaba bağlama,
`getMusteriDb` kapsamı ve kendi IDOR testleri.

**Faz P — sağlamlaştırma**
`TODOS.md > Teknik borç` bölümündeki dört madde: `scoped-db.ts` bölünmesi, vitrinin
üretimde kapatılması, uyarı/hata takibi, `/saglik`'in şemayı gerçekten kontrol etmesi.

**Faz K — SMS ve hatırlatma**
`sms.ts > gonder()` adaptörü. `workers/hatirlatici/` — ayrı, küçük bir Worker; Cron
Trigger'la `POST /api/cron/hatirlatma` yolunu paylaşılan sırla çağırır. Ayrı Worker, çünkü
OpenNext'in ürettiği Worker `fetch` export ediyor; `scheduled` handler'ı oraya iliştirmek
adaptörün iç yapısına bağımlılık yaratır.

## Doğrulama

**Her fazda, PR açmadan önce:**

```bash
npm run tip && npm run lint && npm test && npm run build
```

**Test katmanları:**

| Katman | Neyi kanıtlar |
|---|---|
| `musaitlik.ts` unit testleri | Slot hesabı — DST, öğle arası, süre taşması, min bildirim |
| Route entegrasyon testleri (gerçek Postgres) | Mutlu yol · oturumsuz 401 · **başka işletmenin kaydı 404** · yarışan ikinci karar 409 |
| Çakışma testi | Aynı slota eşzamanlı iki `POST /api/randevu` → biri 201, biri 409 |
| `degismezler.test.ts` | Değişmez 1, 2, 4 ve 12'yi dosya metnini tarayarak zorlar |
| Göç testi | Boş DB ve prod-benzeri veriyle |

**IDOR testi hiçbir route'da atlanmaz:** iki işletme oluştur, birinin kaydını diğerinin
oturumuyla iste, sızmadığını gör.

**Uçtan uca elle doğrulama** (her fazda tekrarlanır):
İşletme kaydol → hizmet + çalışma saati tanımla → dizine çık → `/`de arayıp bul →
`/r/<slug>`ten randevu al → panelde gör → iptal linkiyle iptal et → bildirim önizlemesini
gör. **Aynısı mobil genişlikte ve koyu temada** — hedef kitle telefondan giriyor.

**Deploy doğrulaması:** `cf:kur` çıktısının gzip boyutu (bütçe 3 MiB, bugün 1634 KiB);
canlıda `/`, `/dizin`, `/r/<slug>`, `/saglik` 200.

## Riskler ve elle yapılacaklar

| Konu | Durum |
|---|---|
| **Soğuk başlangıç** | Prod'da bugün **2 işletme, 0'ı dizinde yayında, 1 randevu (bizim testimiz)**. En büyük risk kod değil arz. Bursa ve İstanbul'da gerçek salon kaydedilmeden hiçbir faz bunu çözmüyor |
| **Faceted navigation yinelenen içerik** | `/dizin`in filtre parametreleri bugün serbest. Faz O'da canonical + robots kuralı konmadan sitemap yayınlanmamalı |
| **Worker boyut limiti** | Ücretsiz plan 3 MiB gzip; bugün 1634 KiB. Her fazda ölçülüyor. Aşarsa Workers Paid (~$5/ay) |
| **Kökte çalışan mevcut proje** | Bütün DNS ve Worker işleri **yalnızca `randevu.` alt alan adında**; kökteki A/AAAA, MX, SPF'e dokunulmaz |
| **Supabase custom SMTP** | Resend SMTP bilgileri girilene kadar *Confirm email* kapalı (yerleşik SMTP saatte 2 mail) |
| **Şema tek yön** | Rollback ucuzluğu yalnızca kod için. `goc` iş akışı hâlâ ayrı ve `"uygula"` yazılmasını istiyor; sıra **önce göç, sonra merge** |
| **Marka adı** | Yer tutucu. Netleşince `logo.tsx` + `marka.ts` + metinler değişir |
| **Supabase ücretsiz katman** | Bir hafta hareketsiz projeler duraklatılıyor |
