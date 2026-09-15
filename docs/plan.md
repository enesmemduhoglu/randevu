# Randevu — Uygulama Planı

> Bu dosya ürünün **tek gerçek kaynağıdır**: ne yaptığımız, kime yaptığımız ve neden böyle
> yaptığımız. Günlük karar kaydı `TODOS.md`'de, deploy pipeline `docs/yayin.md`'de.
>
> **3 Eylül 2026'da baştan yazıldı.** Önceki version saf bir SaaS anlatıyordu, Prisma'yı
> anlatıyordu (Faz B'de Drizzle'a geçildi) ve Faz K'de bitiyordu. Üçü de artık doğru değil.

## Bağlam

**Randevu, insanların işini halletmek için randevu aldığı bir yerdir.** Kuaför, berber,
güzellik salonu, tırnak, cilt bakımı, masaj, diş, veteriner — kullanıcı işletmeyi bulur,
uygun saati görür, hesap açmadan randevusunu alır.

Aynı zamanda işletme için bir randevu yazılımıdır: hizmetler, personel, çalışma
saatleri, takvim. **Marketplace hiç olmasa bile tek başına değerlidir** — bu
cümle bir slogan değil, ürünün kurucu kısıtı (bkz. İlke 2).

> Faz H2 bu cümlenin iki eksiğini kapattı: telefonla gelen randevu panele
> giriliyor (H2a) ve müşteri listesi, geçmişi, kayıt düzenlemesi var (H2b).
> Kalan eksik **randevu düzenleme**: bugün bir randevunun yalnızca durumu
> değişebiliyor, saati ya da personeli değişemiyor.

Deployment Cloudflare Workers üzerinde, `randevu.enesmemduhoglu.tech` adresinde.

### Kurucu ilkeler

Bunlar 3 Eylül 2026'daki ürün kimliği tartışmasının çıktısı; gerekçeleri `TODOS.md > Ürün
kimliği` bölümünde uzun uzun yazılı.

**1. `/` bir arama yüzeyidir.** Siteye gelen kişi bir randevu sitesiyle karşılaşır: arama
kutusu, kategoriler, şehirler. İşletme yolu (`/isletmeler-icin`) görünür ama ikincildir.
Örnek alınan mimari Booksy: *"Discover and book beauty & wellness professionals near you"* —
kategori kutucukları, şehir listesi, üstte küçük bir "List your business".

**2. `/r/<slug>` kalır ve kritiktir.** İşletme kendi müşterisini kendi linkiyle
getirebilmeli. Buna "tek-oyunculu mod" deniyor ve marketplace'lerin soğuk başlangıcı
aşmasının tek yolu bu: Booksy abonelikli SaaS olarak başladı, Fresha işletmelere bedava
yazılım verip arzı topladı, tüketici marketplace'i **sonra** ekledi. Dizin dolmadan hiçbir
salon kaydolmaz; dizinin dolması `/r/<slug>`in tek başına faydalı olmasına bağlıdır.

**3. Bursa ve İstanbul ile başlanır.** 81 il açık ama boş bir ülke listesi, dolu tek bir
şehirden kötüdür. Yoğunluk yerel kurulur; sektörün ortak dersi coğrafi yoğunlaşma.

**4. İşletmeye şimdilik bedava.** Fresha oyun kitabı. Karşılaştırma için 2026 fiyatları:
Fresha $19.95/ay + marketplace'ten gelen **yeni** müşteride %20; Booksy $29.99/ay, komisyon
yalnızca "Boost" açıksa %30; Treatwell abonelik + ilk randevuda %35. **Üçünde de dönen
müşteriden hiçbir şey alınmıyor** — marketplace *keşfi* paraya çeviriyor, *kullanımı* değil.
Bizde de para modeli, dizinden gerçek müşteri akmaya başladığında konuşulacak; o güne kadar
alınacak bir şey yok.

**5. Şehir + kategori sayfaları bir üründür**, sitemap detayı değil. Marketplace büyümesinin
motoru "Bursa kuaför", "Kadıköy berber" gibi yüksek niyetli aramaları karşılayan ayrı
sayfalardır. Faz O'nun tamamı bu.

### Rekabet konumu

Türkiye'deki rakiplerin neredeyse tamamı **işletmeye yazılım satıyor**: Kolay Randevu
("randevu programı"), Salon Randevu (URL'i literally `/isletmeler-icin`), RandevuKur,
Hızlıappy, EnRandevu, Kuaförüm Yanımda. Tüketiciye konuşan tek örnek Online Güzellik.
Yani tüketici-önce konum büyük ölçüde boş — ilkelerin tamamı bu boşluğa oynuyor.

### Planın yaslandığı dış gerçekler

1. **Deployment Cloudflare'de**, Vercel yok.
2. **Domain `enesmemduhoglu.tech` ve zaten Cloudflare'de.** Root domain'de **başka bir
   proje** ve Cloudflare Email Routing var (MX + SPF). Bu yüzden hem uygulama hem e-posta
   **subdomain'de** durur; köke dokunulmaz.
3. **Resend doğrulaması tamam** (3 Eylül 2026). Faz I'nin ön koşulu kalktı.
4. **Marka adı hâlâ yer tutucu.** Tasarım dili addan bağımsız; ad netleşince `logo.tsx` ve
   `marka.ts` değişir, başka hiçbir yer etkilenmez.
5. **warden plugin'leri açık.** `PreToolUse` gate'i route handler'da ham `db` ve doğrudan
   `resend.emails.send` çağrısını bloklar; `Stop` hook'u decision log güncellenmediğinde
   uyarır.

## Kararlar

| Konu | Karar | Gerekçe |
|---|---|---|
| **İş modeli** | Marketplace yüzü + SaaS ekonomisi. İşletmeye şimdilik bedava | Komisyon ancak dizin müşteri getirdiğinde meşru; o zamana kadar alınacak bir şey yok |
| **Coğrafi kapsam** | Bursa + İstanbul | Yoğunluk yerel kurulur; boş 81 il, dolu bir şehirden kötü |
| **Kategori kapsamı** | Mevcut dokuz kategori | Doldurulamayacak kadar çok boş kategoriyle açılan dizin boş görünür; talep geldikçe büyür, migration gerektirmiyor |
| Çatı | Next.js 16 App Router + TypeScript | `@opennextjs/cloudflare` Next 16'yı tam destekliyor |
| Deployment | Cloudflare Workers, custom domain `randevu.enesmemduhoglu.tech` | Zone zaten Cloudflare'de; kökteki projeye dokunmaz |
| Veritabanı | Supabase Postgres 17, Workers'ta **Hyperdrive** binding'i | Gerçek transaction + `EXCLUDE` constraint'i; local'de Docker Postgres birebir aynı motor |
| Connection | **Supavisor session mode** (`aws-0-eu-central-1.pooler.supabase.com:5432`) | Direct connection (`db.<ref>.supabase.co`) IPv6-only ve erişilemiyor |
| ORM | **Drizzle + postgres.js** | Prisma 7'nin query compiler'ı WASM; workerd runtime'da WASM compile etmeyi yasaklıyor. Drizzle saf TypeScript — bundle 2734 → 1634 KiB |
| Kimlik | Supabase Auth (JWT) + `@supabase/ssr`, `jose` ile doğrulama | Kayıt, şifre sıfırlama, OTP hazır; müşteri hesabı da aynı sistemde |
| Tenant izolasyonu | `getScopedDb(session)` — uygulama layer'ı, **RLS kapalı** | Tek izolasyon mekanizması, tek yerde denetlenebilir. ESLint + `degismezler.test.ts` zorluyor |
| Bot koruması | Cloudflare Turnstile + Worker rate limiting | Aynı hesapta, ücretsiz |
| E-posta | Resend, `randevu.enesmemduhoglu.tech` subdomain | Kökteki Email Routing MX/SPF'ine dokunmaz |
| Randevu URL'i | `randevu.enesmemduhoglu.tech/r/<slug>` | Tek Worker, tek sertifika |
| Estetik | Sıcak ve davetkâr | Baskın segmentler kuaför/berber/güzellik; müşterinin gördüğü sayfada sıcaklık güven veriyor |
| Dil | Kod, commit, PR, yorum ve UI **Türkçe** | warden `faz` sözleşmesi |

## Mimari

### Layer'lar

```
Cloudflare Worker (OpenNext)  →  randevu.enesmemduhoglu.tech
  └── Next.js 16 App Router
        ├── /                    arama + keşif  (müşteri ön kapısı)
        ├── /dizin[/il[/kat]]    dizin ve SEO iniş sayfaları
        ├── /r/[slug]            public randevu akışı
        ├── /isletmeler-icin     işletmeye tanıtım → /kayit
        ├── /panel/*             işletme yönetim paneli
        ├── /randevularim        müşteri hesabı            (Faz J)
        └── /api/*               route handler'lar
              ├── src/lib/scoped-db.ts   ← tenant'a bağlı TEK data access katmanı
              └── src/lib/dizin.ts       ← cross-tenant TEK okuma (bkz. INVARIANT 12)
                    └── Drizzle + postgres.js
                          └── Hyperdrive binding
                                └── Supabase Postgres (Supavisor session mode)
```

### Kritik altyapı dosyaları

Gate dışı dosyalar; ham `db` ve dış SDK çağrıları **yalnızca** burada:

| Dosya | Sorumluluk |
|---|---|
| `src/lib/db.ts` | Connection'ı kurar. workerd'de Hyperdrive, local'de `DATABASE_URL` |
| `src/lib/scoped-db.ts` | `getScopedDb(session)`, `getHalkaAcikDb(slug)` — her query'ye tenant filtresi enjekte eder |
| `src/lib/dizin.ts` | **Repo'nun tek cross-tenant okuması.** Salt okunur, dar yüzeyli, testle zorlanıyor |
| `src/lib/auth.ts` | Supabase access token'ını doğrular, `Kullanici`'yı yükler, `session` üretir |
| `src/lib/kayit.ts` | İşletme + kullanıcı + varsayılan personel tek transaction'da |
| `src/lib/panel-kapisi.ts` | `checkOrigin` → session → body, bu sırayla. Panel route'larının tek girişi |
| `src/lib/origin.ts` | `checkOrigin(req)` — CSRF ikinci layer'ı |
| `src/lib/pg-hata.ts` | Drizzle'ın sardığı Postgres hatasından kod ve constraint adı çıkarır |
| `src/lib/musaitlik.ts` | Saf fonksiyon: çalışma saati + randevu + kapalı aralık → uygun slotlar |
| `src/lib/zaman.ts` | UTC ↔ işletme saat dilimi dönüşümlerinin tek yeri |
| `src/lib/slug.ts` | Türkçe metin → ASCII slug. Saf; hem `kayit.ts` hem `dizin.ts` kullanıyor |
| `src/lib/turnstile.ts`, `hiz-siniri.ts` | Bot ve hız kalkanı |
| `src/lib/email.ts` | `gonder()` — e-postanın tek çıkış noktası. SDK değil düz `fetch` |
| `src/lib/mod.ts` | `sahte`/`gercek` kararı. Production'da `wrangler.jsonc`, local'de `.env` |
| `src/lib/site.ts` | Kanonik adres; `robots.ts`, `sitemap.ts` ve `metadataBase` buradan okur |
| `src/lib/bildirim.ts` | Hangi olayda ne queue'ya girer, queue nasıl boşalır |
| `src/lib/bildirim-sablon.ts` | Saf metin üretimi; DB'ye ve network'e dokunmuyor |
| `src/lib/sms.ts` | `gonder()` — SMS'in tek çıkış noktası. **Henüz yok**, Faz K'de gelecek |
| `src/lib/marka.ts` | Renk/tipografi sabitleri; e-posta şablonları buradan okur |

### workerd'in dayattığı üç kısıt

Bunlar üç kez sert öğrenildi; her biri kodda yorumla işaretli:

1. **Runtime'da WASM yok** → Prisma bırakıldı, Drizzle'a geçildi.
2. **ICU build'i tam değil** → `Intl.supportedValuesOf`, `Intl.NumberFormat` ve
   `localeCompare(…, "tr")` kullanılmıyor. Kapalı listeler ve elle yazılmış Türkçe
   sıralayıcı var (`ayar-girdi.ts`, `bicim.ts`, `dizin-girdi.ts`). Sebep yalnızca eksiklik
   değil: server ile tarayıcı farklı sıralarsa React hidrasyonda uyuşmazlık görür.
3. **Bundle 3 MiB (gzip) sınırı** → font ekseni kısıtlı, `proxy.ts` kaldırıldı, her fazda
   ölçülüyor. Bugün **1634 KiB**.

### Kimlik akışı

Supabase Auth yalnızca **kimlik** için; veri modelinin tamamı bizim.

1. `@supabase/ssr` httpOnly cookie'de access + refresh token tutar.
2. `auth()` token'ı `jose` ile doğrular → `sub` = `authUserId`.
3. `kullanici` tablosundan tek indeksli lookup → `isletmeId`, `rol`.
4. Session: `{ kullaniciId, authUserId, isletmeId, rol }` — `isletmeId` **düz string**
   (INVARIANT 6).

**`auth.users`'a foreign key yok** (INVARIANT 9). Bedeli bir tutarlılık garantisi; karşılığı
migration'ların tek başına tüm schema'ya sahip olması ve testlerin kendi JWT'lerini
imzalayabilmesi.

### Bildirim kanalları

Resend doğrulandı, yani gerçek gönderim açılabilir. Üç parçalı pattern yine de korunuyor:
testler gerçek mail atmamalı ve SMS provider'ı henüz yok.

1. **Adaptör** — `email.ts > gonder()` ve `sms.ts > gonder()` tek çıkış noktası.
   `BILDIRIM_MODU=sahte|gercek`. Test ve local her zaman `sahte`.
2. **Queue** — `bildirim_kuyrugu` tablosu (Faz E'de kuruldu, migration gerektirmiyor).
   Hatırlatmalar zamanlanmış kayıtlar olduğu için bu tablo moddan bağımsız gerekli.
3. **Preview** — `/panel/gelistirici/bildirimler`: queue'daki mesajın gerçek HTML'i.

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

Bunlar **primitive** layer. Component'ler primitive rengi doğrudan kullanmaz, semantic token
üzerinden gider (INVARIANT 10). Açık ve koyu tema aynı semantic isimleri farklı
primitive'lere bağlar.

**Vurgu rengi seyrek kullanılır.** Panel günde saatlerce açık duracak; terracotta yalnızca
birincil eylem, aktif durum ve seçili slot için.

**`latin-ext` subset'i şart** — Türkçe'nin `ğ ı ş İ` karakterleri `latin` subset'inde yok.

### Tasarlanacak yüzeyler

| Yüzey | Not |
|---|---|
| **`/` ön kapı** | Booksy modeli: arama + kategori kutucukları + şehir bölümleri. Ürünün ne olduğunu ilk üç saniyede anlatır |
| **`/r/[slug]` randevu akışı** | **Mobil öncelikli.** Müşterilerin çoğunun göreceği tek sayfa; ürünün gerçek yüzü |
| Saat seçici | En kritik component. Dolu/boş/seçili, dokunma hedefi ≥44px, gün bazlı gruplama |
| Dizin kartı ve filtre | Yoğun liste; kart "4 hizmet, 300 ₺'den başlıyor" der, fiyat listesini kopyalamaz |
| Panel takvimi | Gün/hafta/ay; yoğun bilgi, düşük görsel gürültü |
| Boş / yükleniyor / hata | Üçü de baştan tasarlanır; sonradan eklenen boş durum her zaman kötü görünür |
| E-posta şablonları | `marka.ts` token'larıyla inline CSS |

Erişilebilirlik hedefi: kontrast AA, görünür odak halkası, klavyeyle tam gezinilebilir
randevu akışı.

## Veri modeli

`src/db/sema.ts`, migration'lar `drizzle/`. Tenant'a bağlı her tabloda `isletmeId` var.

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

Ürünün tek gerçek doğruluk problemi ve uygulama layer'ında çözülmüyor
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
Drizzle `EXCLUDE`'u ifade edemiyor, constraint migration'a elle yazıldı. Uygulama layer'ı constraint'i tekrar
etmez; ihlali yakalayıp **409** döner — hata kodu `pg-hata.ts` ile okunur, çünkü Drizzle
hatayı sarmalıyor ve `hata.code` wrapper'da yok.

## Invariant'lar

`CLAUDE.md` ile birebir aynı liste. Zorlayıcıları parantezde.

1. **`src/app` altında ham `db` yok** → `scoped-db.ts` üzerinden *(ESLint `no-restricted-imports`)*
2. **Mutation route'unda `checkOrigin`** — makine yolları muaf *(`degismezler.test.ts`)*
3. **Karar değiştiren yollarda conditional UPDATE** → etkilenen satır 0 ise 409
4. **E-posta yalnızca `email.ts > gonder()`, SMS yalnızca `sms.ts > gonder()`**
   *(warden gate'i + `degismezler.test.ts`; repo SDK değil `fetch` kullandığı için gate'in
   aradığı metin hiç oluşmuyor — gerçek zorlama testte)*
5. **Secret'lar log'a ve hata metinlerine girmez** *(`hata.ts` gate'i +
   `degismezler.test.ts`; Drizzle hata mesajı için `drizzle-yamasi.test.ts`)*
6. **`session.isletmeId` düz string kalır**
7. **Randevu zamanları DB'de `timestamptz` (UTC).** Local saate çevirme yalnızca `zaman.ts`
   üzerinden ve işletmenin `saatDilimi` alanıyla. Server saat dilimine güvenilmez
8. **Çakışma engeli DB'de.** Uygulama kontrolü erken geri bildirim içindir, garanti değil
9. **`auth.users`'a FK yok**; `kullanici.authUserId` düz string
10. **Renk değeri kodda sabit yazılmaz** — semantic token, e-posta `marka.ts`
11. **Cookie'lerin `Domain` niteliği köke genişletilmez** — session yalnızca
    `randevu.enesmemduhoglu.tech` host'una bağlı
1b. **Müşteri gate'i: `getMusteriDb` aynı disiplini `kullaniciId` üzerinde tekrarlar.**
    Müşterinin randevuları tanımı gereği multi-tenant; filtre yine closure variable'ı,
    çağıran veremez. Muafiyet değil, gate'in ikinci ekseni *(`degismezler.test.ts`
    dosya metnini tarıyor)*

12. **Cross-tenant okuma yalnızca `dizin.ts`'te ve dar.** Yalnızca `isletme` + `hizmet`;
    hizmet yalnızca toplama; dönen tip elle yazılı ve kapalı; çağıran tablo/kolon adı
    veremez; salt okunur *(`degismezler.test.ts` dosya metnini tarıyor)*

## Fazlar

warden `faz` sözleşmesi: her faz `faz-<harf>/<slug>` branch'inde, kendi PR'ıyla, `TODOS.md`'ye
bir satır bırakarak kapanır. **Commit ve push kullanıcı onayı olmadan atılmaz.** Ayrıntılı
karar kaydı `TODOS.md`'de.

### Tamamlananlar

| Faz | İçerik |
|---|---|
| **A** — iskele | Next 16 + TS + Tailwind v4, Docker Postgres, Vitest, invariant'lar |
| **B** — Cloudflare zemini | OpenNext, Hyperdrive, Supabase; **Prisma → Drizzle geçişi** |
| **C** — tasarım dili | Üç layer'lı token, açık/koyu tema, shadcn/ui, wordmark, vitrin |
| **D** — kimlik ve tenant | Supabase Auth, `scoped-db.ts`, kayıt akışı, ilk IDOR testleri |
| **E** — schema ve panel CRUD | Tüm tablolar + `EXCLUDE` migration'ı, panel ekranları |
| **F** — müsaitlik motoru | `musaitlik.ts` saf fonksiyon; DST, öğle arası, gün sınırı testleri |
| **G** — public randevu | `/r/[slug]` akışı, `POST /api/randevu`, iptal token'ı |
| **G2** — bot koruması | Turnstile |
| **H** — panel takvimi | Gün/hafta/ay, randevu detayı, durum değiştirme |
| **CI/CD** | `dogrula` + `yayinla`; merge anı deploy anı |
| **L** — kalkan | Worker rate limiting; Turnstile'ın production'da sessizce kapalı olduğu bulundu |
| **L3** — "gelmedi" kısıtı | Gelmeyen müşteriye randevu kısıtı, işletme ayarlı |
| **M** — marketplace dizini | Dizin schema'sı, `dizin.ts`, panelde yayına çıkma, `/dizin` |
| **N** — ön kapı | Ortak üst bar/alt bilgi, müşteri kök sayfası, `/isletmeler-icin` |
| **I** — bildirim altyapısı | `email.ts`, queue yazma/boşaltma, altı şablon, preview ekranı |
| **O** — keşfedilebilirlik | `/dizin/[il]`, `/dizin/[il]/[kategori]`, `robots.ts`, `sitemap.ts`, faceted navigation gate'i |
| **J** — müşteri hesabı | `/uye-ol`, gerçek `/randevularim`, `getMusteriDb` (INVARIANT 1'in ikinci ekseni), sahipliğe bağlı iptal, link'le ekleme |
| **P** — tur sonrası düzeltmeler | Geliştirici ekranları production'da kapandı, hatırlatma vaadi düzeltildi, arama kategori + hizmet adına da bakıyor, kaybolan filtre, misafir→üye köprüsü, `/giris`'te iki çıkış, eksik sayfa başlıkları, `/gizlilik` |
| **H2a** — elle randevu | `/panel/randevu/yeni`, `POST /api/randevular`, müsaitlik motoru iki gate'e bağlandı (`MusaitlikKapisi`), serbest saat istisnası, `kaynak: ISLETME` |
| **H2b** — müşteri listesi | `/panel/musteriler` + detay, müşteri geçmişi, kayıt düzenleme (`PATCH /api/musteriler/[id]`), L3 kısıtının tek müşteri için kaldırılması |
| **P2a** — secret'sız build | `supabaseSunucu()` env'i `cookies()`ten sonra okuyor, CI'ın `cf:kur` adımından sahte değerler kalktı, iki statik gate |
| **P2b** — `/saglik` schema kontrolü | Kolon kümesi `sema.ts`'ten türetiliyor, migration sayısı ve `EXCLUDE` constraint'inin varlığı; `/api/saglik` makine yolu (200/503), public body daraltılmış |
| **P2c** — şifre sıfırlama | `token_hash` + `verifyOtp`, `/sifremi-unuttum` + `/sifre-yenile`, `girisYonu` `/api/giris` ile ortak, kullanıcı numaralandırması yok. Mail şablonu 13 Eylül'de Management API ile değiştirildi |
| **P2d** — smoke test ve health check | `scripts/duman.ts`; deploy'dan sonra version id eşleşene kadar `/api/saglik` + beş sayfa, `nabiz.yml` 30 dakikada bir. `version_metadata` binding'i → `X-Worker-Surum` |
| **P2e** — hata takibi | `src/lib/hata.ts > hataBildir()` tek gate (mesaj taşımıyor), `onRequestError`, Analytics Engine counter'ı, health check'te `scripts/hata-say.ts`. `console.error` yalnızca gate'te |
| **Q** — kalkan 2 | `randevu-kotasi.ts`: numara başına 24 saatte 5 randevu (iptaller dahil), işletme başına 24 saatte 20 yeni çevrim içi müşteri (dolunca yeni numara reddediliyor), `/panel`de yoğunluk uyarısı. IP sınırı CGNAT yüzünden sıkılaştırılmadı |
| **P2f** — health check scheduler | GitHub'ın `*/30`'u gerçekte 2–5,5 saatte bir koşuyordu. Saat Cloudflare Cron Trigger'a taşındı (`worker-girisi.ts`, `zamanlayici.ts` → `workflow_dispatch`); kontroller GitHub'da kaldı. Trigger başarısızsa gate'e yazıyor, 6 saatlik fallback run "scheduler canlı mı" diye yokluyor |
| **P2g** — log'daki query parametreleri | P2e'nin bulgusu kapandı: `drizzle-orm` yamalı (`patches/drizzle-orm+0.45.2.patch`, `postinstall`'da `patch-package`), `DrizzleQueryError` mesajı parametre taşımıyor. Next'in log satırı `Failed query: <sql>` olarak kaldı. Zorlayan `drizzle-yamasi.test.ts` |

### Sıradakiler

**Faz P2 — sağlamlaştırma (kalanlar)**
Faz P teknik borcun iki maddesini kapattı (vitrin production'da kapalı, `/saglik` arama
motorundan çekildi). P2'nin ilk PR'ı secret'ların yokluğunda build'i ayağa kaldırdı
(PR #35). Kalanlar, öncelik sırasıyla:

1. **Şifre sıfırlama.** **Kapandı** (PR #37): `token_hash` + `verifyOtp`, `girisYonu`
   `/api/giris` ile ortak. Mail şablonu (repo dışında yaşayan bir ayar) 13 Eylül'de
   değiştirildi; end-to-end deneme hâlâ açık (`TODOS.md > Faz P2 — şifre sıfırlama`).
2. **`/saglik`'in schema'yı gerçekten kontrol etmesi** — kolon kümesini `sema.ts`'ten
   türetip DB ile karşılaştırmak, migration sayısı ve `EXCLUDE` constraint'inin varlığı. **Kapandı**
   (PR #36). Deploy sonrası smoke test ve zamanlanmış health check de **kapandı** (P2d).
3. **Uyarı/hata takibi** — tek error gate + `onRequestError`. Üçüncü parti değil:
   repo public olduğu için zamanlanmış GitHub Actions ücretsiz ve başarısız run
   zaten bildirim gönderiyor. **Kapandı** (P2e): counter Analytics Engine'de, health check
   son bir saatte hata varsa kırmızı.

**P2e'nin bulduğu da kapandı (P2g).** Next yakalanmamış hatayı kendi log'una
basarken Drizzle'ın mesajındaki query parametrelerini de yazıyordu. Düzeltme kaynakta
yapıldı, log'da değil: `drizzle-orm` yamalı ve mesaj artık parametre taşımıyor.
Gerekçe ve ölçüm `TODOS.md > Faz P2 — log'daki query parametreleri`. **P2'de açık
madde kalmadı.**

**`scoped-db.ts` bölünmesi P2'den düşürüldü** — ölçülen faydası yok (bundle 0, test
süresi 0) ve closure variable'ı disiplinini zayıflatıyor. Gerekçe `TODOS.md > Faz P2`.

**Faz Q — kalkan 2** — **kapandı.** Dört maddenin üçü yapıldı; IP rate limit'in
sıkılaştırılması CGNAT gerekçesiyle reddedildi. İşletmeye özel ayarlanabilir tavan
migration gerektirdiği için bekliyor. Gerekçeler `TODOS.md > Faz Q — kalkan 2`.

**Faz K — SMS ve hatırlatma**
`sms.ts > gonder()` adaptörü. **Faz J'nin bıraktığı iş burada kapanıyor:** telefon
doğrulanmış bir kimlik olunca misafir randevularını numarayla toplu bağlamak güvenli
hale geliyor (bugün yalnızca iptal link'iyle tek tek ekleniyor — gerekçe
`TODOS.md > Faz J`). Hatırlatıcı bir Cron Trigger. **Ayrı Worker kararı P2f'de
zayıfladı:** gerekçe "`scheduled`'ı OpenNext'in Worker'ına iliştirmek adaptörün iç
yapısına bağımlılık yaratır" idi. OpenNext bu pattern'ı artık kendisi belgeliyor ve health check
scheduler'ı tam bu şekilde kuruldu (`worker-girisi.ts`). Hatırlatma aynı `scheduled`'a
ikinci trigger olarak eklenebilir. O zaman `POST /api/cron/hatirlatma` ve paylaşılan secret da
gerekmeyebilir, çünkü `scheduled` iş mantığını doğrudan çağırabilir. Karar Faz K'de verilecek.

## Doğrulama

**Her fazda, PR açmadan önce:**

```bash
npm run tip && npm run lint && npm test && npm run build
```

**Test layer'ları:**

| Layer | Neyi kanıtlar |
|---|---|
| `musaitlik.ts` unit testleri | Slot hesabı — DST, öğle arası, süre taşması, min bildirim |
| Route integration test'ler (gerçek Postgres) | Happy path · session'sız 401 · **başka işletmenin kaydı 404** · yarışan ikinci karar 409 |
| Çakışma testi | Aynı slota eşzamanlı iki `POST /api/randevu` → biri 201, biri 409 |
| `degismezler.test.ts` | Invariant 1, 2, 4 ve 12'yi dosya metnini tarayarak zorlar |
| Migration testi | Boş DB ve prod-benzeri veriyle |

**IDOR testi hiçbir route'da atlanmaz:** iki işletme oluştur, birinin kaydını diğerinin
session'ıyla iste, sızmadığını gör.

**End-to-end elle doğrulama** (her fazda tekrarlanır):
İşletme kaydol → hizmet + çalışma saati tanımla → dizine çık → `/`de arayıp bul →
`/r/<slug>`ten randevu al → panelde gör → iptal linkiyle iptal et → bildirim preview'unu
gör. **Aynısı mobil genişlikte ve koyu temada** — hedef kitle telefondan giriyor.

**Deploy doğrulaması:** `cf:kur` çıktısının gzip boyutu (bütçe 3 MiB, bugün 1878 KiB);
canlı yoklama artık elle değil, `yayinla` job'ının son adımı (`scripts/duman.ts`).

## Riskler ve elle yapılacaklar

| Konu | Durum |
|---|---|
| **Soğuk başlangıç** | Prod'da bugün **2 işletme, 0'ı dizinde yayında, 1 randevu (bizim testimiz)**. En büyük risk kod değil arz. Bursa ve İstanbul'da gerçek salon kaydedilmeden hiçbir faz bunu çözmüyor |
| **Faceted navigation yinelenen içerik** | `/dizin`in filtre parametreleri bugün serbest. Faz O'da canonical + robots kuralı konmadan sitemap yayınlanmamalı |
| **Worker boyut limiti** | Ücretsiz plan 3 MiB gzip; bugün 1634 KiB. Her fazda ölçülüyor. Aşarsa Workers Paid (~$5/ay) |
| **Kökte çalışan mevcut proje** | Bütün DNS ve Worker işleri **yalnızca `randevu.` subdomain'de**; kökteki A/AAAA, MX, SPF'e dokunulmaz |
| **Supabase custom SMTP** | Resend SMTP bilgileri girilene kadar *Confirm email* kapalı (yerleşik SMTP saatte 2 mail) |
| **Schema tek yön** | Rollback ucuzluğu yalnızca kod için. `goc` workflow hâlâ ayrı ve `"uygula"` yazılmasını istiyor; sıra **önce migration, sonra merge** |
| **Marka adı** | Yer tutucu. Netleşince `logo.tsx` + `marka.ts` + metinler değişir |
| **Supabase free tier** | Bir hafta hareketsiz projeler duraklatılıyor |
