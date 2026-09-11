# Yayın hattı

GitHub Actions dört iş akışı taşıyor. İkisi `.github/workflows/ci.yml` içinde
(aynı dosyada, çünkü yayının testleri beklemesi `needs:` ile kuruluyor ve
`needs:` dosya sınırını geçmiyor), biri `.github/workflows/goc.yml`, biri
`.github/workflows/nabiz.yml`.

| İş akışı | Ne zaman koşar | Ne yapar |
|---|---|---|
| `dogrula` | Her PR, main'e her push | `npm ci` → tip → lint → test → `cf:kur` |
| `yayinla` | Yalnızca main'e push, `dogrula` yeşilse | **Beklemeden** Cloudflare'e deploy, ardından duman testi |
| `goc` | Yalnızca elle (`workflow_dispatch`), **her daldan** | Supabase'e migration uygular |
| `nabiz` | 30 dakikada bir + elle | Canlı siteyi yoklar, son bir saatin sunucu hatalarını sayar |

## Yayın nasıl çıkar

**Merge eden yayınlamış olur.** PR merge edilir → `dogrula` koşar → yeşilse
`yayinla` beklemeden deploy eder. Onay tıklaması yok.

Önceden `uretim` ortamına bağlı bir onay kapısı vardı. Kaldırıldı, çünkü
dayandığı varsayım yanlıştı: *"`NEXT_PUBLIC_*` değerleri derlemeye gömülü
olduğu için geri alma yeniden derleme demek"*. Cloudflare her yayının
**sürümünü saklıyor**, yani kod geri alınabilir ve yeniden derleme
gerektirmiyor:

```bash
npx wrangler versions list        # sürüm geçmişi
npx wrangler rollback <surum-id>  # önceki sürüme dön
```

Kapı dosyadan kaldırıldı, ortamın ayarından değil — böylece `ci.yml`'a bakan
biri kapının olmadığını görüyor. `environment:` satırı geri konursa kapı geri
gelir.

## Yayından sonra: duman testi ve nabız

Yayının yeşil olması Worker'ın **yüklendiğini** söyler, **çalıştığını** değil.
İkisini `scripts/duman.ts` ayırıyor: `/api/saglik` 200 dönmeli, ardından `/`,
`/dizin`, `/giris`, `/isletmeler-icin`, `/saglik` yönlendirmesiz 200 dönmeli.

| Nereden | Nasıl |
|---|---|
| `yayinla` işinin son adımı | `--surum` ile — sürüm kimliği `wrangler deployments status --json`'dan |
| `nabiz` iş akışı | Sürümsüz, 30 dakikada bir |
| Elle | `npm run duman -- https://randevu.enesmemduhoglu.tech` |

**Sürüm neden karşılaştırılıyor:** deploy'dan hemen sonra gelen bir 200'ü eski
sürüm de verebilir. `/api/saglik` yanıtı `X-Worker-Surum` başlığında isteği
karşılayan sürümün kimliğini taşıyor (`wrangler.jsonc > version_metadata`,
`src/lib/surum.ts`); betik yayınlanan kimliği görene kadar 12 × 5 sn bekliyor.

**Duman testi kırmızıysa:** yayın ÇIKMIŞ demektir, geri alınmamıştır. Otomatik
geri alma bilerek yok — şema bozuksa eski kod da bozuk çalışır ve geri alma
yalnızca belirtiyi saklar. Log'a bakılır, gerekiyorsa `npx wrangler rollback`.

**Nabız kırmızıysa** bildirim, `nabiz.yml`'deki cron satırını **en son
değiştiren** kişiye gidiyor (GitHub'ın kuralı). İki bilinen sınırı var:
zamanlanmış koşumlar yoğun saatlerde gecikebiliyor, ve public depoda 60 gün
hareket olmazsa GitHub zamanlanmış iş akışlarını kendiliğinden kapatıyor.

## Hata takibi

Sayfalar 200 dönerken bir route arka planda patlıyor olabilir. Duman testi bunu
görmez, yalnızca beş sayfaya bakıyor. Hata takibinin uyarı kanalı nabızın
ikinci adımı: **son bir saatte tek bir sunucu hatası bile olduysa nabız
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

**Kapı mesaj taşımıyor.** Drizzle'ın hata mesajı sorgunun parametrelerini
içeriyor (e-posta, telefon, iptal jetonu), yani mesaj hiç alınmıyor. Taşınanlar
kaynak, tür, Postgres kodu, kısıt adı ve digest. `console.error`'un `src`
altında başka bir yerde geçmesini `degismezler.test.ts` yasaklıyor.

**Nabız hata sayımıyla kırmızıysa:** Actions log'unda yalnızca toplam sayı var
(depo public). Ayrıntı için Cloudflare → Workers & Pages → `randevu` → Logs,
`olay = "hata"` süzgeci. `kaynak` alanı route'u (`route /api/musaitlik`,
`render /dizin`), `digest` Next'in aynı hataya ait kendi satırını gösteriyor.

**Pencere bir saat, aralık yarım saat.** GitHub zamanlanmış koşumları
geciktirebiliyor. Pencere aralığa eşit olsaydı, iki koşum arası 30 dakikayı
aştığında aradaki hatalar hiç sayılmazdı. Bedeli, aynı hatanın iki koşumda
görünmesi.

**Jeton yoksa nabız kırmızı yanar, sessizce geçmez.** Kurulum için
aşağıdaki `CLOUDFLARE_ANALIZ_TOKENI` satırına bakın.

**Analytics Engine hesapta bir kez etkinleştirilmeli** (Cloudflare paneli →
Analytics Engine). Kapalıyken SQL API doğru izinli jetona da `403
Authorization error` dönüyor (ölçüldü). Topluluk bildirimlerine göre `HATA`
binding'li deploy da düşüyor — hesap yeniden kurulursa bu adım yayından önce.

## Şema değişikliği varsa

Sıra **önce göç, sonra merge**. Yeni kolonu okuyan kod, kolon yerinde değilken
canlıya çıkmamalı.

1. Actions → **Prod gocu** → Run workflow, **PR'ın dalını seç** → onay kutusuna
   `uygula` yaz.
2. Migration koşar.
3. Yeşilse PR merge edilir; yayın kendiliğinden çıkar.

**Dalı seçmek şart.** Göç, tanımı gereği henüz `main`'de olmayan bir dosyayı
uyguluyor. Bir dönem `goc` işi `uretim` ortamına bağlıydı ve o ortam yalnızca
`main`'e izin veriyordu — yani iş akışının kendi tarifi uygulanamaz haldeydi.
Faz M'de görüldü ve ortam bağı kaldırıldı. (L3'te fark edilmemişti çünkü o göç
yanlışlıkla merge *sonrası* koşulmuştu; hatanın kendisi çelişkiyi gizlemişti.)

**Merge sonrasını beklemek diye bir pencere artık YOK:** onay kapısı
kalktığından beri merge anı yayın anı. Göç merge'den önce koşmazsa, kolon
yokken kod canlıya çıkar.

Geri alma yolu **yok**: `scripts/prod-goc.ts` yalnızca ileri gider. Kodun geri
alınabilir olması bunu değiştirmiyor — bir yayını geri almak şemayı geri
almıyor. Geri alınması gerekebilecek bir göç yazarken geri alma SQL'i PR
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

`CLOUDFLARE_ANALIZ_TOKENI` bilerek yayın jetonundan ayrı. Otuz dakikada bir
koşan bir işin Worker yayınlayabilen bir anahtar taşıması gerekmiyor. Bu jeton
yalnızca Analytics Engine'i okuyabiliyor.

### Variables (secret değil)

Bunlar `NEXT_PUBLIC_` önekli, yani **tanımı gereği halka açık** — tarayıcıya
gitmek üzere üretildiler ve tek başlarına hiçbir veriye erişim vermiyorlar.
Kiracı izolasyonu bu anahtarlara değil sunucudaki `scoped-db` katmanına
dayanıyor. Secret olarak saklamak yanlış bir güvenlik hissi verirdi.

| Ad | Değer |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<proje-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon key |
| `NEXT_PUBLIC_SITE_URL` | `https://randevu.enesmemduhoglu.tech` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare → Turnstile → site anahtarı |

`yayinla` işinin ilk adımı bu değişkenlerin varlığını kontrol edip eksikse
durur. Kontrol var, çünkü eksik bir `NEXT_PUBLIC_*` build'i **düşürmüyor**:
`undefined` gömülüyor ve hata canlıda, giriş ekranında ortaya çıkıyor.

**Faz P2'den sonra bu kontrol daha da kritik.** Eskiden Supabase değişkenleri
bir istisnaydı: eksik olduklarında build *düşüyordu*, yani kaza eseri bir
koruma sağlıyorlardı. Faz P2 o düşmeyi bilerek kaldırdı (gerekçe:
`src/lib/supabase/sunucu.ts`), yani artık **dört değişkenin dördü de** sessizce
`undefined` gömülebilir. Geriye kalan tek koruma bu adım — silinmemeli.

İkinci uyarı `next.config.ts`'te: Supabase değişkenleri olmadan koşan bir
üretim build'i konsola "bu çıktıyı yayınlamayın" yazıyor. Yerel bir
`npm run cf:yayinla` bu hattın dışında kaldığı için o uyarı orada tek uyarıdır.

### Environment

**Hiçbir iş artık bir ortama bağlı değil.** `uretim` ortamı GitHub'da hâlâ
duruyor (zorunlu inceleyici ve `main`-only branch policy'siyle) ama ona
başvuran bir iş kalmadı, yani hiçbir şeyi etkilemiyor. Silinebilir; bırakmanın
tek maliyeti ayarlar sayfasında ölü bir kayıt.

Geri istenirse ilgili işe `environment: uretim` satırını eklemek yeterli. Ama
`goc` için eklenmemeli — o kombinasyon çalışmıyor, sebebi yukarıda "Şema
değişikliği varsa" bölümünde.

> GitHub, bir workflow'un başvurduğu ortam yoksa onu **korumasız olarak
> kendiliğinden oluşturuyor** — yani bir ortamı silmek koruma eklemek değil,
> kaldırmak anlamına gelir. Kapıyı dosyadan kaldırmayı seçmemizin bir sebebi
> de bu: ayar sayfasındaki bir kaydın varlığı ya da yokluğu, koşan şeyin ne
> olduğunu okunaklı biçimde anlatmıyor.

Yayın için tek gereken hâlâ `CLOUDFLARE_API_TOKEN` ve `CLOUDFLARE_ACCOUNT_ID`;
ikisi de **repository** secret'ı, ortam secret'ı değil (bu yüzden ortam bağını
kaldırmak hiçbir sırrı kırmadı).

## Runtime sırları hattın dışında

Bunlar derlemeye girmiyor, Worker'ın kendi ortamında duruyor ve GitHub'ın
haberi yok:

```bash
wrangler secret put TURNSTILE_SECRET
wrangler secret put RESEND_API_KEY      # Faz I
```

**Faz L'ye kadar `TURNSTILE_MODU` üretimde tanımsızdı** — `wrangler.jsonc`'de
`vars` bloğu hiç yoktu, mod `sahte`ye düşüyordu ve bot kapısı canlıda koşulsuz
geçiriyordu. Bu satırların bir önceki sürümü sorunu zaten yazmıştı; eksik olan
şey bilgi değil, kapatan bir değişiklikti.

Şimdi mod `wrangler.jsonc > vars` içinde `"gercek"` ve silinmesini
`src/lib/degismezler.test.ts` yakalıyor. Sır (`TURNSTILE_SECRET`) hâlâ yalnızca
`wrangler secret` ile giriliyor — **girilmezse kapı kapalı kalır**, yani
yanlış yapılandırma artık sessizce açık değil, gürültülü kapalı.

> **Yerelde bu değerler OKUNMUYOR** (Faz I, `src/lib/mod.ts`).
> `initOpenNextCloudflareForDev()` yüzünden `wrangler.jsonc > vars` `next dev`e
> de sızıyordu ve bot kapısı yerelde gerçek modda koşup her randevu denemesini
> 403'e çeviriyordu. Artık üretim dışında kararı yalnızca `.env` veriyor.

### Bildirim (Faz I)

Aynı desen, aynı gerekçe: `BILDIRIM_MODU` artık `wrangler.jsonc > vars` içinde
`"gercek"` ve silinmesini `src/lib/degismezler.test.ts` yakalıyor. Anahtar
(`RESEND_API_KEY`) yalnızca `wrangler secret` ile giriliyor.

**Anahtar girilmezse gönderim sahteye DÜŞMÜYOR.** Kuyruğa `anahtar-yok` hatası
yazılıyor ve `/panel/gelistirici/bildirimler` ekranında görünüyor — yani yanlış
yapılandırma yine sessiz değil, görünür. Ama görünür olması yeterli değil:
**bu faz merge edilmeden önce anahtarın girilmiş olması gerekiyor**, yoksa
merge anı yayın anı olduğu için ilk randevudan itibaren hiçbir onay maili
gitmez.

### Hız sınırı

`wrangler.jsonc > ratelimits` iki sınırlayıcı tanımlıyor: `RANDEVU_SINIRI`
(5/dk, yazma) ve `MUSAITLIK_SINIRI` (60/dk, okuma). Panel WAF kuralı **değil**:
bu dosya PR'da inceleniyor ve `wrangler dev` ile yerelde de koşuyor.

**Ne kadar sıkı olduğu ölçüldü** ve yereldeki sonuca bakıp genelleme yapmak
yanlış olurdu:

| Ortam | 5/dk sınırında ilk 429 |
|---|---|
| Yerel workerd (`cf:onizle`) | **6. istek** — tek isolate, sayaç anında |
| Üretim | **22. istek**, sonrası kesintili |

Sebep Cloudflare'in belgelendirdiği davranış: sayaç her isolate'in yerel
önbelleğinde ve kolo başına tutuluyor — dokümantasyonun kendi ifadesiyle
*"permissive, eventually consistent... not an accurate accounting system"*.

Yani bu kapı **kısa bir patlamayı durdurmuyor, sürekli bir seli yavaşlatıyor**.
Korkulan tehdit zaten ikincisi. Kesin kota gerekirse durum tutan bir yapı
(KV / Durable Object) gerekir ve bedeli her istekte bir yazmadır.

## Yerelden elle yayın

Hat devre dışıyken ya da acil durumda:

```bash
npm run cf:yayinla
```

Windows'ta önce `.open-next` dizinini kilitleyen süreçleri kapat (bkz.
`CLAUDE.md` > Windows notu).

> **Bu yolun bedeli var.** Yerelde `.env` varsa `next build` onu okuyup
> `.open-next/server-functions/default/.env` içine kopyalıyor — yani
> `TURNSTILE_SECRET` **Worker paketine gömülü** olarak yayınlanıyor, yönetilen
> bir sır olarak değil. Faz L'de ölçüldü: sır istemci paketine (`assets/`)
> girmiyor, yani halka açık bir sızıntı değil; ama betiği okuyabilen herkes
> görebiliyor ve `wrangler secret` ile döndürmek beklenen etkiyi yapmıyor.
>
> CI bu sorunu yaşamıyor: `yayinla` işi temiz bir checkout'ta koşuyor ve orada
> `.env` yok. Yani **normal yol güvenli, acil yol değil.** Acil yayından sonra
> sırrı döndür.
