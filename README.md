# Randevu

Kuaför, berber, güzellik salonu, cilt bakımı, masaj, diş kliniği, veteriner
gibi işletmelerden randevu alınan bir marketplace. Aynı zamanda o işletmelerin
kullandığı multi-tenant bir randevu SaaS'i.

- **Müşteri** işletmeyi arayıp bulur, uygun saati görür ve **hesap açmadan**
  randevusunu alır.
- **İşletme** hizmetlerini, personelini ve çalışma saatlerini tanımlar,
  randevularını panelden yönetir, müşterisine kendi linkini (`/r/<işletme>`)
  verir.

Canlı: <https://randevu.enesmemduhoglu.tech>

> Ürünün iki yüzü birbirine bağımlı: marketplace dolmadan hiçbir işletme
> kaydolmaz, marketplace de ancak `/r/<işletme>` linki tek başına işe yaradığı
> sürece dolar. Bu yüzden marketplace hiç olmasa bile işletme tarafı tek başına
> kullanılabilir olmak zorunda. Gerekçesi: `docs/plan.md > Kurucu ilkeler`.

---

## Özellikler

### Müşteri tarafı

| Route | Ne var |
|---|---|
| `/` | Arama, kategori kutucukları, Bursa ve İstanbul vitrini |
| `/dizin`, `/dizin/<il>`, `/dizin/<il>/<kategori>` | Marketplace listesi ve şehir/kategori landing sayfaları. Arama işletme adına, kategoriye ve hizmet adına bakıyor |
| `/r/<işletme>` | Randevu sayfası: hizmet → personel (birden fazla kişi veriyorsa) → gün ve saat → bilgiler. Mobile-first |
| `/r/<işletme>/randevu/<token>` | Randevunun durumu ve iptal linki (e-postayla gelen) |
| `/uye-ol`, `/randevularim` | Opsiyonel müşteri hesabı. Farklı işletmelerden alınmış randevular tek listede |

### İşletme tarafı

| Route | Ne var |
|---|---|
| `/isletmeler-icin`, `/kayit` | Landing sayfası ve işletme signup'ı |
| `/panel` | Onboarding adımları, randevu sayfasının adresi; olağan dışı yeni müşteri artışında uyarı |
| `/panel/takvim` | Günlük, haftalık, aylık takvim; randevu status'u değiştirme |
| `/panel/randevu/yeni` | Telefonla gelen randevuyu elle girme |
| `/panel/musteriler` | Müşteri listesi, geçmiş, kayıt düzenleme |
| `/panel/hizmetler`, `/panel/personel`, `/panel/calisma-saatleri` | CRUD; öğle arası için aynı güne iki aralık |
| `/panel/ayarlar` | İşletme bilgileri, il/ilçe/kategori, slot aralığı, en erken randevu, takvim penceresi, otomatik onay, no-show kısıtı, marketplace'te yayına çıkma |

### Backend

- **Availability engine** — DST geçişi, öğle arası, gün sınırı ve izin
  aralıklarını hesaba katan pure function (`src/lib/musaitlik.ts`).
- **Overlap constraint DB'de** — aynı personelin çakışan iki aktif randevusu
  `EXCLUDE USING gist` constraint'iyle imkânsız.
- **E-posta bildirimleri** — onay, iptal ve işletmeye yeni randevu mesajları
  Resend üzerinden; queue `bildirim_kuyrugu` tablosunda.
- **Bot ve abuse koruması** — Turnstile, Worker rate limit, telefon numarası
  başına günlük randevu limiti, işletme başına günlük yeni müşteri limiti ve
  no-show kısıtı.
- Password reset, session refresh, KVKK sayfası (`/gizlilik`).

### Henüz yok

| Eksik | Neden / ne zaman |
|---|---|
| SMS ve hatırlatmanın zamanında gönderilmesi | Faz K. Hatırlatma queue'ya yazılıyor ama onu işleyecek scheduler henüz yok |
| Randevu düzenleme | Bugün yalnızca status değişiyor; saat ya da personel değişmiyor |
| Misafir randevularını telefonla toplu hesaba bağlama | Telefon doğrulanmış bir kimlik değil; SMS verification'ı bekliyor |
| Personeli hesapla davet etme | — |
| Harita / konum araması | — |
| Ödeme, abonelik, komisyon | Bilerek: işletmeye şimdilik ücretsiz |

Sıradaki işler ve öncelikleri `docs/plan.md > Sıradakiler` bölümünde.

---

## Stack

| Layer | Seçim | Neden |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19 | — |
| Hosting | Cloudflare Workers, OpenNext adapter'ıyla | Domain zaten Cloudflare'de; free plan'ın 3 MiB (gzip) bundle limiti repodaki pek çok kararın gerekçesi |
| Database | Postgres 17 (Supabase) | Gerçek transaction ve `EXCLUDE` constraint; local'de Docker'da birebir aynı engine |
| ORM | Drizzle + postgres.js | Prisma 7'nin query compiler'ı WASM ve workerd runtime'da WASM derlemeye izin vermiyor. Faz B'de geçildi |
| Connection | Hyperdrive → Supavisor **session mode** (5432) | Supabase direct connection yalnızca IPv6; transaction mode (6543) prepared statement'ları kırıyor |
| Auth | Supabase Auth, `getClaims` ile | `getSession` cookie'deki değeri imzayı doğrulamadan döndürüyor |
| E-posta | Resend, SDK'sız düz `fetch` | Kullanılan tek endpoint bir POST; bundle bütçesi dar |
| Bot protection | Turnstile + Workers rate limiting | Aynı hesapta, ücretsiz |
| Observability | Workers Logs + Analytics Engine, GitHub Actions health check | Third-party servis yok |
| UI | Tailwind v4 + shadcn/ui, OKLCH design token'ları | Light/dark tema arasında hue kaymadan lightness ayarlanabiliyor |
| Test | Vitest, **gerçek Postgres'e** karşı | Mock'lanmış bir DB tenant leak'ini gösteremez |

---

## Mimari

```
Cloudflare Worker  (worker-girisi.ts: OpenNext fetch handler + Cron Trigger)
  └── Next.js App Router
        ├── /  /dizin/*            ── src/lib/dizin.ts       cross-tenant, read-only
        ├── /r/[slug]              ── getHalkaAcikDb(slug)   tek tenant, session yok
        ├── /panel/*  /api/*       ── getScopedDb(oturum)    tek tenant, session'lı
        └── /randevularim          ── getMusteriDb(id)       tek müşteri, çok tenant
                                         │
                            Drizzle → Hyperdrive → Supabase Postgres
```

### Üç data access katmanı

Repo multi-tenant ve **RLS kapalı**: tenant isolation'ın tamamı application
layer'da, tek bir yerde denetlenebilir biçimde duruyor. `src/app` altında ham
`db` import etmek ESLint hatası. Veriye giden her yol şu üç modülden birinden
geçiyor:

| Modül | Filtre | Kullanan | Karşılığı |
|---|---|---|---|
| `src/lib/scoped-db.ts` | `isletmeId` | Panel ve public randevu sayfası | Tenant id bir **closure** değişkeninde duruyor; caller onu parametre olarak veremiyor |
| `src/lib/musteri-db.ts` | `kullaniciId` | `/randevularim` | Müşterinin randevuları doğası gereği çok tenant'lı. Aynı disiplin, başka eksende. Yalnızca `randevu` yazılabiliyor, o da iki kolonda |
| `src/lib/dizin.ts` | yok — cross-tenant | Ana sayfa, marketplace, sitemap | Yalnızca `isletme` ve `hizmet` okunuyor; hizmet satırı hiç dönmüyor, yalnızca aggregate'i. Return type elle yazılı ve kapalı. Read-only |

Üçünün de sınırı testle enforce ediliyor (`src/lib/degismezler.test.ts`
dosyaların kaynağını tarıyor). Niyet beyanı olarak bırakılmıyorlar, çünkü
Prisma'dan Drizzle'a geçerken tenant kuralı sessizce enforce edilemez hale
geldi ve iki faz boyunca yalnızca code review'a bağlı kaldı.

### Panel request pipeline'ı

```
request → checkOrigin (CSRF) → session (JWT) → body parse
        → validation → scoped-db (tenant filtresi) → Postgres
```

İlk üç adım `src/lib/panel-kapisi.ts`'te ve bu sırayla. Hiçbiri network'e
çıkmadığı için o kısım Postgres olmadan test edilebiliyor.

### workerd'in üç kısıtı

Üçü de zor yoldan öğrenildi ve kodda comment'le işaretli:

1. **Runtime'da WASM yok.** Prisma bu yüzden bırakıldı.
2. **ICU build'i eksik.** `Intl.supportedValuesOf`, `Intl.NumberFormat` ve
   `localeCompare(…, "tr")` kullanılmıyor; Türkçe sıralama elle yazılı. Server
   ile browser farklı sıralarsa React hydration mismatch veriyor.
3. **Bundle limiti 3 MiB (gzip).** Her fazda `cf:kur` + `wrangler deploy
   --dry-run` ile ölçülüp `TODOS.md`'ye yazılıyor.

"Local'de çalışıyorsa workerd'de de çalışır" varsayımı bu repoda birkaç kez
yanlış çıktı. Runtime davranışına dair bir iddia `npm run cf:onizle` ile
ölçülür.

### Klasör yapısı

```
src/
  app/                 route'lar ve sayfalar — ham `db` YOK
    api/               route handler'lar
    panel/             işletme ekranları (auth zorunlu)
    r/[slug]/          public randevu sayfası
    dizin/             marketplace ve landing sayfaları
    randevularim/      müşteri hesabı
  components/          ui/ (shadcn), panel/, randevu/, dizin/, kimlik/, genel/
  db/sema.ts           Drizzle schema — tablo ve kolon adları Türkçe
  lib/                 business logic; data access, availability, timezone, bildirim, rate limit
  instrumentation.ts   yakalanmamış hataları error handler'a bağlar
drizzle/               migration SQL'leri
scripts/               DB kurulumu, prod migration, smoke test, error sayımı, demo seed
worker-girisi.ts       Worker entry point
wrangler.jsonc         Worker config; mode flag'leri, rate limit'ler, binding'ler
```

---

## Invariant'lar

Pazarlık konusu olmayan kurallar. Tam metin ve gerekçeleri **`CLAUDE.md`**'de
("Değişmezler" bölümü).

| # | Kural | Enforce eden |
|---|---|---|
| 1 | `src/app` altında ham `db` yok; tenant'a bağlı her query `scoped-db.ts` üzerinden | ESLint `no-restricted-imports` |
| 2 | Her mutation route'unda `checkOrigin` (CSRF'e karşı ikinci katman) | `degismezler.test.ts` |
| 3 | Karar değiştiren endpoint'lerde conditional UPDATE; etkilenen satır 0 ise 409 | route testleri |
| 4 | E-posta yalnızca `email.ts > gonder()` üzerinden | `degismezler.test.ts` |
| 5 | Secret'lar log'a ve error mesajlarına girmez; hatalar tek noktadan (`hata.ts > hataBildir()`) | `degismezler.test.ts` |
| 6 | `session.isletmeId` düz string kalır | type |
| 7 | Randevu zamanları DB'de UTC; local saate çevirme yalnızca `zaman.ts`'te, işletmenin timezone'uyla | — |
| 8 | Overlap engeli DB'de (`EXCLUDE USING gist`); application kontrolü garanti değil | migration + race condition testleri |
| 9 | `auth.users`'a foreign key yok | — |
| 10 | Renk değeri hardcode edilmez; semantic token ya da `marka.ts` | — |
| 11 | Cookie'lerin `Domain` attribute'u root domain'e genişletilmez | — |
| 12 | Cross-tenant okuma yalnızca `dizin.ts`'te ve dar | `degismezler.test.ts` |

---

## Local kurulum

**Gerekenler:** Node **24** (script'ler `.ts` dosyalarını doğrudan
çalıştırıyor, eski sürümde kırılır), Docker, npm.

```bash
git clone https://github.com/enesmemduhoglu/randevu.git
cd randevu
npm install

# Tek container, iki database: randevu_dev ve randevu_test
docker run -d --name randevu-test-pg -p 5455:5432 \
  -e POSTGRES_PASSWORD=postgres postgres:17-alpine

cp .env.example .env
cp .dev.vars.example .dev.vars

npm run db:hazirla                 # .env'deki database'leri oluşturur
npm run db:uygula                  # migration'ları randevu_dev'e uygular
npm run tohum:demo -- --onayla     # opsiyonel: marketplace'e birkaç demo işletme
npm run dev                        # http://localhost:3000
```

**API key'ler olmadan da ayağa kalkar.** Turnstile ve e-posta local'de default
olarak `sahte` modda: Turnstile her isteği geçiriyor, e-postalar gönderilmiyor,
queue'ya yazılıp `/panel/gelistirici/bildirimler` ekranında preview ediliyor.
Auth akışı için Supabase key'leri gerekli. `.env.example`'daki her satır neden
gerektiğiyle birlikte açıklanmış.

Local'de modu yalnızca `.env` belirliyor; `wrangler.jsonc`'deki production
değerleri `next dev`'e bilerek sızdırılmıyor (`src/lib/mod.ts`).

> **Windows notu.** `cf:kur` symlink oluşturuyor: **Developer Mode açık
> olmalı**, yoksa build `EPERM` ile düşer. `wrangler dev` çalışırken
> `.open-next` klasörü kilitli kalıyor; build'den önce process'leri kapatın.

---

## Komutlar

```bash
npm run dev              # dev server
npm run tip              # next typegen + tsc --noEmit
npm run lint             # eslint (tenant isolation kuralı dahil)
npm test                 # vitest — gerçek Postgres'e karşı
npm run test:izle        # vitest watch mode
npm run build            # next build

npm run db:hazirla       # .env'deki database'leri oluşturur
npm run db:goc           # schema değişince migration SQL'i üretir (drizzle-kit generate)
npm run db:uygula        # migration'ları local DB'ye uygular
npm run db:uygula:prod -- --onayla   # PROD'a (Supabase) uygular
npm run tohum:demo -- --onayla       # demo işletmeler (idempotent)

npm run cf:kur           # OpenNext build
npm run cf:onizle        # build + local workerd'de çalıştır
npm run cf:yayinla       # build + Cloudflare'e deploy (acil durum yolu)
npm run cf:tip           # wrangler types

npm run duman -- <url> [--surum <id>]   # canlı sitede smoke test
node scripts/hata-say.ts                # son bir saatin server error'ları
```

**PR açmadan önce:** `npm run tip && npm run lint && npm test && npm run build`.

---

## Test

Integration testleri **gerçek Postgres'e** karşı koşar
(`fileParallelism: false`). `randevu_test` database'ini
`vitest.global-setup.ts` kendisi oluşturuyor. `vitest.setup.ts` ise
`DATABASE_URL`'i `TEST_DATABASE_URL` ile eziyor; bu satır olmasa bir test
run'ı dev verisini silerdi.

Her route en az dört case ile gelir:

- happy path
- session yok → 401
- **başka işletmenin kaydı → 404/403 (IDOR)**
- yarışan ikinci karar → 409 (race condition)

IDOR testi atlanmaz: iki işletme oluşturulur, birinin kaydı diğerinin
session'ıyla istenir, leak olmadığı görülür.

```bash
npm test                              # tamamı
npx vitest run src/lib/dizin.test.ts  # tek dosya
```

---

## Deploy ve monitoring

GitHub Actions'ta dört workflow var:

| Workflow | Trigger | Ne yapar |
|---|---|---|
| `dogrula` | Her PR ve main'e her push | typecheck → lint → test → `cf:kur` |
| `yayinla` | main'e push, `dogrula` yeşilse | **Approval'sız** deploy, smoke test, GitHub Deployments kaydı |
| `goc` | Manuel, istenen branch'ten | Supabase'e migration uygular |
| `nabiz` | 30 dakikada bir (Cloudflare Cron Trigger tetikliyor) | Canlı siteye health check, son bir saatin server error'larını sayar |

**Merge eden deploy etmiş olur**, approval adımı yok. Kod ucuza rollback
ediliyor, çünkü Cloudflare her deploy'un version'ını saklıyor:

```bash
npx wrangler versions list
npx wrangler rollback <version-id>
```

**Schema değişikliği varsa sıra: önce migration, sonra merge.** Migration
`goc` workflow'uyla PR'ın branch'inden koşturulur. Drizzle explicit kolon
listesi ürettiği için eksik bir kolon, o tabloyu okuyan **her query'nin
patlaması** demek. Rollback de yalnızca kod için ucuz: `scripts/prod-goc.ts`
tek yönlü, bir deploy'u geri almak schema'yı geri almıyor.

**Monitoring üç katmanlı.** Deploy sonrası smoke test, yeni version id'si
`/api/saglik` response'unda görünene kadar bekliyor. Her hata `hataBildir()`
üzerinden Analytics Engine'deki counter'a yazılıyor. Health check son bir
saatte tek bir hata bile görürse kırmızı yanıyor. Otomatik rollback bilerek
yok: schema bozuksa eski kod da bozuk çalışır ve rollback yalnızca semptomu
saklar.

Gereken secret'lar, env variable'lar ve incident anında nereye bakılacağı:
**`docs/yayin.md`**.

---

## Dokümanlar

| Dosya | İçerik |
|---|---|
| `CLAUDE.md` | Invariant'lar, komutlar, test kuralları. Repo sözleşmesi |
| `docs/plan.md` | Ürün tanımı, kurucu ilkeler, mimari, data model, fazlar. Single source of truth |
| `TODOS.md` | Faz faz decision log. En değerli bölümleri "bilerek kapsam dışı" olanlar |
| `docs/yayin.md` | CI/CD pipeline, secret'lar, prod migration sırası, health check ve error tracking |
| `docs/marka.md` | Ses tonu, hitap, UI terim sözlüğü *(bağlayıcı)* |
| `docs/tasarim-sistemi.md` | Design token katmanları, contrast ölçümleri, component kuralları |

Bir tasarım kararını sorgulamadan önce `TODOS.md`'ye bakılır; iş bitince
oraya yazılır.

---

## Çalışma düzeni

- **Dil.** Code comment'leri, commit mesajları, PR açıklamaları ve UI
  metinleri Türkçe. Tablo ve kolon adları da Türkçe (`isletme`,
  `saat_dilimi`, `olusturma_tarihi`). Comment'ler kodun ne yaptığını değil
  **neden böyle yaptığını** anlatır.
- **Fazlar.** Her iş `faz-<harf>/<slug>` branch'inde, kendi PR'ıyla ilerler ve
  `TODOS.md`'ye bir bölüm bırakarak kapanır.
- **Commit'ler küçük.** Tek büyük commit değil, her biri tek bir şey anlatan
  çok sayıda commit.
