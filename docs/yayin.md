# Yayın hattı

GitHub Actions üç iş akışı taşıyor. İkisi `.github/workflows/ci.yml` içinde
(aynı dosyada, çünkü yayının testleri beklemesi `needs:` ile kuruluyor ve
`needs:` dosya sınırını geçmiyor), biri `.github/workflows/goc.yml`.

| İş akışı | Ne zaman koşar | Ne yapar |
|---|---|---|
| `dogrula` | Her PR, main'e her push | `npm ci` → tip → lint → test → `cf:kur` |
| `yayinla` | Yalnızca main'e push, `dogrula` yeşilse | Onay bekler, sonra Cloudflare'e deploy |
| `goc` | Yalnızca elle (`workflow_dispatch`) | Supabase'e migration uygular |

## Yayın nasıl çıkar

1. PR merge edilir → `dogrula` koşar.
2. Yeşilse `yayinla` işi **kuyruğa girer ve bekler**. Actions sekmesinde
   "Review deployments" çıkar.
3. `uretim` ortamının inceleyicisi onaylar → `npm run cf:yayinla` koşar.

Onay kapısı bilerek var: main'e düşen her commit'in canlıya çıkması gerekmiyor
ve `NEXT_PUBLIC_*` değerleri derlemeye gömülü olduğu için geri alma "yeniden
derleme" demek — yani ucuz değil.

## Şema değişikliği varsa

Sıra **önce göç, sonra yayın**. Yeni kolonu okuyan kod, kolon yerinde değilken
canlıya çıkmamalı.

1. Actions → **Prod gocu** → Run workflow → onay kutusuna `uygula` yaz.
2. Ortam onayı verilir, migration koşar.
3. Sonra PR merge edilir ve yayın onaylanır.

Geri alma yolu **yok**: `scripts/prod-goc.ts` yalnızca ileri gider. Geri alınması
gerekebilecek bir göç yazarken geri alma SQL'i PR açıklamasına elle yazılır.

## Gereken ayarlar

Hepsi **Settings → Secrets and variables → Actions** altında.

### Secrets

| Ad | Nereden alınır | Hangi iş kullanır |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → *Edit Cloudflare Workers* şablonu | `yayinla` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare panelinde Workers & Pages sayfasının sağ sütunu | `yayinla` |
| `SUPABASE_DB_URL` | `.env`'deki Supavisor **session mode** (5432) dizesi | `goc` |

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

### Environment

`uretim` adında bir GitHub Environment gerekiyor ve içinde **required
reviewers** tanımlı olmalı. Onay kapısı budur; ortam yoksa ya da inceleyici
tanımlı değilse yayın beklemeden çıkar.

## Runtime sırları hattın dışında

Bunlar derlemeye girmiyor, Worker'ın kendi ortamında duruyor ve GitHub'ın
haberi yok:

```bash
wrangler secret put TURNSTILE_SECRET
```

`TURNSTILE_MODU` ve `BILDIRIM_MODU` ise `wrangler.jsonc`'de `vars` bloğu
olmadığı için üretimde **tanımsız**. Turnstile açısından bunun anlamı şu:
kod yayında olsa bile `TURNSTILE_MODU=gercek` girilene kadar kapı açık kalır.
Koda bakıp "koruma var" demek yetmiyor.

## Yerelden elle yayın

Hat devre dışıyken ya da acil durumda:

```bash
npm run cf:yayinla
```

Windows'ta önce `.open-next` dizinini kilitleyen süreçleri kapat (bkz.
`CLAUDE.md` > Windows notu).
