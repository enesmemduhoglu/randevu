# Deploy pipeline

GitHub Actions dört workflow taşıyor. İkisi `.github/workflows/ci.yml` içinde
(aynı dosyada, çünkü deploy'un testleri beklemesi `needs:` ile kuruluyor ve
`needs:` dosya sınırını geçmiyor), biri `.github/workflows/goc.yml`, biri
`.github/workflows/nabiz.yml`.

| Workflow | Ne zaman koşar | Ne yapar |
|---|---|---|
| `dogrula` | Her PR, main'e her push | `npm ci` → tip → lint → test → `cf:kur` |
| `yayinla` | Yalnızca main'e push, `dogrula` yeşilse | **Beklemeden** Cloudflare'e deploy, ardından smoke test; Deployments kaydı |
| `goc` | Yalnızca elle (`workflow_dispatch`), **her branch'ten** | Supabase'e migration uygular |
| `nabiz` | 30 dakikada bir + elle | Canlı siteyi yoklar, son bir saatin server hatalarını sayar |

## Deploy nasıl çıkar

**Merge eden deploy etmiş olur.** PR merge edilir → `dogrula` koşar → yeşilse
`yayinla` beklemeden deploy eder. Onay tıklaması yok.

Önceden `uretim` environment'ına bağlı bir approval gate vardı. Kaldırıldı, çünkü
dayandığı varsayım yanlıştı: *"`NEXT_PUBLIC_*` değerleri build'e gömülü
olduğu için geri alma yeniden build demek"*. Cloudflare her deploy'un
**version'ını saklıyor**, yani kod geri alınabilir ve yeniden build
gerektirmiyor:

```bash
npx wrangler versions list        # sürüm geçmişi
npx wrangler rollback <surum-id>  # önceki sürüme dön
```

Gate dosyadan kaldırıldı, environment'ın ayarından değil — böylece `ci.yml`'a bakan
biri gate'in olmadığını görüyor. `environment:` satırı geri konursa gate geri
gelir.

### Deployments kaydı

Her deploy reponun **Deployments** sekmesine, `uretim` environment'ının altına bir
kayıt düşürüyor. Kaydı `yayinla` job'ı REST API ile kendisi açıp kapatıyor;
`environment:` satırı **yok**. O satır kaydı kendiliğinden açardı ama environment'ın
ayarında hâlâ duran zorunlu inceleyiciyi de geri getirirdi. Koruma kuralları
yalnızca environment'a bağlı işlere işliyor, API ile açılan kayda değil.

| Kaydın durumu | Anlamı |
|---|---|
| `success` | Deploy çıktı, smoke test yeşil. Açıklamada Worker version id var. |
| `failure`, açıklamada "CANLIDA" | Deploy çıktı ama smoke test kırmızı. Version canlıda, geri alınmadı. |
| `failure`, açıklamada "yayin adimi: …" | Build ya da deploy tamamlanmadı. Canlıdaki version'ı `npx wrangler deployments status` söyler. |

Kayıt adımları `continue-on-error`: GitHub API'sindeki bir aksaklık deploy'u
durdurmuyor, yalnızca kayıt eksik kalıyor.

**Kayıt bir gösterge, deploy geçmişinin kaynağı değil.** `wrangler rollback`
ile yapılan geri alma Deployments sekmesine yansımıyor, sekme en son deploy'u
göstermeye devam ediyor. Hangi version'ın trafik taşıdığını yalnızca `npx wrangler
deployments status` doğru söyler. Local'den elle deploy (`npm run cf:yayinla`)
da kayıt açmıyor.

## Deploy'dan sonra: smoke test ve health check

Deploy'un yeşil olması Worker'ın **yüklendiğini** söyler, **çalıştığını** değil.
İkisini `scripts/duman.ts` ayırıyor: `/api/saglik` 200 dönmeli, ardından `/`,
`/dizin`, `/giris`, `/isletmeler-icin`, `/saglik` redirect'siz 200 dönmeli.

| Nereden | Nasıl |
|---|---|
| `yayinla` job'ının son adımı | `--surum` ile — version id `wrangler deployments status --json`'dan |
| `nabiz` workflow | Version'sız. Cloudflare Cron Trigger 30 dakikada bir tetikliyor, GitHub'ın kendi zamanlaması 6 saatte bir fallback |
| Elle | `npm run duman -- https://randevu.enesmemduhoglu.tech` |

**Version neden karşılaştırılıyor:** deploy'dan hemen sonra gelen bir 200'ü eski
version da verebilir. `/api/saglik` response'u `X-Worker-Surum` başlığında request'i
karşılayan version'ın kimliğini taşıyor (`wrangler.jsonc > version_metadata`,
`src/lib/surum.ts`); script deploy edilen kimliği görene kadar 12 × 5 sn bekliyor.

**Smoke test kırmızıysa:** deploy ÇIKMIŞ demektir, geri alınmamıştır. Otomatik
geri alma bilerek yok — schema bozuksa eski kod da bozuk çalışır ve geri alma
yalnızca belirtiyi saklar. Log'a bakılır, gerekiyorsa `npx wrangler rollback`.

**Health check'in saati Cloudflare'de.** `nabiz.yml` önce yalnızca `schedule: */30`
ile koşuyordu. 10-13 Eylül 2026'da ölçülen gerçek aralık 2 ile 5,5 saatti:
GitHub zamanlanmış run'ları "mümkün olunca" başlatıyor. Şimdi Worker'ın Cron
Trigger'ı (`worker-girisi.ts > scheduled`, `src/lib/zamanlayici.ts`) workflow'u
`workflow_dispatch` ile tetikliyor. Kontroller ve bildirim yine GitHub'da,
çünkü gözcü gözlediği Worker'ın dışında kalmalı.

```
Cloudflare Cron Trigger (*/30) ──> zamanlayici.ts ──> GitHub workflow_dispatch ──> nabiz.yml
        │ trigger başarısız                                                      (smoke test + hata sayımı)
        v
  hataBildir("cron nabiz") ──> HATA counter'ı ──> fallback run'ın hata sayımı kırmızı

GitHub schedule (6 saatte bir, fallback) ──> nabiz.yml + "zamanlayıcı canlı mı"
                                          (son trigger 90 dakikadan eskiyse kırmızı)
```

**Health check kırmızıysa** bildirim, tetiklenen run'da token'ın sahibine, fallback
run'da `nabiz.yml`'deki cron satırını **en son değiştiren** kişiye gidiyor
(GitHub'ın kuralı). Public repo'da 60 gün hareket olmazsa GitHub zamanlanmış
workflow'ları kendiliğinden kapatıyor. Bu artık yalnızca fallback'i etkiliyor,
Cloudflare'in tetiklediği run'lar devam ediyor.

**"Zamanlayıcı canlı mı" kırmızıysa:** Cloudflare 90 dakikadır tetiklemiyor.
Logs'ta `kaynak = "cron nabiz"` satırı varsa trigger koşuyor ama GitHub reddediyor.
`kod` alanı sebebi söylüyor: `JETON_YOK` secret girilmemiş demek, `HTTP_401` ise
token'ın süresi dolmuş. Satır hiç yoksa trigger hiç koşmuyor: `wrangler.jsonc >
triggers` silinmiş olabilir ya da Worker patlıyordur.

## Hata takibi

Sayfalar 200 dönerken bir route arka planda patlıyor olabilir. Smoke test bunu
görmez, yalnızca beş sayfaya bakıyor. Hata takibinin uyarı kanalı health check'in
ikinci adımı: **son bir saatte tek bir server hatası bile olduysa health check
kırmızı yanar.** Üçüncü parti servis yok.

```
yakalanmamış hata ──> src/instrumentation.ts > onRequestError ─┐
catch'li yol (kayit, uye-ol) ─────────────────────────────────┤
                                                              v
                                    src/lib/hata.ts > hataBildir()
                                     │                         │
                          console.error (JSON)       HATA binding
                          Workers Logs, özel         Analytics Engine
                          "ne oldu"                  "kaç tane"
                                                              │
                                   nabiz.yml > scripts/hata-say.ts
```

**Gate mesaj taşımıyor.** Drizzle'ın hata mesajı query'nin parametrelerini
içeriyor (e-posta, telefon, iptal token'ı), yani mesaj hiç alınmıyor. Taşınanlar
kaynak, tür, Postgres kodu, constraint adı ve digest. `console.error`'un `src`
altında başka bir yerde geçmesini `degismezler.test.ts` yasaklıyor.

**Health check hata sayımıyla kırmızıysa:** Actions log'unda yalnızca toplam sayı var
(repo public). Ayrıntı için Cloudflare → Workers & Pages → `randevu` → Logs,
`olay = "hata"` süzgeci. `kaynak` alanı route'u (`route /api/musaitlik`,
`render /dizin`), `digest` Next'in aynı hataya ait kendi satırını gösteriyor.

**Pencere bir saat, aralık yarım saat.** Bir trigger kaçırılsa ya da run
birkaç dakika geç başlasa da aradaki hatalar sayılsın diye. Bedeli, aynı
hatanın iki run'da görünmesi. Bu pencere GitHub'ın kendi zamanlamasıyla
yetmiyordu (yukarıda); saat Cloudflare'e bu yüzden taşındı.

**Token yoksa health check kırmızı yanar, sessizce geçmez.** Kurulum için
aşağıdaki `CLOUDFLARE_ANALIZ_TOKENI` satırına bakın.

**Analytics Engine hesapta bir kez etkinleştirilmeli** (Cloudflare paneli →
Analytics Engine). Kapalıyken SQL API doğru izinli token'a da `403
Authorization error` dönüyor (ölçüldü). Topluluk bildirimlerine göre `HATA`
binding'li deploy da düşüyor — hesap yeniden kurulursa bu adım deploy'dan önce.

## Schema değişikliği varsa

Sıra **önce migration, sonra merge**. Yeni kolonu okuyan kod, kolon yerinde değilken
canlıya çıkmamalı.

1. Actions → **Prod gocu** → Run workflow, **PR'ın branch'ini seç** → onay kutusuna
   `uygula` yaz.
2. Migration koşar.
3. Yeşilse PR merge edilir; deploy kendiliğinden çıkar.

**Branch'i seçmek şart.** Migration, tanımı gereği henüz `main`'de olmayan bir dosyayı
uyguluyor. Bir dönem `goc` job'ı `uretim` environment'ına bağlıydı ve o environment yalnızca
`main`'e izin veriyordu — yani workflow'un kendi tarifi uygulanamaz haldeydi.
Faz M'de görüldü ve environment bağı kaldırıldı. (L3'te fark edilmemişti çünkü o migration
yanlışlıkla merge *sonrası* koşulmuştu; hatanın kendisi çelişkiyi gizlemişti.)

**Merge sonrasını beklemek diye bir pencere artık YOK:** approval gate
kalktığından beri merge anı deploy anı. Migration merge'den önce koşmazsa, kolon
yokken kod canlıya çıkar.

Geri alma yolu **yok**: `scripts/prod-goc.ts` yalnızca ileri gider. Kodun geri
alınabilir olması bunu değiştirmiyor — bir deploy'u geri almak schema'yı geri
almıyor. Geri alınması gerekebilecek bir migration yazarken geri alma SQL'i PR
açıklamasına elle yazılır.

## Gereken ayarlar

Hepsi **Settings → Secrets and variables → Actions** altında.

### Secrets

| Ad | Nereden alınır | Hangi iş kullanır |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → *Edit Cloudflare Workers* şablonu | `yayinla` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare panelinde Workers & Pages sayfasının sağ sütunu | `yayinla`, `nabiz` |
| `CLOUDFLARE_ANALIZ_TOKENI` | Cloudflare → My Profile → API Tokens → *Create Custom Token*, tek izin **Account → Account Analytics → Read** | `nabiz` |
| `SUPABASE_DB_URL` | `.env`'deki Supavisor **session mode** (5432) dizesi | `goc` |

`CLOUDFLARE_ANALIZ_TOKENI` bilerek deploy token'ından ayrı. Otuz dakikada bir
koşan bir işin Worker deploy edebilen bir key taşıması gerekmiyor. Bu token
yalnızca Analytics Engine'i okuyabiliyor.

### Variables (secret değil)

Bunlar `NEXT_PUBLIC_` prefix'li, yani **tanımı gereği public** — tarayıcıya
gitmek üzere üretildiler ve tek başlarına hiçbir veriye erişim vermiyorlar.
Tenant izolasyonu bu key'lere değil server'daki `scoped-db` layer'ına
dayanıyor. Secret olarak saklamak yanlış bir güvenlik hissi verirdi.

| Ad | Değer |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<proje-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon key |
| `NEXT_PUBLIC_SITE_URL` | `https://randevu.enesmemduhoglu.tech` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare → Turnstile → site key'i |

`yayinla` job'ının ilk adımı bu variable'ların varlığını kontrol edip eksikse
durur. Kontrol var, çünkü eksik bir `NEXT_PUBLIC_*` build'i **düşürmüyor**:
`undefined` gömülüyor ve hata canlıda, giriş ekranında ortaya çıkıyor.

**Faz P2'den sonra bu kontrol daha da kritik.** Eskiden Supabase variable'ları
bir istisnaydı: eksik olduklarında build *düşüyordu*, yani kaza eseri bir
koruma sağlıyorlardı. Faz P2 o düşmeyi bilerek kaldırdı (gerekçe:
`src/lib/supabase/sunucu.ts`), yani artık **dört variable'ın dördü de** sessizce
`undefined` gömülebilir. Geriye kalan tek koruma bu adım — silinmemeli.

İkinci uyarı `next.config.ts`'te: Supabase variable'ları olmadan koşan bir
production build'i konsola "bu çıktıyı yayınlamayın" yazıyor. Local bir
`npm run cf:yayinla` bu pipeline'ın dışında kaldığı için o uyarı orada tek uyarıdır.

### Environment

**Hiçbir iş bir environment'a bağlı değil, ama `uretim` environment'ı kullanılıyor:**
`yayinla` job'ının açtığı Deployments kayıtları onun adı altında toplanıyor
(yukarıda "Deployments kaydı"). Environment'ın ayarında zorunlu inceleyici ve
`main`-only branch policy'si hâlâ duruyor. İkisi de yalnızca environment'a bağlı bir
işi bekletebilir, yani bugün deploy'u etkilemiyorlar.

Approval gate geri istenirse ilgili işe `environment: uretim` satırını eklemek
yeterli; o durumda API ile açılan kayıt adımları gereksiz kalır. Ama
`goc` için eklenmemeli — o kombinasyon çalışmıyor, sebebi yukarıda "Schema
değişikliği varsa" bölümünde.

> GitHub, bir workflow'un başvurduğu environment yoksa onu **korumasız olarak
> kendiliğinden oluşturuyor** — yani bir environment'ı silmek koruma eklemek değil,
> kaldırmak anlamına gelir. Gate'i dosyadan kaldırmayı seçmemizin bir sebebi
> de bu: ayar sayfasındaki bir kaydın varlığı ya da yokluğu, koşan şeyin ne
> olduğunu okunaklı biçimde anlatmıyor.

Deploy için tek gereken hâlâ `CLOUDFLARE_API_TOKEN` ve `CLOUDFLARE_ACCOUNT_ID`;
ikisi de **repository** secret'ı, environment secret'ı değil (bu yüzden environment bağını
kaldırmak hiçbir secret'ı kırmadı). Deployments kaydı yeni bir secret istemiyor: işin
kendi `GITHUB_TOKEN`'ı yetiyor, `yayinla` job'ında `deployments: write` izniyle.

## Runtime secret'ları pipeline'ın dışında

Bunlar build'e girmiyor, Worker'ın kendi environment'ında duruyor ve GitHub'ın
haberi yok:

```bash
wrangler secret put TURNSTILE_SECRET
wrangler secret put RESEND_API_KEY      # Faz I
wrangler secret put GITHUB_NABIZ_TOKENI # health check scheduler
wrangler secret put CRON_SIRRI          # hatırlatıcı (Faz K)
```

### Health check scheduler

`GITHUB_NABIZ_TOKENI` bir **ince taneli** GitHub token'ı: GitHub → Settings →
Developer settings → Personal access tokens → *Fine-grained tokens*.

- Repository access: **Only select repositories** → `enesmemduhoglu/randevu`
- Permissions → Repository → **Actions: Read and write**. Başka izin yok.

Token Worker'da duruyor, GitHub'ın secret'larında değil: onu kullanan şey
GitHub'daki bir iş değil, Cloudflare'in trigger'ı.

**Token girilmezse ya da süresi dolarsa trigger sessizce durmuyor.** Her
denemede gate'e `JETON_YOK` ya da `HTTP_401` yazılıyor. Fallback run'ın hata
sayımı ve "zamanlayıcı canlı mı" adımı ikisini de kırmızıya çeviriyor. Süre
dolduğunda yeni token aynı komutla giriliyor.

### Hatırlatıcı (Faz K)

Aynı Cron Trigger (`*/30`) ikinci bir iş koşuyor: `scheduled`,
`POST /api/cron/hatirlatma`'yı **Worker'ın kendi `fetch`'ine** veriyor (request
ağa çıkmıyor) ve route kuyruğun zamanı gelmiş e-posta satırlarını boşaltıyor.
Route internete açık bir adres, gate'i `Authorization: Bearer <CRON_SIRRI>`
(`src/lib/cron-kapisi.ts`).

`CRON_SIRRI` herhangi bir uzun rastgele değer; iki taraf da (tetik ve route)
aynı Worker'ın env'inden okuyor, yani tek bir yere giriliyor:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" | npx wrangler secret put CRON_SIRRI
```

**Secret girilmezse hatırlatıcı sessizce durmuyor.** Tetik gate'e `SIR_YOK`
yazıyor, health check'in hata sayımı son saatte hata görüp kırmızı yanıyor. Route
dışarıdan gelen request'e 503 (`yapilandirma eksik`), yanlış secret'a 401 dönüyor.

**Elle tetikleme** (örneğin bir kesintiden sonra biriken satırları hemen
boşaltmak için):

```bash
curl -X POST -H "Authorization: Bearer <CRON_SIRRI>" https://randevu.enesmemduhoglu.tech/api/cron/hatirlatma
# {"randevu":<işlenen>,"atlanan":<pasif işletme>}
```

Bir koşu en çok 20 randevu işliyor (`hatirlatici.ts > KOSUM_BASINA_RANDEVU`);
kalanlar kaybolmuyor, sonraki koşuya kalıyor. Randevusu başlamış bir
hatırlatma gönderilmiyor, `randevu-basladi` olarak işaretleniyor.

**Faz L'ye kadar `TURNSTILE_MODU` production'da tanımsızdı** — `wrangler.jsonc`'de
`vars` bloğu hiç yoktu, mod `sahte`ye düşüyordu ve bot gate'i canlıda koşulsuz
geçiriyordu. Bu satırların bir önceki version'ı sorunu zaten yazmıştı; eksik olan
şey bilgi değil, kapatan bir değişiklikti.

Şimdi mod `wrangler.jsonc > vars` içinde `"gercek"` ve silinmesini
`src/lib/degismezler.test.ts` yakalıyor. Secret (`TURNSTILE_SECRET`) hâlâ yalnızca
`wrangler secret` ile giriliyor — **girilmezse gate kapalı kalır**, yani
yanlış config artık sessizce açık değil, gürültülü kapalı.

> **Local'de bu değerler OKUNMUYOR** (Faz I, `src/lib/mod.ts`).
> `initOpenNextCloudflareForDev()` yüzünden `wrangler.jsonc > vars` `next dev`e
> de sızıyordu ve bot gate'i local'de gerçek modda koşup her randevu denemesini
> 403'e çeviriyordu. Artık production dışında kararı yalnızca `.env` veriyor.

### Bildirim (Faz I)

Aynı pattern, aynı gerekçe: `BILDIRIM_MODU` artık `wrangler.jsonc > vars` içinde
`"gercek"` ve silinmesini `src/lib/degismezler.test.ts` yakalıyor. Key
(`RESEND_API_KEY`) yalnızca `wrangler secret` ile giriliyor.

**Key girilmezse gönderim sahteye DÜŞMÜYOR.** Queue'ya `anahtar-yok` hatası
yazılıyor ve `/panel/gelistirici/bildirimler` ekranında görünüyor — yani yanlış
config yine sessiz değil, görünür. Ama görünür olması yeterli değil:
**bu faz merge edilmeden önce key'in girilmiş olması gerekiyor**, yoksa
merge anı deploy anı olduğu için ilk randevudan itibaren hiçbir onay maili
gitmez.

### Rate limit

`wrangler.jsonc > ratelimits` iki limiter tanımlıyor: `RANDEVU_SINIRI`
(5/dk, yazma) ve `MUSAITLIK_SINIRI` (60/dk, okuma). Panel WAF kuralı **değil**:
bu dosya PR'da inceleniyor ve `wrangler dev` ile local'de de koşuyor.

**Ne kadar sıkı olduğu ölçüldü** ve local'deki sonuca bakıp genelleme yapmak
yanlış olurdu:

| Environment | 5/dk sınırında ilk 429 |
|---|---|
| Local workerd (`cf:onizle`) | **6. request** — tek isolate, counter anında |
| Production | **22. request**, sonrası kesintili |

Sebep Cloudflare'in belgelendirdiği davranış: counter her isolate'in local
cache'inde ve kolo başına tutuluyor — dokümantasyonun kendi ifadesiyle
*"permissive, eventually consistent... not an accurate accounting system"*.

Yani bu gate **kısa bir patlamayı durdurmuyor, sürekli bir seli yavaşlatıyor**.
Korkulan tehdit zaten ikincisi. Kesin kota gerekirse durum tutan bir yapı
(KV / Durable Object) gerekir ve bedeli her request'te bir yazmadır.

## Local'den elle deploy

Pipeline devre dışıyken ya da acil durumda:

```bash
npm run cf:yayinla
```

Windows'ta önce `.open-next` klasörünü kilitleyen process'leri kapat (bkz.
`CLAUDE.md` > Windows notu).

> **Bu yolun bedeli var.** Local'de `.env` varsa `next build` onu okuyup
> `.open-next/server-functions/default/.env` içine kopyalıyor — yani
> `TURNSTILE_SECRET` **Worker bundle'ına gömülü** olarak deploy ediliyor, yönetilen
> bir secret olarak değil. Faz L'de ölçüldü: secret client bundle'ına (`assets/`)
> girmiyor, yani public bir leak değil; ama script'i okuyabilen herkes
> görebiliyor ve `wrangler secret` ile döndürmek beklenen etkiyi yapmıyor.
>
> CI bu sorunu yaşamıyor: `yayinla` job'ı temiz bir checkout'ta koşuyor ve orada
> `.env` yok. Yani **normal yol güvenli, acil yol değil.** Acil deploy'dan sonra
> secret'ı döndür.
