# Karar gunlugu

Bir tasarim kararini sorgulamadan once buraya bak; is bitirdiginde buraya yaz.
En degerli satir "bilerek yapilmayan ne var ve neden" satiridir.

Plan: `docs/plan.md`. Degismezler: `CLAUDE.md`.

---

## Faz A — iskele

**Kapandi:** Next.js 16.3.3 + React 19.2.8 + TypeScript + Tailwind v4 iskelesi,
Prisma 7.10.0 (CLI + client + adapter-pg), gercek Postgres'e kosan Vitest duzeni,
`CLAUDE.md` degismezleri, bu gunluk.

### Kararlar

- **Prisma CLI 7.10.0'a sabitlendi.** npm'de `prisma` paketinin `latest` etiketi
  su an **`8.0.0-rc.12`**, yani bir release candidate; son stabil surum `prev`
  etiketinde duruyor. `npm i -D prisma` dogrudan RC kuruyor ve yaninda
  `alchemy` + `workerd` diye buyuk bir agac getiriyor - ustelik client
  `^7.10.0` kaldigi icin CLI/client major uyusmazligi olusuyordu.
  **Yeni bagimlilik eklerken `prisma`yi carete birak, major'u yukseltme.**

- **Faz A'ya minimal `Isletme` modeli girdi.** Plan semayi Faz E'ye koyuyordu,
  ama modelsiz bir semada migration da test kosumu da dogrulanamiyor. Kiraci
  koku olan tek model burada duruyor; Faz E onu genisletecek, yeniden
  yazmayacak.

- **`src/lib/db.ts` simdilik tek istemci tutuyor.** Faz B'de Workers yolu
  eklenince istemci ISTEK BASINA uretilecek (modul seviyesinde tutulan bir
  PrismaClient Hyperdrive ile takilabiliyor - prisma#28193). Dosya ikiye
  bolunmeyecek, `getDb` icinde dallanacak.

- **Testler asla gelistirme veritabanina bakmaz.** `vitest.setup.ts`
  `DATABASE_URL`i `TEST_DATABASE_URL` ile ezer. Bu satir olmadan bir test kosumu
  gelistirme verisini silerdi.

- **npm 12'nin allow-scripts kapisi acildi** su paketler icin: `esbuild`,
  `workerd`, `unrs-resolver`, `msgpackr-extract`, `prisma`, `@prisma/engines`.
  Hepsi native binary indiren standart arac zinciri paketleri.

### Bilerek kapsam disi

- Supabase Auth, shadcn/ui, tasarim token'lari, deploy - sirasiyla Faz C ve D.
- `npm audit`: `deepmerge-ts` uzerinden 3 "high" bulgu var, hepsi tek kok nedene
  cikiyor ve **Prisma CLI'in config okuyucusuna** ait, calisma zamani istek
  yoluna degil. `npm audit fix --force` bizi 8-RC'ye iterdi; tedavi hastaliktan
  kotu. Prisma 7 stabil hattinda duzelene kadar bilincli olarak birakildi.

### Elle yapilmasi gerekenler

- [x] Docker Desktop acildi, `randevu-test-pg` konteyneri (port 5455) ayakta.
- [x] `randevu_dev` ve `randevu_test` olusturuldu, ilk migration uygulandi
      (`20260829125614_ilk`).

### Dogrulama

- `npm run tip` temiz
- `npm run lint` temiz
- `npm run build` basarili
- `npm test` - 2 test gecti (gercek Postgres'e karsi)

### Bilinen gurultu

- `npm run db:hazirla` calisirken Node bir modul-tipi uyarisi basiyor: paket
  `type: module` degil ama betik ESM. Zararsiz. Duzeltmenin iki yolu da
  (`type: module` eklemek ya da `.mts`'e gecip vitest import'unu bozmak)
  uyarinin maliyetinden buyuk; bilincli olarak birakildi.

---

## Faz B — Cloudflare zemini

**Kapandi (deploy haric):** Supabase projesi, Hyperdrive baglantisi, OpenNext +
wrangler yapilandirmasi, `/saglik` teshis sayfasi ve **Prisma'dan Drizzle'a
gecis**.

### Prisma birakildi, Drizzle'a gecildi

Prisma 7'nin sorgu derleyicisi WASM ve workerd calisma aninda WASM derlemeyi
yasakliyor: `WebAssembly.Module(): Wasm code generation disallowed by embedder`.
Denenen ve elenen yollar:

- `runtime = "workerd"` generator secenegi dogru mekanizmayi uretiyor
  (`wasm?module` statik import'u) ama o client Node'da hic calismiyor - Vite
  `?module` sozdizimini ayristiramiyor, yani testler ve `next dev` kiriliyor.
- Iki client uretip secimi `package.json > imports` kosullarina birakmak da
  ise yaramadi: **Next sunucu bundle'ini Node icin uretiyor**, OpenNext o Node
  ciktisini workerd'e uyarliyor. `workerd` kosulu hic devreye girmiyor ve
  Turbopack wasm'i base64'e cevirip calisma ani derlemesine dusuruyor.
- Prisma tarafinda acik ve dogrulanmamis kayit: prisma/prisma#28657. Tek
  onerilen cozum Prisma 6.19'a inmek.

Drizzle saf TypeScript, hic WASM yok. Olculen kazanc: **worker bundle 2734 KiB
-> 1032 KiB (gzip), %62 dusus**; test kosumu 2.8s -> 1.5s. 3 MiB'lik ucretsiz
plan siniri artik rahat.

**Bedeli ve karsiligi:** `warden` degismez kapisi Prisma'nin `db.model.method(`
bicimini ariyordu; Drizzle'in `db.select().from()` bicimini yakalamiyor. Yani
1. degismez (route'ta ham `db.*` yok) **artik otomatik zorlanmiyor**. Faz D'de
`scoped-db.ts` gelince ESLint `no-restricted-imports` ile deterministik hale
getirilecek - route handler'lar `@/lib/db` import edemeyecek. Kapinin diger
kurallari (dogrudan `resend.emails.send`, `checkOrigin`) etkilenmedi.

### Diger kararlar

- **Supabase direct baglanti kullanilamiyor.** `db.<ref>.supabase.co` yalnizca
  AAAA (IPv6) kaydi cozuyor; bu makinede IPv6 cikisi yok. Olculdu: session mode
  (5432) ve transaction mode (6543) calisiyor, direct `ENOTFOUND`.
  **Supavisor SESSION MODE** secildi - transaction mode prepared statement
  kirar. Cloudflare'in "direct kullan" tavsiyesi bu senaryoyu kapsamiyor.
- **Hyperdrive sorgu onbellegi KAPALI** (`--caching-disabled`). Musaitlik
  sorgusu yazma kararini besliyor; 60 saniye bayat veri dolu bir slotu bos
  gosterirdi.
- **Yerel Postgres 17'ye cekildi** (prod Supabase 17.6). Onceki 16'ydi.
- **`?schema=public` kaldirildi.** Prisma'ya ozgu bir parametreydi; postgres.js
  onu sunucuya baslangic parametresi olarak gonderip `FATAL 42704` aliyordu.
- **`localConnectionString` wrangler.jsonc'ye yazildi.** Bu deger olmadan
  `next build` ve `wrangler dev` Hyperdrive binding'ini cozemeyip patliyor.
  Gizli degil - yalnizca yerel konteynere bakiyor.
- **`@opennextjs/cloudflare@1.20.4` `esbuild`'i bagimliliklarinda tanimlamamis**
  (ne `dependencies` ne `peerDependencies`), hoisting'e guvenmis. npm onu
  `wrangler/node_modules` altina gomunce paket kendi bagimliligini bulamiyor.
  Acikca `esbuild` devDependency olarak eklendi - kaldirilirsa build kirilir.
- **ESLint build ciktilarini yok sayiyor** (`.open-next`, `.wrangler`,
  `cloudflare-env.d.ts`). Yoksa 26 bin sahte bulgu uretiyordu.
- **Prisma'nin enjekte ettigi agent skill'leri silindi** (`.agents`,
  `.windsurf`, `skills-lock.json`).

### Bilerek kapsam disi

- **Deploy yapilmadi.** `wrangler deploy` oturum politikasi tarafindan
  engellendi; kullanici karari bekliyor. Custom domain
  (`randevu.enesmemduhoglu.tech`) da baglanmadi.
- Incremental cache (R2/KV) bagli degil: sayfalar agirlikli dinamik.

### Dogrulama

- `npm run tip`, `npm run lint` temiz
- `npm test` - 2 test gecti (gercek Postgres, 1.5s)
- `npm run cf:kur` basarili, `wrangler deploy --dry-run`: 1032 KiB gzip
- **`wrangler dev` (yerel workerd) icinde `/saglik`: bagli, PostgreSQL 17, 14 ms**
  - yani Worker kod yolu + Hyperdrive binding calisiyor
- Drizzle migration'i hem yerel hem PROD Supabase'e uygulandi; prod'da `isletme`
  tablosu dogru kolonlarla duruyor

### Elle yapilmasi gerekenler

- [x] Windows Gelistirici Modu acildi (symlink yetkisi). **Her `cf:kur` icin
      gerekli** - kapatilirsa build EPERM ile duser.
- [x] `wrangler login` yapildi; hesap `6f4d2de4cf9316fbf3538ddea2867547`.
- [ ] Deploy karari ve custom domain baglantisi.
- [ ] Supabase access token kullanici tarafindan silindi - yeni bir islem
      gerekirse yenisi lazim.

---

## Faz C — tasarim dili ve bilesen katmani

**Kapandi:** marka sesi ve Turkce metin dili, uc katmanli token sistemi,
shadcn/ui bilesen seti, wordmark ve favicon, bilesen vitrini, tasarim sistemi
belgesi.

### Kararlar

- **Semantic token'lar Ingilizce kaldi.** Primitive ve component katmani Turkce
  (`--renk-terracotta-500`, `--saat-secili-zemin`) ama `--background`,
  `--primary`, `--border` shadcn/ui'nin sozlesmesi. Turkcelestirmek, depoya
  eklenen HER bileseni elle duzenlemek demekti - her yeni bilesende tekrar eden
  bir maliyet. Ucuncu taraf arayuzu oldugu gibi birakildi.

- **OKLCH secildi.** Acik ve koyu tema arasinda ton kaymasi olmadan parlaklik
  ayarlanabiliyor: `terracotta-600` koyu zeminde okunmuyordu, tek yapilan `L`
  degerini bir basamak acmak oldu.

- **Kirmizi, terracotta'dan uzak tutuldu** (ton 20'ye karsi 43). Bu uründe
  "Iptal et" ile birincil eylem cogu zaman yan yana duruyor.

- **Randevu durumlarinda iptal kirmizi degil.** Iptal bir hata degil, normal bir
  sonuc; kirmizi yalnizca "gelmedi" icin.

- **Terminoloji sozlugu baglayici** (`docs/marka.md`). "Slot", "rezervasyon",
  "kullanici" arayuzden cikti - hedef kitle yazilimci degil.

- **Takvim bileseni bilerek eklenmedi.** Randevu akisinin gun secici ihtiyaci
  Faz F'de netlesecek; hazir takvimi simdiden secmek erken karar olurdu.

### Vitrinin yakaladigi iki hata

Vitrin sayfasi "gorsel dogrulama" diye planlanmisti ve ilk bakista iki gercek
hata cikardi:

1. **Saat secici renksiz cikiyordu.** `bg-[--token]` Tailwind v4'te sinif
   uretmiyor ve **hata da vermiyor**. Token `@theme inline` blokuna verilmeli.
   Durum rozetleri calisiyordu cunku onlar zaten oradaydi. Tuzak
   `docs/tasarim-sistemi.md`'ye yazildi.

2. **Dort kontrast cifti AA esiginin altindaydi.** En onemlisi
   `muted-foreground` 3.92:1 idi - butun yardim metni ve aciklamalar onu
   kullaniyor. Olculdu (oklch -> sRGB -> bagil parlaklik), tonlar
   koyulastirildi. Simdi hepsi 4.5:1 uzerinde.

### Bilerek kapsam disi

- ~~Vitrin `/vitrin` altinda acikta duruyor.~~ **Faz D'de kapandi:** sayfa
  `/panel/gelistirici/vitrin` altina tasindi. Vitrin bir gelistirici araci,
  halka acik bir sayfa degil.
- Randevu akisinin kendisi (adim adim ekranlar) Faz F-G'de.

### Dogrulama

- `npm run tip`, `npm run lint` temiz; `npm test` 2 test gecti
- `npm run cf:kur` basarili; bundle **1054 KiB gzip** (3 MiB sinirinin altinda)
- **Elle:** vitrin tarayicida acik ve koyu temada goruldu (o sirada `/vitrin`,
  Faz D'den beri `/panel/gelistirici/vitrin`); Turkce karakterler
  Fraunces'ta dogru geliyor, saat secici durumlari ve form hata durumu calisiyor
- Butun metin/zemin ciftleri WCAG AA uzerinde, degerler belgede tablo halinde

---

## Faz D — kimlik ve kiraci (KISMI: cekirdek bitti, arayuz kalmadi)

**Bu fazda kapanan:** sema (kullanici, personel), kiraci izolasyon katmani,
IDOR guardrail'inin eslint kuraliyla geri getirilmesi, CSRF origin kontrolu,
kimlik katmani ve proxy, isletme kayit akisi, vitrinin panel altina tasinmasi.

**HENUZ KAPANMADI:** giris/kayit ekranlari ve /panel iskeleti. Bu yuzden faz
kapali degil.

### Kararlar

- **IDOR guardrail'i geri geldi.** Drizzle'a gecerken kaybettigimiz warden
  kapisinin yerine eslint `no-restricted-imports`: `src/app` altindan
  `@/lib/db` import etmek yasak. Kapsam route handler'lardan GENIS tutuldu -
  sunucu bilesenleri de sorgu yapabiliyor ve risk birebir ayni. Kural kasitli
  bir ihlalle dogrulandi.

- **Kimlik Supabase'den, yetki bizden.** `auth()` JWT'den yalnizca `sub`
  aliyor, rol ve `isletmeId`'yi kendi `kullanici` tablomuzdan okuyor. Custom
  Access Token Hook bilerek kullanilmadi: claim'e yazmak istek basina bir
  sorgu tasarruf ettirirdi ama rol degisince bayat claim sorunu ve ikinci bir
  migration yuzeyi getirirdi.

- **`getClaims()`, `getSession()` degil.** getSession cookie'den geleni
  DOGRULAMADAN donduruyor; Supabase kendi dokumaninda ona guvenilmemesi
  gerektigini yaziyor. getClaims imzayi dogruluyor ve asimetrik anahtarlarda
  bunu yerelde WebCrypto ile yapiyor - JWKS onbellekli, istek basina ag turu yok.

- **Next 16'da `middleware.ts` DEGIL `proxy.ts`.** Export adi da `proxy`.
  Egitim verisinden yazilsa yanlis olurdu; `AGENTS.md` uyarisi uzerine paketin
  kendi dokumani okundu (`node_modules/next/dist/docs`).

- **Proxy YETKILENDIRME YAPMIYOR.** OpenNext Node middleware'i desteklemedigi
  icin edge'de kosuyor, yani veritabani yok. Yalnizca token yeniliyor (sunucu
  bilesenleri cookie yazamiyor) ve oturum cookie'si hic olmayani ucuzca
  kesiyor. Cookie'nin varligi kimlik kaniti DEGIL; gercek yetki her zaman
  sunucuda `auth()` ile.

- **Turkce slug icin harf tablosu, NFD degil.** Noktasiz i ve noktali I tek
  kod noktasi, ayrilabilir aksanlari yok - NFD onlari cozemiyor. NFD adimi
  yine de duruyor, Turkce olmayan aksanli adlar icin.

- **`x-forwarded-proto` okunuyor.** TLS Cloudflare'de sonlaniyor, uygulamaya
  istek duz http geliyor ama tarayicinin gonderdigi Origin https. Yalnizca
  `req.url`'e guvenilseydi her mesru mutasyon 403 yerdi.

### Bilinen durum

- **`/panel/gelistirici/vitrin` su an tarayicidan acilamiyor.** Yeni yol
  proxy'nin KORUMALI listesine dustu ve `/giris` henuz yok, yani oturumsuz
  ziyaret var olmayan bir sayfaya yonleniyor. Giris ekrani gelince cozulecek.
- Supabase'de hesabi olup bizde `kullanici` kaydi olmayan bir kisi (kayit
  yarida kalirsa) oturum acmis sayilmiyor. Retry akisi henuz yazilmadi.

### Dogrulama

- `npm run tip`, `npm run lint` temiz
- `npm test` - **32 test gecti** (4 dosya, gercek Postgres)
- Guardrail kasitli ihlalle dogrulandi

### Elle yapilmasi gerekenler (Faz D)

- [ ] **PR #3 merge edilince prod'a migration uygula:**
      `npm run db:uygula:prod -- --onayla`
      Goc yalnizca EKLEME (rol enum'i + kullanici + personel tablolari), mevcut
      isletme tablosuna dokunmuyor, veri kaybi yok. Geri alma: iki `drop table`
      ve bir `drop type`.
- [ ] **Supabase panelinde Confirm email KAPALI tutulmali.** Yerlesik SMTP
      saatte 2 mail ile sinirli; acik birakilirsa kayit akisi ilk gun tikanir.
      Domain + Resend custom SMTP baglanana kadar (Faz I) boyle kalacak.
- [ ] Giris/kayit ekranlari ve /panel iskeleti - Faz D'nin kalan yarisi.
      Bunlar gelene kadar /panel/gelistirici/vitrin tarayicidan acilamiyor.
