# Randevu SaaS — Uygulama Planı

## Bağlam

Kuaför, berber, güzellik salonu, özel ders veren eğitmen, danışman, terapist gibi randevuyla
çalışan küçük işletmeler için çok kiracılı (multi-tenant) bir randevu yönetim platformu
kuruluyor. İşletme kendi profilini, hizmetlerini ve çalışma saatlerini tanımlar; müşteri
işletmeye özel `/r/<slug>` sayfasından uygun saati görüp randevu alır; işletme sahibi tek
takvimden günlük/haftalık/aylık akışını yönetir.

Depo şu an tamamen boş — sıfırdan kurulacak. Hedef, karmaşık işletme yazılımlarının yerine
mobil uyumlu, sade ve hızlı anlaşılan bir deneyim koymak.

**Bu planın yaslandığı dört dış gerçek:**

1. **warden eklentileri global olarak açık** (`core@warden`, `nextjs-prisma@warden`). Bu depoda
   da çalışacaklar: `PreToolUse` kapısı route handler'da ham `db.*` çağrısını ve doğrudan
   `resend.emails.send` çağrısını **bloklar**; `Stop` hook'u karar günlüğü güncellenmediğinde
   uyarır. Yani mimari bu değişmezlerin etrafında değil, onlarla birlikte kuruluyor.
2. **Dağıtım Cloudflare'de**, Vercel yok. Vercel Marketplace yolu kapatıldı.
3. **Domain hazır: `enesmemduhoglu.tech` ve zaten Cloudflare'de.** NS kayıtları
   `stan`/`jean.ns.cloudflare.com`; kök alan adı proxy arkasında ve üzerinde başka bir proje
   çalışıyor; kökte **Cloudflare Email Routing** var (`route1-3.mx.cloudflare.net`, SPF
   `include:_spf.mx.cloudflare.net`). Bu yüzden hem uygulama hem e-posta **alt alan adında**
   kurulur; köke dokunulmaz.
4. **Marka adı sonraya bırakıldı.** Tasarım dili marka adından bağımsız kuruluyor; wordmark
   yer tutucu bir adla çalışır ve ad netleştiğinde tek bileşen değişir.

## Kararlar

| Konu | Karar | Gerekçe |
|---|---|---|
| Çatı | Next.js 16 App Router + TypeScript | `@opennextjs/cloudflare` Next.js 16'yı tam destekliyor; warden'ın `nextjs-prisma` araç zinciri aynen geçerli |
| Dağıtım | Cloudflare Workers, custom domain **`randevu.enesmemduhoglu.tech`** | Zone zaten Cloudflare'de; Workers Custom Domain doğrudan çalışır, kökteki mevcut projeye dokunmaz |
| E-posta gönderimi | Resend, **`randevu.enesmemduhoglu.tech`** alt alan adı doğrulanır | Kökte Email Routing'in MX ve SPF'i duruyor; alt alan adında doğrulama onları hiç kurcalamaz |
| Veritabanı | Supabase Postgres, Workers'a **Hyperdrive** binding'i ile | Gerçek transaction + `EXCLUDE` kısıtı; yerelde Docker Postgres birebir aynı motor |
| ORM | Prisma 6 + `@prisma/adapter-pg`, `driverAdapters` + `queryCompiler` | Bundle boyutu ve soğuk başlangıç; warden kapısı Prisma çağrı biçimini tanıyor |
| Kimlik | Supabase Auth (JWT) + `@supabase/ssr` | Kayıt, şifre sıfırlama, telefon OTP hazır; müşteri hesabı da aynı sistemde |
| Kiracı izolasyonu | `getScopedDb(session)` — uygulama katmanı, **RLS kapalı** | warden kapısı bunun üstüne kurulu; tek izolasyon mekanizması, tek yerde denetlenebilir |
| Randevu URL'i | `randevu.enesmemduhoglu.tech/r/<isletme-slug>` | Tek Worker, tek sertifika; wildcard DNS ve per-kiracı sertifika işi yok |
| Personel | Şemada tam, UI'da sade | Sonradan 2. personel eklemek migration gerektirmesin |
| Bildirimler | E-posta ve SMS aynı desen: adaptör + kuyruk + önizleme | Gerçek e-posta artık açılabilir; desen yine de kalır — testler gerçek mail atmamalı ve SMS sağlayıcısı henüz yok |
| Estetik | Sıcak ve davetkâr | Baskın segmentler kuaför/berber/güzellik; müşterinin gördüğü sayfada sıcaklık güven veriyor |
| Logo | Tipografik wordmark, kod içinde SVG | Her boyutta net, tema rengiyle değişir, favicon ve e-posta başlığı tek kaynaktan, API anahtarı gerektirmez |
| Dil | Kod/commit/PR/yorum Türkçe (warden `faz` sözleşmesi); UI Türkçe | — |

## Mimari

### Katmanlar

```
Cloudflare Worker (OpenNext)  →  randevu.enesmemduhoglu.tech
  └── Next.js 16 App Router
        ├── /r/[slug]        halka açık randevu akışı
        ├── /panel/*         işletme yönetim paneli
        ├── /randevularim    müşteri hesabı
        └── /api/*           route handler'lar
              └── src/lib/scoped-db.ts   ← tek veri kapısı
                    └── Prisma + adapter-pg
                          └── Hyperdrive binding
                                └── Supabase Postgres (Direct connection)
```

### Kritik altyapı dosyaları

warden kapısının muaf tuttuğu dosyalar; ham Prisma ve dış SDK çağrıları **yalnızca** burada:

| Dosya | Sorumluluk |
|---|---|
| `src/lib/db.ts` | `PrismaClient`'ı **istek başına** üretir (aşağıdaki nota bak) |
| `src/lib/scoped-db.ts` | `getScopedDb(session)`, `getMusteriDb(session)`, `getHalkaAcikDb(isletmeId)` — her sorguya kiracı filtresi enjekte eder |
| `src/lib/auth.ts` | Supabase access token'ını doğrular, `Kullanici`'yı yükler, `session` üretir |
| `src/lib/origin.ts` | `checkOrigin(req)` — CSRF ikinci katmanı |
| `src/lib/email.ts` | `gonder()` — e-postanın tek çıkış noktası |
| `src/lib/sms.ts` | `gonder()` — SMS'in tek çıkış noktası |
| `src/lib/musaitlik.ts` | Saf fonksiyon: çalışma saati + randevu + kapalı aralık → uygun slotlar |
| `src/lib/zaman.ts` | UTC ↔ işletme saat dilimi dönüşümlerinin tek yeri |
| `src/lib/marka.ts` | Renk/tipografi sabitleri — e-posta şablonları ve inline kullanım buradan okur |

**Prisma istemcisi istek başına üretilir.** Workers'ta modül seviyesinde tutulan bir
`PrismaClient`'ın Hyperdrive ile takıldığı bilinen bir sorun var
([prisma#28193](https://github.com/prisma/prisma/issues/28193)):

```ts
// src/lib/db.ts — kapi disi: ham Prisma burada kurulur
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Workers'ta modul seviyesinde tekil istemci Hyperdrive ile takiliyor;
// bu yuzden her istekte yeni istemci. Yerelde/testte DATABASE_URL'e duser.
export async function getDb(): Promise<PrismaClient> {
  const url = await baglantiDizesi();
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
```

Sonuç: `getScopedDb(session)` de `async` olur. Route iskeleti buna göre yazılır.

### Kimlik akışı

Supabase Auth yalnızca **kimlik** için; veri modelinin tamamı Prisma'nın.

1. `@supabase/ssr` httpOnly cookie'de access + refresh token tutar.
2. `auth()` token'ı `jose` ile doğrular → `sub` = `authUserId`.
3. `Kullanici` tablosundan tek indeksli lookup → `isletmeId`, `rol`.
4. Session: `{ kullaniciId, authUserId, isletmeId, rol }` — **`isletmeId` düz string**
   (warden değişmez #6).

**`auth.users`'a foreign key yok.** `Kullanici.authUserId` düz bir uuid string. Bedeli bir
tutarlılık garantisi; karşılığı şu: Prisma migration'ları tek başına tüm şemaya sahip olur,
yerel Docker Postgres'te `auth` şeması olmadan migrate edilir, entegrasyon testleri kendi
JWT'lerini imzalayıp koşabilir. İki migration sistemi (Prisma + Supabase CLI) taşımak bu
projede kazandırdığından çok götürürdü.

**Custom Access Token Hook kullanılmıyor.** `isletmeId`'yi claim'e yazmak istek başına bir
sorgu tasarruf ettirirdi ama rol/kiracı değişikliğinde bayat claim sorunu ve ikinci bir
migration yüzeyi getirirdi. Gerekirse sonradan eklenir; `auth.ts` dışında hiçbir yeri etkilemez.

### Bildirim kanalları

E-posta gerçekten gönderilebilir durumda, ama üç parçalı desen yine de korunuyor — çünkü
testler gerçek mail atmamalı ve SMS sağlayıcısı henüz yok:

1. **Adaptör** — `email.ts > gonder()` ve `sms.ts > gonder()` tek çıkış noktası. Sağlayıcı
   arkada; `BILDIRIM_MODU=sahte|gercek` env değişkeniyle seçilir. Test ve yerel geliştirme
   her zaman `sahte`.
2. **Kuyruk** — `BildirimKuyrugu` tablosu. Gönderilecek her mesaj önce buraya yazılır;
   gönderim ayrı bir adım. Hatırlatmalar zaten zamanlanmış olduğu için bu tablo moddan
   bağımsız gerekli.
3. **Önizleme** — `/panel/gelistirici/bildirimler`: kuyruktaki mesajların gerçek HTML'i
   tarayıcıda görülür.

**E-posta alan adı kökte değil, alt alan adında doğrulanır.** Kökte Cloudflare Email
Routing'in MX'i ve kendi SPF'i duruyor; Resend'i köke bağlamak o kayıtları birleştirmeyi
gerektirir ve mevcut projenin gelen postasını riske atar. Resend
`randevu.enesmemduhoglu.tech` için kendi kayıtlarını ister (`send.` altında MX + SPF,
`resend._domainkey.` altında DKIM) — hiçbiri kökteki kayıtlarla çakışmaz.
Gönderen: `Randevu <bildirim@randevu.enesmemduhoglu.tech>`.

**Supabase Auth e-postaları da aynı yerden gider.** Resend'in SMTP kimlik bilgileri
Supabase'e custom SMTP olarak girilir; doğrulama ve şifre sıfırlama mailleri de marka alan
adından çıkar ve yerleşik SMTP'nin **saatte 2 mesaj** limiti
([kaynak](https://supabase.com/docs/guides/auth/auth-smtp)) devreden çıkar. Custom SMTP
bağlanana kadar *Confirm email* kapalı tutulur.

## Tasarım dili

`/design` yolu: `brand` → `design-system` → `ui-styling`, randevu akışı için `ui-ux-pro-max`.

### Palet ve tipografi (seçilen yön: sıcak ve davetkâr)

```
Zemin    #FAF8F5   sıcak beyaz
Metin    #1C1917   koyu taş
Vurgu    #C2643C   terracotta
İkincil  #2A9D8F   yumuşak teal
Başlık   Fraunces
Metin    Inter
Köşe     12px, yumuşak gölge
```

Bunlar **primitive** katman. `design-system` skill'i üç katmanlı token üretir
(primitive → semantic → component); bileşenler primitive rengi doğrudan kullanmaz,
`--renk-vurgu-zemin` gibi semantic token üzerinden gider. Açık ve koyu tema aynı semantic
isimleri farklı primitive'lere bağlar.

**Vurgu rengi seyrek kullanılır.** Panel günde saatlerce açık duracak; terracotta yalnızca
birincil eylem, aktif durum ve seçili slot için. Takvimdeki randevu blokları hizmet renginden
gelir, marka renginden değil.

### Tipografi notu

`next/font` ile self-host — Workers'ta dış istek olmaz. **`latin-ext` subset'i şart**;
Türkçe'nin `ğ ı ş İ` karakterleri `latin` subset'inde yok. Fraunces değişken font olduğu için
yalnızca kullanılan ağırlık ekseni alınır (bundle boyutu Faz B'de ölçülen limite giriyor).

### Wordmark

`src/components/marka/logo.tsx` — `currentColor` kullanan SVG bileşeni. Aynı kaynak favicon
(`app/icon.tsx`), panel başlığı ve e-posta şablonu için kullanılır. Marka adı netleşince
yalnızca bu dosya ve `src/lib/marka.ts` değişir.

### Tasarlanacak yüzeyler

| Yüzey | Not |
|---|---|
| `/r/[slug]` randevu akışı | **Mobil öncelikli** — müşteri neredeyse her zaman telefondan girer. Hizmet → personel → gün/saat → bilgiler → onay; her adımda geri dönülebilir |
| Saat seçici | Ürünün en kritik bileşeni. Dolu/boş/seçili durumları, dokunma hedefi ≥44px, uzun listelerde gün bazlı gruplama |
| Panel takvimi | Gün/hafta/ay; yoğun bilgi, düşük görsel gürültü |
| Panel formları | Hizmet, personel, çalışma saati — shadcn form + zod |
| Boş / yükleniyor / hata durumları | Üçü de baştan tasarlanır; sonradan eklenen boş durum her zaman kötü görünür |
| E-posta şablonları | `marka.ts` token'larıyla inline CSS |

Erişilebilirlik hedefi: kontrast AA, görünür odak halkası, klavyeyle tam gezinilebilir
randevu akışı.

## Veri modeli

`prisma/schema.prisma`. Kiracıya bağlı her modelde `isletmeId` var.

- **`Isletme`** — `slug` (unique), ad, telefon, adres, hakkinda, `saatDilimi` (varsayılan
  `Europe/Istanbul`), `slotAraligiDk` (15), `minOnceBildirimDk`, `maksIleriGun`,
  `otomatikOnay`, aktif
- **`Kullanici`** — `authUserId` (unique), eposta, ad, telefon, `rol` (`SAHIP` | `PERSONEL` |
  `MUSTERI`), `isletmeId?` (müşteride null)
- **`Personel`** — isletmeId, ad, unvan, `kullaniciId?`, sira, aktif
- **`Hizmet`** — isletmeId, ad, aciklama, `sureDk`, `fiyatKurus`, renk, sira, aktif
- **`PersonelHizmet`** — personel ↔ hizmet çoka-çok (boşsa personel tüm hizmetleri verir)
- **`CalismaSaati`** — isletmeId, personelId, `haftaninGunu` (0–6), `baslangicDk`, `bitisDk`
  — öğle arası için aynı güne iki satır
- **`Kapali`** — isletmeId, `personelId?`, baslangic, bitis, aciklama (izin/tatil)
- **`Musteri`** — isletmeId, ad, telefon, eposta, not, `kullaniciId?`;
  `@@unique([isletmeId, telefon])`
- **`Randevu`** — isletmeId, personelId, hizmetId, musteriId, baslangic, bitis,
  `durum` (`BEKLIYOR` | `ONAYLI` | `IPTAL` | `TAMAMLANDI` | `GELMEDI`), not,
  `iptalToken` (unique), `kaynak` (`MUSTERI` | `ISLETME`)
- **`BildirimKuyrugu`** — randevuId, `tur` (`EPOSTA` | `SMS`), sablon, `planlananZaman`,
  `gonderimZamani?`, durum, hataMetni, `onizlemeHtml?`

### Çakışma engeli — veritabanı seviyesinde

Ürünün tek gerçek doğruluk problemi ve uygulama katmanında çözülmüyor:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Randevu" ADD CONSTRAINT randevu_cakisma_yok
  EXCLUDE USING gist (
    "personelId" WITH =,
    tstzrange("baslangic", "bitis", '[)') WITH &&
  ) WHERE ("durum" IN ('BEKLIYOR', 'ONAYLI'));
```

Prisma `EXCLUDE` kısıtını modelleyemediği için migration'a elle yazılan ham SQL olacak
(`/goc` skill'i ile). Uygulama katmanı kısıtı tekrar etmez; ihlali yakalayıp **409** döner.
İki müşteri aynı saniyede aynı slota bassa biri kazanır, diğeri temiz bir hata alır.

## Değişmezler (`CLAUDE.md`'ye yazılacak)

warden kapısının dayattığı dördü ve bu projeye özgü dördü:

1. Route handler'da ham `db.*` yok → `scoped-db.ts` üzerinden *(kapı bloklar)*
2. Mutasyon route'unda `checkOrigin` — makine yolları (Cron, Bearer) muaf *(kapı uyarır)*
3. Karar değiştiren yollarda koşullu `updateMany` → `count === 0` ise 409 *(kapı uyarır)*
4. E-posta yalnızca `email.ts > gonder()`, SMS yalnızca `sms.ts > gonder()` *(kapı bloklar)*
5. Sırlar log'a ve hata metinlerine girmez
6. `session.isletmeId` düz string kalır
7. **Randevu zamanları DB'de `timestamptz` (UTC).** Yerel saate çevirme yalnızca `zaman.ts`
   üzerinden ve işletmenin `saatDilimi` alanıyla. Sunucu saat dilimine hiçbir yerde güvenilmez
8. **Çakışma engeli DB'de.** Uygulama kontrolü kullanıcıya erken geri bildirim içindir,
   garanti değildir; garanti `EXCLUDE` kısıtındadır
9. **`auth.users`'a FK yok**; `Kullanici.authUserId` düz string
10. **Renk değeri kodda sabit yazılmaz** — bileşenler semantic token, e-posta şablonları
    `marka.ts` kullanır
11. **Cookie'lerin `Domain` niteliği köke genişletilmez.** Oturum cookie'si yalnızca
    `randevu.enesmemduhoglu.tech` host'una bağlı kalır; `.enesmemduhoglu.tech` yazmak
    oturumu kökteki mevcut projeyle paylaşmak demektir

## Fazlar

warden `faz` sözleşmesi: her faz `faz-<harf>/<slug>` branch'inde, kendi PR'ıyla, `TODOS.md`'ye
bir satır bırakarak kapanır. Commit ve push kullanıcı onayı olmadan atılmaz.

### Faz A — iskele
Next.js 16 + TS + Tailwind v4, Prisma + `adapter-pg`, Docker Postgres, Vitest
(`fileParallelism: false`) + global setup, `git init`, `CLAUDE.md` (değişmezler), `TODOS.md`,
`.claude/settings.json`'a warden test DB env'leri (`WARDEN_TEST_PG_NAME=randevu-test-pg`,
`WARDEN_TEST_PG_DB=randevu_test`).
**Yapmaz:** iş mantığı, deploy, tasarım.

### Faz B — Cloudflare zemini *(bilerek erken)*
`@opennextjs/cloudflare`, `wrangler.jsonc` (`nodejs_compat`, Hyperdrive binding, KV cache),
Supabase projesi + **Direct connection** string'i ile Hyperdrive, tek Prisma sorgusu yapan bir
sayfa canlıya çıkar, **bundle boyutu ölçülür**.
Yayın adresi: Workers Custom Domain olarak **`randevu.enesmemduhoglu.tech`** — zone zaten
Cloudflare'de olduğu için tek kayıt yeterli, kökteki projeye dokunulmaz. Önizleme dağıtımları
`*.workers.dev` üzerinde kalır.
Erken, çünkü OpenNext + Prisma + Hyperdrive üçlüsünün çalıştığını yedi faz sonra öğrenmek
pahalı olur. Kritik dosyalar: `open-next.config.ts`, `wrangler.jsonc`, `src/lib/db.ts`.

### Faz C — tasarım dili ve bileşen katmanı
`brand` → ses tonu ve Türkçe mikro metin dili (`docs/marka.md`).
`design-system` → üç katmanlı token, Tailwind v4 `@theme`, açık/koyu tema
(`src/app/globals.css`, `docs/tasarim-sistemi.md`, `src/lib/marka.ts`).
`ui-styling` → shadcn/ui init ve tema eşlemesi; temel bileşen seti (button, input, select,
dialog, sheet, popover, calendar, badge, card, form, sonner).
`ui-ux-pro-max` → randevu akışı ve saat seçici için UX kalıpları, erişilebilirlik kuralları.
Wordmark bileşeni + favicon. `next/font` ile Fraunces + Inter, **`latin-ext` subset'i dahil**.
Çıktı, bir "bileşen vitrini" sayfasıyla gözle doğrulanır.

### Faz D — kimlik ve kiracı
Supabase Auth + `@supabase/ssr`, `src/lib/auth.ts`, `src/lib/scoped-db.ts`,
`src/lib/origin.ts`, işletme kayıt akışı (Isletme + Kullanici + varsayılan Personel tek
transaction'da), giriş/çıkış, `/panel` koruması. Confirm email kapalı. İlk IDOR testleri burada.

### Faz E — şema ve panel CRUD
Tüm modeller + `EXCLUDE` migration'ı (`/goc` ile, boş DB ve dolu DB'de sınanır).
`/panel/hizmetler`, `/panel/personel`, `/panel/calisma-saatleri`, `/panel/ayarlar` ve
karşılık gelen route'lar (`/route-ekle` ile).

### Faz F — müsaitlik motoru
`src/lib/musaitlik.ts` — saf fonksiyon, DB'ye dokunmaz. Yoğun unit test: gün sınırı, öğle
arası, DST geçişi, hizmet süresi slot'a sığmama, min bildirim süresi, kapalı aralıklar, dolu
randevular. `GET /api/musaitlik` bunu sarar.
Ürünün kalbi burası; testlerin en yoğun olduğu faz.

### Faz G — halka açık randevu sayfası
`/r/[slug]`: hizmet → personel → gün/saat → bilgiler → onay. `POST /api/randevu` (oturumsuz,
`getHalkaAcikDb` ile kapsamlı), `iptalToken`'lı `/r/[slug]/randevu/[token]` iptal sayfası.
Bot koruması **Cloudflare Turnstile** (ücretsiz, aynı hesapta) + `/api/randevu` üstüne
Cloudflare rate limiting kuralı + aynı telefon için günlük randevu sınırı.
Eşzamanlı iki POST'un birinin 409 aldığı test bu fazda.

### Faz H — panel takvimi
Günlük / haftalık / aylık görünüm, randevu detayı, durum değiştirme (koşullu `updateMany` →
409), elle randevu ekleme, müşteri listesi ve müşteri geçmişi.

### Faz I — bildirim altyapısı
`src/lib/email.ts > gonder()`, `BildirimKuyrugu` yazımı, şablonlar (oluşturma, iptal,
hatırlatma), `/panel/gelistirici/bildirimler` önizleme ekranı. Yerelde ve testte
`BILDIRIM_MODU=sahte`, prod'da `gercek`.
Ön koşul: Resend'de `randevu.enesmemduhoglu.tech` doğrulaması ve DKIM/SPF/MX kayıtlarının
Cloudflare DNS'e eklenmesi; ardından Supabase'e custom SMTP girilip *Confirm email* açılır.
Resend'in `{ data, error }` dönüşü **okunur** — warden kapısının doğrudan çağrıyı
bloklamasının sebebi tam olarak bu.

### Faz J — müşteri hesabı
`/randevularim`, misafir randevusunu telefon/e-posta eşleşmesiyle hesaba bağlama,
`getMusteriDb` kapsamı ve kendi IDOR testleri.

### Faz K — SMS hatırlatma ve zamanlama
`src/lib/sms.ts > gonder()` adaptörü (sahte sürüm kuyruğa yazar).
`workers/hatirlatici/` — ayrı, küçük bir Worker; Cron Trigger'la `POST /api/cron/hatirlatma`
yolunu paylaşılan sırla çağırır (makine yolu, `checkOrigin` muaf), kuyruktaki zamanı gelmiş
bildirimleri işler.
Ayrı Worker, çünkü OpenNext'in ürettiği Worker `fetch` export ediyor; `scheduled` handler'ı
oraya iliştirmek adaptörün iç yapısına bağımlılık yaratır.

## Doğrulama

**Her fazda, PR açmadan önce:**

```bash
npx tsc --noEmit
npm test
npm run build
```

**Test katmanları:**

| Katman | Neyi kanıtlar |
|---|---|
| `musaitlik.ts` unit testleri | Slot hesabı — DST, öğle arası, süre taşması, min bildirim |
| Route entegrasyon testleri (gerçek Postgres) | Mutlu yol · oturumsuz 401 · **başka işletmenin kaydı 404** · yarışan ikinci karar 409 |
| Çakışma testi | Aynı slota eşzamanlı iki `POST /api/randevu` → biri 201, biri 409 |
| Migration testi (`/goc`) | Boş DB ve prod-benzeri veriyle, geri alma yolu yazılı |

**IDOR testi hiçbir route'da atlanmaz:** iki işletme oluştur, birinin kaydını diğerinin
oturumuyla iste, sızmadığını gör.

**Tasarım doğrulaması:** Faz G ve H sonrası `design-review` skill'i (tasarımcı gözüyle QA —
boşluk tutarsızlığı, hiyerarşi, yavaş etkileşim) koşturulur ve bulguları o fazın PR'ında
kapatılır.

**Uçtan uca elle doğrulama** (Faz G sonrası, her fazda tekrarlanır):
İşletme kaydol → hizmet + çalışma saati tanımla → gizli sekmede `/r/<slug>` aç → randevu al →
panelde göründüğünü gör → iptal linkiyle iptal et → panelde iptal göründüğünü gör →
önizleme ekranında bildirim HTML'inin doğru üretildiğini gör.
**Aynısı mobil genişlikte** — hedef kitle telefondan giriyor.

**Deploy doğrulaması** (Faz B'den itibaren her deploy'da):
`npx opennextjs-cloudflare build` çıktısının gzip boyutu; preview URL'de Prisma sorgusu yapan
sayfanın 200 dönmesi.

## Riskler ve elle yapılacaklar

| Konu | Durum |
|---|---|
| **Worker boyut limiti** | Ücretsiz plan 3 MiB (gzip), ücretli 10 MiB. Next.js + Prisma + iki font ile ücretsiz limit zorlanır. Azaltma: `queryCompiler` (Rust motoru yok), modüler `date-fns`, font ekseni kısıtlama. Faz B'de ölçülecek; aşarsa **Workers Paid (~$5/ay)** gerekir |
| **Kökte çalışan mevcut proje** | `enesmemduhoglu.tech` kökünde başka bir proje ve Cloudflare Email Routing var. Bütün DNS ve Worker route işleri **yalnızca `randevu.` alt alan adında** yapılır; kökteki A/AAAA, MX ve SPF kayıtlarına dokunulmaz |
| **Resend alan adı doğrulaması** | `randevu.enesmemduhoglu.tech` için DKIM/SPF/MX kayıtları Cloudflare DNS'e eklenmeli — Faz I'nin ön koşulu, senin onayınla eklenir |
| **Supabase custom SMTP** | Resend SMTP bilgileri girilene kadar *Confirm email* kapalı kalır (yerleşik SMTP saatte 2 mail) |
| **Docker çalışmıyor** | Docker Desktop kurulu ama daemon kapalı. Testler gerçek Postgres istiyor — Faz A'dan önce açılmalı |
| **Supabase hesabı** | Faz B'de proje açılmalı, **Direct connection** string'i alınmalı (pooled değil — Hyperdrive havuzlamayı kendi yapar) |
| **Marka adı** | Wordmark yer tutucu adla çalışır. Ad netleşince `logo.tsx` + `marka.ts` + metinler değişir; başka hiçbir yeri etkilemez |
| **Supabase ücretsiz katman** | Bir hafta hareketsiz projeler duraklatılıyor. Geliştirmede sorun değil, demoda akılda tutulmalı |
| **Prisma `queryCompiler`** | Hâlâ preview. Sorun çıkarsa `--no-engine` ile klasik driver adapter yoluna dönülür — bundle büyür, davranış değişmez |
