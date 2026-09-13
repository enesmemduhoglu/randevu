# Randevu

Kuaför, berber, güzellik salonu, cilt bakımı, masaj, diş kliniği, veteriner
gibi işletmelerden randevu alınan bir yer. Aynı zamanda o işletmelerin
kullandığı randevu yazılımı.

- **Müşteri** işletmeyi arayıp bulur, uygun saati görür ve **hesap açmadan**
  randevusunu alır.
- **İşletme** hizmetlerini, personelini ve çalışma saatlerini tanımlar,
  randevularını panelden yönetir, müşterisine kendi bağlantısını
  (`/r/<işletme>`) verir.

Canlı: <https://randevu.enesmemduhoglu.tech>

> Ürünün iki yüzü birbirine bağımlı: dizin dolmadan hiçbir işletme kaydolmaz,
> dizin de ancak `/r/<işletme>` bağlantısı tek başına işe yaradığı sürece
> dolar. Bu yüzden pazaryeri hiç olmasa bile işletme yazılımı tek başına
> kullanılabilir olmak zorunda. Gerekçesi: `docs/plan.md > Kurucu ilkeler`.

---

## Ne yapıyor

### Müşteri tarafı

| Yüzey | Ne var |
|---|---|
| `/` | Arama kutusu, kategori kutucukları, Bursa ve İstanbul vitrini |
| `/dizin`, `/dizin/<il>`, `/dizin/<il>/<kategori>` | Pazaryeri listesi ve şehir/kategori iniş sayfaları. Arama işletme adına, kategoriye ve hizmet adına bakıyor |
| `/r/<işletme>` | Randevu sayfası: hizmet → personel (birden fazla kişi veriyorsa) → gün ve saat → bilgiler. Mobil öncelikli |
| `/r/<işletme>/randevu/<jeton>` | Randevunun durumu ve iptal bağlantısı (e-postayla gelen) |
| `/uye-ol`, `/randevularim` | İsteğe bağlı müşteri hesabı. Farklı işletmelerden alınmış randevular tek listede |

### İşletme tarafı

| Yüzey | Ne var |
|---|---|
| `/isletmeler-icin`, `/kayit` | Tanıtım ve işletme kaydı |
| `/panel` | Kurulum adımları, randevu sayfasının adresi; olağan dışı yeni müşteri yoğunluğunda uyarı |
| `/panel/takvim` | Günlük, haftalık ve aylık takvim; randevu durumu değiştirme |
| `/panel/randevu/yeni` | Telefonla gelen randevuyu elle girme |
| `/panel/musteriler` | Müşteri listesi, geçmiş, kayıt düzenleme |
| `/panel/hizmetler`, `/panel/personel`, `/panel/calisma-saatleri` | Tanımlar; öğle arası için aynı güne iki aralık |
| `/panel/ayarlar` | İşletme bilgileri, il/ilçe/kategori, randevu aralığı, en erken randevu, takvim penceresi, otomatik onay, "gelmedi" kısıtı, dizinde yayına çıkma |

### Arka planda

- **Müsaitlik motoru** — yaz saati geçişi, öğle arası, gün sınırı ve izin
  aralıklarını hesaba katan saf bir fonksiyon (`src/lib/musaitlik.ts`).
- **Çakışma engeli veritabanında** — aynı personelin çakışan iki aktif
  randevusu `EXCLUDE USING gist` kısıtıyla imkânsız.
- **E-posta bildirimleri** — onay, iptal ve işletmeye yeni randevu mesajları
  Resend üzerinden; kuyruk `bildirim_kuyrugu` tablosunda.
- **Bot ve kötüye kullanım kalkanı** — Turnstile, Worker hız sınırı, numara
  başına günlük randevu tavanı, işletme başına günlük yeni müşteri tavanı ve
  "gelmedi" kısıtı.
- **Şifre sıfırlama**, oturum yenileme, KVKK sayfası (`/gizlilik`).

### Henüz yok

| Eksik | Neden / ne zaman |
|---|---|
| SMS ve hatırlatmanın zamanında gönderilmesi | Faz K. Hatırlatma kuyruğa yazılıyor ama onu boşaltacak zamanlayıcı henüz yok |
| Randevu düzenleme | Bugün yalnızca durum değişiyor; saat ya da personel değişmiyor |
| Misafir randevularını telefonla toplu hesaba bağlama | Telefon doğrulanmış bir kimlik değil; SMS doğrulamasını bekliyor |
| Personeli hesapla davet etme | — |
| Harita / konum araması | — |
| Ödeme, abonelik, komisyon | Bilerek: işletmeye şimdilik bedava |

Sıradaki işler ve öncelikleri `docs/plan.md > Sıradakiler` bölümünde.

---

## Yığın

| Katman | Seçim | Neden |
|---|---|---|
| Çatı | Next.js 16 (App Router), React 19 | — |
| Barındırma | Cloudflare Workers, OpenNext adaptörüyle | Alan adı zaten Cloudflare'de; ücretsiz planın 3 MiB (gzip) paket sınırı bu depodaki pek çok kararın gerekçesi |
| Veritabanı | Postgres 17 (Supabase) | Gerçek transaction ve `EXCLUDE` kısıtı; yerelde Docker'da birebir aynı motor |
| ORM | Drizzle + postgres.js | Prisma 7'nin sorgu derleyicisi WASM ve workerd çalışma anında WASM derlemeye izin vermiyor. Faz B'de geçildi |
| Bağlantı | Cloudflare Hyperdrive → Supavisor **session mode** (5432) | Supabase'in doğrudan bağlantısı yalnızca IPv6; transaction mode (6543) prepared statement'ları kırıyor |
| Kimlik | Supabase Auth, `getClaims` ile | `getSession` çerezdeki değeri imzayı doğrulamadan döndürüyor |
| E-posta | Resend, SDK'sız düz `fetch` | Kullanılan yüzey tek bir POST; paket bütçesi dar |
| Bot koruması | Turnstile + Workers rate limiting | Aynı hesapta, ücretsiz |
| Gözlem | Workers Logs + Analytics Engine sayacı, GitHub Actions nabzı | Üçüncü parti servis yok |
| Arayüz | Tailwind v4 + shadcn/ui, OKLCH token'lar | Açık ve koyu tema arasında ton kaymadan parlaklık ayarlanabiliyor |
| Test | Vitest, **gerçek Postgres'e** karşı | Mock'lanmış bir veritabanı kiracı sızıntısını gösteremez |

---

## Mimari

```
Cloudflare Worker  (worker-girisi.ts: OpenNext'in fetch'i + Cron Trigger)
  └── Next.js App Router
        ├── /  /dizin/*            ── src/lib/dizin.ts       kiracı-üstü, salt okunur
        ├── /r/[slug]              ── getHalkaAcikDb(slug)   tek kiracı, oturumsuz
        ├── /panel/*  /api/*       ── getScopedDb(oturum)    tek kiracı, oturumlu
        └── /randevularim          ── getMusteriDb(id)       tek müşteri, çok kiracı
                                         │
                            Drizzle → Hyperdrive → Supabase Postgres
```

### Üç veri kapısı

Bu depo çok kiracılı ve **RLS kapalı**: kiracı izolasyonunun tamamı uygulama
katmanında, tek bir yerde denetlenebilir biçimde duruyor. `src/app` altında ham
`db` import etmek eslint hatası. Veriye giden her yol şu üç kapıdan birinden
geçiyor:

| Kapı | Filtre | Kim kullanıyor | Karşılığı |
|---|---|---|---|
| `src/lib/scoped-db.ts` | `isletmeId` | Panel ve halka açık randevu sayfası | Kiracı bir **kapanış değişkeninde** duruyor; çağıran taraf onu parametre olarak veremiyor |
| `src/lib/musteri-db.ts` | `kullaniciId` | `/randevularim` | Müşterinin randevuları tanımı gereği çok kiracılı. Aynı disiplin, başka eksende. Yalnızca `randevu` yazılabiliyor, o da iki kolonda |
| `src/lib/dizin.ts` | yok — kiracı-üstü | Ana sayfa, dizin, sitemap | Yalnızca `isletme` ve `hizmet` okunuyor; hizmet satırı hiç dönmüyor, yalnızca toplamı. Dönen tip elle yazılı ve kapalı. Salt okunur |

Üçünün de sınırı bir testle zorlanıyor (`src/lib/degismezler.test.ts`
dosyaların metnini tarıyor). Niyet beyanı olarak bırakılmıyorlar, çünkü
Prisma'dan Drizzle'a geçerken kiracı kapısı sessizce zorlanamaz hale geldi ve
iki faz boyunca yalnızca kod incelemesine bağlı kaldı.

### Panelde bir isteğin yolu

```
istek → checkOrigin (CSRF) → oturum (JWT) → gövde ayrıştırma
      → girdi doğrulama → scoped-db (kiracı filtresi) → Postgres
```

İlk üç adım `src/lib/panel-kapisi.ts`'te ve bu sırayla. Hiçbiri ağa çıkmadığı
için o dilim Postgres'siz sınanabiliyor.

### workerd'in dayattığı üç kısıt

Üçü de sert öğrenildi ve kodda yorumla işaretli:

1. **Çalışma anında WASM yok.** Prisma bu yüzden bırakıldı.
2. **ICU derlemesi eksik.** `Intl.supportedValuesOf`, `Intl.NumberFormat` ve
   `localeCompare(…, "tr")` kullanılmıyor; Türkçe sıralama elle yazılı. Sunucu
   ile tarayıcı farklı sıralarsa React hidrasyonda uyuşmazlık görüyor.
3. **Paket sınırı 3 MiB (gzip).** Her fazda `cf:kur` + `wrangler deploy
   --dry-run` ile ölçülüp `TODOS.md`'ye yazılıyor.

"Yerelde çalışıyorsa workerd'de de çalışır" varsayımı bu depoda birkaç kez
yanlış çıktı. Çalışma anına dair bir iddia `npm run cf:onizle` ile ölçülür.

### Dizin yapısı

```
src/
  app/                 route'lar ve sayfalar — ham `db` YOK
    api/               route handler'lar
    panel/             işletme ekranları (oturum zorunlu)
    r/[slug]/          halka açık randevu sayfası
    dizin/             pazaryeri ve iniş sayfaları
    randevularim/      müşteri hesabı
  components/          ui/ (shadcn), panel/, randevu/, dizin/, kimlik/, genel/
  db/sema.ts           Drizzle şeması — tablo ve alan adları Türkçe
  lib/                 iş mantığı; kapılar, müsaitlik, zaman, bildirim, kalkan
  instrumentation.ts   yakalanmamış hataları hata kapısına bağlar
drizzle/               göç SQL'leri
scripts/               veritabanı hazırlığı, prod göçü, duman testi, hata sayımı, demo tohumu
worker-girisi.ts       Worker giriş noktası
wrangler.jsonc         Worker yapılandırması; mod anahtarları, hız sınırları, binding'ler
```

---

## Değişmezler

Pazarlık konusu olmayan kurallar. Tam metin ve gerekçeleri **`CLAUDE.md`**'de.

| # | Kural | Zorlayan |
|---|---|---|
| 1 | `src/app` altında ham `db` yok; kiracıya bağlı her sorgu `scoped-db.ts` üzerinden | eslint `no-restricted-imports` |
| 2 | Her mutasyon route'unda `checkOrigin` (CSRF ikinci katmanı) | `degismezler.test.ts` |
| 3 | Karar değiştiren yollarda koşullu UPDATE; etkilenen satır 0 ise 409 | route testleri |
| 4 | E-posta yalnızca `email.ts > gonder()` üzerinden | `degismezler.test.ts` |
| 5 | Sırlar log'a ve hata metnine girmez; hata yolu tek kapıdan (`hata.ts > hataBildir()`) | `degismezler.test.ts` |
| 6 | `session.isletmeId` düz string kalır | tip |
| 7 | Randevu zamanları DB'de UTC; yerel saate çevirme yalnızca `zaman.ts`'te, işletmenin saat dilimiyle | — |
| 8 | Çakışma engeli veritabanında (`EXCLUDE USING gist`); uygulama kontrolü garanti değil | göç + yarış testleri |
| 9 | `auth.users`'a foreign key yok | — |
| 10 | Renk değeri kodda sabit yazılmaz; semantic token ya da `marka.ts` | — |
| 11 | Çerezlerin `Domain` niteliği kök alan adına genişletilmez | — |
| 12 | Kiracı-üstü okuma yalnızca `dizin.ts`'te ve dar | `degismezler.test.ts` |

---

## Yerelde çalıştırma

**Gerekenler:** Node **24** (betikler `.ts` dosyalarını doğrudan
çalıştırıyor, daha eski sürümde kırılır), Docker, npm.

```bash
git clone https://github.com/enesmemduhoglu/randevu.git
cd randevu
npm install

# Tek konteyner, iki veritabanı: randevu_dev ve randevu_test
docker run -d --name randevu-test-pg -p 5455:5432 \
  -e POSTGRES_PASSWORD=postgres postgres:17-alpine

cp .env.example .env
cp .dev.vars.example .dev.vars

npm run db:hazirla                 # .env'deki veritabanlarını oluşturur
npm run db:uygula                  # göçleri randevu_dev'e uygular
npm run tohum:demo -- --onayla     # isteğe bağlı: dizinde birkaç demo işletme
npm run dev                        # http://localhost:3000
```

**Anahtar olmadan da ayağa kalkar.** Bot kapısı ve bildirim kanalı yerelde
varsayılan olarak `sahte` modda: Turnstile her isteği geçiriyor, e-postalar
gönderilmiyor, kuyruğa yazılıp `/panel/gelistirici/bildirimler` ekranında
önizleniyor. Kimlik akışı için Supabase anahtarları gerekli. `.env.example`'daki
her satır neden gerektiğiyle birlikte açıklanmış.

Yerelde modu yalnızca `.env` belirliyor; `wrangler.jsonc`'deki üretim değerleri
`next dev`'e bilerek sızdırılmıyor (`src/lib/mod.ts`).

> **Windows notu.** `cf:kur` symlink oluşturuyor: **Geliştirici Modu açık
> olmalı**, yoksa build `EPERM` ile düşer. `wrangler dev` çalışırken
> `.open-next` dizini kilitli kalıyor; build'den önce süreçleri kapatın.

---

## Komutlar

```bash
npm run dev              # geliştirme sunucusu
npm run tip              # next typegen + tsc --noEmit
npm run lint             # eslint (izolasyon kapısı dahil)
npm test                 # vitest — gerçek Postgres'e koşar
npm run test:izle        # vitest, izleme modunda
npm run build            # next build

npm run db:hazirla       # .env'deki veritabanlarını oluşturur
npm run db:goc           # şema değişiminde SQL üretir (drizzle-kit generate)
npm run db:uygula        # yerel veritabanına uygular
npm run db:uygula:prod -- --onayla   # PROD'a (Supabase) uygular
npm run tohum:demo -- --onayla       # demo işletmeler (idempotent)

npm run cf:kur           # OpenNext build
npm run cf:onizle        # build + yerel workerd'de çalıştır
npm run cf:yayinla       # build + Cloudflare'e deploy (acil durum yolu)
npm run cf:tip           # wrangler types

npm run duman -- <adres> [--surum <id>]   # canlı site yoklaması
node scripts/hata-say.ts                  # son saatin sunucu hataları
```

**PR açmadan önce:** `npm run tip && npm run lint && npm test && npm run build`.

---

## Test

Entegrasyon testleri **gerçek Postgres'e** koşar (`fileParallelism: false`).
`randevu_test` veritabanını `vitest.global-setup.ts` kendisi oluşturuyor.
`vitest.setup.ts` ise `DATABASE_URL`'i `TEST_DATABASE_URL` ile eziyor; bu satır
olmasa bir test koşumu geliştirme verisini silerdi.

Her route en az dört durumla gelir:

- mutlu yol
- oturumsuz → 401
- **başka işletmenin kaydı → 404/403 (IDOR)**
- yarışan ikinci karar → 409

IDOR testi atlanmaz: iki işletme oluşturulur, birinin kaydı diğerinin
oturumuyla istenir, sızmadığı görülür.

```bash
npm test                              # tamamı
npx vitest run src/lib/dizin.test.ts  # tek dosya
```

---

## Yayın ve gözlem

GitHub Actions dört iş akışı taşıyor:

| İş akışı | Ne zaman | Ne yapar |
|---|---|---|
| `dogrula` | Her PR ve main'e her push | tip → lint → test → `cf:kur` |
| `yayinla` | main'e push, `dogrula` yeşilse | **Beklemeden** deploy, duman testi, Deployments kaydı |
| `goc` | Elle, istenen daldan | Supabase'e göç uygular |
| `nabiz` | 30 dakikada bir (Cloudflare Cron Trigger tetikliyor) | Canlı siteyi yoklar, son bir saatin sunucu hatalarını sayar |

**Merge eden yayınlamış olur**, onay tıklaması yok. Kod ucuza geri alınıyor,
çünkü Cloudflare her yayının sürümünü saklıyor:

```bash
npx wrangler versions list
npx wrangler rollback <surum-id>
```

**Şema değişikliği varsa sıra: önce göç, sonra merge.** Göç `goc` iş akışıyla
PR'ın dalından koşturulur. Drizzle açık kolon listesi ürettiği için eksik bir
kolon, o tabloyu okuyan **her sorgunun düşmesi** demek. Ve geri alma yalnızca
kod için ucuz: `scripts/prod-goc.ts` tek yön, bir yayını geri almak şemayı
geri almıyor.

**Gözlem üç katmanlı.** Deploy sonrası duman testi, yayınlanan sürümün kimliği
`/api/saglik` yanıtında görünene kadar bekliyor. Yakalanan her hata
`hataBildir()` üzerinden Analytics Engine'deki sayaca yazılıyor. Nabız son bir
saatte tek hata bile görürse kırmızı yanıyor. Otomatik geri alma bilerek yok:
şema bozuksa eski kod da bozuk çalışır ve geri alma yalnızca belirtiyi saklar.

Gereken sırlar, ortam değişkenleri ve arıza durumunda nereye bakılacağı:
**`docs/yayin.md`**.

---

## Belgeler

| Dosya | İçerik |
|---|---|
| `CLAUDE.md` | Değişmezler, komutlar, test kuralları. Depo sözleşmesi |
| `docs/plan.md` | Ürün tanımı, kurucu ilkeler, mimari, veri modeli, fazlar. Tek gerçek kaynak |
| `TODOS.md` | Faz faz karar günlüğü. En değerli bölümleri "bilerek kapsam dışı" olanlar |
| `docs/yayin.md` | Yayın hattı, sırlar, prod göçünün sırası, nabız ve hata takibi |
| `docs/marka.md` | Ses tonu, hitap, terim sözlüğü *(bağlayıcı)* |
| `docs/tasarim-sistemi.md` | Token katmanları, kontrast ölçümleri, bileşen kuralları |

Bir tasarım kararını sorgulamadan önce `TODOS.md`'ye bakılır; iş bitince
oraya yazılır.

---

## Çalışma düzeni

- **Dil.** Kod yorumları, commit mesajları, PR açıklamaları ve arayüz metinleri
  Türkçe. Tablo ve alan adları da Türkçe (`isletme`, `saat_dilimi`,
  `olusturma_tarihi`). Yorumlar kodun ne yaptığını değil **neden böyle
  yaptığını** anlatır.
- **Fazlar.** Her iş `faz-<harf>/<slug>` dalında, kendi PR'ıyla ilerler ve
  `TODOS.md`'ye bir bölüm bırakarak kapanır.
- **Commit'ler küçük.** Tek büyük commit değil, her biri tek bir şey anlatan
  çok sayıda commit.
