# Randevu

Küçük işletmeler için çok kiracılı randevu SaaS'i. Kuaför, berber, güzellik
uzmanı — yazılımcı olmayan, paneli müşterisiyle ilgilenirken telefondan açan
insanlar için.

İşletme hizmetlerini ve çalışma saatlerini tanımlıyor; müşteri
`randevu.enesmemduhoglu.tech/r/<işletme>` adresinden **hesap açmadan** uygun
saati seçip randevu alıyor.

Canlı: <https://randevu.enesmemduhoglu.tech>

---

## Ne var, ne yok

| Çalışıyor | Henüz yok |
|---|---|
| İşletme kaydı, giriş, oturum yenileme | E-posta / SMS bildirimi *(Faz I, K)* |
| Panel: hizmet, personel, çalışma saatleri, ayarlar | Müşteri hesabı, `/randevularim` *(Faz J)* |
| Günlük / haftalık / aylık takvim, durum değiştirme | Şifre sıfırlama *(e-posta altyapısına bağlı)* |
| Müsaitlik motoru (yaz saati, öğle arası, çakışma) | Personeli hesapla davet etme |
| Halka açık randevu sayfası + iptal bağlantısı | Panelden elle randevu ekleme |
| Bot koruması (Turnstile) ve hız sınırı | Harita / konum araması |
| "Gelmedi" kısıtı | |
| Pazaryeri dizini (`/dizin`) ¹ | |

¹ Depoda hazır, henüz canlıya çıkmadı — `faz-m/dizin` dalında ve göçü prod'a
uygulanmadı.

Fazların tamamı ve **hangi kararın neden verildiği** `TODOS.md`'de. Yeni bir
şey yazmadan önce oraya bakılır; iş bitince oraya yazılır.

---

## Yığın

| Katman | Seçim | Neden |
|---|---|---|
| Çatı | Next.js 16.3 (App Router), React 19.2 | — |
| Veritabanı | Postgres 17 (Supabase) + Drizzle ORM | Prisma 7'nin sorgu derleyicisi WASM ve workerd çalışma anında WASM derlemeye izin vermiyor. Geçişin ölçülen kazancı: bundle **2734 → 1032 KiB gzip** |
| Barındırma | Cloudflare Workers (OpenNext) | Ücretsiz planın 3 MiB sınırı bu depodaki birçok kararın gerekçesi |
| Bağlantı | Cloudflare Hyperdrive → Supavisor **session mode** | Supabase direct bağlantı IPv6-only; transaction mode (6543) prepared statement kırıyor |
| Kimlik | Supabase Auth (`getClaims`, `getSession` değil) | `getSession` cookie'deki değeri **doğrulamadan** döndürüyor |
| Arayüz | Tailwind v4 + shadcn/ui, OKLCH token'lar | Açık/koyu tema arasında ton kaymadan parlaklık ayarlanabiliyor |
| Test | Vitest, **gerçek Postgres'e** karşı | Mock'lanmış bir veritabanı kiracı sızıntısını gösteremez |

---

## Hızlı başlangıç

**Gerekenler:** Node 20+ (geliştirmede 24 kullanılıyor), Docker Desktop, npm.

```bash
git clone <depo>
cd bookingPlatform
npm install

# Test ve geliştirme veritabanları (Docker Postgres ayakta olmalı)
docker run -d --name randevu-test-pg -p 5455:5432 \
  -e POSTGRES_PASSWORD=postgres postgres:17-alpine

cp .env.example .env               # değerleri doldur
cp .dev.vars.example .dev.vars

npm run db:hazirla                 # randevu_dev + randevu_test oluşturur
npm run db:uygula                  # migration'ları yerel veritabanına uygular
npm run dev                        # http://localhost:3000
```

`.env` içindeki değerlerin her biri o dosyada **neden gerektiğiyle birlikte**
açıklanmış durumda; Supabase ve Turnstile anahtarları olmadan da uygulama
ayağa kalkar (bot kapısı ve kimlik akışı `sahte` modda çalışır).

> **Windows notu.** `cf:kur` symlink oluşturuyor: **Geliştirici Modu açık
> olmalı**, yoksa build `EPERM` ile düşer. Ayrıca `wrangler dev` çalışırken
> `.open-next` dizini kilitli kalıyor — build'den önce süreçleri kapatın.

---

## Komutlar

```bash
npm run dev              # geliştirme sunucusu
npm run tip              # next typegen + tsc --noEmit
npm run lint             # eslint
npm test                 # vitest run — gerçek Postgres'e koşar
npm run test:izle        # vitest, izleme modunda
npm run build            # next build

npm run db:hazirla       # .env'deki veritabanlarını oluşturur
npm run db:goc           # şema değişiminde SQL üretir (drizzle-kit generate)
npm run db:uygula        # yerel veritabanına uygular
npm run db:uygula:prod -- --onayla   # PROD'a (Supabase) uygular

npm run cf:kur           # OpenNext build
npm run cf:onizle        # build + yerel workerd'de çalıştır
npm run cf:yayinla       # build + Cloudflare'e deploy
npm run cf:tip           # wrangler types
```

**PR açmadan önce:** `npm run tip`, `npm run lint`, `npm test`, `npm run build`.

---

## Mimari

```
src/
  app/            Next.js route'ları — HAM `db` YOK (eslint zorluyor)
    api/          route handler'lar; mutasyonlar panel-kapisi'ndan geçer
    panel/        işletme sahibinin ekranları (oturum zorunlu)
    r/[slug]/     müşterinin gördüğü randevu sayfası (oturumsuz)
    dizin/        halka açık pazaryeri listesi (kiracı-üstü)
  db/
    sema.ts       Drizzle şeması — tablo ve alan adları Türkçe
  lib/
    db.ts         ham istemci — YALNIZCA aşağıdaki dosyalar kullanır
    scoped-db.ts  ★ kiracı kapsama katmanı: her sorguya isletmeId enjekte eder
    dizin.ts      ★ tek KİRACI-ÜSTÜ okuma; karşılığı dar tutulmuş bir yüzey
    auth.ts       JWT doğrulama + rol/kiracı çözümü
    musaitlik.ts  saf müsaitlik motoru (`simdi` bile dışarıdan gelir)
    zaman.ts      UTC ↔ yerel saat; sunucunun dilimine hiçbir yerde güvenilmez
    panel-kapisi.ts  checkOrigin → oturum → gövde, bu sırayla
drizzle/          migration SQL'leri (0000…0004)
docs/             plan, marka dili, tasarım sistemi, yayın hattı
```

Bir isteğin panelde izlediği yol:

```
istek → checkOrigin (CSRF) → oturum (JWT) → gövde ayrıştırma
      → girdi doğrulama → scoped-db (kiracı filtresi) → Postgres
```

İlk üç adım ağa çıkmadığı için o dilim Postgres'siz sınanabiliyor; testler tam
olarak bu sıraya dayanıyor ve sıra bozulursa kırmızıya düşüyorlar.

---

## Değişmezler

Bu depoda pazarlık konusu olmayan kurallar var. Tamamı ve gerekçeleri
**`CLAUDE.md`**'de; en kritik dördü:

1. **`src/app` altında ham `db` yok.** Kiracıya bağlı her sorgu
   `scoped-db.ts` üzerinden gider; kiracı bir **kapanış değişkeninde** durur,
   yani çağıran taraf onu veremez. *(eslint `no-restricted-imports` zorluyor)*
2. **Mutasyon route'unda `checkOrigin`.** `SameSite=Lax` tek başına yetmez:
   `multipart/form-data` kabul eden yollar CORS'un "basit istek" sınıfına
   giriyor. *(`degismezler.test.ts` her route dosyasını okuyup arıyor)*
3. **Karar değiştiren yollarda koşullu UPDATE.** Önce-oku-sonra-yaz yok;
   beklenen durum `where`'e konur, etkilenen satır 0 ise 409 döner.
4. **Çakışma engeli veritabanında.** Aynı personelin çakışan iki aktif
   randevusu `EXCLUDE USING gist` kısıtıyla imkânsız. Uygulama katmanındaki
   kontrol kullanıcıya erken geri bildirim içindir, **garanti değildir**.

Kuralların çoğu bir metin taramasıyla ya da eslint kuralıyla **zorlanıyor** —
niyet beyanı olarak bırakılmıyorlar. Sebebi yaşanmış: Prisma'dan Drizzle'a
geçerken kiracı kapısı sessizce zorlanamaz hale geldi ve iki faz boyunca
yalnızca kod incelemesine bağlı kaldı.

---

## Test

Entegrasyon testleri **gerçek Postgres'e** koşar (`fileParallelism: false`).
`vitest.setup.ts`, `DATABASE_URL`'i `TEST_DATABASE_URL` ile ezer — bu satır
olmadan bir test koşumu geliştirme verisini silerdi.

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

## Yayın

GitHub Actions üç iş akışı taşıyor: `dogrula` (her PR), `yayinla` (yalnızca
`main`, **beklemeden**) ve `goc` (elle tetiklenen prod migration'ı).

**Merge eden yayınlamış olur** — onay tıklaması yok. Bir sorun çıkarsa kod geri
alınabiliyor, çünkü Cloudflare her yayının sürümünü saklıyor:

```bash
npx wrangler versions list
npx wrangler rollback <surum-id>
```

**Şema değişikliği varsa sıra: önce göç, sonra merge.** Yeni kolonu okuyan kod,
kolon yerinde değilken canlıya çıkmamalı — Drizzle açık kolon listesi ürettiği
için eksik bir kolon "o alan `undefined` gelir" değil, o tabloyu okuyan **her
sorgunun düşmesi** demek. Bu sıra bir kez bozuldu; ne olduğu ve neden fark
edilmediği `TODOS.md > "Sıra bozulunca"` bölümünde.

Göç `workflow_dispatch` ile **PR'ın dalından** koşturulur; merge anı artık yayın
anı olduğu için "merge sonrası göçü koştururum" diye bir pencere yok. Ve
rollback'in ucuzluğu yalnızca kod için geçerli: `scripts/prod-goc.ts` tek yön,
bir yayını geri almak şemayı geri almıyor.

Ayrıntı, gereken sırlar ve ortam değişkenleri: **`docs/yayin.md`**.

---

## Belgeler

| Dosya | İçerik |
|---|---|
| `CLAUDE.md` | Değişmezler, komutlar, test kuralları — depo sözleşmesi |
| `TODOS.md` | Karar günlüğü. En değerli satır "bilerek yapılmayan ne var ve neden" |
| `docs/plan.md` | Uygulama planı, veri modeli, fazlar |
| `docs/marka.md` | Ses tonu, hitap, terim sözlüğü *(bağlayıcı)* |
| `docs/tasarim-sistemi.md` | Token katmanları, kontrast ölçümleri, bileşen kuralları |
| `docs/yayin.md` | Yayın hattı, sırlar, prod göçünün sırası |

---

## Dil

Kod yorumları, commit mesajları, PR açıklamaları ve arayüz metinleri
**Türkçe**. Tablo ve alan adları da Türkçe (`isletme`, `saat_dilimi`,
`olusturma_tarihi`).

Yorumlar "ne yaptığını" değil **"neden böyle yaptığını"** anlatır — ne yaptığı
zaten kodun kendisinde yazıyor.
