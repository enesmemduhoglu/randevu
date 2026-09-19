# Decision log

Bir tasarim kararini sorgulamadan once buraya bak; is bitirdiginde buraya yaz.
En degerli satir "bilerek yapilmayan ne var ve neden" satiridir.

Plan: `docs/plan.md`. Invariant'lar: `CLAUDE.md`.

---

## Faz A — iskele

**Kapandi:** Next.js 16.3.3 + React 19.2.8 + TypeScript + Tailwind v4 iskelesi,
Prisma 7.10.0 (CLI + client + adapter-pg), gercek Postgres'e kosan Vitest duzeni,
`CLAUDE.md` invariant'lari, bu gunluk.

### Kararlar

- **Prisma CLI 7.10.0'a sabitlendi.** npm'de `prisma` package'inin `latest` etiketi
  su an **`8.0.0-rc.12`**, yani bir release candidate; son stabil version `prev`
  etiketinde duruyor. `npm i -D prisma` dogrudan RC kuruyor ve yaninda
  `alchemy` + `workerd` diye buyuk bir agac getiriyor - ustelik client
  `^7.10.0` kaldigi icin CLI/client major uyusmazligi olusuyordu.
  **Yeni bagimlilik eklerken `prisma`yi carete birak, major'u yukseltme.**

- **Faz A'ya minimal `Isletme` modeli girdi.** Plan schema'yi Faz E'ye koyuyordu,
  ama modelsiz bir schema'da migration da test run'i de dogrulanamiyor. Tenant
  koku olan tek model burada duruyor; Faz E onu genisletecek, yeniden
  yazmayacak.

- **`src/lib/db.ts` simdilik tek client tutuyor.** Faz B'de Workers yolu
  eklenince client REQUEST BASINA uretilecek (modul seviyesinde tutulan bir
  PrismaClient Hyperdrive ile takilabiliyor - prisma#28193). Dosya ikiye
  bolunmeyecek, `getDb` icinde dallanacak.

- **Testler asla gelistirme veritabanina bakmaz.** `vitest.setup.ts`
  `DATABASE_URL`i `TEST_DATABASE_URL` ile ezer. Bu satir olmadan bir test run'i
  gelistirme verisini silerdi.

- **npm 12'nin allow-scripts gate'i acildi** su package'lar icin: `esbuild`,
  `workerd`, `unrs-resolver`, `msgpackr-extract`, `prisma`, `@prisma/engines`.
  Hepsi native binary indiren standart arac zinciri package'lari.

### Bilerek kapsam disi

- Supabase Auth, shadcn/ui, tasarim token'lari, deploy - sirasiyla Faz C ve D.
- `npm audit`: `deepmerge-ts` uzerinden 3 "high" bulgu var, hepsi tek kok nedene
  cikiyor ve **Prisma CLI'in config okuyucusuna** ait, calisma zamani request
  yoluna degil. `npm audit fix --force` bizi 8-RC'ye iterdi; tedavi hastaliktan
  kotu. Prisma 7 stabil hattinda duzelene kadar bilincli olarak birakildi.

### Elle yapilmasi gerekenler

- [x] Docker Desktop acildi, `randevu-test-pg` container'i (port 5455) ayakta.
- [x] `randevu_dev` ve `randevu_test` olusturuldu, ilk migration uygulandi
      (`20260829125614_ilk`).

### Dogrulama

- `npm run tip` temiz
- `npm run lint` temiz
- `npm run build` basarili
- `npm test` - 2 test gecti (gercek Postgres'e karsi)

### Bilinen gurultu

- `npm run db:hazirla` calisirken Node bir modul-tipi uyarisi basiyor: package
  `type: module` degil ama script ESM. Zararsiz. Duzeltmenin iki yolu da
  (`type: module` eklemek ya da `.mts`'e gecip vitest import'unu bozmak)
  uyarinin maliyetinden buyuk; bilincli olarak birakildi.

---

## Faz B — Cloudflare zemini

**Kapandi (deploy haric):** Supabase projesi, Hyperdrive connection'i, OpenNext +
wrangler config'i, `/saglik` teshis sayfasi ve **Prisma'dan Drizzle'a
gecis**.

### Prisma birakildi, Drizzle'a gecildi

Prisma 7'nin query compiler'i WASM ve workerd runtime'da WASM compile etmeyi
yasakliyor: `WebAssembly.Module(): Wasm code generation disallowed by embedder`.
Denenen ve elenen yollar:

- `runtime = "workerd"` generator secenegi dogru mekanizmayi uretiyor
  (`wasm?module` statik import'u) ama o client Node'da hic calismiyor - Vite
  `?module` sozdizimini ayristiramiyor, yani testler ve `next dev` kiriliyor.
- Iki client uretip secimi `package.json > imports` kosullarina birakmak da
  ise yaramadi: **Next server bundle'ini Node icin uretiyor**, OpenNext o Node
  ciktisini workerd'e uyarliyor. `workerd` kosulu hic devreye girmiyor ve
  Turbopack wasm'i base64'e cevirip runtime compile'ina dusuruyor.
- Prisma tarafinda acik ve dogrulanmamis kayit: prisma/prisma#28657. Tek
  onerilen cozum Prisma 6.19'a inmek.

Drizzle saf TypeScript, hic WASM yok. Olculen kazanc: **worker bundle 2734 KiB
-> 1032 KiB (gzip), %62 dusus**; test run'i 2.8s -> 1.5s. 3 MiB'lik ucretsiz
plan siniri artik rahat.

**Bedeli ve karsiligi:** `warden` invariant gate Prisma'nin `db.model.method(`
bicimini ariyordu; Drizzle'in `db.select().from()` bicimini yakalamiyor. Yani
1. invariant (route'ta ham `db.*` yok) **artik otomatik zorlanmiyor**. Faz D'de
`scoped-db.ts` gelince ESLint `no-restricted-imports` ile deterministik hale
getirilecek - route handler'lar `@/lib/db` import edemeyecek. Gate'in diger
kurallari (dogrudan `resend.emails.send`, `checkOrigin`) etkilenmedi.

### Diger kararlar

- **Supabase direct connection kullanilamiyor.** `db.<ref>.supabase.co` yalnizca
  AAAA (IPv6) kaydi cozuyor; bu makinede IPv6 cikisi yok. Olculdu: session mode
  (5432) ve transaction mode (6543) calisiyor, direct `ENOTFOUND`.
  **Supavisor SESSION MODE** secildi - transaction mode prepared statement
  kirar. Cloudflare'in "direct kullan" tavsiyesi bu senaryoyu kapsamiyor.
- **Hyperdrive query cache'i KAPALI** (`--caching-disabled`). Musaitlik
  query'si yazma kararini besliyor; 60 saniye bayat veri dolu bir slotu bos
  gosterirdi.
- **Local Postgres 17'ye cekildi** (prod Supabase 17.6). Onceki 16'ydi.
- **`?schema=public` kaldirildi.** Prisma'ya ozgu bir parametreydi; postgres.js
  onu server'a baslangic parametresi olarak gonderip `FATAL 42704` aliyordu.
- **`localConnectionString` wrangler.jsonc'ye yazildi.** Bu deger olmadan
  `next build` ve `wrangler dev` Hyperdrive binding'ini cozemeyip patliyor.
  Gizli degil - yalnizca local container'a bakiyor.
- **`@opennextjs/cloudflare@1.20.4` `esbuild`'i bagimliliklarinda tanimlamamis**
  (ne `dependencies` ne `peerDependencies`), hoisting'e guvenmis. npm onu
  `wrangler/node_modules` altina gomunce package kendi bagimliligini bulamiyor.
  Acikca `esbuild` devDependency olarak eklendi - kaldirilirsa build kirilir.
- **ESLint build ciktilarini yok sayiyor** (`.open-next`, `.wrangler`,
  `cloudflare-env.d.ts`). Yoksa 26 bin sahte bulgu uretiyordu.
- **Prisma'nin enjekte ettigi agent skill'leri silindi** (`.agents`,
  `.windsurf`, `skills-lock.json`).

### Bilerek kapsam disi

- **Deploy yapilmadi.** `wrangler deploy` session politikasi tarafindan
  engellendi; kullanici karari bekliyor. Custom domain
  (`randevu.enesmemduhoglu.tech`) da baglanmadi.
- Incremental cache (R2/KV) bagli degil: sayfalar agirlikli dinamik.

### Dogrulama

- `npm run tip`, `npm run lint` temiz
- `npm test` - 2 test gecti (gercek Postgres, 1.5s)
- `npm run cf:kur` basarili, `wrangler deploy --dry-run`: 1032 KiB gzip
- **`wrangler dev` (local workerd) icinde `/saglik`: bagli, PostgreSQL 17, 14 ms**
  - yani Worker kod yolu + Hyperdrive binding calisiyor
- Drizzle migration'i hem local hem PROD Supabase'e uygulandi; prod'da `isletme`
  tablosu dogru kolonlarla duruyor

### Elle yapilmasi gerekenler

- [x] Windows Gelistirici Modu acildi (symlink yetkisi). **Her `cf:kur` icin
      gerekli** - kapatilirsa build EPERM ile duser.
- [x] `wrangler login` yapildi; hesap `6f4d2de4cf9316fbf3538ddea2867547`.
- [x] Deploy karari ve custom domain baglantisi - 30 Agustos 2026'da yapildi,
      ayrinti "Ilk deploy" bolumunde. `wrangler.jsonc` `workers_dev: false` +
      custom domain tasiyor.
- [ ] Supabase access token kullanici tarafindan silindi - yeni bir islem
      gerekirse yenisi lazim. (Kapanmiyor: duran bir kosul, yapilacak is
      degil.)

---

## Faz C — tasarim dili ve component layer'ı

**Kapandi:** marka sesi ve Turkce metin dili, uc layer'lı token sistemi,
shadcn/ui component seti, wordmark ve favicon, component vitrini, tasarim sistemi
belgesi.

### Kararlar

- **Semantic token'lar Ingilizce kaldi.** Primitive ve component layer'ı Turkce
  (`--renk-terracotta-500`, `--saat-secili-zemin`) ama `--background`,
  `--primary`, `--border` shadcn/ui'nin sozlesmesi. Turkcelestirmek, repo'ya
  eklenen HER component'i elle duzenlemek demekti - her yeni component'te tekrar eden
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

- **Takvim component'i bilerek eklenmedi.** Randevu akisinin gun secici ihtiyaci
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
  public bir sayfa degil.
- Randevu akisinin kendisi (adim adim ekranlar) Faz F-G'de.

### Dogrulama

- `npm run tip`, `npm run lint` temiz; `npm test` 2 test gecti
- `npm run cf:kur` basarili; bundle **1054 KiB gzip** (3 MiB sinirinin altinda)
- **Elle:** vitrin tarayicida acik ve koyu temada goruldu (o sirada `/vitrin`,
  Faz D'den beri `/panel/gelistirici/vitrin`); Turkce karakterler
  Fraunces'ta dogru geliyor, saat secici durumlari ve form hata durumu calisiyor
- Butun metin/zemin ciftleri WCAG AA uzerinde, degerler belgede tablo halinde

---

## Faz D — kimlik ve tenant

**Kapandı:** schema (kullanıcı, personel), tenant izolasyon layer'ı, IDOR
guardrail'inin eslint kuralıyla geri getirilmesi, CSRF origin kontrolü, kimlik
layer'ı ve proxy, işletme kayıt akışı, giriş/kayıt/kayıt-tamamlama ekranları,
kimlik API route'ları, panel iskeleti, kök sayfa.

### Kararlar

- **IDOR guardrail'i geri geldi.** Drizzle'a geçerken kaybettiğimiz warden
  gate'inin yerine eslint `no-restricted-imports`: `src/app` altından
  `@/lib/db` import etmek yasak. Kapsam route handler'lardan GENİŞ tutuldu —
  server component'leri de query yapabiliyor ve risk birebir aynı. Kural kasıtlı
  bir ihlalle doğrulandı.

- **Kimlik Supabase'den, yetki bizden.** `auth()` JWT'den yalnızca `sub`
  alıyor, rol ve `isletmeId`'yi kendi `kullanici` tablomuzdan okuyor. Custom
  Access Token Hook bilerek kullanılmadı: claim'e yazmak request başına bir
  query tasarruf ettirirdi ama rol değişince bayat claim sorunu ve ikinci bir
  migration yüzeyi getirirdi.

- **`getClaims()`, `getSession()` değil.** getSession cookie'den geleni
  DOĞRULAMADAN döndürüyor; Supabase kendi dokümanında ona güvenilmemesi
  gerektiğini yazıyor. getClaims imzayı doğruluyor ve asimetrik key'lerde
  bunu local'de WebCrypto ile yapıyor — JWKS cache'li, request başına network turu
  yok.

- **Next 16'da `middleware.ts` DEĞİL `proxy.ts`.** Export adı da `proxy`.
  Eğitim verisinden yazılsa yanlış olurdu; `AGENTS.md` uyarısı üzerine package'ın
  kendi dokümanı okundu (`node_modules/next/dist/docs`).

- **Proxy YETKİLENDİRME YAPMIYOR.** Yalnızca token yeniliyor (server
  component'leri cookie yazamıyor) ve session cookie'si hiç olmayanı ucuzca
  kesiyor. Cookie'nin varlığı kimlik kanıtı DEĞİL; gerçek yetki her zaman
  server'da `auth()` ile — panelde bu karar `src/app/panel/layout.tsx`'te.

  > **Faz E'de düzeltildi:** buradaki "OpenNext Node middleware'i
  > desteklemediği için edge'de koşuyor" cümlesi ölçümle değil varsayımla
  > yazılmıştı ve yanlıştı. Next 16'da proxy zorunlu olarak Node.js
  > runtime'ında koşuyor, OpenNext destekliyor ve bedeli Worker bundle'ında
  > 1358 KiB gzip'ti. Proxy Faz E'de kaldırıldı; ayrıntı Faz E bölümünde.

- **`/api` proxy kapsamının DIŞINDA.** Proxy'nin tek işi cookie yenilemek ve
  route handler'lar bunu kendileri yapabiliyor (`cookies().set` orada
  çalışıyor, server component'lerinin aksine). İkisi aynı response'a cookie yazarsa
  hangi `Set-Cookie`'nin sonda kalacağı belirsizleşiyordu — çıkış request'inde bu,
  session'ı hiç temizlememek anlamına gelirdi.

- **Türkçe slug için harf tablosu, NFD değil.** Noktasız i ve noktalı I tek
  kod noktası, ayrılabilir aksanları yok — NFD onları çözemiyor. NFD adımı
  yine de duruyor, Türkçe olmayan aksanlı adlar için.

- **`x-forwarded-proto` okunuyor.** TLS Cloudflare'de sonlanıyor, uygulamaya
  request düz http geliyor ama tarayıcının gönderdiği Origin https. Yalnızca
  `req.url`'e güvenilseydi her meşru mutation 403 yerdi.

- **Kimlik akışlarının tamamı server'da.** Formlar kendi route'larımıza POST
  atıyor; Supabase çağrısını server yapıyor, cookie'yi de o yazıyor. Bedeli:
  formlar JS gerektiriyor. Karşılığı: şifre tarayıcıdaki bir SDK'ya hiç
  girmiyor, cookie yazma tek yerde kalıyor ve dört route da `checkOrigin` ile
  aynı CSRF gate'inden geçiyor (server action olsaydı o gate Next'in kendi
  kontrolüne devredilirdi). `createBrowserClient` wrapper'ı hiç
  çağrılmadığı için silindi.

- **Route'larda adım sırası sözleşme:** `checkOrigin` → body ayrıştırma →
  input doğrulama → *ancak sonra* Supabase/veritabanı. İlk üç adım network'e
  çıkmadığı için o dilim Postgres'siz ve Supabase'siz test edilebiliyor; testler
  tam olarak bu sıraya dayanıyor ve sıra bozulursa `cookies()` fırlatarak
  düşüyorlar. Kayıtta ayrıca bir ürün gerekçesi var: geçersiz bir işletme
  adıyla açılmış Supabase hesabı geri alınamaz, sahipsiz kalırdı.

- **Girişte şifre uzunluğu kontrol EDİLMİYOR**, yalnızca boş mu diye
  bakılıyor. Var olan bir hesabın şifresi kural sıkılaşmadan önce belirlenmiş
  olabilir; onu "geçersiz" saymak sahibini kendi hesabından dışarı kilitlerdi.
  Kayıtta tam kural geçerli — orada yeni şifre belirleniyor.

- **Şifre üst sınırı 72 KARAKTER değil, 72 BAYT.** Supabase bcrypt kullanıyor
  ve bcrypt 72 bayttan sonrasını sessizce atıyor. Türkçe harfler UTF-8'de iki
  bayt, yani 40 karakterlik bir şifre sınırı aşıyor; karakter sayan bir kontrol
  bunu kaçırırdı ve kullanıcı bir daha giriş yapamazdı.

- **Başarısız girişte tek mesaj.** "Böyle bir hesap yok" ile "şifre yanlış"
  ayrımını yapmak hesap sayımına (enumeration) gate açar.

- **Supabase hata kodları kendi cümlelerimize eşleniyor** (`src/lib/supabase/
  hata.ts`). Provider'ın metni hiçbir zaman taşınmıyor (invariant 5), yalnızca
  bilinen KOD eşleniyor. Bu eşleme elle denemeden doğdu: Supabase `.test`
  uzantılı adresi reddetti ve ekranda "bağlantıda bir sorun oldu" yazdı —
  kullanıcıya düzeltebileceği bir şey olduğunu hiç söylemeyen bir mesaj.

- **Çıkış kapsamı `local`, varsayılan `global` değil.** `global` kullanıcının
  tüm cihazlarındaki yenileme token'larını iptal ediyor: telefonundan çıkan
  biri masaüstünden de atılmış oluyor. "Tüm cihazlardan çık" ayrı ve açıkça
  seçilen bir işlem olmalı.

- **Route'lar `Response.redirect` dönmüyor.** fetch ile atılan bir request'te 30x
  response'unu tarayıcı sessizce izliyor ve client nereye gidildiğini
  öğrenemiyor. Sözleşme: hata `{ hata }`, başarı `{ yon }` — redirect'i
  client yapıyor ve ardından `router.refresh()` çağırıyor (cookie yeni
  yazıldı, server component'lerinin çıktısı bayat).

- **`auth()` ve `authKimligi()` React `cache`'ine alındı.** Panel düzeni ve
  içindeki sayfa aynı request'te ikisi de session'ı soruyor; sarmadan her biri
  kendi JWT doğrulamasını ve kendi query'sini yapardı. Request başına cache,
  yani bayat session riski yok.

- **`isletmeKaydiOlustur` benzersizlik ihlalini yakalıyor.** Transaction önce
  "bu authUserId kayıtlı mı" diye bakıyor ama iki request aynı anda gelirse
  ikisi de boş görüyor; kesin cevabı `kullanici_auth_user_id_idx` veriyor
  (invariant 3). Slug çarpışması bilerek yakalanmıyor: o kadar dar bir pencere
  için yeniden deneme döngüsü taşımak, hiç koşulmayan — yani test edilmemiş — kod
  demekti.

- **Zod eklenmedi.** Doğrulanan alan sayısı az ve mesajların tamamı Türkçe;
  kütüphanenin ürettiği metni yine elle yazacaktık. Form layer'ı
  (react-hook-form + zod) Faz E'de hizmet/personel formlarıyla birlikte gelecek.

- **Olmayan sayfalara link verilmiyor.** Panel menüsünde Takvim, Hizmetler,
  Personel, Çalışma saatleri ve Ayarlar tıklanamaz duruyor ve "Yakında" rozeti
  taşıyor. 404'e götüren menü, eksik menüden kötü.

- **Panel ana sayfasında sahte veri yok.** Gösterilecek randevu, hizmet ve
  çalışma saati Faz E-H'de geliyor; boş bir takvim ya da uydurma istatistik
  çizmek yerine elimizdeki gerçek bilgi (işletme adı, saat dilimi, randevu
  sayfası adresi) ve sıradaki adımlar gösteriliyor.

- **Kimlik ekranlarında alan yüksekliği `h-8` değil `h-10`.** Varsayılan ölçü
  panel içi yoğun arayüz için; bu üç ekran mobilde parmakla kullanılıyor ve
  tasarım sistemi dokunma hedefini en az 44px alıyor.

- **Client'ta ağır doğrulama yok.** Kuralların tek sahibi server'daki
  `girdi.ts`. Aynı kuralı iki yerde tutmak, ikisinin zamanla ayrışması ve
  kullanıcının server'da göremediği bir hatayla karşılaşması demekti.

### Bilinen durum

- ~~Supabase'de *Confirm email* hâlâ açık.~~ **Faz F sırasında kapatıldı ve
  akış end-to-end doğrulandı** — bkz. "End-to-end doğrulama" bölümü. Kod her iki
  duruma da hazır: `data.session` yoksa kullanıcı `/giris`'e mesajla
  yönlendiriliyor.
- Supabase'de `faz-d-deneme@example.com` için sahipsiz bir hesap kalmış
  olabilir (request e-posta gönderimi adımında düştü). Local veritabanında
  karşılığı yok — kontrol edilip silinebilir.

### Bilerek kapsam dışı

- **Şifre sıfırlama akışı yok.** Kayıt ve giriş çalışır durumda; sıfırlama
  gerçek e-posta gönderimi gerektiriyor ve o altyapı Faz I'de kuruluyor.
  Şimdi yazılsa yerleşik SMTP'nin saatte 2 mesaj sınırına çarpardı.
- **Müşteri rolü için ekran yok.** `MUSTERI` rolü schema'da ve `auth()`'ta var,
  panele girişi engelleniyor; `/randevularim` Faz J'de.
- **Kök sayfa geçici.** Gerçek tanıtım sayfası ürün çalışır hale gelince
  yazılacak; bugün anlatılacak bir şey yok ve uydurulmuş bir özellik listesi
  sonradan düzeltilecek bir borç olurdu.
- **`/saglik` public kaldı.** Vitrin panel altına taşındı ama sağlık
  sayfası dışarıdan izleme için anlamlı ve sızdırdığı tek şey PostgreSQL major
  version'ı ile gidiş-dönüş süresi; hata metni zaten bastırılıyor.

### Doğrulama

- `npm run tip`, `npm run lint` temiz
- `npm test` — **90 test geçti** (10 dosya, gerçek Postgres)
- `npm run build` başarılı; 13 route üretiliyor
- **Elle (`next dev`):** `/`, `/giris`, `/kayit` 200; session'sız `/panel` ve
  `/kayit/tamamla` → 307 `/giris?devam=…`; `/api/giris` Origin'siz ve yabancı
  Origin'le 403, doğru Origin'le olmayan hesapta 401 (gerçek Supabase'e
  ulaşarak); kayıtta Supabase hata kodları doğru cümleye eşleniyor

### Elle yapılması gerekenler (Faz D)

- [x] **Prod'a uygulandı** (30 Ağustos 2026, Faz E migration'ıyla birlikte). Migration
      yalnızca EKLEME'ydi (rol enum'u + kullanıcı + personel tabloları); mevcut
      işletme tablosuna dokunmadı. Geri alma: iki `drop table`, bir `drop type`.
- [x] **Supabase'de *Confirm email* KAPATILDI** (30 Ağustos 2026,
      Management API: `mailer_autoconfirm: true`). Yerleşik SMTP saatte 2 mail
      ile sınırlı; domain + Resend custom SMTP bağlanana kadar (Faz I) kapalı
      kalmalı. Açılırsa kayıt akışı ilk iki denemeden sonra tıkanır.
- [x] **End-to-end elle doğrulama yapıldı** (30 Ağustos 2026). Ayrıntı aşağıda
      "End-to-end doğrulama" bölümünde.
- [x] Cloudflare'e deploy ederken `NEXT_PUBLIC_SUPABASE_URL` ve
      `NEXT_PUBLIC_SUPABASE_ANON_KEY` **build time'da** environment'ta olmalı;
      `NEXT_PUBLIC_` prefix'li variable'lar `cf:kur` adımında gömülüyor. İlk
      deploy'da sağlandı — ama bu bir kerelik iş değil, **her `cf:kur` için
      geçerli duran bir kural**. Faz G2'nin
      `NEXT_PUBLIC_TURNSTILE_SITE_KEY`'i de aynı sınıfta.
- [x] Deploy kararı ve custom domain bağlantısı (Faz B'den devrediyordu) —
      30 Ağustos 2026, "İlk deploy" bölümü.

---

## Faz E — schema ve panel CRUD

**Kapandı:** yedi yeni tablo, `EXCLUDE` çakışma constraint'i, hizmet / personel /
çalışma saatleri / ayarlar ekranları ve route'ları, invariant tarayıcısı,
proxy'nin kaldırılması.

### Kararlar

- **Çalışma saati `timestamp` değil, gün + dakika.** Bunlar tekrar eden duvar
  saati kuralları: "Pazartesi 09:00" yaz saati geçişinde de 09:00'dur.
  Timestamp olarak saklansaydı yılda iki kez bir saat kayardı.

- **`haftaninGunu` 0 = Pazar**, yani JavaScript `Date.getDay()` ile birebir.
  Müsaitlik motoru günü hesaplarken dönüşüm yapmasın diye. Arayüz haftayı
  pazartesiden başlatıyor; sıra `HAFTA_SIRASI` sabitinde veriliyor.

- **Öğle arası ayrı bir kavram değil, ikinci bir aralık.** Aynı güne iki satır
  yazılıyor. "Ara başlangıç/bitiş" gibi ayrı alanlar koysaydık, üçüncü bir ara
  gerektiğinde hem schema'yı hem arayüzü hem dönüşümü yeniden yazmak gerekirdi.

- **Para kuruş cinsinden tam sayı ve dönüşüm SERVER'DA.** Ondalık sayıda
  `0.1 + 0.2` problemi tutara sızardı; `numeric` ise JS tarafında string olarak
  gelir. Client "350,50" için 35050'yi kendisi hesaplasaydı dönüşüm kayan
  noktadan geçerdi (`350.5 * 100 = 35050.000000000004`). Metin üzerinde tam
  sayı aritmetiği bu sınıfı tamamen kapatıyor; `paraBicimle` ↔
  `paraKurusDogrula` gidiş-dönüş testiyle kilitli.

- **`personel_hizmet` boş olması "hiçbiri" değil "hepsi" demek.** Tek kişilik
  işletmede tablo hiç dolmuyor ve varsayılan davranış doğru kalıyor.
  Alternatifi her yeni hizmet için her personele satır yazmaktı — unutulduğunda
  hizmet görünmez olurdu.

- **Hizmet ve personel silinmiyor, pasifleniyor.** Geçmiş randevular onlara
  `ON DELETE restrict` ile bağlı; silmek geçmişi de götürürdü.

- **Son aktif personel pasife alınamıyor.** Randevu bir personele bağlanmak
  zorunda; son kişiyi de pasiflemek işletmeyi randevu alınamaz duruma sokar ve
  bu ancak müşteri şikâyet edince fark edilirdi. Sayma ve güncelleme aynı
  transaction'da, satırlar `FOR UPDATE` ile kilitli — olmasa ard arda gelen iki
  request ikisini de "son değil" görüp ikisini birden pasifleyebilirdi.

- **Toplu yazma (önce sil, sonra ekle), satır bazlı API değil.** Haftalık düzen
  ve hizmet eşlemesi kullanıcının kafasında tek bir şey; satır bazlı bir API
  yarım uygulanmış bir hafta bırakabilirdi. Yabancı bir id geldiğinde request'in
  tamamı reddediliyor — sessizce atlamak "kaydettim" deyip yarım küme bırakmak
  olurdu.

- **Saat dilimi ve randevu aralığı kapalı liste**, `Intl.supportedValuesOf`
  değil: workerd'in ICU build'i tam değil ve orada liste eksik dönebiliyor —
  kullanıcının kayıtlı saat dilimi bir gün "geçersiz" sayılırdı. Aynı sebeple
  `paraBicimle` de `Intl.NumberFormat` kullanmıyor.

- **Telefon veritabanında yalnızca rakam ve tek biçimde**; baştaki `0` ve `90`
  kırpılıyor. `musteri` tablosunda telefon benzersiz olduğu için iki yazım iki
  ayrı müşteri kaydı üretir ve geçmiş ikiye bölünürdü.

- **Gün içi çakışan çalışma aralıkları reddediliyor.** Bu kuralın işi Faz F'deki
  müsaitlik motorunun input'unu korumak: motor çakışan aralıkları çözerken aynı
  slotu iki kez üretir ya da sessizce düşürür. Bitişik aralıklar (13:00 biten ve
  13:00 başlayan) çakışma sayılmıyor — kullanıcının öğleden önce/sonra ayrımını
  görmek istemesi meşru.

### Çakışma constraint'i (INVARIANT 8 artık gerçek)

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "randevu" ADD CONSTRAINT "randevu_cakisma_yok"
  EXCLUDE USING gist ("personel_id" WITH =,
                      tstzrange("baslangic","bitis",'[)') WITH &&)
  WHERE ("durum" IN ('BEKLIYOR','ONAYLI'));
```

Drizzle `EXCLUDE`'u ifade edemiyor; constraint migration'a elle yazıldı. İki ayrıntı
kasıtlı: aralık `'[)'` olduğu için bitişik randevular çakışma sayılmıyor
(10-11 ile 11-12 birlikte alınabiliyor), `WHERE` koşulu iptal ve gelmedi
durumlarını dışarıda bıraktığı için iptal edilen saat boşalıyor. Sekiz test bu
davranışların her birini ayrı ayrı kilitliyor.

Migration hem **boş** hem **Faz D verisiyle dolu** bir veritabanında test edildi; ikisinde
de uygulandı ve mevcut veri korundu.

### Ortaya çıkan iki gerçek hata

1. **Drizzle, Postgres hatasını sarmalıyor.** `DrizzleQueryError`'da `code`
   alanı YOK; o yalnızca en içteki nesnede duruyor. Yani Faz D'de yazılan
   `hata.code === "23505"` kontrolü **hiçbir zaman eşleşmiyordu** — kayıt yarışı
   sadece fallback mesaj kontrolü sayesinde çalışıyordu. `src/lib/pg-hata.ts`
   `cause` zincirini geziyor ve testi uydurulmuş bir nesne değil, gerçek bir
   Drizzle hatası kullanıyor.

2. **Test temizliği schema büyüyünce sessizce bozuldu.** Her dosya kendi bildiği
   tabloları siliyordu; `randevu` personele `ON DELETE restrict` ile bağlı
   olduğu için bir dosya randevu bırakınca sonraki dosyanın `delete(personel)`
   çağrısı düşüyordu. Testler tek tek geçerken hep birlikte düşüyorlardı — en
   pahalı hata türü. `TRUNCATE ... CASCADE` zinciri Postgres'e çözdürüyor.

### Proxy kaldırıldı — ölçülmüş bir karar

Cloudflare bundle'ı 3 MiB'lik ücretsiz plan sınırının **100 KiB altına**
inmişti (2969.80 KiB gzip). Sebep tek bir dosya çıktı: proxy kaldırılınca
**1611.40 KiB**'a düştü, yani proxy tek başına **1358 KiB** — bütçenin %44'ü.

Neden bu kadar pahalı: Next 16'da proxy **zorunlu olarak Node.js runtime'ında**
koşuyor. Package'ın kendi dokümanı açık yazıyor: *"Proxy defaults to using the
Node.js runtime. The `runtime` config option is not available in Proxy files.
Setting the `runtime` config option in Proxy will throw an error."* OpenNext de
onun için Next server runtime'ının ikinci bir kopyasını paketliyor. Kaçış yolu
yok; seçim "proxy var ya da yok".

**Faz D'deki not yanlıştı:** "OpenNext Node middleware'i desteklemediği için
edge'de koşuyor" cümlesi ölçümle değil varsayımla yazılmıştı.

Proxy'nin iki işi vardı ve ikisi de karşılandı:
1. Token tazeleme → `POST /api/oturum` + `OturumTazeleyici` client component'i
   (25 dakikada bir ve sekme öne geldiğinde). Server component'leri cookie
   yazamıyor, route handler'lar yazabiliyor.
2. Cookie'siz request'i `/panel`den ucuzca çevirme → zaten **kesin bir kontrol
   değildi** (cookie'nin varlığı kimlik kanıtı değil) ve gerçek karar hep panel
   düzenindeydi.

**Kaybedilen tek şey:** derin link'e dönüş. Önce `/panel/hizmetler`e
session'sız giren kişi girişten sonra oraya dönüyordu, şimdi `/panel`e dönüyor.
Server component'i kendi yolunu güvenilir biçimde okuyamıyor; bedeli 1358 KiB'a
değmez.

### Invariant tarayıcısı

`panelKapisi` üç adımı (checkOrigin → session → body) tek yere aldı ve bunun
bir bedeli oldu: `checkOrigin` artık route dosyalarında **görünmüyor**, yani
warden'ın metin arayan gate'i onu yakalayamıyor. Aynı şey Faz B'de bir kez
yaşandı (Prisma'dan Drizzle'a geçerken tenant gate'i sessizce zorlanamaz hale
geldi ve iki faz incelemeye bağlı kaldı).

Tekrarlanmasın diye `src/lib/degismezler.test.ts` eklendi: `src/app` altındaki
her route dosyasını okuyup mutation metodu olan her birinde gate'in varlığını
arıyor, `panelKapisi`nin gerçekten `checkOrigin` çağırdığını doğruluyor ve
hiçbir dosyanın `@/lib/db` import etmediğini kontrol ediyor. **Kasıtlı bir
ihlalle test edildi — yakaladı.**

### Bilerek kapsam dışı

- **Randevu CRUD'u yok.** Tablo ve constraint hazır ama randevu yazan tek yol Faz
  F-G'de gelecek (müsaitlik motoru + public sayfa). Panelden elle randevu
  ekleme Faz H'de.
- **`bildirim_kuyrugu` tablosu boş duruyor.** Faz I'de kullanılacak; şimdi
  oluşturuldu ki o faz migration gerektirmesin.
- **`kapali` (izin/tatil) tablosunun ekranı yok.** Müsaitlik motoru onu Faz
  F'de okuyacak; ekranı o zaman anlamlı olacak.
- **Hizmet sırası elle düzenlenemiyor.** Schema'da `sira` var ve liste ona göre
  sıralanıyor; sürükle-bırak arayüzü bu fazın kazancına değmezdi.
- **Personel hesabı davet etme yok.** `personel.kullaniciId` schema'da duruyor ama
  personeli sisteme davet etme akışı yazılmadı; şu an işletme sahibi herkesi
  kendi adına yönetiyor.

### Doğrulama

- `npm run tip`, `npm run lint` temiz
- `npm test` — **189 test geçti** (18 dosya, gerçek Postgres)
- `npm run build` başarılı, 23 route
- `npm run cf:kur` + `wrangler deploy --dry-run`: **1612 KiB gzip** (3 MiB
  sınırının 1460 KiB altında)
- Migration boş ve dolu veritabanında ayrı ayrı test edildi
- Elle (`next dev`): `/`, `/giris` 200; session'sız `/panel`, `/panel/hizmetler`
  → 307 `/giris?devam=/panel`; `/kayit/tamamla` → 307 `/giris`;
  `/api/oturum` Origin'siz 403

### Elle yapılması gerekenler (Faz E)

- [x] **Prod'a uygulandı** (30 Ağustos 2026). Migration yalnızca EKLEME'ydi (yedi
      tablo, dört enum, `btree_gist` uzantısı ve `isletme`ye `DEFAULT` değerli
      kolonlar). Geri alma: yedi `drop table`, dört `drop type`, `isletme`
      kolonlarında `drop column`.
- [x] **`btree_gist` Supabase'de sorunsuz kuruldu** — yetki hatası çıkmadı,
      migration'ın ilk satırı (`CREATE EXTENSION IF NOT EXISTS`) yetti.
- [x] Faz D'den devreden madde kapandı: Confirm email kapatıldı ve akış end-to-end
      doğrulandı.

---

## Faz F — müsaitlik motoru

**Kapandı:** `src/lib/zaman.ts`, `src/lib/musaitlik.ts`, `src/lib/musaitlik-sorgu.ts`,
`GET /api/musaitlik`. Ürünün kalbi ve testlerin en yoğun olduğu faz: bu üç
dosya için **76 test** yazıldı.

### Zaman layer'ı (`zaman.ts`)

**Server'ın saat dilimine hiçbir yerde güvenilmiyor.** `new Date()` dışında
hiçbir local-zaman API'si kullanılmıyor: Worker'ın dilimi UTC, geliştirici
makinesininki Europe/Istanbul, testlerinki bir başkası olabilir. Aynı kod üç
yerde üç farklı sonuç üretirse hata ancak production'da görünür.

**Kütüphane eklenmedi.** `date-fns-tz` ya da `luxon` Worker bundle'ına yüz
kilobaytlarca ekliyor ve bütçe 3 MiB (bkz. Faz E). Gereken iki dönüşüm
`Intl`in zaten taşıdığı IANA verisiyle yapılabiliyor.

**Yaz saati sınırları açıkça seçildi** (ECMAScript Temporal'ın "compatible"
kuralıyla aynı):

- **Var olmayan saat.** Saat ileri alınırken 02:00 doğrudan 03:00 olur; 02:30 o
  gün hiç yaşanmaz. Sonuç **ileri kayıyor**. Hata fırlatmıyoruz: çalışma saati
  02:30'da başlayan bir işletme için "o gün bir saat geç başladı" makul,
  "randevu alınamaz" değil.
- **İki kez yaşanan saat.** Saat geri alınırken 02:30 iki kez yaşanır. **İlki**
  seçiliyor — "saat 02:30 olduğunda" denince kastedilen ilk defasıdır.

Yöntem: geçiş bir günden kısa sürede olup bittiği için hedef günün bir gün
öncesi ve sonrasındaki ofsetler iki adayı veriyor; istenen duvar saatine geri
dönen adaylardan en erkeni seçiliyor.

**Yakalanan iki tuzak:**
- ICU bazı version'larda `hour12: false` ile gece yarısını **"24"** veriyor.
  Düzeltilmezse 00:15 randevusu önceki günün 24:15'i gibi görünürdü.
- `Date.UTC` taşırma yapıyor: `"2026-02-29"` (2026 artık yıl değil) sessizce
  1 Mart olurdu ve kullanıcı istemediği bir günün saatlerini görürdü. Ayrıştırma
  geri okuyup aynı gün mü diye bakıyor.

### Motor (`musaitlik.ts`)

**Saf fonksiyon** — `simdi` bile dışarıdan veriliyor. İçeride okunsaydı yaz
saati geçişi, gün sınırı ve minimum bildirim süresi ancak o anları bekleyerek
test edilebilirdi.

- **Slot ızgarası her çalışma aralığının kendi başından başlıyor**, günün
  başından değil. Öğleden sonraki aralık 13:10'da başlıyorsa saatler 13:10,
  13:30... oluyor; gün başından sayılsaydı 12:50 gibi noktalara düşerdi.
- **Hizmet aralığa sığmalı.** 18:00'de kapanan bir aralıkta 17:45'te başlayan
  30 dakikalık hizmet yer bulamaz. Öğle arasına taşan randevu da böylece
  engelleniyor: iki aralık ayrı ayrı deneniyor.
- **Bitiş gerçek süreyle hesaplanıyor, duvar saatiyle değil.** Duvar saatinden
  hesaplansaydı yaz saati geçişini kapsayan randevu 120 dakika sürer ve bir
  sonrakiyle çakışırdı. Testi var: geçişi kapsayan aralıkta her randevu tam 60
  dakika ve ardışık slotlar çakışmıyor.
- **Çakışma testi yarım açık `[)`** — veritabanındaki `EXCLUDE` constraint'iyle aynı.
  İkisi ayrışırsa motor "boş" dediği bir slotu constraint reddeder ve kullanıcı
  sebebini anlamaz.
- **`slotAraligiDk <= 0` boş dönüyor.** Değer kullanıcı ayarından geliyor ve
  döngü sonsuza giderdi.

**Motor bir garanti değil.** İki müşteri aynı saniyede aynı slotu isterse ikisi
de "boş" görür; kesin cevabı `EXCLUDE` constraint'i veriyor (INVARIANT 8).

### Query layer'ı (`musaitlik-sorgu.ts`)

Route ile motor arasında ayrı bir dosya, çünkü aynı iş iki yerde gerekecek:
`GET /api/musaitlik` listeyi gösteriyor, Faz G'deki `POST /api/randevu` ise
yazmadan hemen önce aynı hesabı tekrarlayıp slotun hâlâ boş olduğunu
doğrulayacak. İki yerde iki farklı hesap, müşteriye gösterilen liste ile kabul
edilen randevunun ayrışması demekti.

- **Personel verilmezse** hizmeti verebilen herkes deneniyor ve aynı saat **tek
  seçenek** olarak dönüyor. "Farketmez" diyen müşteriye aynı saati iki kez
  göstermek anlamsız olurdu; sıralı listede `sira`'sı küçük olan kazanıyor.
- **Randevu ve izin aralıkları pencereyle KESİŞENLER olarak çekiliyor**,
  "içinde olanlar" olarak değil: gece yarısını aşan bir randevu ya da bir
  haftalık tatil aksi halde görünmezdi. İkisinin de testi var.
- **Dolu kümesi yalnızca `BEKLIYOR` ve `ONAYLI`** — `EXCLUDE` constraint'inin `WHERE`
  koşuluyla aynı. İptal ve gelmedi saati boşaltıyor.

### `GET /api/musaitlik`

Session'sız ve public: müşteri randevu almak için hesap açmıyor. Tenant
session'dan değil `isletme` slug'ından çözülüyor ve `getHalkaAcikDb` filtreyi yine
closure variable'ı olarak tutuyor.

- **GET olduğu için `checkOrigin` yok** — INVARIANT 2 yalnızca mutation'lar için.
  Kötüye kullanım (başka bir salonun doluluk takvimini kazımak) CSRF ile değil
  rate limit'le engelleniyor; Cloudflare kuralı Faz G'de bu yola konacak.
- **Response cache'lenmiyor** (`cache-control: no-store`). Müsaitlik yazma
  kararını besliyor: bir saniye bayat veri, dolu bir slotu boş gösterip
  müşteriyi 409'a götürür. Hyperdrive'ın query cache'i de aynı sebeple kapalı.
- Kapalı ya da hiç olmayan işletme **aynı** cevabı alıyor: hangi slug'ların
  kayıtlı olduğunu sızdırmanın faydası yok.

### Bilerek kapsam dışı

- **Randevu yazma yok.** `POST /api/randevu` ve iptal akışı Faz G'de.
- **Çok günlü müsaitlik query'si yok.** Uç tek gün veriyor; takvimde "hangi
  günler dolu" göstergesi gerekirse Faz G'de eklenecek. Şimdi eklemek,
  kullanılmayan bir query şekli test etmek olurdu.
- **`kapali` (izin) ekranı hâlâ yok.** Motor tabloyu okuyor ama işletme henüz
  izin giremiyor; ekran Faz H'de takvimle birlikte anlamlı olacak.
- **Rate limit konmadı.** Cloudflare kuralı Faz G'de, `POST /api/randevu` ile
  birlikte.

### Doğrulama

- `npm run tip`, `npm run lint` temiz
- `npm test` — **266 test geçti** (21 dosya)
  - `zaman.test.ts` 23, `musaitlik.test.ts` 33, `musaitlik-sorgu.test.ts` 20
  - query testlerinin beşi public yolun **IDOR** testi
- **Elle, gerçek veriyle** (`next dev` + seed'lenmiş `randevu_dev`): 45 dk'lık
  hizmet öğle arasında kesiliyor (son sabah slotu 11:15, öğleden sonra 13:00'te
  başlıyor), son slot 17:15; 120 dk'lık hizmet 18 slot üretiyor; cumartesi
  10:00-16:00; pazar, geçmiş gün ve pencere dışı boş; Ayşe 10:00-10:45 dolu
  olunca o saatler Ali'ye düşüyor ve **10:45 bitişik olduğu için** Ayşe'ye geri
  dönüyor; bilinmeyen slug/hizmet 404, bozuk tarih ve eksik parametre 400

### Elle yapılması gerekenler (Faz F)

- [x] Faz D'den devreden madde kapandı: `mailer_autoconfirm: true` yapıldı ve
      kayıt → panel akışı end-to-end doğrulandı.
- [x] `randevu_dev` veritabanına örnek işletme seed'lendi (`isil-guzellik`,
      iki personel, iki hizmet, haftalık çalışma düzeni, bir randevu). Faz G
      geliştirmesi için duruyor; prod'a gitmiyor.

---

## End-to-end doğrulama — 30 Ağustos 2026

Faz D'den beri bekleyen engel kalktı: Supabase'de *Confirm email* kapatıldı
(`mailer_autoconfirm: true`, Management API üzerinden). Ardından Faz D-E-F'nin
tamamı **çalışan uygulamada, gerçek Supabase ve gerçek Postgres'e karşı**
test edildi. Aşağıdakilerin hepsi `next dev` üzerinde gözlendi.

### Kimlik akışı

| Adım | Sonuç |
|---|---|
| Kayıt (yeni e-posta) | `200 {"yon":"/panel"}`, dört `sb-*` cookie'si yazıldı |
| Session'la `/panel` | 200 |
| Çıkış | `200 {"yon":"/giris"}`, cookie'ler temizlendi |
| Çıkış sonrası `/panel` | `307 → /giris?devam=/panel` |
| Yanlış şifreyle giriş | `401 "E-posta ya da şifre hatalı"` — hangisinin yanlış olduğu **söylenmiyor** |
| Doğru şifre + `devam=/panel/hizmetler` | `200 {"yon":"/panel/hizmetler"}` |
| **Açık redirect denemesi** `devam=//kotu.site` | `200 {"yon":"/panel"}` — gate tuttu |

### Panel

Altı sayfa da session'la 200 dönüyor: `/panel`, `/panel/hizmetler`,
`/panel/personel`, `/panel/calisma-saatleri`, `/panel/ayarlar`,
`/panel/gelistirici/vitrin`.

Mutation'lar: hizmet eklendi (`"150,50"` → `fiyatKurus: 15050`, yani para
ayrıştırması end-to-end doğru), personel eklendi, ayarlar güncellendi.

### IDOR — gerçek session'la, çapraz tenant

Bir işletmenin session'ıyla **başka** bir işletmenin kayıtlarına üç ayrı saldırı
denendi. Üçü de reddedildi ve kurban kayıtlar veritabanında **değişmedi**:

| Deneme | Response | Kurban kayıt |
|---|---|---|
| `PATCH /api/hizmetler/<başkasının-id>` | `404 "Hizmet bulunamadı"` | `Saç kesimi, 45 dk, aktif` — değişmedi |
| `DELETE /api/hizmetler/<başkasının-id>` | `404 "Hizmet bulunamadı"` | aynı |
| `PUT /api/personel/<başkasının-id>/calisma-saatleri` | `404 "Personel bulunamadı"` | 0 satır eklendi |

404 mesajı bilerek "yetkiniz yok" demiyor: başka tenant'a ait bir kaydı istemek
ile hiç olmayan bir kaydı istemek çağırana aynı görünmeli, yoksa kaydın varlığı
sızar.

### Müsaitlik motoru (Faz F)

Seed'lenmiş `randevu_dev` verisiyle (`isil-guzellik`, iki personel, iki hizmet,
hafta içi 09:00-12:00 ve 13:00-18:00, cumartesi 10:00-16:00):

| Senaryo | Sonuç |
|---|---|
| 45 dk hizmet, salı | Son sabah slotu **11:15**, sonra **13:00**; son slot **17:15** |
| 120 dk hizmet | 18 slot, son **16:00** |
| Cumartesi | 22 slot, 10:00–15:15 |
| Pazar / geçmiş gün / pencere dışı | Boş |
| Ayşe 10:00-10:45 dolu | O saatler **Ali**'ye düştü; **10:45 bitişik olduğu için Ayşe**'ye döndü |
| Bilinmeyen slug / hizmet | 404 |
| Bozuk tarih / eksik parametre | 400 |

Son satır `'[)'` aralık semantiğinin end-to-end doğru olduğunu gösteriyor: constraint,
motor ve query layer'ı aynı kuralı uyguluyor.

### Bu doğrulamanın bıraktıkları

- Supabase'de test hesapları kaldı (`deneme-<zaman>@example.com`). Silinmesi
  gerekmiyor ama isteniyorsa Supabase panelinden Authentication → Users.
- `randevu_dev` içinde iki örnek işletme var (`isil-guzellik` seed'i ve test
  kaydı). Yalnızca geliştirme veritabanı; prod'a gitmiyor.

### Prod migration'ı — 30 Ağustos 2026

PR #3 ve #4 merge edildikten sonra `npm run db:uygula:prod -- --onayla`
çalıştırıldı. Öncesinde prod'da yalnızca `isletme` tablosu ve tek bir migration
vardı (Faz A); tablo boştu, yani veri riski yoktu.

**Sonuç:** 10 tablo, 5 enum, `btree_gist` uzantısı, 3 migration uygulanmış durumda.
`isletme`ye eklenen yedi kolonun hepsi `DEFAULT` değerli; mevcut satırlar
etkilenmedi (zaten yoktu).

`btree_gist` Supabase'de **yetki hatası çıkarmadan** kuruldu — migration'ın ilk
satırındaki `CREATE EXTENSION IF NOT EXISTS` yetti. Panelden elle açmaya gerek
kalmadı.

#### Çakışma constraint'i PROD'da test edildi

INVARIANT 8'in production'da gerçekten tuttuğu, **geri alınan bir transaction**
içinde kanıtlandı — prod'a kalıcı hiçbir satır yazılmadı (sonrasında sayıldı:
0). Her deneme kendi `SAVEPOINT`'inde koştu; ilk denemede bu yapılmamıştı ve
23P01 hatası transaction'ı iptal edince sonraki komutlar `25P02` alıp anlamsız
sonuç vermişti.

| Deneme | Sonuç |
|---|---|
| Çakışan ikinci randevu | `23P01 randevu_cakisma_yok` — reddedildi |
| Bitişik randevu (11:00 biten, 11:00 başlayan) | Kabul edildi — `'[)'` doğru |
| Ters aralık (bitiş < başlangıç) | `23514 randevu_bitis_baslangictan_sonra` |
| İptal edilenin saatine yeni randevu | Kabul edildi — `WHERE` koşulu doğru |

Yani constraint, motor ve query layer'ı production'da da aynı kuralı uyguluyor.

### workerd doğrulaması — 30 Ağustos 2026

Faz F'nin en büyük **doğrulanmamış** varsayımı kapandı: müsaitlik motorunun
tamamı `Intl.DateTimeFormat` + IANA saat dilimi verisine dayanıyor ve workerd'in
ICU build'inin tam olduğu **varsayılmıştı, ölçülmemişti**. (Aynı şüpheyle
`ayar-girdi.ts`'te saat dilimi listesi kapalı tutulmuştu.)

`npm run cf:onizle` ile gerçek workerd'de test edildi — deploy gerekmedi:

| Senaryo | Beklenen | workerd |
|---|---|---|
| `Europe/Istanbul`, salı, 45 dk hizmet | 28 slot, öğle arası kesik, son 17:15 | **birebir aynı** |
| Berlin kış (+1), pazar 09:00 local | `08:00Z` | ✓ |
| Berlin **ileri geçiş günü** (2027-03-28) | `07:00Z` | ✓ |
| Berlin yaz (+2) | `07:00Z` | ✓ |
| Berlin **geri geçiş günü** (2027-10-31) | `08:00Z` | ✓ |

Yani workerd'de **tam IANA yaz saati kuralları var**; motor Node'daki testlerle
aynı sonucu üretiyor. Zaman layer'ını yeniden yazma riski yok.

Aynı run'da doğrulanan diğerleri:
- `/saglik`: Hyperdrive → Supavisor → Postgres 17, gidiş-dönüş **17 ms**
- Session'sız `/panel` → 307 `/giris?devam=/panel`
- Origin'siz POST → 403 (INVARIANT 2 production runtime'da da tutuyor)
- Gerçek Supabase'e giriş → 200, cookie'ler yazıldı, panel doğru veriyle geldi
- Bundle **1621 KiB gzip** (3 MiB sınırının 1451 KiB altında)

**Sonuç:** deploy'un önünde teknik bir bilinmeyen kalmadı.

### İlk deploy — 30 Ağustos 2026

**Canlı: https://randevu.enesmemduhoglu.tech**

Faz B'den beri bekleyen deploy yapıldı. Version ID `58a1e2ab`, Worker açılış
süresi **25 ms**, bundle **1621 KiB gzip**.

#### workers.dev kapatıldı, tek adres custom domain

`wrangler deploy` ilk denemede hesap ayarına takıldı: bu hesapta workers.dev
subdomain kayıtlı değildi ve wrangler'ın otomatik denediği `randevu` adı
küresel olarak alınmış. İki yol vardı; **custom domain** seçildi.

`wrangler.jsonc`'ye `"workers_dev": false` ve `custom_domain: true` ile
`randevu.enesmemduhoglu.tech` yazıldı. Cloudflare DNS kaydını ve sertifikayı
kendisi yönetiyor. **Root domain'e dokunulmadı** — orada başka bir proje ve
Email Routing'in MX kayıtları duruyor (`docs/plan.md`).

Tek adres olması ayrıca bilinçli: iki adresten servis edilen bir uygulama
`checkOrigin` listesini ve paylaşılan link'leri ikiye böler.

#### Windows tuzağı tekrar çıktı

İlk `cf:yayinla` `.open-next` üzerinde **EPERM** ile düştü. `CLAUDE.md`'de
yazan tuzak: `wrangler dev` çalışırken dizin kilitli kalıyor. Bu sefer kilidi
tutan şey `cf:onizle`'nin process ağacıydı — port dinleyen process'i öldürmek
yetmedi, `taskkill /T` ile ağacın tamamını kapatmak gerekti (wrangler ölen
workerd'yi yeniden başlatıyor).

#### Production'da doğrulananlar

| | |
|---|---|
| DNS + TLS | geçerli sertifika, kök sayfa 200 |
| `/saglik` | Hyperdrive → Supavisor → Postgres 17, gidiş-dönüş **228 ms** |
| Session'sız `/panel` | 307 → `/giris?devam=/panel` |
| Origin'siz POST | **403** — INVARIANT 2 production'da da tutuyor |
| Kayıt → panel | 200, panel doğru veriyle geldi |
| Para ayrıştırma | `400,25` → `40025` kuruş |
| Müsaitlik (session'sız) | 26 slot, öğle arası kesik (11:00 → 13:00), son 17:00 |
| `Cache-Control` | `no-store` |

Smoke test verisi production'dan **silindi** (`isletme` silinince tenant'a bağlı
her şey cascade ile gidiyor). Production veritabanı yine boş.

#### Deploy sonrası kalanlar

- [x] Supabase `site_url` → `https://randevu.enesmemduhoglu.tech` yapıldı.
- [x] `uri_allow_list` → `http://localhost:3000/**`. Faz I'de şifre sıfırlama
      gelince local geliştirmenin de çalışması için; production adresi zaten
      `site_url` üzerinden izinli.
- [x] PR #6 merge edildi; production ve `main` hizalandı.
- [x] Smoke test auth kullanıcıları silindi. Supabase'de yalnızca
      `demo@ornek.com` duruyor — local tarayıcı testleri için, satırları
      `randevu_dev`'de.
- [ ] `/api/musaitlik` üzerinde rate limit yok. **Faz G2'ye taşındı** ve orada
      Cloudflare WAF kuralı olarak duruyor — kod tarafında değil, bilerek
      (gerekçe: Faz G2 → "Bilerek kapsam dışı").

---

## Session sonu durumu — 30 Ağustos 2026

**Canlı:** https://randevu.enesmemduhoglu.tech · **Tek branch:** `main` ·
**270 test** (21 dosya) · bundle **1621 KiB gzip**

| Faz | Durum |
|---|---|
| A — iskele | kapandı |
| B — Cloudflare zemini | kapandı (deploy dahil) |
| C — tasarım dili | kapandı |
| D — kimlik ve tenant | kapandı |
| E — schema ve panel CRUD | kapandı |
| F — müsaitlik motoru | kapandı |
| **G — public randevu sayfası** | **sıradaki** |
| H, I, J, K | bekliyor |

### Ne çalışıyor, ne çalışmıyor

**Çalışıyor:** işletme kaydı, giriş/çıkış, panel (hizmetler, personel, çalışma
saatleri, ayarlar), müsaitlik motoru ve `GET /api/musaitlik`.

**Çalışmıyor:** müşteri hiçbir şekilde randevu ALAMIYOR — `/r/[slug]` yok
(Faz G). İşletme sahibi randevu göremiyor (Faz H). Bildirim ve şifre sıfırlama
yok (Faz I).

### Yakın zamanda kaybedilmesi kolay iki ayrıntı

- **`wrangler.jsonc` production config'ini taşıyor** (`workers_dev: false` +
  custom domain). Bu dosya bir kez `main`'e girmeden merge edilip branch
  silindiği için neredeyse kayboluyordu; commit'ler local'den cherry-pick ile
  kurtarıldı. Deploy'dan önce bu iki alanın yerinde olduğunu doğrula.
- **`.open-next` Windows'ta kilitleniyor.** `cf:onizle`'nin process ağacını
  `taskkill /T` ile kapatmak gerekiyor; yalnızca portu dinleyen süreci
  öldürmek yetmiyor, wrangler ölen workerd'yi yeniden başlatıyor.

### Faz G'ye başlarken

- Motor ve query layer'ı hazır. `POST /api/randevu` yazmadan hemen önce
  `slotUygunMu()` çağırmalı: müşterinin gördüğü liste ile kabul edilen randevu
  ayrışmamalı.
- Route session'sız olacak: `getHalkaAcikDb(slug)`, `checkOrigin` şart
  (INVARIANT 2), çakışma ihlali `pgHata.cakismaIhlaliMi` ile yakalanıp
  **409**'a çevrilecek (INVARIANT 8).
- `musteri` telefon üzerinden tekilleniyor; normalizasyon
  `ayar-girdi.ts > telefonDogrula`'da.
- `randevu.iptalToken` schema'da var ve benzersiz. **Tahmin edilemez olmalı ve
  id'den türetilmemeli.**
- Rate limit ve Turnstile bu fazda; `/api/musaitlik` şu an korumasız.
- Çalışma saatleri ekranındaki `<input type="time">` işletim sistemi local'ine
  göre AM/PM gösterebiliyor (marka kuralı 24 saat). Karar verilmedi:
  native alan mı, 15 dakikalık açılır liste mi.

---

## Faz G — public randevu sayfası

**Branch:** `faz-g/halka-acik-randevu` · **3 commit** (veri layer'ı → route'lar →
arayüz) · **321 test** (23 dosya), bunun **49'u** bu fazın route testleri.

Müşteri artık randevu **alabiliyor**. Session sonu notundaki "müşteri hiçbir
şekilde randevu ALAMIYOR" satırı kapandı.

### Ne geldi

| Parça | Ne yapıyor |
|---|---|
| `src/lib/iptal-token.ts` | 160 bitlik iptal secret'ı, id'den türetilmiyor |
| `src/lib/randevu-girdi.ts` | body doğrulaması, id'ler Postgres'e gitmeden eleniyor |
| `musaitlik-sorgu.ts > slotSec()` | istenen anı aynı motorla yeniden test eder |
| `scoped-db.ts` | `randevuOlustur`, `randevuTokenIleGetir`, `randevuIptalEt` |
| `POST /api/randevu` | session'sız yazma |
| `POST /api/randevu/iptal` | conditional UPDATE ile iptal |
| `/r/[slug]` | hizmet → personel → gün/saat → bilgiler → onay |
| `/r/[slug]/randevu/[token]` | müşterinin iptal sayfası |

### Kararlar

**Müşteri telefonla tekilleniyor, ama mevcut kaydın adı GÜNCELLENMİYOR.** Bu
yol session'sız: numarayı bilen herkes buraya yazabiliyor. Güncelleseydik bir
yabancı, işletmenin müşteri kaydındaki adı değiştirebilirdi. İşletme farklı
bir ad görmek isterse panelden kendi düzeltir.

**Müşteri + randevu tek transaction.** Müşteri yazılıp randevu yazılamazsa
geriye sahibi olmayan bir müşteri kaydı kalırdı; işletme onu panelde "hiç
gelmemiş biri" gibi görürdü.

**Personel ve bitiş motordan geliyor, client'tan değil.** Bitişi route'ta
yeniden hesaplamak, yaz saati geçişinde motorunkinden farklı bir değer
üretebilirdi ve çakışma constraint'i o farkı görmezdi.

**`simdi` bir kez okunuyor.** Müsaitlik penceresi ile açık randevu sayımı
aynı ana bakmalı. İki ayrı `new Date()` bugün bir şey bozmuyor ama iki farklı
"şu an" taşıyan bir akış, ileride sınırdaki bir durumu açıklanamaz hale
getirir.

**Kapalı, olmayan ve pasif olan aynı cevabı alıyor.** Hangi slug'ların kayıtlı
olduğunu sızdırmanın faydası yok. IDOR'un görüntüsü de bu olmalı: var olmayan
id ile başkasının id'si çağırana aynı görünsün.

**Aynı numarayla en çok 3 açık randevu (429).** Bot koruması **değil** —
takvimi elli randevuyla doldurup hiçbirine gelmeyen kullanımı engelliyor. 3,
çünkü küçük işletmede meşru müşteri en fazla birkaç randevuyu aynı anda açık
tutuyor (kesim + boya + eşinin randevusu gibi); dördüncüsü artık olağan değil.
Sayım transaction içinde ama SERIALIZABLE değil: aynı anda gelen iki request
sınırı bir aşabilir. Kabul edildi — bunun bedeli fazladan bir randevu,
kilitlemenin bedeli ise her yazımda müşteri satırını kilitlemek.

### 40P01 — yarışan iki POST testinin ortaya çıkardığı gerçek hata

İki request **çakışan** aralıkları aynı anda yazınca Postgres 23P01
üretemiyor: her işlem önce kendi satırını yazıyor, sonra `EXCLUDE` constraint'ini
doğrularken diğerinin işlemini bekliyor. İkisi birbirini bekleyince Postgres
birini kurban seçip **40P01 (deadlock_detected)** fırlatıyor — yani "çakıştı"
değil "sırayı çözemedim" diyor.

Yakalanmadığı sürece yarışı kaybeden müşteri **500 görüyordu**. Şimdi en çok
3 kez yeniden deneniyor. Neden doğrudan 409 değil: kurban işlem hiçbir şey
yazmadan geri alınıyor, yani ikinci deneme kesin bir cevap alıyor — saat
gerçekten doluysa 23P01 ile "dolu", değilse randevu yazılıyor. Doğrudan 409
demek, yazılabilecek bir randevuyu reddetmek olurdu.

INVARIANT 8'in "uygulama layer'ı garanti değildir" cümlesinin pratikteki
karşılığı bu: motor slotu uygun gördü, constraint reddetti, müşteri doğru mesajı
gördü.

### Bilerek kapsam dışı

- **Turnstile ve rate limit — Faz G2.** `/api/randevu` ve `/api/musaitlik`
  şu an bot korumasız. Açık randevu sınırı bunun yerini **tutmuyor**:
  numarayı değiştiren bir bot sınırı görmeden geçer. Ayrı faz, çünkü
  Cloudflare panelinden site key + secret alınmasını gerektiriyor ve o iş
  koddan bağımsız.
- **Panelde randevuyu görmek — Faz H.** İşletme şu an gelen randevuyu
  yalnızca veritabanında görebiliyor. Faz G'nin end-to-end elle
  doğrulamasının "panelde göründüğünü gör" adımı bu yüzden Faz H'ye kaldı.
- **Bildirim yok — Faz I.** Randevu alındığında müşteriye e-posta gitmiyor;
  iptal linki yalnızca 201 body'sinde dönüyor. Müşteri o sayfayı kapatırsa
  linki kaybediyor.
- **`npm run build` bu session'da koşturulmadı.** Tip kontrolü, lint ve 321
  testin tamamı yeşil; prod build merge öncesi koşturulmalı.

### Elle yapılması gerekenler (Faz G)

- [ ] `npm run build` ve ardından `npm run cf:onizle` ile workerd'de
      `/r/<slug>` akışını gör.
- [ ] End-to-end elle doğrulama: kaydol → hizmet + çalışma saati tanımla →
      gizli sekmede `/r/<slug>` → randevu al → iptal linkiyle iptal et.
      **Aynısı mobil genişlikte** — hedef kitle telefondan giriyor.
- [ ] `design-review` skill'i (plan.md: Faz G ve H sonrası koşturulur).
- [ ] Çalışma saatleri ekranındaki `<input type="time">` AM/PM sorunu hâlâ
      karara bağlanmadı — native alan mı, 15 dakikalık açılır liste mi.

---

## Faz G2 — bot koruması

**Branch:** `faz-g2/bot-korumasi` (Faz G'den dallandı, `main`'den değil) ·
**2 commit** · **341 test** (24 dosya), bunun **20'si** bu fazın.

Faz G'nin kodu bu işi kendi yorumlarında "G2'de gelecek" diye işaretlemişti;
o satırlar artık gerçek.

### Neden ayrı bir layer gerekliydi

Faz G'deki "aynı numarayla en çok 3 açık randevu" sınırı bot korumasının
yerini **tutmuyor**. Sınır numaraya bağlı; numarayı her request'te değiştiren
bir script onu hiç görmeden geçiyor ve takvimi doldurabiliyor. Sınır kötü
kullanan **müşteriyi** durduruyor, Turnstile **script'i**.

Turnstile seçildi çünkü hesapta zaten var, ücretsiz ve çoğu ziyaretçiye
hiçbir şey göstermiyor. Randevu alan kitle telefondan geliyor; resim
seçtiren bir gate, engellediğinden fazla meşru müşteri kaybettirirdi.

### Kararlar

**`TURNSTILE_MODU` varsayılanı `sahte`, ve yalnızca tam olarak "gercek"
yazılmışsa gerçek.** Tanımsızken gerçeğe düşmek, yeni geliştiricinin ilk
gününde her randevuyu 403'e çevirirdi. "acik"/"true"/"1" de gerçek
sayılmıyor: yazım hatası olan bir env sessizce bütün randevuları kapatmasın.
`BILDIRIM_MODU` ile aynı pattern.

**Gerçek modda secret yoksa gate KAPALI.** Yanlış yapılandırılmış bir production
deployment'ının korumasız çalışmasından iyidir: sessizce açık kalan bir gate'i
kimse fark etmez, kapalı gate ilk request'te görünür.

**Network hatasında da kapalı.** Alternatifi, Cloudflare'e ulaşılamadığı her anda
gate'in kendiliğinden açılmasıydı — saldırganın tetikleyebileceği bir durumu,
korumanın kapanma koşulu yapmak olurdu.

**Üç sebep (eksik / geçersiz / ulaşılamadı) kullanıcıya aynı metni
gösteriyor.** "Server Cloudflare'e ulaşamadı" demek meşru müşteriye yardım
etmiyor, botun ise hangi branch'te olduğunu öğretiyor. Yapılabilecek tek şey her
durumda aynı: yenile, tekrar dene.

**Gate slug çözümünden ÖNCE.** Geçemeyen request veritabanına tek query bile
açtırmıyor — bir script'in saniyede yüzlerce request atması Postgres'e değil
Cloudflare'e maliyet yazıyor. Testi de bu: olmayan slug + token'sız request 404
değil **403** alıyor.

**IP `CF-Connecting-IP`'den okunuyor, `X-Forwarded-For` bilerek
okunmuyor** — ikincisini client serbestçe yazıyor ve token'ı IP'ye bağlama
güvencesini sahte bir değerle yok ederdi.

**Widget örtük (implicit) render.** Token'ı forma `cf-turnstile-response`
adıyla kendisi yazıyor. Açık render daha fazla denetim verirdi ama script'in
yüklenmesini beklemek, iki kez çalışmamasını sağlamak ve React yeniden
çiziminde widget'i temizlemek bize düşerdi — üç ayrı hata kaynağı,
ihtiyacımız olmayan bir esneklik karşılığında.

**Hatadan sonra widget sıfırlanıyor.** Token tek kullanımlık: 403 ya da 409
sonrası müşteri "tekrar dene" dediğinde aynı harcanmış token'ı gönderirdi ve
ikinci deneme, sebebi görünmeden her zaman başarısız olurdu.

**İki taraf aynı koşulda açılıp kapanıyor.** Key tanımsızsa widget hiç
çizilmiyor ve server `sahte` moda düşüyor — local'de randevu almak için
Cloudflare hesabı gerekmiyor.

### Bilerek kapsam dışı

- **Rate limit koda girmedi, Cloudflare kuralı olarak kalıyor.** `plan.md`
  zaten böyle tarif ediyordu. Worker'ın `ratelimit` binding'iyle kod
  tarafında yapmak mümkün ama `wrangler.jsonc` production config'ini
  taşıyor ve bu session'da `cf:onizle` ile **ölçülemedi**; ölçülmemiş bir
  runtime varsayımını o dosyaya sokmak bu repo'da daha önce üç kez yanlış
  çıktı. Elle yapılacaklar listesinde.
- **Panel ve kimlik yollarında Turnstile yok.** `/api/giris` ve `/api/kayit`
  de public, ama session açma denemesinin kendi geri bildirimi var ve
  kayıt e-posta doğrulamasına bağlanacak (Faz I). Ayrı bir karar olarak
  kalsın.
- **`npm run build` ve `cf:onizle` bu session'da koşturulmadı.**

### Elle yapılması gerekenler (Faz G2)

- [ ] Cloudflare paneli → Turnstile → yeni site (`randevu.enesmemduhoglu.tech`).
      Widget türü **Managed**. Çıkan iki değer:
      - site key → `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. **Build time'da**
        gömülüyor, yani `npm run cf:kur` adımında environment'ta olmalı.
      - secret → `npx wrangler secret put TURNSTILE_SECRET`. `.env`'e
        yazılmıyor.
- [ ] Production'da `TURNSTILE_MODU=gercek`. Bu satır girilene kadar kod canlıda
      olsa bile gate **açık** — koda bakıp "koruma var" demek yetmiyor.
- [ ] Cloudflare paneli → Security → WAF → **Rate limiting rules**. Ücretsiz
      planda tek kural hakkı var; `/api/randevu` ve `/api/musaitlik`
      yollarını tek ifadede eşleştir, counter karakteristiği **IP**. Süre ve
      eşik seçenekleri plana göre değişiyor, panelde görünen listeden en kısa
      pencere seçilsin.
- [ ] `cf:onizle` ile workerd'de gerçek modu ölç: secret `wrangler secret`
      üzerinden geldiği için `process.env`'de **görünmüyor**, binding
      branch'inin gerçekten çalıştığı ölçülmeden varsayılmasın.

      **Ölçerken `.env` değil `.dev.vars`.** workerd'de kod
      `getCloudflareContext().env`'i okuyor ve wrangler orayı `.dev.vars`'tan
      dolduruyor; `.env`'e yazılan `TURNSTILE_SECRET` `cf:onizle`'de
      görünmez ve gate "secret yok" branch'ine düşüp her randevuyu 403 yapar —
      yani koda değil yanlış dosyaya bakmış olursun. `.env`'deki satır
      yalnızca `next dev` içindir.

---

## Faz H — panel takvimi

**Branch:** `faz-h/panel-takvimi` · **406 test** (28 dosya), bunun **65'i** bu
fazın. `npm run tip`, `npm run lint`, `npm test` ve **`npm run build`** yeşil.

Faz G'den beri açık duran engel kapandı: işletme sahibi gelen randevuyu artık
panelde görüyor ve durumunu değiştirebiliyor.

### Faz ikiye bölündü

`plan.md` Faz H'yi beş iş olarak tarif ediyordu: gün/hafta/ay görünümü, randevu
detayı, durum değiştirme, **elle randevu ekleme**, **müşteri listesi ve
geçmişi**. Son ikisi ayrıldı — **Faz H2**. Sebep kapsam değil incelenebilirlik:
elle randevu ekleme müsaitlik motorunu panel tarafına bağlamayı gerektiriyor
(aşağıda) ve o kendi başına bir mimari karar; aynı PR'a koymak takvimin
diff'ini okunamaz yapardı.

### Kararlar

**Geçiş kuralı tek dosyada: `src/lib/randevu-durum.ts`.** Arayüz hangi
düğmeleri göstereceğini `GECISLER`'den, veritabanı conditional UPDATE'in
`where`'ini `kaynakDurumlar()`'dan alıyor ve ikincisi birincisinden
**türetiliyor**. İki liste elle yazılsaydı birine eklenen geçiş diğerinde
unutulabilirdi ve hata "düğme görünüyor ama basınca hep 409 dönüyor" şeklinde,
sebebi hiçbir yerde yazılı olmadan ortaya çıkardı.

**Kaynak durum kümesi `scoped-db`'ye parametre olarak GEÇMİYOR.**
`randevuDurumunuDegistir(id, hedef)` kümeyi kendisi üretiyor. Parametre olsaydı
bir route "IPTAL → ONAYLI"yı kendi başına mümkün kılabilirdi ve kural iki yerde
yaşardı.

**Üç durum terminal: IPTAL, TAMAMLANDI, GELMEDI.** Bu bir ürün tercihi değil,
constraint. İptali geri açmak slotu yeniden doldurmak demek ve o slot bu arada
başkasına verilmiş olabilir — `EXCLUDE` constraint'i 23P01 ile reddeder. Doğru
davranış önce müsaitlik motoruna sormak, gerekirse yeni saat önermek; yani
"elle randevu ekleme" işi. Faz H2'ye bırakıldı, şimdilik geri alma yolu "yeni
randevu aç".

**BEKLIYOR'dan doğrudan TAMAMLANDI/GELMEDI'ye geçilebiliyor.** Otomatik onay
kapalıyken işletme onaylamayı unutuyor ama müşteri yine geliyor. Önce
"onayla" demeye zorlamak, olmuş bir randevuyu olmamış gibi kaydettirirdi.

**Aralık semantiği KESİŞME, "içinde olma" değil.** `randevulariListele`
`baslangic < ust AND bitis > alt` kullanıyor. Gece yarısını aşan bir randevu
"içinde olma" ile hiçbir günde görünmezdi — ne bittiği günde (orada
başlamıyor) ne başladığı günde (orada bitmiyor). `musaitlik-sorgu.ts` zaten
aynı kabulü yapıyordu; ikisinin ayrışması, takvimde görünmeyen bir randevunun
slotu doldurması demekti. Sınırlar `[)`: tam `ust`'te başlayan ve tam `alt`'ta
biten kayıt dışarıda, `EXCLUDE` constraint'inin `'[)'` aralığıyla aynı kabul.

**Liste TÜM durumları döndürüyor, IPTAL dahil.** İşletme iptali görmek istiyor
("müşteri gelmedi mi, iptal mi etti"); hangisinin gösterileceği arayüzün
filtresi, verinin işi değil.

**Yol adı `/api/randevular` (çoğul), `/api/randevu` değil.** Public ve
session'sız olan yollar tekil kalıyor. Ayrımı adreste tutmak, bir gün bu iki
sınıfın yanlışlıkla aynı gate'i paylaşmasını zorlaştırıyor — panel yolunu
`/api/randevu/[id]/durum` yazsaydık session'sız bir yolun altına session'lı bir yol
aşılamış olurduk.

**409 açıklaması randevunun MEVCUT durumunu söylüyor, istenen hedefi değil.**
Kullanıcının aradığı cevap "neden olmadı" ve cevap her zaman "kayıt artık başka
bir durumda" — çoğunlukla başka bir sekmede ya da müşteri iptal linkini
kullandığı için. 409'dan sonra çekmece bilerek **açık** kalıyor ve
`router.refresh()` çağrılıyor: mesaj okunsun, düğmeler gerçek duruma göre
yeniden çizilsin.

**Takvim durumu URL'de, component'te değil.** `?gorunum=&tarih=&personel=`.
`useState` daha az kod olurdu; URL üç somut şey kazandırıyor: adres
paylaşılabiliyor, yer imine konabiliyor ve tarayıcının geri tuşu çalışıyor (ay
görünümünden bir güne inip geri dönmek refleks). Veri zaten server'dan geldiği
için ayrıca fetch de yazılmıyor. Gezinme `<Link>` ile — orta tıkla yeni sekme
ve adres kopyalama `onClick`+`push` ile kaybolurdu; `router.push` yalnızca
personel açılır listesinde, çünkü onun verecek bir `href`'i yok.

**Hafta görünümü İKİ AYRI DÜZEN.** Masaüstünde yedi sütun, telefonda güne göre
gruplanmış dikey liste. Tek responsive ızgara denenmedi: 360 pikselde sütun
başına ~48 piksel düşüyor, içine ne müşteri adı ne 44 piksellik dokunma hedefi
sığıyor ve kalan tek çıkış yatay kaydırma oluyordu. Hedef kitle telefondan
giriyor; onların düzeni ikinci sınıf olmamalı.

**Ay penceresi tam haftalara yuvarlanıyor.** Ayın ilk günü çarşambaysa satırın
ilk üç hücresi önceki ayın günleriyle doluyor. Boş bırakmak, işletmenin o
haftanın pazartesi randevusunu görmeden hafta planı yapmasına yol açardı.
Ay görünümünde hücre randevu SAYISI değil ilk randevuların kendisini
gösteriyor: "3 randevu" günün dolu mu boş mu olduğunu söylüyor ama 09:00'ın mı
18:00'in mi dolu olduğunu söylemiyor — plan yapan kişinin sorduğu soru bu.

**Hafta pazartesiden başlıyor.** Kodda daha önce alınmış bir karar yoktu;
`bicim.ts > HAFTA_SIRASI` arayüzü zaten öyle diziyordu, `takvim-araligi.ts` onu
takvime taşıdı. Veritabanındaki `haftaninGunu` 0 = Pazar olarak kalıyor.

**Gün/ay adları `ortak.tsx`'ten `bicim.ts`'e taşındı.** `ortak.tsx` "use
client"; panel takviminin **server** component'i aynı ay adını yazmak için oradan
import edemiyordu. İki kopya tutmak, bir gün birinde "Agustos" diğerinde
"Ağustos" yazması demekti. `ortak.tsx` isimleri yeniden dışa açıyor, çağrı
yerleri değişmedi.

**Hizmet rengi eşlemesi `hizmet-girdi.ts`'e, etiket listesinin yanına
taşındı.** Kopyası hizmet listesindeydi; takvim üçüncü kopyayı isteyince tek
kaynağa indi. Liste ile eşleme birlikte değişmek zorunda — yeni renk eklenip
eşleme unutulursa hizmet sessizce renksiz görünür.

**Detaydaki ücret hizmetin BUGÜNKÜ fiyatı.** `randevu` tablosu tutar
taşımıyor, yani geçmiş randevularda fiyat değişimi geriye dönük görünüyor.
Kabul edildi: panel bunu tahsilat kaydı olarak değil "bu randevu ne kadarlık"
bilgisi olarak gösteriyor ve gerçek tahsilat planda hiç yok.

**Schema migration'ı YOK.** Faz E'nin schema'sı takvimi olduğu gibi taşıyor;
`randevu_isletme_baslangic_idx` zaten "bu işletmenin şu tarih aralığındaki
randevuları" için konmuştu.

### Bilerek kapsam dışı

- **Elle randevu ekleme ve müşteri listesi — Faz H2.** Ekleme, `musaitlik.ts`'i
  panel tarafına bağlamayı gerektiriyor ve `musaitlik-sorgu.ts` şu an
  `getHalkaAcikDb`'ye kilitli: `getScopedDb`'de `kapaliAraliklariListele`,
  `doluRandevulariListele` ve `hizmetiVerenPersoneller` **yok**. İki yol var —
  query layer'ını yapısal bir arayüze gevşetmek, ya da eksik üç metodu
  `getScopedDb`'ye eklemek. Karar Faz H2'nin ilk işi.
- **Kapalı aralıklar (izin/tatil) takvimde görünmüyor.** `kapali` tablosu
  duruyor ama takvim yalnızca randevu çiziyor; işletme izin günlerini panelde
  göremiyor. Ayrı iş, çünkü kendi CRUD ekranı da yok.
- **Randevunun saatini/personelini panelden değiştirme yok.** `EXCLUDE`
  constraint'ine çarpacağı için müsaitlik kontrolü gerektiriyor — elle eklemeyle aynı
  aile, aynı faz.
- **Route'un happy path / 401 / IDOR testleri route dosyasında değil.** Repo'daki
  kalıp: vitest'in node environment'ında `cookies()` context'i yok, o yüzden route
  testleri yalnızca CSRF dilimini sınıyor; iş mantığı `scoped-db-randevu.test.ts`'te
  (17 test, IDOR ve conditional UPDATE dahil).
- **`cf:onizle` bu session'da koşturulmadı.** `npm run build` koştu ve temiz,
  ama workerd tarafı yine ölçülmedi.

### Elle yapılması gerekenler (Faz H)

- [ ] End-to-end: kaydol → hizmet + çalışma saati → gizli sekmede `/r/<slug>` →
      randevu al → **panelde `/panel/takvim`'de göründüğünü gör** → onayla →
      iptal linkiyle iptal et → panelde iptal göründüğünü gör.
      **Aynısı mobil genişlikte.**
- [ ] Yarışan iki sekme: aynı randevuyu iki sekmede aç, birinde onayla,
      diğerinde onayla — ikincisi 409 ve Türkçe açıklama almalı, çekmece açık
      kalmalı.
- [ ] `npm run cf:onizle` ile takvimi workerd'de gör (Intl/ICU riski: ay adları
      elle yazılı ama `yerelParcalar` `Intl`e dayanıyor).
- [ ] `design-review` skill'i (plan.md: Faz G ve H sonrası koşturulur).
- [ ] `/panel` giriş ekranındaki "Randevu sayfanız" kartı hâlâ "Sayfa hazır
      olduğunda" diyor ve adresi düz metin gösteriyor — Faz G'den kalma bayat
      metin, sayfa artık **var**. Ayrı düzeltme.

---

## Session sonu durumu — 31 Ağustos 2026

**Canlı:** https://randevu.enesmemduhoglu.tech (G öncesi version) ·
**Tek branch:** `main` · **341 test** (24 dosya)

Bu session'da Faz G ve G2 kapandı: PR #7 ve #8 merge edildi, branch'leri silindi.

| Faz | Durum |
|---|---|
| A — iskele | kapandı |
| B — Cloudflare zemini | kapandı |
| C — tasarım dili | kapandı |
| D — kimlik ve tenant | kapandı |
| E — schema ve panel CRUD | kapandı |
| F — müsaitlik motoru | kapandı |
| G — public randevu sayfası | **kapandı** (PR #7) |
| G2 — bot koruması | **kapandı** (PR #8) |
| **H — panel takvimi** | **sıradaki** |
| I, J, K | bekliyor |

### Ne çalışıyor, ne çalışmıyor

**Çalışıyor:** işletme kaydı, giriş/çıkış, panel (hizmetler, personel,
çalışma saatleri, ayarlar), müsaitlik motoru, `GET /api/musaitlik`, ve
**müşterinin randevu alması** — `/r/[slug]` akışı, `POST /api/randevu`,
iptal linki.

**Çalışmıyor:** işletme sahibi randevuyu panelde göremiyor (Faz H). Bildirim
ve şifre sıfırlama yok (Faz I).

**Canlıda değil:** `main` G ve G2'yi taşıyor ama prod'a deploy edilmedi.
Canlıdaki version hâlâ Faz G öncesi — yani `/r/<slug>` production'da 404.

### Bu session'da ölçülmeyenler

Dürüstçe: `npm run build` ve `cf:onizle` **hiç koşmadı**. Tip kontrolü, lint
ve 341 testin tamamı yeşil, ama workerd tarafı ölçülmedi. Turnstile'ın
Cloudflare binding branch'i de bu yüzden ölçülmemiş durumda.

### En kolay kaybedilecek üç ayrıntı

- **Turnstile kodu canlıda olsa bile `TURNSTILE_MODU=gercek` girilene kadar
  gate AÇIK.** Koda bakıp "koruma var" demek yetmiyor.
- **`cf:onizle`'de secret `.dev.vars`'tan okunuyor, `.env`'den değil.** Yanlış
  dosyaya yazılan secret sessizce "secret yok" branch'ine düşürür.
- **`NEXT_PUBLIC_` prefix'li her variable build time'da gömülüyor.** Site
  key'i `cf:kur` adımında environment'ta olmalı; sonradan tanımlamak işe
  yaramaz.

### Faz H'ye başlarken

Veri layer'ı büyük ölçüde hazır: `scoped-db.ts` randevu yazma ve iptal
metotlarını taşıyor, `randevuTokenIleGetir` join'leri (hizmet, personel,
müşteri) panelin de ihtiyaç duyacağı şekli gösteriyor.

Durum değiştirme **conditional UPDATE** olacak (INVARIANT 3) — iptalde kullanılan
pattern birebir geçerli. Elle randevu ekleme aynı `EXCLUDE` constraint'ine çarpacak,
yani 40P01 yeniden deneme mantığı orada da gerekli; `randevuOlustur`
paylaşılabilir.

---

## Altyapı — CI/CD

**Kapandı:** GitHub Actions ile doğrulama (`tip` → `lint` → `test` → `cf:kur`),
main'e merge sonrası approval gate'li Cloudflare deploy'u ve elle tetiklenen prod migration
workflow. Kullanım ve gereken secret'lar: `docs/yayin.md`.

**Harfsiz branch (`altyapi/ci-cd`).** Plandaki I, J, K harfleri bildirim
altyapısı, müşteri hesabı ve SMS'e ayrılmış durumda; sıradaki fazın harfini
çalmak plan ile günlüğü kalıcı olarak ayırırdı. `duzeltme/...` dallarında
kullanılan kalıp izlendi.

### Kararlar

- **Doğrulama ve deploy aynı dosyada (`ci.yml`), migration ayrı (`goc.yml`).**
  Doğrulama ile deploy ayrı dosyalara bölünseydi ikisi de `on: push` ile aynı
  anda başlardı ve deploy, testlerin yeşil olduğunu bilemezdi — `needs:` dosya
  sınırını geçmiyor. Migration ise farklı bir trigger'a sahip, orada böyle bir
  bağ yok.

- **Deploy approval gate'li, otomatik değil.** `uretim` GitHub Environment'ında
  zorunlu inceleyici var: iş queue'ya girer ve "Approve" bekler. Gerekçe
  günlükte zaten yazılıydı — main uzun süre G ve G2'yi taşıyıp bilerek
  deploy edilmemişti. Ayrıca `NEXT_PUBLIC_*` değerleri build'e gömülü olduğu
  için geri alma yeniden build demek, yani ucuz değil.

- **Prod migration'ı hatta değil, ayrı ve elle.** Drizzle migration'larının otomatik
  geri alma yolu yok. Kodu geri almak eski version'ı yeniden deploy etmek, schema'yı
  geri almak elle SQL yazmak demek — aynı boruya konmamaları bu yüzden. İki
  gate var: onay kutusuna `uygula` yazmak (run kaydında niyet izi bırakır) ve
  `uretim` environment onayı (trigger'ı çekenin yetkisini doğrular).

- **CI `npm run build` değil `npm run cf:kur` koşuyor.** `cf:kur` önce
  `next build` çalıştırıyor, yani onun kapsadığı her şeyi kapsıyor; üstüne
  OpenNext'in worker bundle'ını da üretiyor. Günlükte üst üste üç session
  "workerd tarafı ölçülmedi" notu düşülmüştü — paketleme hatası artık deploy
  anında değil PR'da çıkıyor.

- **Postgres servisi 5455 portuna eşlendi.** GitHub'ın varsayılanı 5432'ydi;
  local container'la aynı portu kullanmak, connection string'in
  `.env.example`'daki satırın birebir aynısı olmasını sağlıyor. İki environment
  arasında gidip gelirken "burada port kaçtı" sorusu hiç doğmuyor.

- **CI'da `DATABASE_URL` bilerek tanımsız.** `vitest.setup.ts` onu zaten
  `TEST_DATABASE_URL`'e eşitliyor. `randevu_test` veritabanını da
  `vitest.global-setup.ts` kendisi CREATE ediyor, yani `db:hazirla` adımına
  gerek kalmadı.

- **Node 24'e sabitlendi.** Tercih değil zorunluluk: `scripts/*.ts` ve
  `vitest.global-setup.ts` `.ts` dosyalarını doğrudan çalıştırıyor (node'un tip
  soyma desteği).

- **`tip` komutu artık `next typegen && tsc --noEmit`.** Pipeline'ın ilk run'ında
  çıkan gerçek bir bulgu: `tsc` tek başına `RouteContext`'i bulamıyor, çünkü o
  tip Next'in ürettiği `.next/types/**` altında duruyor ve `.gitignore`'da.
  Local'de yıllardır geçiyordu, çünkü `.next` eski build'lerden artakalıyordu —
  yani **temiz bir klonda `npm run tip` bugüne kadar kırıktı** ve bunu kimse
  görmemişti. Düzeltme CI adımına değil komutun kendisine konuldu; CI'a özel
  bir `typegen` adımı, local footgun'u yerinde bırakırdı. Maliyet ~2.7 saniye.

- **CI'ın build adımı sahte `NEXT_PUBLIC_SUPABASE_*` değerleriyle koşuyor.**
  Pipeline'ın ikinci bulgusu: `/giris` build anında prerender ediliyor ve
  `supabaseSunucu()` çağırıyor, variable'lar yoksa `ayarlar()` fırlatıp build'i
  düşürüyor. Yani "build env variable istemez" varsayımı yanlıştı — bu da
  ölçümle çıktı, muhakemeyle değil. Sahte değer güvenli, çünkü hiçbir network
  çağrısı yapılmıyor: session cookie'si olmadan `getClaims()` token bulamayıp
  hemen dönüyor ve `cookies()` çağrısı sayfayı zaten dinamiğe düşürüyor.
  **Bedeli:** bu adım "değerler doğru mu" sorusunu yanıtlamıyor, yalnızca
  "kod build ediliyor ve bundle'lanıyor mu" sorusunu yanıtlıyor.

- **`NEXT_PUBLIC_*` değerleri secret değil repository variable.** Tanımı gereği
  halka açıklar — tarayıcıya gitmek üzere üretildiler ve tenant izolasyonu
  onlara değil `scoped-db` layer'ına dayanıyor. Secret olarak saklamak yanlış
  bir güvenlik hissi verirdi. Deploy job'ının ilk adımı varlıklarını kontrol edip
  eksikse duruyor: eksik bir `NEXT_PUBLIC_*` build'i **düşürmüyor**,
  `undefined` gömülüyor ve hata canlıda giriş ekranında çıkıyor.

### Bilerek kapsam dışı

- **Branch koruması (branch protection) kurulmadı.** `dogrula` job'ını main'e merge
  için zorunlu kılmak repo ayarı, kod değişikliği değil; PR'ın diff'ine
  girmediği için ayrı ve görünür bir adım olarak bırakıldı.

- **End-to-end / tarayıcı testi yok.** Pipeline yalnızca repo'daki mevcut doğrulama
  setini koşuyor. Playwright eklemek kendi başına bir iş ve `cf:onizle`
  üzerinde koşan bir smoke testi ancak deploy adresi kararlıyken anlamlı.

- **Deploy sonrası smoke test (canlı adrese request) yok.** `/saglik` sayfası bu
  iş için hazır duruyor ama deploy'un DNS'e yayılma süresi belirsiz; sabit bir
  bekleme koymak yanlış negatif üretirdi.

- **Otomatik geri alma yok.** Yanlış giden bir deploy'da yol: önceki commit'i
  main'e al ve deploy'u yeniden onayla. Cloudflare panelindeki "Rollback" da
  çalışır ama o, repo'nun taşıdığı version'la canlıdaki version'ı ayırır.

- **`wrangler.jsonc`'ye `vars` bloğu eklenmedi.** `TURNSTILE_MODU` ve
  `BILDIRIM_MODU` production'da hâlâ tanımsız — yani Turnstile gate'i açık. Bu
  pipeline'ın değil, ayrı bir kararın konusu.

### Elle yapılması gerekenler (CI/CD)

- [x] `uretim` GitHub Environment'ı kuruldu: required reviewer + deployment
      branch policy `main`. İkincisi asıl olarak `goc`'u koruyor —
      `workflow_dispatch` herhangi bir branch'ten tetiklenebiliyor.
- [x] Secret'lar: `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_DB_URL` girildi
      (değerler `.env`'den ve `wrangler whoami`'den alındı).
- [x] Variable'lar: `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` girildi.
- [ ] **`CLOUDFLARE_API_TOKEN` eksik — deploy'u bloke eden tek şey.** Local'de
      yok: `wrangler` OAuth ile giriş yapmış ve o token kısa ömürlü, CI'da
      kullanılamaz. Cloudflare panelinden *Edit Cloudflare Workers* şablonuyla
      üretilip `gh secret set CLOUDFLARE_API_TOKEN` ile girilmeli. Şablonun
      Hyperdrive iznini kapsamaması olası; deploy yetki hatası verirse
      **Hyperdrive: Edit** eklenir.
- [ ] `NEXT_PUBLIC_TURNSTILE_SITE_KEY` girilmedi, çünkü **widget hiç
      oluşturulmamış** (Faz G2'nin açık maddesi, bkz. yukarısı). Deploy'u
      durdurmuyor: `yayinla`nın kontrol adımı bu variable'ı aramıyor ve
      `TURNSTILE_MODU` production'da zaten tanımsız, yani gate bugünkü davranışıyla
      açık kalıyor.
- [ ] İlk deploy'dan sonra canlıda `/saglik` ve `/r/<slug>` sayfalarını gözle
      doğrula — production'daki version hâlâ Faz G öncesi, yani `/r/<slug>` şu an 404.

---

## Faz L — kalkan

Dizin (marketplace) açılmadan önce public yolların savunması. Sıra bilinçli:
dizin her işletmeyi keşfedilebilir yapıp saldırı yüzeyini bir anda büyütüyor.

### Doğurduğu bulgu: Turnstile production'da sessizce kapalıydı

`turnstile.ts` yalnızca `"gercek"` yazan değeri gerçek sayıyor, başka her değer
— ve tanımsızlık — gate'i açıyor. `wrangler.jsonc`'de `vars` bloğu **hiç
yoktu**, yani production'da `TURNSTILE_MODU` tanımsızdı ve bot gate'i Faz G2'den
beri koşulsuz geçiriyordu.

Kod doğruydu. Eksik olan bir satır değil, bir satırın **yokluğuydu** — ve
yokluk kod incelemesinde görünmüyor. `docs/yayin.md` durumu zaten yazmıştı;
eksik olan bilgi değil, kapatan bir değişiklikti.

### Yapılanlar

- `wrangler.jsonc > vars > TURNSTILE_MODU: "gercek"`.
- `wrangler.jsonc > ratelimits`: `RANDEVU_SINIRI` (5/dk, yazma) ve
  `MUSAITLIK_SINIRI` (60/dk, okuma). Panel WAF kuralı **değil** — bu dosya
  PR'da inceleniyor ve `wrangler dev` ile local'de de koşuyor.
- `src/lib/hiz-siniri.ts` — sınırlayıcının tek çıkış noktası.
- `degismezler.test.ts`: **config de test ediliyor.** İki binding'in ve
  `TURNSTILE_MODU="gercek"` satırının varlığı test run'ında aranıyor; ayrıca
  wrangler'daki binding adıyla koddaki union üyesinin ayrışmadığı doğrulanıyor.
- `ci.yml`'e "turnstile iki yakası tutarlı mı" adımı (aşağıda).

### Ölçüm — `cf:onizle`, workerd

Varsayılmadı, ölçüldü (bkz. "ölçmeden runtime varsayımı yapma"):

| Ölçüm | Sonuç |
|---|---|
| `env.TURNSTILE_MODU` | `"gercek"` olarak bağlandı |
| `env.RANDEVU_SINIRI` / `MUSAITLIK_SINIRI` | ikisi de bağlandı |
| Token'sız `POST /api/randevu` | **403** (önce gate'ten geçiyordu) |
| Yabancı Origin | 403 (CSRF bozulmadı) |
| `CF-Connecting-IP` ile 8 POST | 1–5 → 403, 6–8 → **429** |
| Başlıksız 8 POST *(ilk version)* | hepsi 403 — **sınır hiç ateşlemedi** |

Son satır bir tasarım hatasını açığa çıkardı: `istekIpsi()` local workerd'de
`null` dönüyordu ve kod "key yoksa geçir" diyordu. Production'da Cloudflare o
başlığı hep koyuyor, yani kod "çalışıyordu" — ama bu tam olarak Turnstile'ı
aylarca sessizce açık bırakan şeklin ta kendisiydi, yalnızca başka bir
variable'da. Düzeltildi: binding varken key'siz request'ler **tek kovaya**
düşüyor, geçmiyor. Yeniden ölçüldü, başlıksız request'ler de 6'dan sonra 429.

### Bilerek kapsam dışı

- **"Gelmedi" kısıtı (L3)**: schema migration'ı gerektiriyor, ayrı risk sınıfı —
  `/goc` ile ayrı faz.
- **SMS OTP (L2)**: `src/lib/sms.ts` henüz yok (Faz K'nin dosyası); adaptörü
  öne çekmek bu PR'ı iki konuya bölerdi.
- **Uygulama içi IP counter'ı**: kenarda duran bir kural Postgres'e hiç query
  açtırmıyor, uygulama counter'ı ise her request'te bir yazma demekti.

### ELLE YAPILMASI GEREKEN — bu PR merge edilmeden önce

Turnstile'ın iki yakası **birlikte açılıp birlikte kapanacak** şekilde
tasarlanmış: `turnstile-alani.tsx:38` site key'i yoksa widget'ı hiç
çizmiyor. Bugüne kadar ikisi de kapalıydı ve simetri sessizce doğruydu. Modu
açmak o simetriyi bozuyor — server token istiyor, client üretemiyor.

1. Cloudflare → Turnstile → widget oluştur (`randevu.enesmemduhoglu.tech`).
2. Site key'ini `NEXT_PUBLIC_TURNSTILE_SITE_KEY` repository **variable**
   olarak gir (build time'da gömülüyor, runtime'da geç kalır).
3. `wrangler secret put TURNSTILE_SECRET`.

Bu üçü yapılmadan deploy pipeline **düşer**: `yayinla` job'ına eklenen "turnstile iki
yakası tutarlı mı" adımı, `TURNSTILE_MODU=gercek` iken site key'i boşsa
build'i reddediyor. Bilerek: sessizce açık bir gate'i kimse fark etmiyor,
düşen bir deploy ilk denemede görülüyor.

**Durum (aynı session'da tamamlandı):** widget oluşturuldu, `TURNSTILE_SECRET`
`wrangler secret put` ile Worker'a girildi (`wrangler secret list` ile
doğrulandı), site key'i `gh variable set` ile repository variable oldu.
Compile edilmiş client bundle'ında site key'i görüldü — yani widget artık çiziliyor.

### Deploy sonrası ölçüm: rate limit local'dekinden çok daha gevşek

Deploy sonrası canlıda ölçüldü (5/dk sınırı, `POST /api/randevu`):

| Environment | İlk 429 |
|---|---|
| Local workerd | 6. request |
| **Production** | **22. request**, sonrası kesintili (429, 403, 429) |

Kod doğru, binding bağlı (deploy logunda `env.RANDEVU_SINIRI (5 requests/60s)`).
Fark Cloudflare'in belgelendirdiği davranış: counter her isolate'in local
cache'inde ve kolo başına — *"permissive, eventually consistent... not an
accurate accounting system"*.

**Kabul edildi:** bu gate kısa patlamayı durdurmuyor, sürekli seli yavaşlatıyor.
Korkulan tehdit (takvimi dolduran script) dakikalarca request atmak zorunda, yani
kapsanıyor. Kesin kota gerekirse KV/Durable Object gerekir, bedeli her request'te
bir yazma.

**Ders:** local `cf:onizle` ölçümü bu binding için production'ı temsil etmiyor.
"Local'de 6. request'te tetikledi" demek, production hakkında yanlış güven veriyordu.

### Tuzak: `vars` eklemek tip kontrolünü kırdı, ama yalnızca CI'da

PR #13 local'de dört gate'ten de geçtikten sonra CI'da `tip` adımında düştü.
Sebep: `cloudflare-env.d.ts` **üretilen** bir dosya ve `.gitignore`'da.
Local'de en son `npm install` sırasında üretilmişti, yani `vars` bloğu eklenmeden
önceki haliyle duruyordu. CI ise `npm ci` → `postinstall` → `wrangler types`
zinciriyle onu yeniden üretti ve yeni tipler geldi.

`wrangler types` varsayılan olarak `vars` değerlerini **literal** tipe
çeviriyordu (`TURNSTILE_MODU: "gercek"`) ve `ProcessEnv`'e zorunlu alan olarak
yazıyordu. İki sonuç: testlerdeki `process.env.TURNSTILE_MODU = "sahte"` artık
tip hatası, `delete process.env.TURNSTILE_MODU` de öyle (TS2790).

Çözüm iki parça:

- `--strict-vars=false` (`cf:tip` ve `postinstall`) → `vars` değerleri `string`
  olarak üretiliyor. Literal tip burada **yanlış bir söz**: `vars` bir build
  sabiti değil, runtime config'i ve `.dev.vars` ile `process.env`
  onu meşru şekilde eziyor.
- `src/lib/test-ortam.ts > ortamiSil()` → `delete` için gereken cast tek bir
  yerde. Tip aslında doğruydu (production'da o variable hep var); testin taklit
  ettiği şey production değil, variable'ın hiç tanımlı olmadığı yerel/vitest environment'ı.

**Ders:** üretilen ve gitignore'da olan bir dosya, local'i CI'dan sessizce
ayırabiliyor. `wrangler.jsonc` değiştiren bir işten sonra `npm run cf:tip`
koşturmadan "tip temiz" demek yanlış güven veriyor.

### Yan bulgu: local `cf:yayinla` secret'ı bundle'a gömüyor

Ölçüldü: `.env` varken `next build` onu `.open-next/server-functions/default/.env`
içine kopyalıyor, yani `TURNSTILE_SECRET` Worker bundle'ının **içinde** deploy edilir.
Client bundle'ına (`assets/`) girmiyor — public leak değil — ama script'i
okuyabilen görüyor ve `wrangler secret` ile döndürmek etkisiz kalıyor.

CI temiz checkout'ta koştuğu için `yayinla` job'ı bu sorunu yaşamıyor; risk
yalnızca `docs/yayin.md`'de belgelenen **acil local deploy** yolunda. Oraya uyarı
düşüldü. Kalıcı çözüm (`.env`'i build'den dışlamak ya da secret'ı yalnızca binding'den
okumak) ayrı ve küçük bir iş — bu fazın konusu değil, bilerek ertelendi.
## Faz L3 — "gelmedi" kısıtı

**428 test** (29 dosya), bunun **17'si** bu işin. `npm run tip`, `npm run lint`,
`npm test` ve `npm run cf:tip` yeşil. Migration: `drizzle/0003_gelmedi-kisiti.sql`
(iki `ADD COLUMN`, ikisi de eklemeli).

> Branch önce **Faz L'den önceki** main'den çıkmıştı: worktree açılırken local
> `origin/main` referansı bayattı. O haliyle merge edilseydi Faz L'nin tamamını
> (`hiz-siniri.ts`, `wrangler.jsonc`'deki `vars` ve `ratelimits`, CI gate'i)
> geri alırdı — diff bunu "silme" olarak gösteriyordu. `origin/main` üzerine
> rebase edildi; L3'ün kendi değişiklikleri zaten tamamen eklemeliydi, yalnızca
> bu dosya çakıştı. Yukarıdaki sayılar rebase SONRASI ölçüm.

Randevusuna gelmeyen müşteri bir süre o işletmeden randevu alamıyor. Kaporası
olmayan işletmenin — yani hedef kitlenin çoğunun — boş saate karşı tek
korunması bu.

### Kararlar

**Kısıt `musteri` satırında, sayılan bir değer değil.** "Gelmedi randevularını
say, üçü geçtiyse engelle" biçiminde türetilebilirdi; türetmedik çünkü işletme
affetmek istediği müşteriyi affedemezdi — geçmişi silmesi gerekirdi. Tek bir
`randevuKisitiBitis` alanı hem okuması ucuz hem de panelden elle sıfırlanmaya
açık (o ekran henüz yok, aşağıda).

**Tenant'a özel olması ücretsiz geldi.** `musteri` zaten tenant başına ayrı bir
satır (`musteri_isletme_telefon_idx`), yani aynı telefon numarası iki salonda
iki ayrı kayıt. Bir salonda gelmemek diğerinden randevu almayı engellemiyor ve
bunu iki ayrı IDOR testi arıyor: biri yazma yolunda (başka işletmenin
randevusunu GELMEDI yapmak müşterisini kısıtlamıyor), biri okuma yolunda (A'daki
kısıt B'nin sayfasında görünmüyor).

**Kısıtı yazan UPDATE, durumu değiştiren conditional UPDATE ile AYNI
transaction'da.** Kısıt randevunun gerçekten GELMEDI'ye geçmesinin sonucu; iki
ayrı request'te yapılsaydı yarışı kaybeden ikinci sekme de cezayı bir kez daha
uzatırdı. Testi var: zaten GELMEDI olan randevuda ikinci çağrı 0 satır etkiliyor
ve kısıt milisaniyesine kadar aynı kalıyor.

**Süre `now()` ile veritabanı saatinden hesaplanıyor**, uygulamadan gelen bir
`Date` ile değil. Worker ile Postgres arasındaki saat kayması cezayı uzatıp
kısaltamıyor. `GREATEST(coalesce(mevcut, now()), now() + gün)`: var olan bir
kısıt KISALTILMIYOR — işletme ayarı 100 günden 30'a indirdiğinde ikinci bir
"gelmedi" cezayı azaltmış olurdu.

**Süre parametre değil, closure variable'ı.** `randevuDurumunuDegistir` ayarı
kendisi okuyor, `randevuOlustur` da `sahip.gelmediKisitiGun`'ü kapanıştan
alıyor — `otomatikOnay` gibi çağıran taraftan GELMİYOR. Gerekçe: route bir gün
ayarı geçmeyi unutsa koruma sessizce kalkardı ve hiçbir test bunu göstermezdi,
çünkü ayar alanı panelde dolu görünmeye devam ederdi.

**`gelmediKisitiGun = 0` kayıtlı bitiş tarihini de yok sayıyor.** Ayarı kapatan
işletme mevcut kısıtların da kalkmasını bekliyor. Alanları temizlemek yerine
okumada yok saymak, ayarı tekrar açınca geçmişin geri gelmesi demek — "yanlışlıkla
kapattım" durumunda doğru davranış bu. 0 iken GELMEDI işaretlemek yine de
çalışıyor: 0 "kaydı tutma" değil, "müşteriyi gate'e koyma".

**429 mesajı kısıtın SEBEBİNİ söylemiyor.** `POST /api/randevu` session'sız: bir
telefon numarası yazıp cevaba bakan herkes o kişinin bu işletmeye gelmediğini
öğrenirdi. Kısıtın VARLIĞINI gizlemek mümkün değil — meşru müşteriye ne zaman
tekrar deneyeceğini söylemek zorundayız — ama sebebini gizlemenin maliyeti yok:
mesaj tarihi veriyor ve "daha erken bir randevu için işletmeyi arayın" diyor.
Test metinde "gelmedi" kelimesinin geçmediğini de doğruluyor.

**Sınır `>`, yani bitiş anında kısıt bitmiş sayılıyor.** Eşitliği kısıtlı
saymak, "3 Mart 12:00'ye kadar" denen cezayı belirsiz biçimde uzatırdı. Tarih
işletmenin saat diliminde yazılıyor (INVARIANT 7); server'ınkine göre yazılsaydı
gece yarısına yakın bitişler bir gün kaymış görünürdü.

### Bilerek kapsam dışı

- **Kısıtı panelden görme ve kaldırma ekranı yok.** Müşteri listesi Faz H2'nin
  işi ve kısıt orada anlamlı bir sütun; ayrı bir "kısıtlı müşteriler" ekranı
  açmak, iki fazın aynı listeyi iki kez çizmesi olurdu. Bugünkü kaldırma yolu
  ayarı geçici olarak 0 yapmak — kaba ama var.
- **İşletmenin kendi eklediği randevuya kısıt uygulanmıyor.** Elle randevu
  ekleme zaten yok (Faz H2); geldiğinde kararı orada verilmeli — telefonla arayıp
  yer isteyen müşteriyi işletme kendi affediyor olabilir.
- **Müşteriye kısıt bildirimi gönderilmiyor.** Bildirim altyapısı Faz I'de;
  şimdilik müşteri kısıtı ancak randevu almaya çalışınca görüyor.
- **Kısıt süresi tek bir sayı; tekrar edene daha uzun ceza yok.** Kademeli ceza
  ("ikinci kez gelmediyse iki katı") kaç kez gelmediğini saymayı gerektiriyor —
  yani yukarıda bilerek reddedilen türetilmiş modeli. Değerse ayrı bir karar.
- **Prod'a migration UYGULANMADI.** Migration yalnızca ekleme (`isletme.gelmedi_kisiti_gun`
  DEFAULT 30, `musteri.randevu_kisiti_bitis` nullable); geri alma iki
  `drop column`. `docs/yayin.md`'deki elle workflow'la uygulanacak.

### Doğrulama

- `npm run db:goc` + `npm run db:uygula` — local `randevu_dev`'e uygulandı
- `npm run cf:tip`, `npm run tip`, `npm run lint` temiz
- `npm test` — **423 test geçti** (28 dosya), üst üste üç run'da
- Yeni testler: `scoped-db-randevu.test.ts` +11 (kısıtın yazılması ve
  okunması, iki IDOR, `GREATEST`, ayar 0, tam sınır), `randevu.test.ts` +3
  (end-to-end 429 + mesajın tarih taşıması + sebebin sızmaması),
  `ayar-girdi.test.ts` +2

### Elle yapılması gerekenler (Faz L3)

- [x] **Prod migration'ı uygulandı** (2 Eylül 2026). Ama SIRA TERSTİ ve bu bir olay
      oldu: PR #16 merge edilip **deploy edildikten sonra** migration uygulandı.
      Arada production'daki kod, veritabanında olmayan iki kolonu `select`
      ediyordu — Drizzle açık kolon listesi ürettiği için `isletme` ve
      `musteri` okuyan her query `column does not exist` ile düşüyordu.
      Ayrıntı ve alınan ders: aşağıda "Sıra bozulunca" bölümünde.
- [ ] End-to-end: randevu al → panelde "Gelmedi" işaretle → aynı numarayla
      tekrar randevu almayı dene, tarihli 429 mesajını gör → ayarı 0 yapıp
      tekrar dene, geçtiğini gör.
- [ ] Ayarlar ekranındaki yeni alanı mobil genişlikte gözle doğrula.

---

## Sıra bozulunca — 2 Eylül 2026

Faz L3'ün migration'ı prod'a **deploy'dan sonra** uygulandı. `docs/yayin.md` sırayı
zaten yazıyordu (önce migration, sonra deploy); eksik olan bilgi değil, sırayı
**zorlayan** bir şeydi.

### Neden sessiz kaldı

Deploy sonrası bakılan iki şey de yeşildi:

| Kontrol | Sonuç | Neden yanıltıcı |
|---|---|---|
| `/` | 200 | Kök sayfa hiç query yapmıyor |
| `/saglik` | 200 | Yalnızca `select version()` koşuyor — schema'ya bakmıyor |
| Supabase `list_migrations` | `[]` | O tablo Supabase CLI'ın (`supabase_migrations`); Drizzle kendi günlüğünü `drizzle.__drizzle_migrations`'ta tutuyor |

Gerçek durum ancak `information_schema.columns` sorgulanınca göründü:
`isletme` 14 kolon taşıyordu ve `gelmedi_kisiti_gun` aralarında yoktu.

**Drizzle bu hatayı yumuşatmıyor, sertleştiriyor.** `select()` açık kolon
listesi üretiyor; yani eksik bir kolon "o alan `undefined` gelir" değil,
`isletme` ya da `musteri` okuyan **her query'nin** düşmesi demek —
`scoped-db.ts`'te beş çağrı noktası. Yani panelin ve randevu sayfasının
tamamı. Sessiz bozulma değil, görünmeyen bir tam durma.

### Alınan ders

`/saglik`'in 200 dönmesi bir schema kanıtı **değil**. Bir deploy'un sağlıklı
olduğunu söyleyen kontrol, uygulamanın gerçekten okuduğu bir tabloya
dokunmalı; `select version()` yalnızca "Postgres ayakta" diyor.

### Bilerek yapılmayan

- **Migration'ı Supabase MCP `apply_migration` ile uygulamak.** Uygulardı ama
  `drizzle.__drizzle_migrations`'a satır yazmazdı; bir sonraki
  `db:uygula:prod` 0003'ü yeniden koşup "column already exists" ile düşerdi.
  Doğru araç `scripts/prod-goc.ts`.
- **Migration'ı branch üzerindeyken koşmak.** `prod-goc.ts` `./drizzle` klasörünün
  TAMAMINI uyguluyor; `faz-m/dizin` üzerindeyken koşulsaydı henüz merge
  edilmemiş `0004_dizin.sql` de prod'a giderdi. Önce `origin/main`'e detach
  edildi, sonra branch'e dönüldü.
- **Deploy öncesi schema kontrolü script'i.** Prod'daki son migration hash'iyle
  `drizzle/meta/_journal.json`'ı karşılaştırıp uyuşmazlıkta deploy'u durduran
  bir adım doğru çözüm ve kullanıcıya önerildi; henüz yazılmadı.

---

## Faz M — marketplace dizini

**Kapandı:** schema ve kapalı listeler, cross-tenant okuma layer'ı, panelde dizin
profili ve yayına çıkma anahtarı, public `/dizin` sayfası.

**456 test** (31 dosya). `npm run tip`, `npm run lint`, `npm test`,
`npm run build` yeşil. `cf:kur` + `wrangler deploy --dry-run`: **1634 KiB
gzip** (3 MiB sınırının 1400 KiB altında). Migration: `drizzle/0004_dizin.sql`.

### Invariant 1 burada esniyor — ve karşılığı

Bu repo'nun merkezi invariant'ı "her query bir tenant'a kapsanır".
`getScopedDb(oturum)` ve `getHalkaAcikDb(slug)` tenant'ı bir **kapanış
variable'ında** tutuyor, yani çağıran taraf onu veremiyor. Bir dizin ise tanımı
gereği cross-tenant: amacı bütün işletmeleri listelemek.

Kapsama olmadığı için karşılığı, sızabilecek yüzeyin daraltılması
(`src/lib/dizin.ts`):

1. Yalnızca `isletme` ve `hizmet` okunuyor. `randevu`, `musteri`, `kullanici`,
   `bildirim_kuyrugu` bu dosyada **hiç geçmiyor**.
2. `hizmet` yalnızca **toplama** olarak: adet ve en düşük fiyat. Tek tek hizmet
   satırı dönmüyor — kart "4 hizmet, 300 ₺'den başlıyor" diyor, işletmenin
   fiyat listesini dizine kopyalamıyor.
3. Dönen tip (`DizinKarti`) **elle yazılmış ve kapalı**. `$inferSelect`
   kullanılmadı: schema'ya yarın eklenen bir kolon buradan sessizce sızmasın.
4. Çağıran taraf tablo ya da kolon adı **veremiyor**; il ve kategori kapalı
   listeye karşı doğrulanıyor.
5. Salt okunur. Bu dosyaya asla yazma metodu eklenmeyecek.

**Bunların hiçbiri niyet beyanı olarak bırakılmadı.** `degismezler.test.ts`
dosyanın metnini tarıyor: izinli import listesi, yasaklı tablo adlarının hiç
geçmemesi, iki görünürlük koşulunun varlığı, yazma metodu olmaması. Yorumlar
**soyularak** taranıyor — dosyanın kendi başlığı yasaklı tabloları kuralı
anlatmak için anıyor; ham metin taransaydı test kendi gerekçesinin yazılmasını
cezalandırırdı.

Gerekçe geçmişten: aynı şey Faz B'de bir kez yaşandı (Prisma'dan Drizzle'a
geçerken tenant gate'i sessizce zorlanamaz hale geldi ve iki faz incelemeye
bağlı kaldı).

### Kararlar

- **`yayinda` `aktif`ten AYRI.** `aktif=false` randevu sayfasını tümden
  kapatıyor, `yayinda=false` yalnızca dizinden gizliyor — doğrudan linki olan
  müşteri randevu almaya devam ediyor. Tek alana sıkıştırmak, "Instagram'dan
  gelenler girsin ama dizinde olmayayım" diyen işletmeyi imkânsız kılardı.
  Panel kartı bu ayrımı açıkça yazıyor; yazmasaydı işletme kendini yanlışlıkla
  randevuya kapatırdı.

- **`yayindaAyarla` ayrı bir metot, `ayarlariGuncelle`nin alanı değil.** Yayına
  çıkış ön koşullu (il, kategori, en az bir hizmet, personel, çalışma saati);
  aynı sette gelseydi bir request `{ ad: "…", yayinda: true }` gönderip kontrolü
  atlayabilirdi — alan yazılır, koşul bakılmazdı. **Kapatmak koşulsuz:**
  işletme kendini her an dizinden çekebilmeli.

- **Eksikler sayılarak dönüyor, tek bir "olmadı" ile değil.** Neyi
  tamamlaması gerektiğini söylemeyen bir ret, ayarlar ekranında tıkanmış
  kullanıcı demek. Route ham key döndürüyor (`il`, `hizmet`, …), cümleyi
  arayüz kuruyor: her eksiğin yanında gidilecek bir ekran var ve o link
  route'ta bilinmiyor.

- **Eksik profil 409, 400 değil.** Request biçimsel olarak doğru, kaydın bugünkü
  durumuyla çatışıyor. 400 deseydik client body'sini düzeltmeye çalışırdı;
  düzeltilmesi gereken body değil işletme profili.

- **il/kategori `pgEnum` ya da ayrı tablo DEĞİL**, düz `text` + kapalı TS
  listesi — `ayar-girdi.ts > SAAT_DILIMLERI` emsali. Bunlar durum makinesi
  değil referans alanı. `pgEnum` olsalardı her yeni kategori bir `ALTER TYPE
  … ADD VALUE` migration'ı (ve o değerin aynı transaction'da kullanılamaması tuzağı)
  isterdi. Ayrı tablo olsalardı her dizin query'sine bir join eklerdi.
  **Bedeli:** DB geçersiz bir değeri engellemiyor. Kabul edildi, çünkü bu
  alanlar tek bir yoldan yazılıyor (panel ayarları) ve o yol doğrulamadan
  geçiyor.

- **İlçe serbest metin ve FİLTRE DEĞİL.** ~1000 ilçenin il eşlemesini doğru
  tutmak ayrı bir veri yatırımı; ilçe yalnızca kartta görünen bir etiket ve
  yanlış yazılmış bir ilçe hiçbir query'nin sonucunu bozmuyor. Filtre olsaydı
  normalize etmek zorunlu olurdu. Ayarlar ekranı bunu kullanıcıya da söylüyor
  ("Kartınızda görünür; aramayı etkilemez") — söylenmeseydi listede bulunmak
  için doldurması gerektiğini sanırdı.

- **Geçersiz filtre değeri filtreyi DÜŞÜRÜYOR, boş sonuç üretmiyor.** Bozuk bir
  URL parametresi yüzünden boş sayfa göstermek kullanıcıya hiçbir şey
  anlatmıyor. Arayüz seçili filtreyi göstermediği için ne olduğu görünüyor.

- **Filtre seçenekleri sabit listenin tamamı değil, DİZİNDE GERÇEKTEN İŞLETMESİ
  OLAN il ve kategoriler.** 81 ilin 78'i boş bir dizinde kullanıcı tek tek
  deneyip boş sonuç görürdü. Dolu olanları göstermek listeyi hem kısaltıyor hem
  dürüst kılıyor.

- **Sıralama ada göre ve bu GEÇİCİ.** Gerçek sıralama (yakınlık, doluluk, puan)
  bir ürün kararı ve henüz verilmedi; rastgele ya da id sırası ise aynı
  query'nin iki çağrısında farklı sıra üretip sayfalamayı bozardı.

- **Sayfa üst sınırı 200.** Derin `OFFSET` Postgres'te pahalılaşıyor ve dizinde
  binlerce sayfa gezmenin meşru bir kullanımı yok; sınır kazıyıcının maliyetini
  de sabitliyor. Arayüz aynı sınırda duruyor — durmasaydı "Sonraki" sessizce
  aynı sayfayı getirirdi.

- **Filtre düz bir GET formu, client component'i değil.** Bu sayfa ürünü hiç
  tanımayan bir müşteriye açılan ilk ekran ve tek işi bir işletme bulmak;
  JavaScript'e bağlamak yavaş bağlantıda boş bir sayfa ve çalışmayan bir arama
  kutusu demek. GET formunda gönderim URL'e giriyor, sonuç paylaşılabiliyor ve
  geri tuşu çalışıyor. Sayfa numarası forma **konmuyor**: yeni bir filtreyle 7.
  sayfada kalmak boş sonuç göstermek olurdu, alan olmadığı için gönderimde
  kendiliğinden düşüyor.

- **İki ayrı boş durum.** Araması tutmayan kullanıcıyla dizinin gerçekten boş
  olduğu gün aynı cümleyi görmemeli: ilkinde yapacak bir şey var (filtreyi
  temizle), ikincisinde yok — ve olmadığını söylemek, kullanıcıyı olmayan bir
  sonucu aramaya bırakmaktan dürüst.

- **Sayım yalnızca filtreliyken gösteriliyor.** Filtresiz listede "142 işletme"
  kullanıcıya hiçbir şey söylemiyor; filtreliyken aramanın işe yarayıp
  yaramadığını söylüyor.

- **`/dizin` `force-dynamic` ama gerekçesi `/r/[slug]`inkinden FARKLI.** Orada
  cache'sizlik şart: sayfa bir yazma kararını besliyor ve bayat bir hizmet
  listesi müşteriyi hiç alınamayacak bir slota götürür. Dizin yalnızca bir
  liste; yine de dinamik, çünkü bir dakikalık bayat liste dizinden yeni çıkmış
  bir işletmeyi göstermeye devam ederdi.

### Ortaya çıkan iki gerçek hata

**1. Arama Türkçe'nin doğru küçük yazımını bulmuyordu.** Postgres'in `ilike`i
küçültmeyi veritabanı collation'ıyla yapıyor ve orada "I"nın küçülmüşü noktalı
"i". Yani "Işıl Güzellik" kaydı `işıl` aramasını buluyordu ama Türkçe'de o adın
**doğru küçük yazımı olan** `ışıl` aramasını bulmuyordu; ASCII yazan ziyaretçi
(`isil`) de hiçbir şey bulamıyordu. Beş yazımdan ikisi boş dönüyordu.

Çözüm yeni bir kolon, `unaccent` uzantısı ya da ifade indeksi **değil**: zaten
duran `slug`. Kayıt anında `slugUret` ile ASCII'ye katlanıyor
(`Işıl Güzellik` → `isil-guzellik`) ve üzerinde benzersizlik indeksi var;
aramayı aynı fonksiyondan geçirmek yetti. `ad` üzerindeki koşul kaldırılmadı,
yanına eklendi: slug noktalama ve boşlukları da tireye çeviriyor, yani `&` ya
da kesme işareti içeren adlarda ham metin eşleşmesi hâlâ daha iyi sonuç
veriyor.

`slugUret` kendi dosyasına taşındı (`src/lib/slug.ts`). `kayit.ts`'te bırakıp
oradan import etmek, cross-tenant dizine bir veritabanı modülünü bağımlılık
yapardı.

**Bu hata elle doğrulamada çıktı, testte değil** — mevcut arama testi
`"berber"` ve `"NISAN"` gibi ASCII adlar kullanıyordu ve ikisi de geçiyordu.

**2. İl listesi `localeCompare(…, "tr")` ile sıralanamıyor.** 81 il panelde
plaka sırasında gösterilemez, ama liste hem server'da (workerd) hem tarayıcıda
**aynı** sırayı üretmek zorunda ve workerd'in ICU build'i tam değil — iki
taraf farklı sıralarsa React hidrasyonda uyuşmazlık görüyor. Elle yazılmış harf
tablosu (`trKarsilastir`), `SAAT_DILIMLERI` ve `paraBicimle`nin emsalini
izliyor.

### Bilerek kapsam dışı

- **Sıralama seçeneği yok** (ada göre sabit). Gerçek sıralama sinyali
  (yakınlık, doluluk, puan) ürün kararı; puan için değerlendirme sistemi, konum
  için koordinat gerekiyor ve ikisi de bu fazda yok.
- **Harita ve konum araması yok.** İşletmenin koordinatı schema'da yok; adres
  serbest metin. Coğrafi arama ayrı bir veri yatırımı (geocoding + PostGIS).
- **Dizin sayfası `robots`/`sitemap` ile beslenmiyor.** Arama motoru
  görünürlüğü ayrı bir konu ve bugün dizinde üç işletme var; boş bir dizini
  indekslettirmenin faydası yok.
- **Rate limit konmadı.** `/dizin` bir okuma yolu ve `/api/musaitlik`in aksine
  ucuz; kazıyıcının maliyeti sayfa üst sınırıyla zaten sabitlenmiş durumda.
  Trafik geldiğinde Faz L'nin `hiz-siniri.ts`'i bu yola da bağlanabilir.
- **Kategori listesi küçük başladı** (dokuz kalem). Doldurulamayacak kadar çok
  boş kategoriyle açılan bir dizin boş görünür; talep geldikçe büyür ve migration
  gerektirmiyor.
- **İşletmenin dizindeki görünümünü preview'u yok.** Kart, kayıtlı alanlardan
  kuruluyor ve ayarlar ekranı hepsini gösteriyor; ayrı bir preview ekranı bu
  fazın kazancına değmezdi.

### Doğrulama

- `npm run tip`, `npm run lint` temiz
- `npm test` — **456 test geçti** (31 dosya, gerçek Postgres)
  - `dizin.test.ts` 16 (görünürlük gate'i, filtreler, toplama, Türkçe arama)
  - `degismezler.test.ts` +4 (dizin.ts'in şeklini zorlayan tarama)
  - `ayar-girdi.test.ts` +5 (dizin alanları ve il sıralaması)
  - `dizin.test.ts` (route) 3 — CSRF dilimi
- `npm run build` başarılı, 34 route
- `cf:kur` + `wrangler deploy --dry-run`: **1634.49 KiB gzip**
- **Elle (`next dev`, seed'lenmiş `randevu_dev`):** `/dizin` 200 ve yalnızca
  `yayinda=true` olan üç işletmeyi listeliyor (dördüncüsü yayında değil ve
  görünmüyor); `?il=İstanbul` ikiye, `?kategori=Berber` bire iniyor;
  `?il=Paris` (listede olmayan değer) filtreyi düşürüp tam listeyi veriyor;
  `?arama=%` ve `?arama=_` boş dönüyor (joker kaçışı); `?sayfa=999` boş;
  `Işıl / ışıl / işıl / isil / ISIL` yazımlarının **beşi de** aynı kaydı
  buluyor

### Elle yapılması gerekenler (Faz M)

- [x] **Prod migration'ı uygulandı — bu sefer DEPLOY'DAN ÖNCE** (2 Eylül 2026 19:22
      UTC, `npm run db:uygula:prod -- --onayla`). Doğrulandı: dört kolon
      yerinde (`yayinda` NOT NULL DEFAULT false), `isletme_dizin_idx` ve
      `isletme_yayin_alanlari_tam` mevcut, journal 5 satır, iki mevcut işletme
      korundu ve ikisi de `yayinda=false` — yani dizine kendileri girene kadar
      görünmüyorlar. Canlıdaki (henüz eski) kod etkilenmedi: `/`, `/r/berber`,
      `/r/demo-guzellik-salonu` 200.

      > **`goc` workflow bu migration için KULLANILAMADI** ve bu bir config
      > çelişkisi: `goc`, `uretim` environment'ına bağlı ve o environment'ın deployment
      > branch policy'si yalnızca `main`'e izin veriyor. Ama workflow'un kendi
      > başlığı "önce bu workflow'u koştur, sonra merge et" diyor — yani migration
      > henüz `main`'de olmayan bir dosyayı uygulamak zorunda. İki kural aynı
      > anda sağlanamıyor.
      >
      > Bu sefer `docs/yayin.md`'nin ikinci yolu (local'den `db:uygula:prod`)
      > kullanıldı; L3'ün elle listesi de ikisini eşdeğer sayıyordu. **Kalıcı
      > çözüm aynı gün verildi:** aşağıdaki "Approval gate'ler kaldırıldı"
      > bölümü.
- [ ] End-to-end: ayarlarda il + kategori doldur → "Dizine ekle" → `/dizin`'de
      kartı gör → "Dizinden çıkar" → kartın kaybolduğunu ama `/r/<slug>`in
      hâlâ çalıştığını gör.
- [ ] Eksik profille "Dizine ekle" → 409 ve eksikler listesi ekranda görünüyor
      mu, link'ler doğru ekrana gidiyor mu.
- [ ] `/dizin` ve ayarlardaki yeni bölümü **mobil genişlikte** ve **koyu
      temada** gözle doğrula. Bu session'da tarayıcı plugin'i bağlanamadığı için
      görsel doğrulama yapılmadı; kontroller HTTP üzerinden yapıldı.

### Bilinen local gürültü

`randevu_dev`'deki `agdas-berber` kaydının adı bozuk kodlanmış
(`Çağdaş Berber` yerine tek bayt hatalı bir dize) ve slug'ı `agdas-berber`.
Önceki bir session'ın elle seed'inden kalma; kod hatası değil. `cagdas` araması
bu yüzden bu kaydı bulmuyor, `agdas` buluyor.

---

## Approval gate'ler kaldırıldı — 2 Eylül 2026

**Merge eden deploy etmiş olur.** `yayinla` job'ı artık beklemiyor, `goc` job'ı de
herhangi bir branch'ten onaysız koşuyor. Kullanıcı kararı: *"pr'ı merge ettikten
sonra otomatik deploy gerçekleşsin, zaten bir sorun olduğunda önceki deploya
dönebiliriz."*

### Kaldırılan gate'in dayandığı varsayım yanlıştı

`docs/yayin.md` approval gate'i şöyle gerekçelendiriyordu: *"`NEXT_PUBLIC_*`
değerleri build'e gömülü olduğu için geri alma 'yeniden build' demek — yani
ucuz değil."*

Ölçüldü, varsayılmadı: `npx wrangler versions list` üç ayrı version'ı listeliyor
ve `wrangler rollback` bunlardan birine dönüyor. Yani **geri alma yeniden
build değil**, saklanmış bir version'a geçiş. Cümle Faz B'de yazıldığında
Cloudflare'in version geçmişi bu repo'da hiç denenmemişti.

### İki gate, iki farklı sebep

| Gate | Neden kaldırıldı |
|---|---|
| `yayinla` → `environment: uretim` | Dayandığı varsayım yanlıştı (üstte). Rollback ucuz. |
| `goc` → `environment: uretim` | **Çelişkiliydi ve uygulanamazdı** (altta). |

`goc`'un environment bağı bir hataydı: `uretim` environment'ının branch policy'si yalnızca
`main`'e izin veriyor, ama workflow'un kendi başlığı *"önce bu workflow'u
koştur, sonra merge et"* diyor — yani migration, tanımı gereği henüz `main`'de
**olmayan** bir dosyayı uygulamak zorunda. İki kural aynı anda sağlanamıyordu.

Faz M'de görüldü: `0004_dizin.sql` yalnızca branch'te duruyordu ve workflow onu
uygulayamadı. L3'te fark edilmemişti, çünkü o migration yanlışlıkla merge *sonrası*
koşulmuştu — **hatanın kendisi çelişkiyi gizlemişti**.

### Gate dosyadan kaldırıldı, environment ayarından değil

`uretim` environment'ı GitHub'da hâlâ duruyor; ona başvuran bir iş kalmadığı için
hiçbir şeyi etkilemiyor. `environment:` satırları `ci.yml` ve `goc.yml`'dan
silindi.

Gerekçe: gate görünmez bir repo ayarında değil, PR'da **incelenen** bir dosyada
dursun. Aynı gerekçeyle rate limit'ler de WAF kuralı değil `wrangler.jsonc`'de
(Faz L) — ve Faz L'nin bulgusu tam da buydu: `wrangler.jsonc`'de `vars` bloğunun
**yokluğu** kod incelemesinde görünmüyordu ve bot gate'i aylarca sessizce
açıktı. Bir ayarın varlığı ya da yokluğu, ancak baktığın dosyada duruyorsa
okunabilir.

Yan fayda: environment secret'ı hiç kullanılmıyordu (`CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_DB_URL` üçü de **repository** secret'ı), yani
bağı kaldırmak hiçbir secret'ı kırmadı. Kontrol edildi, denenmedi.

### Kaybedilen ve bilerek kabul edilen

- **Kazayla merge edilen bir PR artık doğrudan canlıya çıkıyor.** Karşılığı
  rollback'in ucuz olması. Asıl koruma zaten `dogrula` işiydi: tip, lint, 456
  test ve `cf:kur` yeşil olmadan `yayinla` hiç başlamıyor.
- **GitHub'ın Deployments sekmesindeki environment geçmişi** artık dolmuyor. Deploy
  geçmişinin gerçek kaynağı zaten Cloudflare'in version listesi.

### Değişmeyen: schema hâlâ tek yön

Rollback'in ucuzluğu **yalnızca kod için** geçerli. `scripts/prod-goc.ts` ileri
gider, geri gitmez; bir deploy'u geri almak schema'yı geri almıyor. Bu yüzden:

- `goc` hâlâ ayrı bir workflow ve hâlâ `"uygula"` yazılmasını istiyor. O gate
  kaldırılmadı: run kaydında "bunu isteyerek yaptım" izi bırakıyor.
- Geri alınması gerekebilecek bir migration yazarken **geri alma SQL'i PR
  açıklamasına elle yazılmaya devam ediyor**.
- Sıra artık "önce migration, sonra **merge**" — "sonra deploy" değil. Merge anı deploy
  anı olduğu için aradaki pencere kapandı; migration merge'den önce koşmazsa kolon
  yokken kod canlıya çıkar.

---

## Teknik borç — 3 Eylül 2026

Ürün kimliği tartışması sırasında sayıldı. Hiçbiri acil değil, hiçbiri de
kendiliğinden geçmiyor. **Faz P**'de toplu halledilecek.

Sağlık taraması aynı gün yapıldı ve şunlar **temiz** çıktı: `src/` içinde 0
TODO/FIXME/HACK, 0 `@ts-ignore`, 0 `eslint-disable`, 0 `any`. 14.337 satır
kaynağa karşı 6.535 satır test. Yani aşağıdakiler zanaat sorunu değil, biriken
kapsam.

### 1. `scoped-db.ts` 1065 satır

INVARIANT 1 gereği tenant'a bağlı her query buradan geçiyor — dosyanın büyümesi
tasarımın sonucu, hatası değil. Ama 1065 satır okunabilirlik sınırını geçti.

**Bölme ekseni tablo değil, KULLANIM olmalı.** Test dosyaları
(`scoped-db-randevu.test.ts`, `scoped-db-hizmet.test.ts`) bu ayrımı zaten
yapmış; kaynak onları takip etsin.

> **Bölerken dikkat:** `getScopedDb`'nin closure variable'ı (`isletmeId`) tek
> yerde kalmalı. Her parça kendi connection'ını kurarsa invariant zorlanamaz hale
> gelir — Faz B'de Prisma'dan Drizzle'a geçerken aynı gate bir kez sessizce
> kaybolmuştu ve iki faz boyunca yalnızca incelemeye bağlı kaldı. ESLint
> `no-restricted-imports` muaf listesi ve `degismezler.test.ts` de
> güncellenmeli.

### 2. `/panel/gelistirici/vitrin` production'da açık

264 satırlık component vitrini (Faz C'de tasarım doğrulaması için yazıldı) canlıda
erişilebilir. Leak değil — session arkasında ve tenant verisi göstermiyor —
ama production yüzeyinde geliştirici aracı durmamalı ve bundle'a giriyor.

Karar: **silme, env flag'iyle kapat.** Vitrin tasarım değişikliğinde hâlâ işe
yarıyor; local'de açık, production'da 404 olsun.

### 3. Uyarı ve hata takibi yok

> **Düzeltme (aynı gün):** bu madde ilk yazıldığında "gözlemlenebilirlik yok"
> deniyordu. Yanlış — `wrangler.jsonc`'de **`observability.enabled: true` zaten
> var**, yani Workers Logs açık ve geçmiş Cloudflare panelinden sorgulanabiliyor.
> Eksik olan log değil, **loga bakan bir şey**.

Production'da bir hata olsa kimse haberdar olmuyor: log düşüyor ama uyarı çıkmıyor ve
kimse panele bakmıyor. `/saglik` de bu boşluğu kapatmıyor — L3'te gerçek bir
schema sorununu **yakalamadığı** görüldü, çünkü yalnızca `select version()`
koşuyor.

En az gereken: yakalanmamış istisnaların bir kanala düşmesi (hata takibi ya da
Workers Analytics Engine üstüne bir uyarı), `/saglik`'in schema'yı gerçekten
kontrol etmesi.

> **INVARIANT 5 burada kritik.** Hata takibine giden yükte token, key ve
> connection string olmayacak. Üçüncü parti bir servise gönderiyorsak filter tek
> bir gate'ten geçmeli — `email.ts > gonder()` pattern'ının aynısı.

### 4. `robots.txt` ve `sitemap.xml` yok

Faz M'de bilerek ertelendi: *"bugün dizinde üç işletme var, boş bir dizini
indekslettirmenin faydası yok."* **Ürün yönü marketplace'e döndüğü için bu gerekçe
artık geçerli değil** — dizinin Google'da bulunması ürünün kendisi.

Gereken: `app/robots.ts` ve `app/sitemap.ts`, `/r/<slug>` sayfalarının sitemap'e
girmesi, ve `/dizin`'in **filtre parametrelerinin indekslenmemesi** — faceted
navigation yinelenen içerik üretiyor ve marketplace SEO'sunda en sık görülen
başarısızlık sebebi bu.

---

## Ürün kimliği — 3 Eylül 2026

**Karar: bu bir randevu sitesidir, bir randevu yazılımı değil.** Siteye giren
kişi randevu almaya gelmiştir. Ana sayfa bir arama yüzeyi olur (Booksy modeli),
işletme tanıtımı `/isletmeler-icin`'e taşınır.

### Nereden çıktı

Kök sayfa işletmeye konuşuyordu — *"Hizmetlerinizi tanımlayın, çalışma
saatlerinizi belirleyin"* — ve müşteri yolu sayfanın dibinde tek satır gri
metindi. Faz M dizini ekledi ama **ön kapıyı çevirmedi**; dizin ürüne bir
plugin olarak geldi, ürünün kendisi olarak değil.

Kullanıcının cümlesi: *"kullanıcı bu siteyi sadece birinin instasından görüpte
kullanmasın. herhangi bir işini halletmek için randevu almak istediğinde bu
siteye girsin."*

### Araştırmadan gelen üç bulgu

1. **Hepsi arzla başladı.** Booksy tek bir topluluğa (berberler) odaklanıp
   abonelikli SaaS olarak büyüdü — "bir marketplace değil ve randevu başına para
   almıyor". Fresha işletmelere **bedava yazılım** verip arzı topladı, tüketici
   marketplace'i sonra ekledi. Sektörün ortak reçetesi: önce arzı seed'le,
   tek-oyunculu modda çalışan bir ürün yap, coğrafi olarak yoğunlaş.
2. **Ama "arz-önce" ile "işletme odaklı arayüz" aynı şey değil.** Booksy bugün
   tamamen tüketici yüzlü. Yani tüketici yüzlü siteyi şimdi kurmakla, büyümeyi
   tek tek salon kaydederek yapmak çelişmiyor. İtirazım bu noktada düzeldi.
3. **Türkiye'de tüketici-önce konum boş.** Kolay Randevu, Salon Randevu (URL'i
   `/isletmeler-icin`), RandevuKur, Hızlıappy, EnRandevu, Kuaförüm Yanımda —
   hepsi "randevu programı/yazılımı" diyor. Tüketiciye konuşan tek örnek
   Online Güzellik.

Para modelinde de ortak pattern var: Fresha %20, Booksy %30 (opsiyonel Boost),
Treatwell %35 — hepsi **yalnızca marketplace'ten gelen YENİ müşterinin ilk
randevusunda**, ve **üçü de dönen müşteriden hiçbir şey almıyor**. Marketplace
keşfi paraya çeviriyor, kullanımı değil.

### Reddedilen alternatif

**Saf SaaS'ta kalmak** (benim ilk önerimdi). Gerekçesi geçerliydi: marketplace bir
özellik değil arz problemi, ve prod'da bugün **2 işletme, 0'ı yayında, 1 randevu
(bizim testimiz)** var. Boş bir marketplace ana sayfası bugünkünden kötüdür.

Reddedildi çünkü bulgu 2 ikisini uzlaştırıyor: ön kapıyı tüketiciye çevirmek,
büyüme stratejisini değiştirmeyi gerektirmiyor. Kabul edilen bedel: dizin
dolana kadar ana sayfa boş görünecek. Karşılığı, boş durumun dürüst kurulması
ve iki şehre odaklanma.

### Verilen kararlar

| Konu | Karar |
|---|---|
| Ön kapı | Booksy modeli — arama + kategori kutucukları + şehir bölümleri |
| Coğrafi kapsam | **Bursa + İstanbul** |
| Kategori | Faz M'deki **dokuz kategori** yeterli |
| Para modeli | İşletmeye şimdilik bedava; komisyon dizin müşteri getirince |
| `/r/<slug>` | **Kalır ve kritiktir** — tek-oyunculu mod, dizinin dolmasının ön koşulu |

### Sonuç: Faz I'nin gönderen kimliği netleşti

Bildirim fazı bilerek bu karardan sonraya bırakıldı, çünkü şablonun kime ait
olduğu kimliğe bağlıydı. Artık belli: **platform önde**
(`Randevu <bildirim@randevu.enesmemduhoglu.tech>`), işletme adı konunun içinde.
Saf SaaS seçilseydi tersi olurdu ve sonradan değiştirmek şablonları, `marka.ts`'i
ve gönderen adresini birlikte etkilerdi.

### `docs/plan.md` baştan yazıldı

Yalnızca ürün kimliği yüzünden değil. Plan üç ayrı yerden bayattı:

- **Teknoloji:** mimari bölümü, kod örneği, veri modeli ve riskler tablosu
  **Prisma** anlatıyordu. Faz B'de Drizzle'a geçilmişti; `package.json`'da
  Prisma yok. Connection da "Direct connection" diyordu, oysa Supavisor session
  mode kullanılıyor (direct IPv6-only ve erişilemiyor).
- **Fazlar:** K'de bitiyordu. L, L3 ve M plan dışı kalmıştı.
- **Invariant'lar:** 11 madde vardı, ama kod ve test **INVARIANT 12**'yi kullanıyordu
  (`degismezler.test.ts:119`, `slug.ts:8`). Test zorluyor, sözleşme bilmiyordu —
  `CLAUDE.md`'ye eklendi.

Yeni faz sırası: ~~**N** (ön kapı)~~ → ~~**I** (bildirim)~~ →
~~**O** (keşfedilebilirlik)~~ → **J** (müşteri hesabı) → **P** (sağlamlaştırma)
→ **K** (SMS).

---

## Faz N — ön kapı

**Kapandı:** public sayfaların ortak üst barı ve alt bilgisi, kök sayfanın
müşteriye çevrilmesi (arama + dokuz kategori kutucuğu + şehir bölümleri),
işletme içeriğinin `/isletmeler-icin`'e taşınması, `/randevularim` yer tutucusu,
metadata'nın müşteri diline geçmesi.

**459 test** (31 dosya). `npm run tip`, `npm run lint`, `npm test`,
`npm run build` yeşil. `cf:kur` + `wrangler deploy --dry-run`: **1635.64 KiB
gzip** (önceki 1634.49 — +1.15 KiB). **Migration yok.**

### Kararlar

- **`enCok` kısabiliyor ama BÜYÜTEMİYOR.** Şehir bölümü altı kart istiyor; üst
  sınır yine `SAYFA_BOYUTU`. Olmasaydı `enCok: 10000` yazan bir çağrı sayfalama
  sınırının etrafından dolaşıp tek request'te bütün dizini çekerdi. `toplam`
  kırpılmadan dönüyor: "N işletmenin tümü" link'i gösterilenden fazlası olup
  olmadığını o sayıdan biliyor; kırpılsaydı link hiç görünmez ve kalan
  işletmelere gidilemezdi.

- **`VITRIN_ILLERI` kapalı listede ve testle bağlı.** Dizin query'si geçersiz bir
  il değerini **sessizce yok sayıyor** (Faz M kararı) — yani yanlış yazılmış bir
  şehir, ana sayfada o başlık altında bütün dizini listelerdi. Test her değerin
  `ILLER`de olduğunu zorluyor.

- **İl adına ek getirilmiyor** ("Bursa — öne çıkan işletmeler"). Türkçede ek ünlü
  uyumuna göre değişiyor ("Bursa'da" ama "İzmir'de"); listeye yarın eklenen bir
  il sessizce yanlış yazılırdı. Tire eki gereksiz kılıyor.

- **Kategori kutucukları SABİT listeden, dizin filtresi ise gerçek veriden.**
  Ters gibi görünüyor ama amaçlar farklı: filtrede amaç bulunan sonucu daraltmak
  (boş il seçtirmek kullanıcıyı boş sonuca götürür), kutucuklarda kapsamı
  göstermek. Kategorileri dizin doluluğuna göre gizlemek, ana sayfanın günden
  güne şekil değiştirmesi olurdu.

- **Boş şehir bölümü çizilmiyor, boş başlık gösterilmiyor.** İki şehrin de kartı
  yoksa tek bir dürüst boş durum çıkıyor. Sahte kart gösterilmedi: tıklayınca
  hiçbir yere gitmeyen bir ürün demek olurdu. (Ürün kimliği maddesinde kabul
  edilen bedel buydu — "dizin dolana kadar ana sayfa boş görünecek".)

- **`UstBar` `/r/[slug]`e KONMADI.** O sayfa işletmenin kendi randevu sayfası ve
  ziyaretçi oraya Instagram biyografisinden geliyor; üstüne "İşletme misiniz?"
  koymak, işletmenin müşterisini işletmenin sayfasından geri çağırmak olurdu.
  Aynı gerekçeyle `/r/[slug]` başlığı `title.absolute` ile şablondan muaf.

- **Üst bardaki arama kutusu kendi arama yüzeyi olan sayfalarda KAPALI**
  (`arama={false}`: kök sayfa, `/dizin`). Aynı ekranda iki arama alanı,
  kullanıcının hangisinin ne aradığını bilmemesi demek.

- **Öneri listesi (autocomplete) yok.** Her tuşa basışta server'a soran bir kutu
  hem ana sayfayı client component'ine çevirirdi hem de bugün önerecek bir şey yok.
  Dizin dolunca değer kazanır.

- **`/randevularim` liste göstermiyor** ve bu bilinçli: liste müşteri hesabı
  istiyor (Faz J), bugün randevunun kimliğini token taşıyor — server'ın elinde
  "bu ziyaretçinin randevuları" diye bir küme yok. Link'i üst bardan
  çıkarmak yerine sayfa bugünkü cevabı veriyor; kullanıcı önce o başlığı arıyor.

- **"İşletme misiniz?" mobilde üst barda gizli, alt bilgide açık.** Dar ekranda
  üst barın işi müşteriyi randevusuna götürmek.

### Ortaya çıkan gerçek hata

**Tailwind'de `hidden` sessizce eziliyordu.** Paylaşılan link sınıfı
`inline-flex` içeriyordu ve `` `${BAGLANTI} hidden sm:inline-flex` `` yazıldığında
Tailwind aynı özelliği yazan iki utility arasında **kaynak sırasına değil
üretilen CSS sırasına** bakıyor: `hidden` uygulanmıyordu. 390px genişlikte
ölçüldü — "İşletme misiniz?" mobilde de görünüyor ve barı iki satıra çıkarıyordu.
Çözüm: display sınıfı paylaşılan dizeden çıkarıldı, her link kendi yazıyor.

**Tarayıcıdan görüldü, testte değil.** Faz M'deki Türkçe arama hatasıyla aynı
sınıf: yalnızca gözle bakılınca çıkan bir kusur.

### Bilerek kapsam dışı

- **`robots.txt` / `sitemap.xml` yok** — Faz O'nun kendisi (teknik borç 4).
- **Sıralama sinyali yok.** Şehir bölümleri de ada göre sıralı; gerçek sıralama
  (yakınlık, doluluk, puan) hâlâ verilmemiş bir ürün kararı.
- **Müşteri hesabı yok** (Faz J). `/randevularim` onun yer tutucusu.
- **Harita, konum ve "yakınımdakiler" yok.** İşletmenin koordinatı schema'da yok.
- **Ana sayfada rate limit yok.** `/dizin` ile aynı gerekçe: okuma yolu ucuz ve
  kart sayısı sabitlenmiş. Faz L'nin `hiz-siniri.ts`'i trafik geldiğinde bağlanır.
- **Alt bilgi kısa** (hakkımızda/gizlilik/iletişim yok): o sayfalar yazılmadı ve
  olmayan sayfaya link vermek kullanıcıyı 404'e götürmek olurdu.

### Doğrulama

- `npm run tip`, `npm run lint` temiz
- `npm test` — **459 test geçti** (31 dosya, gerçek Postgres); `dizin.test.ts`
  +3 (`enCok` kırpması, üst sınır, vitrin illerinin geçerliliği)
- `npm run build` başarılı, 36 route (`/isletmeler-icin` ve `/randevularim`
  statik üretiliyor — ikisi de veritabanına dokunmuyor)
- **Elle (`next dev`, seed'lenmiş `randevu_dev`, tarayıcı plugin'i):**
  `/`, `/dizin`, `/isletmeler-icin`, `/randevularim` 200; ana sayfada yalnızca
  İstanbul bölümü çiziliyor (Bursa'da yayında işletme yok — boş bölüm
  gösterilmiyor); hero'dan `isil` araması `/dizin?arama=isil`e gidip iki kaydı
  buluyor; **390px genişlik** ve **açık/koyu tema** ikisi de gözle doğrulandı.

### Elle yapılması gerekenler (Faz N)

- [ ] Production'da `/` artık dizine bakıyor ve prod'da **yayında işletme yok** —
      yani canlıda boş durum görünecek. Beklenen; demo işletmeyi dizine
      çıkarmak isteniyorsa panelden "Dizine ekle".
- [ ] Prod'da `Bursa` bölümü ancak o ilde yayında bir işletme olunca çıkar.

### Not: tasarım zinciri

`/design` çağrıldı; redirect tablosu bu iş için `ui-styling` alt-skill'ine
gidiyor ve o skill `skillOverrides`'ta **model çağrısına kapalı**. Yerleşim ve
UX kararları `ui-ux-pro-max` (product/ux alanları) ve repo'nun kendi
`docs/tasarim-sistemi.md`'siyle verildi; yeni palet ya da tipografi
üretilmedi — mevcut token'lar kullanıldı.

---

## Faz I — bildirim altyapısı

**Kapandı:** `email.ts > gonder()` adaptörü, `bildirim-sablon.ts` (altı şablon),
`bildirim.ts` (hangi olayda ne queue'ya girer, queue nasıl boşalır), queue
metotlarının `scoped-db.ts`'e eklenmesi, üç route'un bağlanması ve
`/panel/gelistirici/bildirimler` ekranı.

**489 test** (34 dosya). `npm run tip`, `npm run lint`, `npm test`,
`npm run build` yeşil. `cf:kur` + `wrangler deploy --dry-run`: **1664.74 KiB
gzip** (önceki 1635.64 — +29.1 KiB). **Migration yok** — `bildirim_kuyrugu` tablosu
Faz E'de tam da bu faz migration istemesin diye kurulmuştu.

### Kararlar

- **Resend SDK'sı EKLENMEDİ, düz `fetch` var.** Kullanılan yüzey tek bir POST
  ve bu repo sert bir bundle sınırıyla yaşıyor (3 MiB gzip). Yan etkisi:
  INVARIANT 4'ü zorlayan warden gate'i `resend.emails.send` metnini arıyor ve o
  metin artık hiç oluşmuyor — yani gate bir şey görmüyor. Gerçek zorlama
  `degismezler.test.ts`'e taşındı: `api.resend.com` yalnızca `email.ts`'te
  geçebiliyor. **Aynı hikâyenin üçüncü tekrarı** (Faz B'de Prisma→Drizzle,
  Faz E'de `panelKapisi`): gate'in göremediği kural testle geri geliyor.

- **Key yoksa gönderim SAHTEYE DÜŞMÜYOR.** `BILDIRIM_MODU=gercek` ama
  `RESEND_API_KEY` yoksa queue'ya `anahtar-yok` hatası yazılıyor. Sahteye
  düşseydi production'da hiçbir mail gitmez ve queue "gönderildi" derdi — Faz L'de
  Turnstile'ın aylarca sessizce kapalı kalmasıyla birebir aynı hata sınıfı.
  `wrangler.jsonc > vars` içindeki `"gercek"` de teste bağlandı.

- **Önce üstlen, sonra gönder.** `bildirimiUstlen` conditional UPDATE ile satırı
  `BEKLIYOR` → `GONDERILDI` yapıyor; 0 satır dönerse gönderim atlanıyor.
  Alternatif ("gönder, sonra işaretle") aynı mesajı iki kez gönderebilirdi —
  Faz K'nin cron'u request içi boşaltmayla yarışacak. **Bedeli bilinerek
  seçildi:** işaretledikten sonra Worker ölürse mesaj gönderilmeden
  "gönderildi" kalır. Müşteriye aynı onayı iki kez yollamak, kaybolan bir onay
  mailinden daha görünür ve daha güven kırıcı.

- **Gönderim response'tan SONRA (`after`).** Müşteriyi "randevunuz alındı"
  ekranına götürmeden önce Resend'in cevabını beklemek, iyi günde yüzlerce ms
  eklerdi. **Ölçüldü, varsayılmadı:** compile edilmiş worker'da (`.open-next/
  server-functions/default/handler.mjs`) OpenNext'in `provideNextAfterProvider`
  fonksiyonu `Symbol.for("@next/request-context")`e `waitUntil` bağlıyor — yani
  `after` workerd'de gerçekten response'tan sonra koşuyor.

- **Queue'ya yazma response ÖNCESİNDE, tek INSERT.** Satırın var olması garanti
  olsun ki `after` hiç koşmasa bile Faz K'nin cron'u mesajı bulabilsin.

- **Queue yazma hatası YUTULUYOR.** Randevu (ya da iptal, ya da onay) zaten
  yazıldı. Bildirim yüzünden 500 dönmek, müşteriye "olmadı" deyip takvimde
  duran bir randevu bırakmak olurdu — müşteri tekrar dener, bu kez "saat dolu"
  alır ve nedenini anlamaz.

- **Konu satırında işletme adı EK ALMIYOR:** "Randevunuz onaylandı — Çağdaş
  Berber". "Berber'deki randevunuz" istenirdi ama Türkçe'de bu ek ünlü uyumuna
  göre değişiyor ve adı kullanıcı yazıyor. Faz N'de şehir başlıkları için
  verilen kararın aynısı; tire eki gereksiz kılıyor.

- **Şablon metni GÖNDERİM ANINDA üretiliyor, queue'da saklanmıyor.**
  Hatırlatma yazılmasıyla gönderilmesi arasında ~24 saat var; metin donmuş
  olsaydı arada personeli değişen bir randevu için yanlış isim taşıyan bir
  hatırlatma giderdi. Bunun bedeli: alıcı adresi de kolon olarak tutulmuyor,
  şablon kimliğinin prefix'inden (`MUSTERI_` / `ISLETME_`) seçiliyor.

- **Adresi olmayan mesaj sessizce düşürülmüyor, `adres-yok` hatası yazılıyor.**
  Randevu formunda e-posta zorunlu değil (telefon var, SMS Faz K'de) — yani bu
  beklenen bir durum. Ama panelde "neden mail gitmedi" sorusunun görünür bir
  cevabı olmalı.

- **İptalde önce bekleyenler düşürülüyor, sonra iptal mesajları yazılıyor.**
  Sıra ters olsaydı az önce yazılan mesajlar da silinirdi. Düşürülen şey
  pratikte hatırlatma: iptal edilmiş randevu için ertesi gün "yarınki
  randevunuz" maili gitmesi, ürüne duyulan güveni tek başına bitirirdi.
  **Silme, "IPTAL" durumu değil:** enum'da öyle bir değer yok ve eklemek migration
  demekti. Silinen şey zaten hiç gönderilmemiş bir mesaj — geçmiş kaydı değil,
  geleceğe verilmiş bir söz. Gönderilmiş satırlara dokunulmuyor.

- **TAMAMLANDI ve GELMEDI'de mesaj YOK.** İkisi de randevu saatinden sonra
  işaretleniyor ve işletmenin kendi kaydı. "Gelmediniz" diyen bir mail,
  kısıtı zaten uygulanmış birine ikinci kez söylemek olurdu.

- **`bildirimleriListele` yalnızca panel gate'inde.** Queue müşteri adı ve
  randevu saati taşıyor; public gate session'sız.

- **Queue metotları iki gate'te de AYNI kod** (`bildirimKapisi` helper'ı).
  Randevuyu yazan yol session'sız, durumunu değiştiren yol session'lı, ama ikisi de
  aynı queue'ya yazıyor. İki kopya bir gün ayrışırdı — biri `tur = 'EPOSTA'`
  filtresini unutur ve Faz K'nin SMS satırları e-posta olarak gönderilmeye
  çalışılırdı.

- **`randevuIptalEt` satır sayısı yerine ID dönüyor.** Çağıran taraf iptal
  bildirimleri için randevunun kimliğine ihtiyaç duyuyor; ikinci bir query'yle
  okumak, bu arada silinmiş bir kayıtla yarışa girmek demekti.

- **Hatırlatma 24 saat önce.** Müşterinin plan değiştirebileceği kadar erken,
  unutmayacağı kadar geç. Yarından yakın randevuya hatırlatma hiç yazılmıyor:
  yazılsaydı ilk boşaltmada hemen gönderilir ve müşteri "yarınki randevunuz"
  mailini randevuyu aldığı dakikada alırdı.

### Ortaya çıkan gerçek hata — production variable'ları `next dev`'e sızıyordu

Faz I'nin bildirim ekranını local'de denerken çıktı: `/r/<slug>` üzerinden
randevu alınmaya çalışılınca **"Doğrulama tamamlanamadı. Sayfayı yenileyip
yeniden deneyin."** dönüyordu.

**Zincir:** `next.config.ts` içindeki `initOpenNextCloudflareForDev()`,
`next dev` sırasında `getCloudflareContext()`i çalışır kılıyor — amacı local'de
Hyperdrive binding'ine ulaşmak. Yan etkisi, `wrangler.jsonc > vars` içindeki
**production variable'larının da local'de okunması**. Faz L'de oraya
`TURNSTILE_MODU: "gercek"` yazıldı ve o günden beri `next dev` bot gate'ini
gerçek modda koşturuyordu. Production site key'i yalnızca
`randevu.enesmemduhoglu.tech` için kayıtlı olduğundan widget `localhost`'ta
**Turnstile 110200** (bilinmeyen domain) veriyor, token hiç üretilmiyor,
server da token'sız request'i 403'e çeviriyordu.

`.env.example` "local'de sahte" diyordu ama bu **ulaşılamaz bir vaatti**:
`cfMod ?? process.env.TURNSTILE_MODU` zincirinde cf değeri önce geliyor, yani
`.env`e ne yazılırsa yazılsın eziliyordu.

**Faz I bunu ikinci kez üretiyordu.** `BILDIRIM_MODU: "gercek"` da aynı yoldan
`next dev`e sızacaktı: local denemeler gerçek modda koşup `anahtar-yok`
hatasıyla dolacak, key girilseydi de **gerçek adreslere mail gidecekti**.
Planın "test ve local her zaman sahte" sözü tutulmuyordu.

**Çözüm — `src/lib/mod.ts`:** modu seçen kural iki dosyadan çıkarılıp tek yere
alındı ve environment'a bağlandı.

- Production'da (`NODE_ENV === "production"`) karar Cloudflare variable'ının, `.env`
  fallback. Local bir dosyanın production'ın kararını ezmesi istenmiyor — "sessizce
  sahte moda düşmüş production" bu repo'nun iki kez yaşadığı hata.
- Local'de ve testte **yalnızca** `.env`. Gelistiricinin makinesinde production
  config'inin kendiliğinden devreye girmesi, geliştirmeyi engellemekten
  başka bir şey yapmıyor.
- Gevşetme yönü tek taraflı: bu branch production'ı hiçbir koşulda gevşetemiyor, çünkü
  `NODE_ENV` production bundle'ında `next build` tarafından sabitleniyor.

`turnstile-alani.tsx` de aynı kurala bağlandı: widget artık production dışında hiç
çizilmiyor. Server gate'iyle client kutusu **aynı anda açılıp kapanmalı** —
ayrışırlarsa ya müşteri çözemeyeceği bir kutuyla karşılaşır ya da gate token
bekler ve kutu hiç çizilmez. (Dosyadaki eski yorum "key yoksa çizilmiyor,
server da aynı koşulda sahte" diyordu; iki yarısı da artık doğru değildi.)

**Neden testler görmedi:** ikisi de `process.env` üzerinden koşuyor ve vitest'te
Cloudflare context'i hiç yok — yani testlerin gördüğü dünyada bu çakışma
oluşmuyor. Faz M ve Faz N'deki hatalarla aynı sınıf: yalnızca gerçek tarayıcıda
gerçek environment'ta ortaya çıkan bir kusur. `src/lib/mod.test.ts` artık zinciri
kilitliyor (5 test).

**Tarayıcıdan end-to-end doğrulandı** (`next dev`, seed'lenmiş `randevu_dev`):
randevu alma → queue'da `MUSTERI_RANDEVU_ONAYLANDI` + `ISLETME_YENI_RANDEVU`
`GONDERILDI`, preview HTML'i dolu; iptal → `MUSTERI_RANDEVU_IPTAL` +
`ISLETME_RANDEVU_IPTAL`. Turnstile hata kutusu yok. Yarınki randevuda
hatırlatma satırı **yazılmadı** — hatırlatma zamanı geçmişte kalıyor, tasarlanan
davranış canlıda da doğrulanmış oldu.

### Bilerek kapsam dışı

- **Hatırlatmanın zamanı gelince gönderilmesi.** Queue satırı yazılıyor ama
  onu boşaltacak scheduler yok: boşaltma bugün yalnızca o randevuya dokunan
  bir request'le tetikleniyor. Faz K'nin `workers/hatirlatici/` cron'u bunu
  bağlayacak — queue'nun tamamını tarayan query cross-tenant olacağı için ayrı
  bir tasarım kararı ve `dizin.ts` gibi kendi dar yüzeyini isteyecek.
- **SMS yok** (`sms.ts` yazılmadı) — Faz K.
- **Yeniden deneme yok.** `HATA` satırı orada kalıyor; kimse tekrar denemiyor.
  Cron gelince "hatalıyı N kez tekrar dene" kararı verilebilir.
- **İşletme bildirimi AÇILIP KAPANAMIYOR.** Sahibin gelen kutusuna her randevu
  düşüyor. Ayar alanı migration demekti ve bugün kaç randevunun geldiği bilinmiyor.
- **Personele bildirim yok.** Sahip rolü seçiliyor; personelin gelen kutusuna
  işletmenin bütün randevuları düşmemeli.
- **Müşterinin göreceği bir "gönderim geçmişi" yok.** Ekran
  `/panel/gelistirici/*` altında, işletmenin günlük işine ait değil.

### Doğrulama

- `npm run tip`, `npm run lint` temiz
- `npm test` — **489 test geçti** (34 dosya, gerçek Postgres); yeni:
  `bildirim-sablon.test.ts` (9), `bildirim.test.ts` (11), `mod.test.ts` (5),
  `degismezler.test.ts` +3, route testlerine +2 (queue'ya yazıldığı ve iptalde
  hatırlatmanın düştüğü)
- `npm run build` başarılı, 37 route
- `cf:kur` + `wrangler deploy --dry-run`: 1664.74 KiB gzip; `env.BILDIRIM_MODU
  ("gercek")` binding listesinde görünüyor
- **End-to-end (tarayıcı, `next dev`):** randevu alma ve iptal akışları gerçekten
  koşturuldu; queue'nun dört satırı da `GONDERILDI` ve preview HTML'leri dolu
- **Gözle (tarayıcı plugin'i):** altı şablonun gerçek HTML'i tek sayfada
  işlendi — Türkçe karakterler, tablo yerleşimi, iptal link'inin yalnızca
  müşteri mesajlarında olması, işletme mesajlarında müşteri telefonunun
  biçimlenmiş hali (`0533 987 65 43`) doğrulandı

### Elle yapılması gerekenler (Faz I)

- [ ] **MERGE ETMEDEN ÖNCE:** `wrangler secret put RESEND_API_KEY`. Merge anı
      deploy anı; key girilmezse ilk randevudan itibaren her mesaj queue'ya
      `anahtar-yok` yazar.
- [ ] `/panel/gelistirici/bildirimler` ekranı **gözle görülmedi** — panele
      girmek için giriş yapmak gerekiyor ve şifre girmek asistanın yapabileceği
      bir şey değil. Sayfa build ediliyor, beslediği query testte ve local
      `randevu_dev`de artık altı queue satırı hazır duruyor (Işıl Güzellik
      Salonu) — panele girip ekrana bakmak yeterli.
- [ ] Production'da ilk randevudan sonra queue'nun `GONDERILDI` gösterdiği ve mailin
      gerçekten geldiği doğrulanmalı (Resend panelinden de bakılabilir).

---

## Faz O — keşfedilebilirlik

**Kapandı:** `/dizin/[il]` ve `/dizin/[il]/[kategori]` iniş sayfaları, il ve
kategori için slug eşlemesi, `app/robots.ts`, `app/sitemap.ts`, faceted
navigation gate'i (`/dizin`in filtre parametreleri için canonical/noindex),
kart listesinin paylaşılan component'e çıkarılması.

**515 test** (37 dosya). `npm run tip`, `npm run lint`, `npm test`,
`npm run build` yeşil. `cf:kur` + `wrangler deploy --dry-run`: **1693.13 KiB
gzip** (önceki 1664.74 — +28.4 KiB). **Migration yok.**

### Kararlar

- **Canonical ile noindex AYNI URL'e KONMUYOR.** Plan "ikisi birlikte konur"
  diyordu; uygulamada bu yanlış olurdu. Google, `noindex` ile başka bir adresi
  gösteren `canonical`ı çelişkili sinyal sayıyor ve `noindex`i canonical
  hedefine taşıyabiliyor — yani asıl iniş sayfasını da dizinden düşürme riski.
  Bu yüzden her URL'e **biri**:
  - Filtre gerçek bir iniş sayfasına karşılık geliyorsa (il, ya da il+kategori,
    arama yok, ilk sayfa) → `canonical` o sayfayı gösteriyor.
  - Karşılığı olmayan her şey (arama metni, ikinci ve sonraki sayfalar, ilsiz
    kategori) → `noindex, follow`. Dizine girmiyor ama link'ler izleniyor,
    yani işletme sayfaları yine bulunuyor.

- **`robots.txt` `/dizin`in query parametrelerini ENGELLEMİYOR** ve bu, ilk
  içgüdünün tersi. Taranması engellenen bir sayfanın `canonical` etiketi de
  okunamıyor; o zaman motor "bu içeriğin aslı şurada" bilgisini hiç öğrenemez
  ve biriken değer iniş sayfasına akmaz. Doğru araç sayfanın kendi metadata'sı.

- **`/r/*/randevu/` hem `robots.txt`'te kapalı hem sayfada `noindex`.** İki
  gate üst üste bilinçli: robots.txt bir *rica* (uymayan tarayıcı var), meta
  etiketi ise ancak sayfa *taranırsa* görülüyor. Tek başına ikisi de yetmez ve
  bu URL tek başına iptal yetkisi taşıyor (INVARIANT 5'in dışarı bakan yüzü).

- **Slug eşlemesi ayrı bir tablo değil, `slugUret`.** Repo'da slug üretimi zaten
  tek yerde ve Türkçe harfleri elle eşliyor. İkinci bir tablo yazmak aynı
  kuralı iki yerde tutmak olurdu. Karşılığı: `slugUret` artık bir **URL
  sözleşmesi** taşıyor — davranışı değişirse canlıdaki adresler değişir.
  `dizin-slug.test.ts` bunu sabitliyor (81 ilin ve 9 kategorinin slug'ı
  benzersiz, gidip geri geliyor, dört bilinen adres birebir sabit).

- **Tanınmayan slug 404, "boş liste" değil.** Dizin *query'sinde* geçersiz il
  parametresi yok sayılıyor (Faz M kararı) çünkü orada kullanıcının gördüğü şey
  bir liste. Burada il **adresin kendisi**: `/dizin/istanbull` diye bir sayfa
  yok ve "var ama boş" demek, arama motoruna sonsuz sayıda anlamsız URL açmak
  olurdu.

- **Kategori çoğulları ELLE yazıldı** (`KATEGORI_COGUL`, dokuz satır). "İstanbul
  kuaförleri" istiyoruz ama çoğul eki ünlü uyumuna göre değişiyor ("kuaförleri"
  ama "salonları") ve bazıları düz çoğul almıyor ("Cilt Bakımı" → "cilt bakımı
  merkezleri"). Üretmeye çalışan bir fonksiyon dokuz durumdan en az üçünü yanlış
  yazardı. **Ek il adına gelmiyor**, kategori kelimesine geliyor — yani 81 ilin
  hiçbiri için ayrı yazım gerekmiyor. Faz N'de şehir başlıklarında aynı tuzaktan
  kaçınılmıştı; buradaki fark, listenin kapalı ve dokuz satırlık olması.

- **Sitemap BOŞ iniş sayfalarını öne sürmüyor.** 81 il × 9 kategori = 729 adres;
  yalnızca gerçekten yayında işletmesi olanlar giriyor. Boş sayfaları sitemap'e
  koymak, arama motoruna "bunlar önemli" deyip içeriği olmayan sayfalara
  götürmek olurdu. Boş sayfalar erişilebilir kalıyor (il sayfasından link
  var), yalnızca öne sürülmüyorlar.

- **`lastModified` işletmenin kendi güncelleme tarihinden.** Uydurma bir "bugün"
  değeri her taramada her sayfayı değişmiş gösterir ve sinyali tümden
  değersizleştirirdi.

- **Sitemap query'si `isletmeleriAra` değil kendi metodu** (`sitemapKayitlari`).
  O sayfalama yapıyor (en çok 24 kart), sitemap ise tamamını istiyor. Ayrıca
  kart alanlarının hiçbiri gerekmiyor: sitemap'e "hakkında" metni ya da fiyat
  taşımak, sızabilecek yüzeyi bedelsiz genişletmek olurdu. INVARIANT 12 korunuyor
  — yalnızca `isletme` okunuyor, dönen tip elle yazılmış ve kapalı.

- **Ana sayfanın şehir link'i artık iniş sayfasına gidiyor**
  (`/dizin?il=İstanbul` → `/dizin/istanbul`). İkisi aynı listeyi gösteriyor ama
  ilki dizine girmiyor; ana sayfadan çıkan link'in dizine giren sayfaya
  işaret etmesi, iç link değerinin doğru yere akması demek.

- **Kart listesi `DizinListesi` component'ine çıkarıldı.** Sayfalamanın sınır
  davranışı (son sayfada "Sonraki" çizilmemesi, filtrenin link'lerde
  taşınması) üç yerde ayrı ayrı doğru tutulması gereken bir şey olurdu. Boş
  durum dışarıdan geliyor: `/dizin`de iki ayrı boş durum var, iniş sayfasında
  tek.

- **Kategori adı cümle içinde geçmiyor.** Küçük harfe çevirmek
  `toLocaleLowerCase("tr")` isterdi ve workerd'in ICU build'i tam değil; ham
  bırakmak da cümle ortasında büyük harf demekti. Kategori zaten başlıkta ve
  rozetlerde duruyor.

- **`metadataBase` eklendi.** Olmadan Next göreli `canonical` değerlerini
  localhost'a göre üretiyor — canlıda yanlış adresi gösteren bir canonical, hiç
  olmamasından kötü.

- **`siteKoku()` fallback değer taşıyor.** `robots.txt` ve `sitemap.xml` mutlak
  adres istiyor; göreli URL protokole aykırı ve motor dosyayı tümden yok
  sayıyor. Variable tanımsızken üretilecek en doğru şey production'da kullanılan
  adres.

### Ortaya çıkan gerçek hata — kurtarılamaz karakter input gate'inden geçiyordu

Dizinde bir işletme **"agdas Berber"** olarak görünüyordu; adın başındaki
Ç yerine siyah baklava içinde soru işareti (U+FFFD, REPLACEMENT CHARACTER)
duruyordu.

**Teşhis:** veritabanındaki kod noktaları tek tek okundu. `randevu_dev`'deki
dokuz işletmeden yalnızca biri bozuktu; diğerlerinin hepsinde `ş`, `ı`, `ğ`,
`ö`, `ç` doğru saklanıyordu. **Production veritabanı tamamen temiz.** Yani
uygulamanın yazma yolunda hata yok — o kayıt, kod sayfası UTF-8 olmayan bir
terminalden geçen bir script'le oluşturulmuş (bu repo'nun bilinen tuzağı; hafızada
"Türkçe metni kabuktan geçirme" olarak duruyor).

**Ama gate açıktı.** `adDogrula`, `metinDogrula` ve `ilceDogrula` U+FFFD taşıyan
bir değeri kabul ediyordu. Bu karakterin klavyede karşılığı yok ve kimse onu
bilerek yazmıyor; göründüğü her yerde anlamı tek: metin bir yerde yanlış
kodlamayla çözülmüş ve **asıl harf geri getirilemeyecek şekilde kaybolmuş**.
Kaydedildikten sonra düzeltmenin yolu da yok — hangi harf olduğunu artık kimse
bilmiyor.

Üç gate'e de kontrol eklendi (`girdi.ts > cozulememisKarakterVar`). Kullanıcıya
"geçersiz ad" değil, ne yapacağını söyleyen bir mesaj dönüyor: bozukluk çoğu
fontta tek bir küçük işaret ve kullanıcı ekranda doğru görünen bir metne bakıp
neden reddedildiğini anlamayabilir.

Kontrol **kod noktası karşılaştırmasıyla**, regex ile değil; karakter kaynak
dosyaya harf olarak da yazılmıyor, `String.fromCodePoint(0xfffd)` ile
üretiliyor. Aynı gerekçe `kontrolKarakteriVar` için de yazılıydı: kaçış dizileri
bu repo'da birkaç kez araç zincirinde gerçek karaktere dönüşüp kaynağı bozdu — ve
tam da o bozulmadan şikâyet eden bir testte bedeli daha yüksek olurdu.

Bozuk kayıt local veritabanında düzeltildi ("Çağdaş Berber", "Baba oğul
berber"). **Slug değiştirilmedi** (`agdas-berber`): slug kayıt anında üretiliyor
ve ad değişince yeniden üretilmiyor — bu bilinçli, çünkü o adres paylaşılmış
olabilir. Production'da düzeltilecek bir kayıt yok.

### Yol boyunca temizlenen

`siteKoku()` iki dosyada birden vardı: `bildirim.ts` (Faz I) tanımsız variable'da
`null` dönüyordu, `site.ts` (Faz O) production adresini fallback olarak taşıyor. Aynı
adı taşıyan iki fonksiyonun farklı davranması, hangisinin çağrıldığını okumadan
bilmenin imkânsız olması demek. `bildirim.ts` kendi kopyasını bıraktı; fallback
değer sayesinde "link hiç konulmasın" branch'i de gereksiz kaldı.

### Bilerek kapsam dışı

- **Kategori-yalnız iniş sayfası yok** (`/dizin/kategori/kuafor` gibi). Ana
  sayfadaki dokuz kutucuk hâlâ `/dizin?kategori=...`e gidiyor ve o adres
  `noindex`. Ürün kararı: marketplace **local** — "kuaför" araması ülke çapında
  bir liste istemiyor, "istanbul kuaför" istiyor. İl boyutu olmayan bir sayfanın
  kullanıcıya vaadi de zayıf. İhtiyaç görülürse eklenmesi ucuz.
- **İlçe kırılımı yok** (`/dizin/istanbul/kadikoy`). İlçe serbest metin ve
  doğrulanmıyor (Faz M kararı); adres üretmek önce il→ilçe eşlemesini veri
  olarak tutmayı gerektirir.
- **Yapılandırılmış veri (JSON-LD) yok.** `LocalBusiness` işaretlemesi sıradaki
  doğal adım ama açılış/kapanış saatleri, koordinat ve puan alanlarının
  hiçbirini bugün taşımıyoruz; yarısı boş bir işaretleme koymak yarar
  sağlamıyor.
- **Sıralama sinyali hâlâ yok** — iniş sayfaları da ada göre sıralı.
- **`generateStaticParams` yok**, sayfalar `force-dynamic`. Dizinden yeni çıkmış
  bir işletmeyi göstermeye devam eden bayat bir liste istemiyoruz; sayfa sayısı
  da 81 il ile sınırlı, yani cache'ten kazanılacak şey sınırlı.
- **Sitemap bölünmesi yok.** Üst sınır 5000 kayıt; protokol 50.000'e izin
  veriyor ama o boyuta gelindiğinde sitemap'i bölmek ayrı bir karar.

### Doğrulama

- `npm run tip`, `npm run lint` temiz
- `npm test` — **515 test geçti** (37 dosya, gerçek Postgres); yeni:
  `dizin-slug.test.ts` (8), `seo.test.ts` (12), `bozuk-karakter.test.ts` (6)
- `npm run build` başarılı, 40 route (`/robots.txt` statik, `/sitemap.xml`
  dinamik)
- `cf:kur` + `wrangler deploy --dry-run`: 1693.13 KiB gzip
- **Elle (`next dev`, seed'lenmiş `randevu_dev`, tarayıcı plugin'i):**
  `/dizin/istanbul` ve `/dizin/istanbul/kuafor` 200, `/dizin/atlantis` **404**;
  `robots.txt` ve `sitemap.xml` mutlak adreslerle üretiliyor; sitemap yalnızca
  dolu il ve il+kategori kombinasyonlarını taşıyor. Canonical/noindex
  etiketleri beş ayrı URL'de HTML'den okundu ve beklendiği gibi çıktı.
  **390px** genişlik (iframe içinde gerçek dar görünüm) ve **koyu tema** gözle
  doğrulandı; rozetler sarıyor, yatay taşma yok.

### Elle yapılması gerekenler (Faz O)

- [ ] Deploy'dan sonra Google Search Console'a `sitemap.xml` bildirilmeli; aksi
      halde iniş sayfalarının keşfi tarayıcının kendi hızına kalıyor.
- [ ] Production'da `robots.txt` ve `sitemap.xml` bir kez açılıp `Host` satırının ve
      adreslerin `randevu.enesmemduhoglu.tech` olduğu doğrulanmalı
      (`NEXT_PUBLIC_SITE_URL` build time'da gömülüyor).

## Faz J — müşteri hesabı

**Kapandı:** `/uye-ol` müşteri üyeliği, gerçek `/randevularim` listesi,
`getMusteriDb` gate'i (INVARIANT 1'in ikinci ekseni), sahipliğe bağlı iptal,
iptal link'iyle randevuyu hesaba ekleme, yarım kalan müşteri kaydının
kurtarma yolu.

**570 test** (42 dosya). `npm run tip`, `npm run lint`, `npm test`,
`npm run build` yeşil. `cf:kur` + `wrangler deploy --dry-run`: **1728.15 KiB
gzip** (önceki 1693.13 — +35 KiB). **Migration var:** `0005_musteri-hesabi.sql`.

### Kararlar

- **Sahiplik RANDEVU BAŞINA, müşteri satırı başına değil.** Schema'da Faz E'den
  kalma boş bir `musteri.kullanici_id` vardı ve planın "telefon/e-posta
  eşleşmesiyle bağlama" cümlesi oraya işaret ediyordu. O eksen seçilmedi.

  `musteri` satırı tenant başına ve **telefonla** tekilleniyor
  (`musteri_isletme_telefon_idx`); telefon ise bugün doğrulanmış bir kimlik
  değil — SMS Faz K'de. Sahiplik orada tutulsaydı şu delik açık kalırdı:
  saldırgan kurbanın numarasıyla bir randevu alır, kendi iptal token'ıyla o
  müşteri satırını sahiplenir ve **kurbanın o salondaki tüm geçmişini okur**.
  Delik ancak SMS doğrulamasıyla kapanıyordu, yani Faz K'ye kadar açık
  kalacaktı.

  Randevu başına sahiplikte kanıt randevunun **kendi** iptal token'ı: kişi
  yalnızca elinde linki olan randevuyu ekleyebiliyor. Aynı saldırgan yine
  yalnızca KENDİ randevusunu görüyor. Bedeli: misafirken alınmış eski
  randevular listeye kendiliğinden gelmiyor, elde link olması gerekiyor.
  SMS geldiğinde telefonla toplu bağlama bunun ÜSTÜNE eklenebilir.

- **`getMusteriDb` INVARIANT 12 gibi bir muafiyet DEĞİL, gate'in ikinci
  ekseni.** Müşterinin randevuları tanımı gereği multi-tenant — iki ayrı
  salondan randevu almış biri ikisini de tek listede görüyor — yani
  `isletmeId` filtresi orada doğru soruyu soramıyor. `scoped-db`ye metot
  eklemek de olmazdı: o gate'in sözleşmesi "tek tenant" ve onu delen bir
  metot, gate'in bütün çağıranlara verdiği güvenceyi zayıflatırdı.

  Filtre yine **parametre değil closure variable'ı**. Karşılığı `dizin.ts`
  disiplini: yalnızca `randevu` yazılabiliyor ve o da iki kolonda (`durum`,
  `kullanici_id`); okunan alanlar elle yazılı ve kapalı; `musteri` tablosu hiç
  import edilmiyor, yani `not` ve `telefon` sızamıyor; `iptalToken` dönmüyor.

- **Rol kontrolü YOK.** Filtre `kullaniciId` olduğu için güvenlik role bağlı
  değil: SAHIP rolündeki biri de bu gate'ten yalnızca kendi randevularını
  görüyor. Şart koymak güvenliğe hiçbir şey katmaz, buna karşılık başka bir
  salondan randevu alan işletme sahibini kendi listesinden mahrum bırakırdı —
  o kişi de bir müşteri.

- **Üyelik işletme kaydından AYRI bir fonksiyon ve ayrı bir route.**
  `isletmeKaydiOlustur` üç kaydı tek transaction'da yazıyor ve slug üretiyor;
  müşteride yazılacak tek satır var, yani transaction'ın koruyacağı bir
  bütünlük yok. Tek route'ta bir flag'le toplamak, body'sinin yarısı
  okunmayan bir branch üretirdi.

- **Session'lı randevu alırken bağlama server'da, ama `randevuOlustur`a
  `kullaniciId` parametresi EKLENMEDİ.** O yol session'sız ve input'unun tamamı
  body'den geliyor; oraya bir kullanıcı kimliği alanı koymak, client'ın
  **başkasının hesabına** randevu yazdırabileceği bir yüzey açardı — alanı her
  çağrı yerinde session'dan doldurmayı hatırlamaya bağlı, yani unutmakla bozulan
  bir kural. Bunun yerine aynı tek kural kullanılıyor: token'ı gösteren
  sahiplenir.

- **`kullanici_auth_user_id` tekil kalıyor.** Bir Supabase hesabı ya işletmeye
  ya müşteriye ait; ikisine birden değil. İşletme sahibi müşteri hesabı da
  istiyorsa ayrı bir e-posta ile üye oluyor. Alternatifi kullanıcı başına rol
  listesi tutmaktı ve bunun bedeli `auth.ts`'in tamamını yeniden yazmak.

- **Hesap sayımı (enumeration) kapalı tutuldu.** "Bu adres müşteri olarak
  kayıtlı" ile "işletme olarak kayıtlı" ayrımı yapılmıyor; iki durum da aynı
  metni alıyor.

### Ortaya çıkan gerçek hata — ikinci kayıt yolu `/kayit/tamamla`yı sessizce yanlış hale getirdi

`/kayit/tamamla` Faz D'den beri var ve yaptığı şey bir **işletme** açmak. Faz
J ikinci bir kayıt yolu ekleyince o ekran kendiliğinden yanlış oldu.

Zincir şu: `/api/uye-ol` önce Supabase'de hesap açıyor, sonra `kullanici`
satırını yazıyor. İki ayrı sistem, aralarında transaction yok — veritabanı o
an erişilemezse hesap açılmış, satır yazılmamış oluyor. Böyle biri giriş
yaptığında `/api/giris` onu `/kayit/tamamla`ya gönderiyor ve karşısına
**"İşletme adı"** kutusu çıkıyordu. Doldurursa MUSTERI değil **SAHIP** oluyor
— randevu almaya gelen kişi kendini bir işletme panelinde buluyor. Üstelik
`kullanici_auth_user_id` tekil olduğu için bunun geri dönüşü de yok.

Kod incelemesiyle görülmesi zor bir sınıf: eklenen dosyada değil, **eklenmeyen
bir branch'te**. Ekran artık iki türü de tamamlayabiliyor (`/api/uye-ol/tamamla`)
ve varsayılan hâlâ işletme — bu ekrana düşmenin yolu neredeyse her zaman
işletme kaydının yarıda kalması, çünkü müşteri kaydı tek satır yazıyor ve
kırılma penceresi çok daha dar.

### Yol boyunca temizlenen

- **Durum rozeti ve renkleri** `/r/[slug]/randevu/[token]` sayfasında gömülüydü.
  `/randevularim` ikinci bir müşteri ekranı getirdi; kopyalansaydı bir gün
  birinde eklenen bir durum ötekinde eksik kalırdı ve eksik branch `undefined`
  rozet olarak, yani **sessizce** çıkardı. `DurumRozeti` component'ine çıktı.

  Etiketler `randevu-durum.ts > DURUM_ETIKETLERI` ile birleştirilmedi: o liste
  panelin dili ("Onaylı", "Gelmedi"), rozet müşterinin dili ("Onaylandı",
  "Gelinmedi"). Tek listeye indirmek, iki taraftan birine ötekinin cümlesini
  okuturdu.

- **Ay adı listesi** aynı dosyada ikinci kez duruyordu; gerekçesi "bicim.ts ay
  adlarını taşımıyor" diye yazılıydı ve o cümle **Faz H'den beri doğru
  değildi** — takvim yazımları o fazda `bicim.ts`e taşınmıştı.
  `tarihUzun`a devredildi.

- **Koyu temada `<select>` açılır listesi okunmuyordu.** Chrome popup'ı kutunun
  kendi zemin rengiyle boyuyor; kutularımızın zemini yarı saydam olduğu için
  liste beyaz çıkıyor, seçenek metni `--foreground`u miras alıp açık gri
  kalıyordu. `color-scheme: dark` yetmiyor — popup rengini o değil kutunun
  zemini belirliyor. `option`a opak zemin verilerek kırılma kaynağında
  kapatıldı.

### Bilerek kapsam dışı

- **Telefonla toplu geçmiş bağlama.** Yukarıdaki ilk karar. SMS doğrulaması
  (Faz K) gelmeden güvenli değil.
- **`musteri.kullanici_id` doldurulmuyor.** Panelde "bu müşterinin hesabı var"
  göstergesi olurdu ama aynı telefon deliği o alanı da güvenilmez yapıyor.
  Kolon schema'da duruyor; Faz K'de anlamı netleşecek.
- **Şifre sıfırlama yok** — işletme tarafında da yok, ikisi birlikte gelmeli.
- **Sayfalama yok.** Liste 200 randevuda kesiliyor. O sınıra dayanmak için
  yıllarca düzenli randevu almak gerekiyor ve o gün geldiğinde doğru çözüm
  sayfalama değil "geçmişi yıl yıl aç" olur.
- **Müşteri profil ekranı yok** (ad/telefon düzenleme, favori işletme, "tekrar
  randevu al" kısayolu).
- **Üst bar session durumunu göstermiyor.** "Randevularım" link'i herkese
  görünüyor ve session'sız tıklayan üyelik kartını görüyor — bu bilinçli, hesap
  açmadan da randevusuna ulaşabileceğini orada öğreniyor.

### Doğrulama

- `npm run tip`, `npm run lint` temiz
- `npm test` — **570 test geçti** (42 dosya, gerçek Postgres); yeni:
  `musteri-db.test.ts` (16), `uye-ol.test.ts` (7), `uye-ol/tamamla.test.ts` (5),
  `randevularim/ekle.test.ts` (9), `randevularim/[id]/iptal.test.ts` (4),
  `kayit.test.ts`e müşteri kaydı (5), `degismezler.test.ts`e müşteri gate'i (5)
- `npm run build` başarılı, 45 route
- `cf:kur` + `wrangler deploy --dry-run`: **1728.15 KiB gzip**
- **Migration:** boş DB'de ve gerçek veri taşıyan `randevu_dev`'de (9 işletme,
  4 randevu) uygulandı, veri korundu; `drizzle-kit check` temiz, ikinci
  `generate` "No schema changes" dedi (göz ile doğrulandı). Backfill yok —
  `NULL` zaten doğru varsayılan. Geri alma tek satır:
  `ALTER TABLE randevu DROP COLUMN kullanici_id`.

**IDOR testi `musteri-db.test.ts`'te** ve route'da değil, bilerek: route'un
sızdırmama güvencesi tamamen gate'in `where` koşullarına dayanıyor — session'dan
kimliği alıp sonucu HTTP koduna çeviriyor. Route seviyesinde aynı şeyi test etmek
`cookies()` gerektiriyor (vitest'in node environment'ında yok, aynı gerekçe
`giris.test.ts`te yazılı) ve o test filtrenin **kendisini** değil yalnızca
çağrılıp çağrılmadığını gösterirdi. İki ayrı hesap ve iki ayrı işletme
kuruluyor; başkasının randevusu listede görünmüyor, iptal edilemiyor ve
**gerçekten ONAYLI kalıyor**, bağlanmış randevu ikinci hesap tarafından
çalınamıyor, eşzamanlı iki iptalden tam olarak biri kazanıyor.

**Elle (`next dev`, seed'lenmiş `randevu_dev`, tarayıcı plugin'i):** gerçek
bir session'la `/randevularim` render oldu — yani `auth() → getMusteriDb →
liste` zinciri runtime'da doğrulandı; `/uye-ol` session'lıyken role göre
`/panel`e yönlendiriyor; session'sız `/randevularim` üyelik kartını gösteriyor;
token sayfası ortak rozet ve `tarihUzun` ile doğru çiziliyor. **390px** (iframe
içinde gerçek dar görünüm, `scrollWidth` 386 — yatay taşma yok) ve **açık/koyu
tema** gözle doğrulandı.

### Elle yapılması gerekenler (Faz J)

- [x] **Müşteri hesabı gerektiren adımlar elle test edildi.** Kutu Faz P turunda
      kapandı: canlıda gerçek bir session'la `/randevularim` render oluyor,
      listede hesaba bağlı bir randevu ve iptal düğmesi duruyor, "Elinizdeki
      randevuyu ekleyin" kutusu yerinde.
- [x] **Prod'a migration uygulandı.** `0005_musteri-hesabi.sql` canlıda; doğrulaması
      yukarıdaki satırın kendisi — kolon olmasa `/randevularim` query'si düşerdi.
### Faz J üstüne gelen düzeltmeler

Kullanıcı PR açıldıktan sonra üç şey söyledi. İkisi düzeltildi, biri karara
bağlandı.

- **"Giriş yap" alt bilgiden üst bara taşındı ve üst bar session'ı yansıtıyor.**
  Şikâyet somuttu: işletme hesabıyla girişliyken "Giriş yap"a basınca `/giris`
  onu zaten girişli görüp `/panel`e atıyordu. Link session durumundan
  habersizdi — hem yanlış yerdeydi hem yanlış şeyi söylüyordu. Artık session
  açıkken o düğme hiç çizilmiyor, yani redirect **oluşamıyor**.

  Hesap menüsü yeniden uydurulmadı: panelde çözülmüş pattern (`HesapMenusu` +
  `CikisDugmesi`) üst bara taşındı, çıkış düğmesi birebir aynı component. Ayrı
  bir kardeş component olmasının tek sebebi trigger'ın şekli — panelinki
  geniş bir kenar çubuğu düğmesi, üst barınki dar ve yatay bir avatar. Rol
  etiketi ve baş harf `src/lib/rol.ts`e çıktı, çünkü aynı harita artık iki
  ayrı component ağacında gerekiyor.

  Bedeli açıkça kaydedilsin: `auth()` cookie okuyor, yani `UstBar` kullanan her
  sayfa dinamik oldu. Pratikte tek kayıp `/isletmeler-icin` (○ → ƒ). Alternatif
  session'ı her sayfadan prop geçirmekti; o da statik kalan sayfada girişli
  kullanıcıya "Giriş yap" göstermeye devam ederdi — düzeltilen hatanın
  kendisini bir sayfada bırakırdı.

- **Hesap ayrımı bugünkü hâliyle kalıyor.** Veri tarafında ayrım zaten var: bir
  Supabase hesabı ya işletmeye ya müşteriye ait (`kullanici_auth_user_id`
  tekil). Eksik olan ayrım değil, **arayüzün session'ı göstermemesiydi** ve
  yukarıdaki madde onu kapatıyor. Ayrı giriş adresleri (`/isletme/giris`) ve
  aynı tarayıcıda iki session birden değerlendirildi, ikisi de bugün
  gerekmiyor — ikincisi iki ayrı cookie ad alanı ve `auth.ts`in yeniden
  yazılması demek, INVARIANT 6 ve 11'e dokunur.

- **Misafir randevusu KALIYOR.** Soru şuydu: "giriş yapmamış biri randevu
  alabiliyor, birisi bot atıp sistemi tıkayabilir." Bugün üç kat koruma var —
  Turnstile (production'da `gercek`, `degismezler.test.ts` zorluyor), Worker rate
  limit (`RANDEVU_SINIRI`, IP başına 5 istek/60sn) ve telefon başına en çok
  3 açık randevu; bunların üstüne `gelmediKisitiGun`.

  Üyelik zorunluluğu dördüncü bir kat olurdu ama **botu durdurmuyor**: kayıt da
  ücretsiz ve otomatikleştirilebilir. Durdurduğu şey gerçek müşteri — ve ürün
  kimliği kararının ("siteye giren kişi randevu almaya gelmiştir") tam
  karşısına düşüyor.

  Karar: üyelik zorunlu değil, kalkan ayrı bir fazda güçlendirilecek. Sıradaki
  adımlar: IP rate limit'i sıkılaştırmak, telefon başına **günlük** randevu
  tavanı, işletme başına günlük yeni-müşteri tavanı, ve panelde şüpheli
  yoğunluğu gösteren bir uyarı. Reddedilen üçüncü seçenek, misafir randevusunu
  e-posta/SMS koduyla doğrulatmaktı: bota gerçek maliyet yaratıyor ama kendi
  altyapısını (kod üretimi, süre aşımı, doğrulanmayanı düşüren temizlik işi)
  gerektiriyor — o da ayrı bir faz.

---

## Faz P — tur sonrası düzeltmeler

**Kapandı:** yedi PR (#25–#31). Uygulama local'de ve **canlıda** end-to-end
gezildi; çıkan üç sınıf sorun kapatıldı. **625 test** (43 dosya). Migration yok.

Turun kendisi bir yöntem notu bırakıyor: bulguların hiçbiri koddan okunarak
değil, **ürünü kullanarak** çıktı. Testler yeşildi, tipler temizdi, invariant'lar
tutuyordu — ve ana sayfa yine de arayana sonuç vermiyordu.

### Canlıda yanlış söyleyen üç yer (PR #25)

- **Panelde "Geliştirici" bölümü her işletme sahibine görünüyordu.** Karar
  `Teknik borç` maddesinde YAZILIYDI ("silme, env flag'iyle kapat") ama
  uygulanmamıştı — yani decision log'a yazmak tek başına yetmiyor. Şimdi iki
  gate üst üste: sayfalar production'da `notFound()`, menü bölümü çizilmiyor.
  `degismezler.test.ts` ikisini de zorluyor.

  > **Bilerek yapılmayan:** vitrin **bundle'dan çıkmıyor**, route hâlâ
  > build ediliyor. Teknik borcun "production yüzeyinde geliştirici aracı durmamalı"
  > kısmı kapandı, "bundle'a giriyor" kısmı kapanmadı.

- **Randevu formu olmayan bir SMS hatırlatması vaat ediyordu.** Telefon
  alanının altında "Randevu hatırlatması da buraya gidiyor" yazıyordu; SMS
  kanalı yok (Faz K), bütün bildirimler e-postayla gidiyor ve e-posta formda
  opsiyonel. Yani telefonunu yazıp e-postasını boş bırakan müşteri hiçbir
  şey almıyordu — üstelik `bildirim.ts` o satırı `adres-yok` diye **hata**
  işaretliyordu. Vaat yalnızca yanlış değil, queue'da görünür bir arıza
  üretiyordu.

- **`/saglik` arama motoruna açıktı.** Sayfa public kalıyor (teşhis değeri
  tam da deploy sonrası tarayıcıdan açılabilmesinde) ama `robots.txt` +
  `noindex` ile dizinden çekildi.

### Arama vaadi karşılıyor (PR #26)

Ana sayfa "Ne arıyorsunuz?" diyordu, query yalnızca `isletme.ad` ve
`isletme.slug`'a bakıyordu. Ölçüldü: `saç kesimi` **0 sonuç**, `kuaför` ise
Kuaför kategorisindeki işletmeyi adında o kelime geçmediği için bulamıyordu.
`/dizin` aynı kutuyu dürüstçe "İşletme adı" diye etiketliyordu — ön kapı
dizinin verebileceğinden fazlasını vaat ediyordu.

- **`exists` kullanıldı, JOIN değil.** `isletmeleriAra` iki query koşuyor ve
  ikisi de aynı `kosul`u paylaşıyor: kart query'si `hizmet`e LEFT JOIN atıp
  topluyor, sayım query'si **join'siz** `count(*)`. Koşula doğrudan bir `hizmet`
  kolonu koymak sayım query'sini kırar, kart query'sinde LEFT JOIN'i fiilen
  INNER'a çevirip hizmetsiz işletmeyi düşürür ve toplamaları bozardı.
  Korelasyonlu `exists` her iki query'de de kendi başına ayakta duruyor.

- **Kategori eşleşmesi SQL'de değil, kapalı liste üzerinden JS'te.** `ilike`
  küçültmeyi collation'la yapıyor ve `kuafor` yazan ziyaretçi `Kuaför`
  kategorisini bulamazdı. Aynı tuzak işletme adı için Faz M'de yaşanmış ve
  orada `slug` kolonuyla çözülmüştü.

- **Hizmet adında katlama SQL'de.** `hizmet` tablosunda slug kolonu yok;
  `lower(translate(...))` kullanılıyor ve tablo `slug.ts`ten **tek kaynak**
  olarak okunuyor. `translate` önce, `lower` sonra — `lower('I')` collation'a
  bağlı, `translate` değil.

- **INVARIANT 12 metni güncellendi:** `hizmet` artık **filtrelenebilir ama
  döndürülemez**. Bir kolona göre süzmek o kolonun içeriğini dışarı vermiyor;
  ziyaretçi zaten elindeki metni soruyor. Kart hâlâ yalnızca toplama gösteriyor.

  > **Gate kasıtlı ihlalle test edildi — yakaladı.** Korelasyon satırı kaldırılınca
  > tam olarak üç test kırmızıya döndü; biri `exists`'in sabit-doğruya dönüp
  > **bütün dizini** döndürmesini yakalayan çapraz tenant testi.

  > **Bilerek yapılmayan:** `pg_trgm` indeksi. Bir `CREATE EXTENSION` migration'ı demek
  > ve korelasyon zaten `isletme_id` ile daralttığı için planlayıcı muhtemelen
  > seçmezdi. Eşik: `hizmet` ~50k satırı geçerse yeniden bakılmalı. Türkçe dışı
  > aksanlar (`Café`) da katlanmıyor — `unaccent` yine migration.

### Kaybolan filtre (PR #27)

Ana sayfadaki "Veteriner" kutucuğuna basan kullanıcı boş bir liste görüyor **ve
Kategori kutusu "Tüm kategoriler" diyordu** — seçimi kayboluyordu. Sebep iki
kaynağın çarpışması: kutucuklar sabit dokuz kategoriden (kapsamı göstermek
için), filtre seçenekleri gerçek veriden (dürüst olmak için). İkisi de tek
başına doğru; **çarpıştıkları yer ele alınmamıştı**.

Listenin kaynağı değişmedi — yalnızca aktif seçim istisna tutuluyor. Boş durum
ayrıca hangi filtrenin etkin olduğunu yazıyor.

### Misafirden üyeye köprü (PR #28)

Faz J "elinizdeki randevuyu ekleyin" kutusunu `/randevularim`a koymuştu, ama
kullanıcının linki **elinde tuttuğu** tek an token sayfası; o sayfa da
session'dan tamamen habersizdi. Yani akış, kullanıcıdan linki kopyalayıp başka
bir sayfaya gidip **geri** yapıştırmasını bekliyordu.

- **Token hiçbir yeni URL'e konmadı.** Onay ekranından giriş yoluna geçirmek
  için `?devam=<iptalYolu>` yazmak cazipti ama o değer server erişim loglarına
  düşerdi ve token tek başına yetki taşıyor (INVARIANT 5'in ruhu). Tek tıkla
  ekleme bu yüzden token'ın **zaten adres çubuğunda olduğu** sayfada duruyor;
  onay ekranı düz bir `/uye-ol` daveti gösteriyor. Aynı gerekçeyle `/uye-ol`'a
  `devam` desteği **eklenmedi** — bugün onu besleyecek güvenli bir çağıran yok.
  (Yazıldı, sonra geri alındı: spekülatif kapsam.)

- **Yetki modeli değişmedi.** Sayfayı hâlâ URL'deki token açıyor; session hiçbir
  gate açmıyor, yalnızca bir kutu çiziyor.

- **`/giris` artık iki çıkış gösteriyor.** Tek link `/uye-ol`a — müşteri
  kaydına — gidiyordu ve bu **geri dönüşü olmayan** bir tuzaktı:
  `kullanici_auth_user_id` tekil, yani oradan kaydolan işletme sahibinin
  e-postası kalıcı olarak MUSTERI oluyor ve o adresle bir daha işletme
  açamıyor. Faz J aynı sınıfı `/kayit/tamamla` için düzeltmişti; **çatalın
  kendisi giriş ekranındaydı** ve görülmemişti.

### Akış pürüzleri (PR #29)

- **Gün şeridi başlığı ay yazıyordu, oklar hafta atlıyordu.** `aria-label`
  baştan beri doğruydu ("Sonraki hafta") — yani ekran okuyucu ile göz farklı
  şey duyuyordu. Yazım panelin takviminde zaten vardı; `bicim.ts >
  tarihAraligi`ya taşındı ve iki yer de oradan okuyor.
- **"Devam et" slot seçilince aşağı kayıyordu** ve tıklama boşa gidiyordu —
  turda gerçekten ıskalandı. Satır artık her zaman yer kaplıyor.
- **Boş gün ipucu "Farketmez'i seçin" diyordu**, kullanıcı zaten Farketmez
  seçmişken de.

### Başlıklar ve KVKK (PR #30)

- **`/giris`, `/kayit`, `/kayit/tamamla` ve bütün panel sayfaları** kök
  layout'un ana sayfa başlığını taşıyordu. Faz J'de eklenen `/uye-ol` doğru
  yapmıştı, eskiler geride kalmıştı — yani yeni sayfa eklendikçe **sessizce
  tekrarlanan** bir sınıf. `degismezler.test.ts` artık her `page.tsx`'in
  `metadata` ihraç etmesini zorluyor; kök sayfa muaf.

- **`/gizlilik` eklendi.** Ürün ad, telefon ve e-posta topluyor ve Türkiye'de
  tüketiciye açıktan hizmet veriyor; bugüne kadar formda tek satır
  bilgilendirme, alt bilgide tek bir link yoktu.

  > **Onay kutusu konmadı, bilinçli:** misafir randevusunun sürtünmesini
  > artırmamak Faz J kararıydı ve buradaki işleme sözleşmenin ifası için
  > gerekli olan işleme — ayrıca rıza alınması gereken bir şey değil. Gereken
  > şey bilgilendirme.

### Bilerek kapsam dışı (Faz P'nin tamamı için)

- **Şifre sıfırlama.** Bugün hiç yok ve `kullanici_auth_user_id` tekil olduğu
  için şifresini unutan kullanıcı **kalıcı olarak kilitleniyor** — aynı
  e-postayla yeniden kayıt da olamıyor. Canlıda gerçek hesaplar var, yani bu
  bugünkü en pahalı boşluk. Faz P2'ye alındı.
- **`scoped-db.ts` bölünmesi** ve **uyarı/hata takibi** — teknik borcun kalan
  iki maddesi, Faz P2.
- **`/saglik`'in schema'yı gerçekten kontrol etmesi** — bu turda yalnızca dizinden
  çekildi, teşhis derinleştirilmedi.
- **`/r/<slug>` bir profil sayfası değil, doğrudan form.** Dizinden gelen kişi
  "Beşiktaş, İstanbul" yazan bir kart tıklıyor, karşısında adres yok, çalışma
  saati yok, dizine dönüş yok. `/r/`'ye üst bar koymama kararı Instagram
  trafiği içindi; marketplace ön kapısı kararından sonra o gerekçe tek başına
  yetmiyor. Ayrı bir iş.
- **Elle randevu ekleme ve müşteri listesi** — Faz H2, aşağıya bakın.

### Ortaya çıkan: Faz H2 yol haritasından düşmüştü

`plan.md` tamamlananlar tablosu Faz H'yi "müşteri geçmişi" dahil diye yazıyordu.
Oysa Faz H kendi notunda ikiye bölünmüştü: **elle randevu ekleme** ile **müşteri
listesi ve geçmişi** Faz H2'ye ayrılmıştı — ve H2 "Sıradakiler" listesinde hiç
yoktu. İki belge birbiriyle çelişiyordu ve kimse fark etmemişti.

Sonucu somut: **telefonla gelen randevuyu salon panele giremiyor.** Ürünün
işletme tarafındaki en büyük fonksiyonel boşluğu bu ve `/isletmeler-icin` "tek
takvim" derken bunu kapsıyormuş gibi duruyordu. H2 `plan.md`ye geri kondu,
`plan.md`nin bağlam cümlesi de "tam bir randevu yazılımı" iddiasını bugünkü
gerçeğe çekti.

### Prod'a seed atıldığı KAYDA GEÇMEMİŞTİ

Canlı dizindeki yedi işletmenin **tamamı** `tohum-demo.ts` çıktısı. Script
`--prod --onayla` ile bunu destekliyor, yani bilinçli bir işti — ama TODOS'taki
her seed satırı `randevu_dev` diyor ve prod'a yazıldığı hiçbir yerde yazılı
değildi. Kayıt buraya düşüyor.

Bunun iki sonucu var ve ikisi de görülmeliydi: kayıtlar `sitemap.xml`'de, yani
Google'a **uydurma salonlar** sunuluyor; ve `page.tsx`'in kendi yorumu
"DÜRÜST BOŞ DURUM — sahte kart göstermek, tıklayınca hiçbir yere gitmeyen bir
ürün demek" diyor. Kod bir ilkeyi savunurken veri onun tersini yapıyordu.

### Elle yapılması gerekenler (Faz P)

- [ ] **Prod'dan `berber` kaydını sil.** Adı düpedüz bozuk bir test kaydı ve
      alfabetik sıra yüzünden Bursa vitrininin **ilk kartı**. Karar: tamamen
      silinsin; bağlı randevu cascade ile gidiyor ve bu kabul edildi.
      ```sql
      begin;
      select id, slug, ad from isletme where slug = 'berber';
      delete from isletme where slug = 'berber';
      commit;  -- ya da rollback;
      ```
      `SUPABASE_DB_URL` üzerinden, `prod-goc.ts` disipliniyle. Sitemap
      `force-dynamic`, bir sonraki request'te kendiliğinden düşüyor. `auth.users`
      girdisi kalıyor (INVARIANT 9: FK yok).
- [ ] **`/gizlilik` metnini hukukçuya okut ve yer tutucuları doldur:** üç ayrı
      bilgi, dört yerde geçiyor — veri sorumlusunun unvanı (1), başvuru adresi
      (2 yer: "Veri sorumlusu" ve "Haklarınız") ve saklama süresi (1). Sayfada
      `[doldurulacak]` olarak görünüyorlar.
- [x] **Session'lı iki branch'in ilki canlıda doğrulandı** (5 Eylül 2026, merge
      sonrası): `/panel/gelistirici/vitrin` işletme sahibi session'ıyla **404**
      veriyor ve panel yan menüsünde "Geliştirici" bölümü yok. Plan bunu
      "ölçülemedi" diye kapatmıştı; tarayıcıda zaten açık bir production session'ı
      olduğu ortaya çıkınca şifre girmeye gerek kalmadan ölçüldü.
- [ ] **Token sayfasının "Hesabıma ekle" branch'i hâlâ ölçülmedi.** Görmek için
      production'da gerçek bir randevu oluşturmak gerekiyor (kayıt yazar ve e-posta
      gönderir), o yüzden tur sırasında yapılmadı. `musteri-db.test.ts`'teki üç
      testle kilitli.

### Merge ve canlı doğrulama (5 Eylül 2026)

Yedi PR sırayla `main`'e alındı (#25 → #31) ve `main`'in ağacı zincirin son
ucuyla **birebir aynı** çıktı — `git diff 83d13df d13adf6` boş. CI + Cloudflare
deploy'u yeşil.

**Merge sırasında öğrenilen: `--delete-branch` zinciri kırıyor.** #25 merge
edilip `faz-p/canli-duzeltmeler` silinince GitHub #26'yı `main`'e yeniden
hedeflemedi — **kapattı**, ve kapalı bir PR'ın tabanı değiştirilemediği için
`gh pr edit --base` de reddetti. Kurtarma: silinen branch'i eski ucuna geri push
et (`git push origin <sha>:refs/heads/<dal>`), PR'ı reopen et, tabanı `main`
yap, sonra branch'i tekrar sil.
Doğru sıra bu yüzden şu: **önce çocuğun tabanını `main` yap, sonra ebeveyni
merge et, en son branch'i sil.** Kalan altısı bu sırayla sorunsuz geçti.

**Canlıda ölçülenler.** Dizin araması: `saç kesimi` / `sac kesimi` / `KESİMİ`
→ 4, `kuaför` / `kuafor` → 1, `manikür` → 2, `zzz` → 0; **her query'de counter =
kart sayısı**, yani iki query'nin ayrışmadığı canlıda da doğrulandı. Boş
kategori (`?arama=zzz&kategori=Veteriner&il=Bursa`) seçimini kutuda gösteriyor
ve boş durum "zzz · Veteriner · Bursa" yazıyor. Gün şeridi başlığı aralık:
"5 – 11 Eylül 2026", ay sınırında "26 Eylül – 2 Ekim 2026", son pencere randevu
ufkunda kesilince "3 – 5 Ekim 2026". "Devam et" saat seçilince **0 piksel**
kayıyor (ölçüldü: `getBoundingClientRect().y` 728 → 728). Farketmez seçiliyken
boş gün ipucu çizilmiyor. Form metinleri, `/gizlilik`, `robots.txt`'te
`/saglik`, sitemap'te `/gizlilik` ve sekiz sayfanın ayrı başlığı yerinde.

**Deploy turunda çıkan yeni bulgu: üçüncü arama kutusu unutulmuştu.** Faz P
aramanın kapsamını genişletirken iki etiketi düzeltti (kahraman ve dizin
filtresi) ama `ust-bar.tsx`'teki kutu "İşletme adı ara" demeye devam ediyordu —
iç sayfalarda görünen tek arama girişi o. Artık "Hizmet ya da işletme ara".
Ders: bir yetenek genişlerken onu **anlatan** yerlerin tamamı aranmalı; bu
turda `grep -rn "İşletme adı"` üç dosya döndürüyordu, ikisi düzeltilmişti.

---

## Faz H2 — elle randevu (PR #33)

**Kapandı:** panelden randevu ekleme. `/panel/randevu/yeni`,
`POST /api/randevular`, `GET /api/randevular/musaitlik`,
`scoped-db > randevuElleOlustur`. 660 → 686 test.

Faz H'de ayrılıp yol haritasından düşen işin ilk yarısı. Telefonla gelen
randevu artık panele giriliyor; **müşteri listesi ve geçmişi** bu fazın ikinci
PR'ında.

### Müsaitlik motoru iki gate'e birden bağlandı

Motorun ilk hâli `getHalkaAcikDb`nin **dönüş tipine** bağlıydı
(`type HalkaAcikDb = NonNullable<Awaited<ReturnType<typeof getHalkaAcikDb>>>`),
yani panel tarafı aynı hesabı yapamıyordu. Bağ iki adımda çözüldü:

- `musaitlik-sorgu.ts` artık dar bir **yapısal arayüz** istiyor
  (`MusaitlikKapisi`: dört metot) ve işletme ayarlarını `db`den değil ayrı bir
  `isletme` alanından alıyor. Ayrı olmasının sebebi somut: `getHalkaAcikDb`
  işletmeyi slug'dan çözerken zaten okuyor, `getScopedDb` ise yalnızca session'ın
  `isletmeId`sini biliyor — ayarları okumak ek bir query ve panelin ayarla
  ilgilenmeyen her sayfasına onu ödetmek istemedik.
- Üç query (`hizmetiVerenPersoneller`, `kapaliAraliklariListele`,
  `doluRandevulariListele`) `musaitlikKapisi(db, kiraci)` ortak fonksiyonuna
  taşındı ve **iki gate'e de aynı kod** yayılıyor — `bildirimKapisi` pattern'ının
  aynısı. Kopyalamanın bedeli sessiz olurdu: `doluRandevulariListele`nin durum
  kümesi veritabanındaki `EXCLUDE` constraint'inin `WHERE`iyle aynı olmak zorunda
  (INVARIANT 8), ayrışsa motor "boş" dediği bir slotu constraint reddederdi.

Müşteriyi telefonla tekilleyen yarış çözümü de ortaklaştı (`musteriyiCoz`):
`onConflictDoNothing` + yarışı kaybedeni okuma mantığı tek yerde.

### Serbest saat — bilinçli bir istisna

**Karar: panel motorun dışına yazabiliyor.** Telefonda "yarım saat sonra
geliyorum" diyen müşteri min bildirim süresinin, bazen de çalışma saatinin
dışında kalıyor. Motorun kuralları müşteriye "bu saat alınamaz" demek için;
işletmenin kendi takvimine istisna yazmasını engellemek için değil.

Serbestliğin **sınırı yine veritabanında**: aynı personelin çakışan iki aktif
randevusu `EXCLUDE` constraint'iyle imkânsız ve `zorla` flag'i bunu **aşmıyor**.
Yani işletme çalışma saati dışına yazabiliyor, dolu bir saatin üstüne
yazamıyor.

İstisna **iki adımlı**: client önce flag'siz gönderiyor, saat motorun
dışındaysa 409 + `zorlanabilir: true` alıyor ve kullanıcıya "yine de eklensin
mi" diye soruluyor. Tek adımda yazsaydık yanlış saate dokunan bir tık sessizce
takvime işlerdi.

### Public yoldan üç fark

1. **`kaynak: "ISLETME"`.** Schema bu ayrımı Faz E'den beri taşıyordu ama yazan
   bir yol yoktu.
2. **`durum: "ONAYLI"`, `otomatikOnay` ayarına bakılmadan.** O ayar müşterinin
   aldığı randevunun onay bekleyip beklemeyeceğini söylüyor; işletme kendi
   girdiği randevuyu kendi onaylayacak olurdu.
3. **Gelmedi kısıtı ve açık randevu tavanı uygulanmıyor.** İkisi de session'sız
   yolun kötüye kullanımına karşıydı. Kısıt özellikle önemli: "gelmedi"
   işaretlenen müşteri telefonla arayıp özür dilediğinde işletme onu gate'te
   bırakmak zorunda kalmamalı — **affetme yolu bu.**

### IDOR: foreign key'in yakalayamadığı yer

`randevu.personel_id` foreign key'i yalnızca `personel.id`ye bakıyor,
**işletmeye değil**. Yani başka bir salonun personel id'si veritabanı
tarafından reddedilmezdi ve randevu bizim işletmemizde o yabancı personelle
oluşurdu. Kontrol route'ta değil **gate'in transaction'ının içinde** duruyor ki
çağıran taraf onu unutamasın; `scoped-db-elle-randevu.test.ts` bunu kilitliyor.

### Bildirim: işletmeye mesaj yok

`elleRandevuKayitlari` `ISLETME_YENI_RANDEVU` yazmıyor — randevuyu giren zaten
işletmenin kendisi. Müşteri tarafı değişmiyor: onay mesajı **iptal linkini
taşıyor** ve o link müşterinin randevuyu kendi iptal edebileceği tek yol.
Hatırlatmanın "geçmişe yazma" kuralı iki yolda da ortak (`hatirlatmaKaydi`) ve
elle girilen randevularda o branch daha sık çalışıyor — telefonla alınan
randevunun çoğu aynı haftanın içinde.

### Bilerek kapsam dışı

- **Müşteri listesi, geçmişi ve düzenlemesi.** Faz H2'nin ikinci PR'ı.
  Bugünkü sonucu: mevcut müşterinin **adı ve notu güncellenmiyor** — işletme
  "Ahmet" diye kayıtlı birini "Ahmet Yılmaz" yazarak aradığında kaydın sessizce
  yeniden adlandırılması sürpriz olurdu; ad düzeltmek ayrı ve açık bir iş.
- **Geçmişe randevu yazma.** Tarih input'unun alt sınırı bugün. Geçmişe yazmak
  bir kayıt tutma işi (dünkü müşteriyi sonradan girmek) ve randevu akışının
  değil müşteri geçmişinin sorusu.
- **L3'ün "gelmedi" kısıtını panelden görme ve kaldırma ekranı.** Kısıt elle
  yazmada zaten uygulanmıyor, yani acil değil; ekran ikinci PR'a.
- **Panelde "farketmez" personel seçimi.** Serbest saatte motor hiç koşmuyor ve
  "müsait olan ilk personel" diye bir cevap üretilemez; sessizce ilk personeli
  seçmek randevuyu yanlış kişinin takvimine yazmak olurdu.
- **Randevu düzenleme (saat/personel değiştirme).** Bugün yalnızca durum
  değiştirilebiliyor. Ayrı iş.

### Elle doğrulandı — 5 Eylül 2026, `npm run dev` + gerçek session

Veri: `isil-guzellik-salonu` (4 hizmet, 2 personel, Pzt–? 09:00–12:00 /
13:00–18:00).

- [x] **Uygun saatle ekleme.** 7 Eylül 10:00 Saç kesimi → takvimde
      `10:00 – 10:45 · Onaylı`; DB'de `durum=ONAYLI`, `kaynak=ISLETME`.
- [x] **Motorun listesi doğru.** 45 dk hizmette son sabah slotu **11:15**
      (11:30 seçilseydi öğle arasına taşardı); 75 dk hizmette 09:00–10:30
      elenmiş, çünkü 10:00'daki randevuyla çakışıyor. Öğle arası boş.
- [x] **Serbest saat.** "Başka saat" → 20:00 (çalışma saati dışı): önce 409 +
      *"Bu saat çalışma saatlerinin dışında ya da dolu görünüyor. Yine de
      eklemek istiyor musunuz?"*, buton **"Yine de ekle"**ye dönüyor, ikinci
      gönderimde 201 → takvimde `20:00 – 21:15`.
- [x] **Çakışmayı `zorla` AŞMIYOR.** Dolu 10:15'e serbest yazma → *"Bu
      personelin o saatte başka bir randevusu var."* DB'de **hiçbir satır
      yok** — müşteri kaydı bile açılmamış, yani transaction bütün olarak
      geri alınıyor.
- [x] **Müşteri tekilleme.** Aynı numarayla ikinci randevu → tek `musteri`
      satırı, iki randevu. Formda ad "Fatma Ş." yazılmasına rağmen kayıt
      **"Fatma Şahin"** kaldı: mevcut müşterinin adı bilerek güncellenmiyor.
- [x] **Bildirim.** Queue'da `MUSTERI_RANDEVU_ONAYLANDI` +
      `MUSTERI_HATIRLATMA` (randevudan 24 saat önce); **`ISLETME_YENI_RANDEVU`
      yok**. E-posta girilmediği için onay satırı `adres-yok` ile hata
      alıyor — müşteri akışıyla aynı davranış.
- [x] **Açık ve koyu tema.** İkisinde de kontrast ve vurgu yerinde.
- [ ] **Mobil genişlik ÖLÇÜLEMEDİ.** Tarayıcı penceresi yeniden
      boyutlandırılamadı (viewport 1920'de kaldı), yani düzen yalnızca
      `sm:` kırılma noktalarının okunmasıyla varsayıldı — **ölçülmedi**.
      Telefonda bir kez açılmalı.

### Bundle bütçesi

`cf:kur` + `wrangler deploy --dry-run`: **gzip 1769,53 KiB** (bütçe 3 MiB).
Faz P sonundaki 1634 KiB'den **+135 KiB** — yeni sayfa, form component'i ve
ikonlar. Bütçenin yarısında duruyoruz ama artış tek bir ekran için küçük
değil; sonraki panel ekranlarında ölçüm sürmeli.

### İKİNCİ BİR DEPLOY PIPELINE BAĞLANMIŞ: Cloudflare "Workers Builds"

PR #33'te Cloudflare'ın **Workers Builds** entegrasyonu bir commit status'u
düşürüyor ve **fail** veriyor. Bu kontrol `main`'in son commit'inde YOK, yani
entegrasyon yeni bağlanmış ve ilk kez burada göründü.

**Kodla ilgisi yok.** Build log'u sebebi tek başına söylüyor: `next build`in
prerender adımında `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
tanımsız olduğu için `src/lib/supabase/sunucu.ts` fırlatıyor. İki run'da iki
farklı sayfada patlamış (`/isletmeler-icin` ve `/giris`) — prerender sırası
rastgele, sebep aynı. `ci.yml` bu variable'ları veriyor (`dogrula` job'ına sahte
değerler, `yayinla` job'ına gerçek `vars`), Cloudflare'ın build environment'ına ise
kimse vermemiş.

**Ama asıl mesele başarısızlık değil, entegrasyonun kendisi.** Üç ayrı sorun
üst üste duruyor:

1. **Yanlış komut.** Cloudflare `npm run build` koşuyor, `npm run cf:kur`
   değil — başarılı olsa bile OpenNext bundle'ı üretmiyor.
2. **İki deploy pipeline.** Repo'daki sözleşme "merge anı deploy anı" ve deploy'u
   `ci.yml`deki *Cloudflare Workers yayini* işi yapıyor (`docs/yayin.md`).
   İkinci bir pipeline aynı Worker'a bakıyor.
3. **En tehlikelisi:** Workers Builds **branch başına** koşuyor. Config'i
   düzeltilip yeşile dönseydi, merge edilmemiş bir PR branch'ini production'a
   deploy edebilirdi. Bugün onu engelleyen tek şey, eksik bir env variable'ı.

**Öneri: entegrasyon kaldırılsın.** Cloudflare panelinde Workers → randevu →
Settings → Builds bağlantısı sökülür; deploy `ci.yml`de kalır. İkinci seçenek
(env'leri ekleyip komutu `cf:kur` yapmak) 3. maddeyi çözmüyor, branch koruması da
ayrıca kurulmalı.

> Yan bulgu, ayrı bir iş: **build zamanı bu iki variable'a bağımlı.** `/giris`
> ve `/isletmeler-icin` `ƒ (Dynamic)` olarak işaretli olmasına rağmen
> prerender denemesi `auth()` üzerinden Supabase client'ını kuruyor ve env
> yoksa build tümden düşüyor. CI bunu sahte değerlerle örtüyor. Secret'ların
> yokluğunda build'in ayakta kalması Faz P2'ye yazılmalı.


---

## Faz H2 — müşteri listesi ve geçmişi *(ikinci yarı, PR #34)*

**Kapandı:** `/panel/musteriler` + müşteri detayı, randevu geçmişi, kayıt
düzenleme (`PATCH /api/musteriler/[id]`) ve L3'ün "gelmedi" kısıtının tek bir
müşteri için kaldırılması (`DELETE /api/musteriler/[id]/kisit`). `scoped-db`'ye
beş metot; **700 test** (fazdan önce 660).

Fazın ilk yarısı PR #33'te kapanmıştı; bu PR onun bilerek dışarıda bıraktığı
dört maddeyi alıyor.

### Panelde müşteri diye bir yüzey yoktu

`musteri` tablosu Faz E'den beri duruyor ama panelin ona bakan **tek bir
metodu** yoktu: müşteri kaydı yalnızca randevu yazılırken `musteriyiCoz` ile
açılıyor, takvimde ise adı ve telefonu randevu satırının join'inden
görünüyordu. Yani "bu müşteri kaç kez geldi" sorusunun cevabı veritabanında
vardı, panelde yoktu.

Eklenen beş metot: `musterileriListele`, `musteriGetir`,
`musteriRandevulariniListele`, `musteriGuncelle`, `musteriKisitiniKaldir`.

### Telefon düzenlenemiyor — eksiklik değil, karar

Müşteri `(isletmeId, telefon)` ile tekilleniyor, yani **numara kaydın
kimliği**. Düzenlenebilir bir alan olsaydı ya başka bir müşterinin numarasıyla
çarpışıp benzersizlik ihlali üretirdi ya da o numaradan gelen sonraki randevu
ikinci bir müşteri kaydı açardı. Numarası değişen müşteri, yeni numarayla
gelen ilk randevuda zaten ayrı bir kayıt olarak açılıyor.

Alan doğrulayıcıda (`musteri-girdi.ts`) da yok: body'ye telefon yazılsa bile
**okunmuyor**, yani gate'e hiç ulaşmıyor. Test bunu ayrıca kilitliyor.

### Ad güncelleme: iki yolun bilinçli farkı

Elle randevu yazan yol mevcut müşterinin adını **bilerek** güncellemiyordu
(PR #33 kararı: "Ahmet" diye kayıtlı biri "Ahmet Yılmaz" yazılarak arandığında
kaydın sessizce yeniden adlandırılması sürpriz olurdu). Bu PR o sürprizin
**açık** karşılığını getiriyor: ad düzeltmek ayrı bir ekran ve ayrı bir uç.
İki yol artık birbirini tamamlıyor — biri sessizce değiştirmiyor, öteki
isteyerek değiştiriyor.

### Kısıtın affetme yolu artık tek müşteri için

Faz L3 kısıtı yazıyordu ama kaldıran bir yol yoktu; günlükteki kayıt bunu
açıkça söylüyordu: *"Bugünkü kaldırma yolu ayarı geçici olarak 0 yapmak — kaba
ama var."* Yani tek bir müşteriyi affetmek için **bütün müşterilerin** kısıtını
düşürüp geri açmak gerekiyordu.

`DELETE /api/musteriler/[id]/kisit` tek satırı sıfırlıyor, ayara dokunmuyor.
Kısıt **sıfırlanıyor, kısaltılmıyor** — affetme yarım olmaz; yazma tarafı da
süreyi `greatest` ile hiç kısaltmıyordu, buradaki `null` o gate'in bilinçli
karşı yönü.

Üç sonuç dönüyor (`tamam` / `kisit-yok` / `yok`) çünkü `isNotNull` koşulu
yüzünden 0 satırın iki sebebi var: "müşteri yok" 404, "zaten kısıtlı değil"
409. İkisi kullanıcıya aynı cümleyle anlatılamaz.

**Kısıtın GEÇERLİ olup olmadığına server karar veriyor**, client değil:
tarihin gelecekte olması tek başına yetmiyor, işletme ayarı 0'a çekildiyse
kayıtlı tarih de yok sayılıyor — randevu yazan yol (`randevuYaz`) tam olarak
böyle bakıyor. İki yer ayrışsaydı ekran "kısıtlı" derken müşteri randevu
alabiliyor olurdu.

### Liste tamamen server component'i

Arama düz bir **GET formu**, satırlar birer link — tutulacak durum yok. Üç
sonucu var: arama JavaScript kapalıyken de çalışıyor, sonuç URL'e yazıldığı
için yer imine konabiliyor, ve liste client bundle'ına hiç inmiyor. Fazın ilk
yarısı tek ekran için +135 KiB getirmişti; bu PR **+22,7 KiB** getiriyor.

Sayfalama yok, bilerek: bir salonun müşteri sayısı binlerle değil yüzlerle
ölçülüyor ve sayfa numaraları, arama kutusunun çözdüğü sorunu ikinci kez
çözerdi. Sınır aşıldığında liste **sessizce kesilmiyor** — gate bir satır
fazla okuyup `dahaVar` flag'ini dolduruyor ve ekran aramayı daraltmayı
söylüyor.

### Elle doğrulamada bulunan iki hata

**1. `sonRandevu` `Date` değil metin dönüyordu.** Ham `sql` ifadesi
(`max(baslangic)`) kolon tipini kaybediyor, yani Drizzle'ın timestamptz
çözücüsü hiç devreye girmiyor — tip `Date` diyordu, değer `string`di ve
`getTime()` "is not a function" ile patlıyordu. `.mapWith(randevu.baslangic)`
kolonun çözücüsünü ödünç alıyor. **Testte yakalandı, tarayıcıda değil** —
`sql<T>` bir söz, kanıt değil.

**2. Ekrandan kopyalanan telefon numarası bulunamıyordu.** `telefonDogrula`
numarayı baştaki `0`/`90` olmadan saklıyor (10 hane) ama panel onları
**ekleyerek** gösteriyor (`telefonBicimle` → "0555 123 45 67"). Yani işletmenin
listede gördüğü numarayı arama kutusuna yapıştırması hiçbir zaman sonuç
vermiyordu. Arama terimindeki baştaki `0` ve `90` artık kırpılıyor.
**Bu hata yalnızca elle doğrulamada çıktı** — testler kendi yazdıkları ham
numarayı arıyordu, yani ekranın gösterdiği biçimi hiç sormamışlardı.

### Bilerek kapsam dışı

- **Randevu düzenleme (saat/personel değiştirme).** Bugün bir randevunun
  yalnızca durumu değişebiliyor. Ayrı iş ve `docs/plan.md`'de artık açıkça
  "kalan eksik" olarak yazılı.
- **Müşteri silme.** `randevu.musteriId` `ON DELETE RESTRICT`, yani geçmiş
  randevusu olan müşteri zaten silinemiyor. Anlamlı olan tek şey "arşivle"
  olurdu ve onu isteyen kimse yok.
- **Geçmişten randevu detayına gitme.** Geçmiş satırı bugün bir link değil;
  randevunun detayı takvimde duruyor ve iki ekranı birbirine bağlamak, hangi
  güne dönüleceği sorusunu açardı.
- **Müşteri birleştirme.** İki farklı numarayla açılmış iki kaydın aynı kişi
  olduğunu yalnızca işletme bilebilir; birleştirme randevuları taşımak demek
  ve kendi başına bir faz.
- **Notun randevu ekranında görünmesi.** `musteri.not` işletmenin iç kaydı;
  bugün yalnızca müşteri detayında görünüyor. Takvimde de göstermek istenirse
  ayrı bir karar (ekran omuz üstünden okunuyor).
- **Sayfalama ve sıralama seçenekleri.** Gerekçesi yukarıda.

### Elle doğrulandı — 7 Eylül 2026, `npm run dev` + gerçek session

Veri: `isil-guzellik-salonu`, üç müşteri.

- [x] **Liste.** Randevu sayıları ve son randevu tarihleri doğru; son
      randevusu en yeni olan üstte, hiç randevusu olmayan en sonda.
- [x] **Ad ile arama.** "yılmaz" → tek satır.
- [x] **Telefon ile arama.** "0555 123" → önce **BULAMADI** (yukarıdaki 2.
      hata), düzeltildikten sonra tek satır. "+90 555 123" de çalışıyor.
- [x] **Detay ve geçmiş.** İki randevu, en yeni üstte, "Panelden eklendi"
      işareti ve durum rozetleri yerinde.
- [x] **Düzenleme.** Ad, e-posta ve not kaydedildi; **telefon alanı formda
      yok**. Değişen ad takvimde de göründü.
- [x] **Kısıt zinciri end-to-end.** Takvimde randevu → "Gelmedi" → listede
      **Kısıtlı** rozeti → detayda kart (*"7 Ekim 2026 tarihine kadar"*, ayar
      30 gün) → "Kısıtı kaldır" → kart kayboldu.
- [x] **Affetme geçmişi bozmuyor.** Kısıt kalktıktan sonra randevu hâlâ
      **Gelmedi** durumunda duruyor.
- [x] **Olmayan müşteri id'si → 404.**
- [x] **Açık ve koyu tema.** İkisinde de kontrast ve vurgu yerinde.
- [ ] **Mobil genişlik YİNE ÖLÇÜLEMEDİ.** `resize_window` "başarılı" dönüyor
      ama viewport değişmiyor (ekran görüntüsü 1568 px'te kalıyor ve masaüstü
      kenar çubuğu duruyor). **İkinci fazdır ölçülemiyor**; düzen yine yalnızca
      `sm:` kırılma noktalarının okunmasıyla varsayıldı. Telefonda bir kez
      açılmalı — artık iki ekran birikti (`/panel/randevu/yeni` ve
      `/panel/musteriler`).

### Bundle bütçesi

`cf:kur` + `wrangler deploy --dry-run`: **gzip 1792,26 KiB** (bütçe 3 MiB).
H2a sonundaki 1769,53 KiB'den **+22,73 KiB**. İki ekran ve bir client
component'i için küçük — listenin server'da kalması işe yaradı (H2a tek ekran için
+135 KiB getirmişti).

---

## Faz P2 — secret'ların yokluğunda build (PR #35)

**Kapandı:** `npm run build` ve `npm run cf:kur` artık Supabase variable'ları
olmadan da geçiyor. Faz H2'nin sonunda "P2'ye yazılmalı" diye bırakılan yan
bulgu.

### Kök neden tek satırın sırasıydı

`supabaseSunucu()` şu sırayla koşuyordu: önce `ayarlar()` (env okuyor ve yoksa
fırlatıyor), sonra `await cookies()`. Next, `dynamic` işareti olmayan bir
sayfayı build'de **önce prerender etmeyi deniyor** ve sayfa ancak bir request-anı
API'sine *gerçekten ulaştığında* dinamiğe düşüyor. `ayarlar()` bir satır önce
patladığı için o düşüş hiç gerçekleşmiyordu.

**`ƒ (Dynamic)` işareti bir input değil, çıktı.** Bu sayfaların hiçbirinde
`export const dynamic` yok. Env varken prerender denemesi `cookies()`e ulaşıp
bailout ediyor ve Next sayfayı `ƒ` diye *etiketliyor* — yani etiket, "prerender
denenmedi"nin değil, **"prerender denendi ve bailout etti"nin** kanıtı. Faz
H2'nin notu bu ilişkiyi ters okumuştu.

**Etki iki değil altı sayfa:** `/giris`, `/kayit`, `/uye-ol`,
`/kayit/tamamla`, `/isletmeler-icin` ve `/gizlilik` (son ikisi `UstBar` →
`auth()` üzerinden). Build ilk hatada durduğu için her run'da yalnızca biri
görünüyordu.

### `connection()` denendi ve ÖLÇÜLDÜ, sonra geri alındı

İlk düzeltme `supabaseSunucu()`'nun ilk satırına `await connection()` koydu —
niyeti açıkça yazan, `src/app/saglik/page.tsx`'te emsali olan araç. Çalıştı,
ama `next/server` import'u bu modül üzerinden worker bundle'ına **+45,4 KiB gzip**
ekledi (1792,40 → 1837,77). Bütçe 3 MiB ve her fazda izleniyor; bir satırın
sırası için ödenecek bedel değil.

Bugünkü hâli: `cookies()` çağrısı `ayarlar()`'ın **üstüne** alındı. Aynı kesmeyi
zaten orada duran bir çağrı yapıyor, bundle `main` ile birebir aynı kaldı
(1792,40 KiB).

**"İki satırın sırası" kırılgan bir garanti** — o yüzden kaza olmaktan
çıkarıldı: `degismezler.test.ts` body'nin **ilk ifadesinin** o satır olduğunu
zorluyor. Gate'in kırmızıya döndüğü, satırlar bilerek takas edilerek
doğrulandı.

### CI'daki sahte değerler kaldırıldı

`dogrula` işindeki `cf:kur` adımı iki sahte Supabase değeri taşıyordu ve yorumu
"öyle kalmalı" diyordu. O gerekçenin dayanağı (env yoksa `ayarlar()` fırlatır)
artık doğru değil.

**Kaldırmak, bu regresyonu yakalayan tek koruma.** Sebep ergonomik değil
teknik: `next build` `.env`'i kendiliğinden yüklüyor ve `.env` gitignore'da —
yani `.env`'i olan bir geliştirici hatayı **hiçbir zaman göremez**. Repo'daki
tek secret'sız environment o adım. İkinci bir gate `degismezler.test.ts`'te: adımın içine
Supabase variable'ı geri konulursa test kırmızıya dönüyor (Faz L'de
`TURNSTILE_MODU`'nun sessizce kaybolmasıyla aynı hata sınıfı).

### Gürültülü hata sessiz hataya dönüşmesin diye

Bu düzeltmenin bilinen bedeli var: **eksik env build'i düşürerek kazara koruma
sağlıyordu.** Artık sağlamıyor, yani secret'sız bir `cf:yayinla` başarıyla **kırık
bir Worker** deploy edebilir — `NEXT_PUBLIC_*` build time'da gömüldüğü için
`wrangler vars` bunu runtime'da düzeltemiyor.

Karşılığı iki yerde: `next.config.ts` production build'inde eksik variable'ı görürse
"bu çıktıyı yayınlamayın" uyarısı basıyor (`throw` değil — fazın işi tam olarak
düşmemek), ve `ci.yml`'deki mevcut "derleme değişkenleri var mı" gate'i artık
**tek** koruma olarak `docs/yayin.md`'ye yazıldı.

Uyarı üç kez basıyordu; modül seviyesindeki bir flag aynı process'teki tekrarı
kesti. **İkiye indi, bire değil**: `next build` ayrı bir process daha açıyor ve
oradaki çağrı flag'i görmüyor. Ölçüldü, kabul edildi.

### Bilerek kapsam dışı

- **`NEXT_PUBLIC_` prefix'inden kurtulmak.** Bu iki değer tarayıcıda hiç
  kullanılmıyor (tek okuma noktası `supabase/sunucu.ts`; formlar `/api/*`'ye
  POST atıyor), yani prefix gereksiz ve kaldırılması "secret'sız üretilen bundle
  kırıktır" tuzağını tümden ortadan kaldırırdı. Ama `wrangler.jsonc`,
  `docs/yayin.md` ve `ci.yml`'nin iki işini birden değiştirir — **ayrı iş**.
- **`NEXT_PUBLIC_SITE_URL` ve `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.** İkisi de
  build'i zaten düşürmüyordu (`site.ts`'te fallback değer, `turnstile-alani.tsx`
  sessizce kapanıyor). Ayrı davranışlar, ayrı karar.
- **`/isletmeler-icin` ve `/gizlilik`'i gerçekten statik yapmak** (`UstBar`'ı
  session'sız bir varyanta ayırarak). Performans kararı, bu fazın konusu değil.

### Faz P2'den DÜŞÜRÜLEN madde: `scoped-db.ts` bölünmesi

Dosya bugün **1809 satır** (teknik borç maddesindeki "1065" notu 3 Eylül'den
kalma, dosya o gün bugün %70 büyümüş). Bölünme yine de **yapılmıyor**, çünkü
ölçülen faydası yok:

- **Bundle: 0.** Dış yüzey (`getScopedDb`) değişmediği için her sayfa yine
  bütün parçaları yüklüyor; client tarafına bugün de hiçbir şey inmiyor
  (`import type` kullanılıyor).
- **Test süresi: 0.** Maliyet gerçek Postgres gidiş-dönüşü, modül boyutu değil;
  test dosyaları zaten bölünmüş.
- **`npm run tip`: muhtemelen hafif kötüleşir** (spread edilen fabrika dönüş
  tiplerinin çıkarımı).

Kalan fayda tamamen insani: 1809 satırda eksik bir `eq(x.isletmeId, kiraci)`'yi
incelemede kaçırmak kolay. Ama bedeli ağır: `bildirimKapisi(db, kiraci)` bugün
*dosya içi* bir fonksiyon; `export` edildiği an `kiraci` **gerçek bir
parametre** oluyor ve `randevuKapisi(db, "başka-işletme-id")` build edilen,
lint'ten geçen, hiçbir testin görmediği bir satır hâline geliyor. Yani bölünme
INVARIANT 1'in bugünkü en güçlü argümanını ("filtre tek dosyada bir kapanış
variable'ı") zayıflatıyor.

Yeniden bakılacak eşik: dosya büyümeye devam ederse ya da closure variable'ını
koruyan gate'ler (tenant bağlama tek dosyada, parçalar dışarıdan import
edilemez, imza taraması) ayrı bir iş olarak yazılmak istenirse.

### Elle doğrulandı — 7 Eylül 2026

- [x] **Hata önce üretildi.** `.env` geçici kaldırıldı → `npm run build`
      `Error occurred prerendering page "/giris"` ile düştü. Teşhis
      varsayılmadı.
- [x] **Düzeltmeden sonra secret'sız `npm run build` geçiyor**, uyarı basıyor.
- [x] **Secret'sız `npm run cf:kur` geçiyor** — CI'ın artık koşacağı adımın aynısı.
- [x] **Statik/dinamik sınıflandırması değişmedi.** `main`'de ve branch'te statik
      kalan üç yol aynı: `/_not-found`, `/icon.svg`, `/robots.txt`.
- [x] **Gerçek request.** `npm run dev` → `/giris`, `/kayit`, `/uye-ol`,
      `/isletmeler-icin`, `/gizlilik`, `/` **200**; `POST /api/oturum` **200**.
- [x] **Gate kırmızıya dönüyor.** Satırlar bilerek takas edildi, test düştü,
      geri alındı.

### Bundle bütçesi

`cf:kur` + `wrangler deploy --dry-run`: **gzip 1792,40 KiB** (bütçe 3 MiB).
`main` ile **birebir aynı** — `connection()` yolu +45,4 KiB getirdiği için
geri alındı.

### Elle yapılması gerekenler

- [x] **Cloudflare panelinde Workers Builds bağlantısı söküldü** (Workers →
      randevu → Settings → Builds), 7 Eylül 2026. `TODOS.md > Faz H2`'de zaten
      önerilmişti; bu faz **aciliyetini artırmıştı**: o pipeline branch başına koşuyor
      ve production'a deploy etmekten alıkoyan tek şey eksik env variable'ıydı — bu faz
      o kazayı ortadan kaldırdı, yani söküm koddan önce gelmek zorundaydı.

      **Nasıl doğrulandı (ampirik, çünkü CLI'dan okunamıyor):** `wrangler` bu
      config'i göstermiyor ve GitHub App kurulum listesi kullanıcı
      token'ına kapalı. Bu branch'in push'undan sonra Cloudflare'de **ne yeni
      version ne yeni deploy** belirdi (son ikisi de 7 Eylül 12:41Z, PR #34
      merge'ünden), commit'te Cloudflare'e ait **check run yok**.

      **Yanıltıcı görünen şey:** commit'te `cloudflare-workers-and-pages`
      adında `queued` bir check *suite* duruyor. Bu bir build DEĞİL — GitHub,
      kurulu her App için boş bir suite açıyor; aynı listede `render`, `vercel`
      ve `claude` de var. GitHub App hesap genelinde kurulu kalmaya devam
      ediyor (başka projelere hizmet ediyor olabilir); sökülen şey o App değil,
      bu Worker'a bakan **Builds bağlantısı**.

---

## Faz P2 — `/saglik` schema kontrolü (PR #36)

**Kapandı:** `/saglik` artık "Postgres ayakta" demiyor, "schema uygulamanın
beklediğiyle uyumlu" diyor. Faz L3'ün gösterdiği boşluğu kapatıyor: 200 dönmesi
schema kanıtı değildi, `hizmet` tablosuna `hizmet_id` FK'sinden farklı bir kolon
eklenip drift yaşanabiliyordu.

### Dört kontrol, tek gidiş-dönüş

- **Kolon kümesi** — `src/db/sema.ts`'ten `getTableConfig`/`PgTable` ile
  RUNTIME'da türetiliyor, elle yazılmış bir tablo/kolon listesi YOK. Yeni bir
  kolon eklendiğinde kimsenin ikinci bir yeri güncellemesi gerekmiyor.
- **Migration sayısı ve son migration zamanı** — `drizzle.__drizzle_migrations`, **DEĞİL**
  Supabase CLI'ın `supabase_migrations` tablosu (TODOS.md > Faz L3'te bu ayrım
  zaten yazılıydı, burada tekrar doğrulandı: test DB'de yalnızca `drizzle`
  schema'sı var). Beklenen sayı `drizzle/meta/_journal.json`'dan **build
  time'da** gömülüyor (`resolveJsonModule`); `drizzle-kit generate` her
  koştuğunda kendiliğinden senkron kalıyor.
- **Çakışma constraint'i** (INVARIANT 8) — `randevu_cakisma_yok`, `contype = 'x'`
  şartıyla. Bu şart olmadan aynı adla bir CHECK constraint'i de "constraint var" diye
  geçerdi; test bunu ayrıca kilitliyor.

**Yön önemli, ters çevrilirse yanlış:** eksik kolon = **bozuk**, fazla kolon =
**sağlıklı**. İkincisi doğru migration sırasının (`docs/yayin.md`: önce migration, sonra
deploy) normal ara durumu — hata sayılsaydı doğru davranış cezalandırılırdı.

### Public body daraltılmış

`/saglik` ve yeni `/api/saglik` (makine yolu, 200/503) **aynı filter'dan**
geçiyor: `kamuyaAcilanYoklama()`. Kamuya yalnızca `durum`, `surum`, `sureMs`,
`goc` gidiyor. **Eksik kolon adları ve constraint durumu GİTMİYOR** — INVARIANT 8'in
kendi ifadesiyle "uygulama layer'ı garanti değil"; "constraint yok" cümlesi
saldırgana tam olarak neyin savunmasız olduğunu söylerdi. Sebep yalnızca
`uretimMi()` false iken (local, `wrangler dev`, CI, vitest) sayfada gösteriliyor
— geliştirme teşhisi zayıflamıyor.

**"Tablo adları zaten secret değil" argümanı burada geçerli değildi, bilerek
kullanılmadı:** repo public, `drizzle/*.sql` GitHub'da tam metin duruyor. Ama
gerçek risk isim değil **drift bilgisi** — "constraint düştü" cümlesi TOCTOU
penceresinin açık olduğunu doğrudan söyler.

### `/api/saglik` neden ayrı, `/saglik` sayfası neden yetmiyordu

HTML sayfa durum kodu taşımıyor; deploy sonrası bir `curl -f` bunu tek satırda
okuyamaz. Yeni route GET (mutation yok, INVARIANT 2 kapsamı dışında),
`Cache-Control: no-store`, `robots.ts`'in `/api/` kuralı zaten kapsıyor.

### Test dosyası INVARIANT 1'e nasıl uyuyor

`src/app/api/saglik/saglik.test.ts` `@/lib/db`'yi **import edemiyor** —
`iptal.test.ts` ve `randevu.test.ts`'teki emsalin aynısı: havuz kapatılmıyor
(`baglantiyiKapat` `@/lib/db`'de), `globalThis` üzerinde yaşıyor,
`fileParallelism: false` olduğu için `src/lib` altındaki testler kendi
`afterAll`'larında kapatması yetiyor. "Bozuk → 503" branch'i bu dosyada DB'yi elle
bozamadığı için **metin** olarak doğrulanıyor (`route.ts`'teki ternary'nin
varlığı); davranışsal kanıt `src/lib/saglik.test.ts`'te.

### Bilerek kapsam dışı

- **Deploy sonrası smoke test ve zamanlanmış health check.** `/api/saglik` artık var,
  ikisi de ona bağlanabilir — ayrı PR, çünkü bu PR merge olup canlıda
  görünmeden `ci.yml`'e bir smoke test adımı eklemek ilk günü kırmızıya düşürür
  (endpoint canlıda yok).
- **Uyarı/hata takibi** (tek error gate + `onRequestError`) — Faz P2'nin
  ayrı maddesi, bu PR'ın konusu değil.
- **`bildirim_kuyrugu` başarısız mail counter'ı.** Gerçek bir boşluk
  (`/panel/gelistirici/bildirimler` production'da 404) ama bu bir *iş* sinyali,
  *sağlık* sinyali değil.
- **Migration `hash` doğrulaması** (`drizzle.__drizzle_migrations.hash` ile
  `.sql` dosyalarının karşılaştırılması). Drizzle'ın kendi karşılaştırması
  yalnızca `created_at` sırasına bakıyor, yani uygulanmış bir migration dosyası
  sonradan düzenlense kimse görmez — gerçek risk ama `.sql` metinlerini bundle'a
  gömmek ya da codegen adımı gerektiriyor, ayrı iş.
- **Deploy öncesi schema gate'i** (`_journal.json` ↔ prod karşılaştırıp deploy'u
  durduran adım). Bu PR'ın **sonrası**: `SUPABASE_DB_URL`'i deploy job'ına sokmak
  demek ve o secret bugün bilerek yalnızca `goc` job'ında.

### Elle doğrulandı — 7 Eylül 2026

- [x] `npm run dev`, constraint yerindeyken `/saglik` → "saglikli", `/api/saglik` →
      200
- [x] Dev DB'de `randevu_cakisma_yok` elle düşürüldü → `/api/saglik` **503**,
      `/saglik` sayfasında "bozuk" + eksik kolon/kısıt teşhisi (yalnızca
      geliştirmede), constraint geri eklendi ve `/api/saglik` **200**'e döndü
- [x] `npm test` — 716 test geçti (main'e göre +14)

### Bundle bütçesi

`cf:kur` + `wrangler deploy --dry-run`: **gzip 1859,17 KiB** (bütçe 3 MiB).
P2a sonundaki 1792,40 KiB'den **+66,77 KiB** — `getTableConfig`/`PgTable`
içe aktarımı ve gömülü `_journal.json`.

---

## Faz P2 — şifre sıfırlama (PR #37)

**Kapandı:** Bugüne kadar hiç olmayan akış geldi. Şifresini unutan kullanıcı
artık `kullanici_auth_user_id`'nin tekilliği yüzünden kalıcı kilitlenmiyor.
Planın "bugünkü en pahalı boşluk" dediği madde.

### `token_hash` + `verifyOtp`, PKCE `?code=` DEĞİL

`@supabase/ssr` PKCE akışını zorluyor ve `resetPasswordForEmail` bir
`code_verifier`'ı **cookie'ye** yazıyor. Mail telefonda Gmail uygulamasının
**kendi iç tarayıcısında** açıldığında o cookie orada yok ve akış sessizce
ölüyor — hedef kitle telefondan geliyor (`docs/plan.md`), yani bu marjinal
değil baskın durum. `token_hash` cihazdan bağımsız; `/sifre-yenile` sayfası
GET'te **hiçbir doğrulama yapmıyor, session açmıyor** — iki ayrı gerekçeyle:
kurumsal mail tarayıcıları (Outlook SafeLinks) link'i kullanıcı
tıklamadan kendileri açıyor, ve doğrulamak linki açan **herkese** session
verirdi. Asıl doğrulama yalnızca `POST /api/sifre/yenile`'de, "Şifreyi
güncelle"ye basıldığında.

### `signOut({ scope: "others" })` — `/api/cikis`'in BİLEREK TERSİ

`/api/cikis` `scope: "local"` kullanıyor çünkü kullanıcı yalnızca o
tarayıcıdan çıkmak istiyor. Sıfırlama "hesabımın kontrolünü kaybettim" yolu;
diğer cihazlardaki yenileme token'larını ayakta bırakmak akışın amacını boşa
çıkarırdı. İki kararın yan yana okunduğunda çelişki gibi görünmesin diye
buraya yazılıyor.

### `girisYonu` ortak helper'a çıkarıldı

`/api/giris` ve `/api/sifre/yenile` **aynı üçlü kararı** veriyor (kayıtsız →
`/kayit/tamamla`, MÜŞTERİ → `/randevularim`, diğeri → `devam` ya da `/panel`).
`src/lib/auth.ts > girisYonu` — tek yerde tutulmazsa bir gün ayrışıp
müşteriyi panele düşürürlerdi. Bugüne kadar `/api/giris`'in içine gömülü
olduğu için hiç test edilemeyen bu branch artık saf fonksiyon, `src/lib/auth.test.ts`.

**Yan bulgu — gerçek bir tip boşluğu:** `girisYonu`'nun parametre tipini
`Awaited<ReturnType<typeof kullaniciyiYukle>>` olarak yazınca `null` geçmek
tip hatası verdi. Sebep: `noUncheckedIndexedAccess` kapalı, yani
`const [kayit] = await db.select()...` tek başına `kayit`i HER ZAMAN dolu
sayıyor ve `kayit ?? null` sessizce `T | null`den `T`ye daralıyor.
`kullaniciyiYukle`'nin dönüş tipi artık açıkça `Promise<KullaniciKaydi | null>`
yazılı. Bu boşluk repo'daki her `const [x] = await db.select()...` pattern'ında
var olabilir — bilerek geniş taranmadı, yalnızca burada düzeltildi.

### Kullanıcı numaralandırma (enumeration) yok

`/api/sifre/sifirla` her durumda **tek response**: kayıtlı adres, kayıtsız
adres, kayıtlı ama `kullanici` satırı olmayan hesap — üçü de aynı ekrana
gidiyor. `resetPasswordForEmail` **koşulsuz** çağrılıyor; kendi tablomuzda ön
kontrol yapılmıyor çünkü (a) response süresini hesabın varlığına göre ayırıp
zamanlama kanalı açardı, (b) kaydı yarım kalmış biri sıfırlama hakkını
kaybederdi. `/api/sifre/yenile` de tek mesaj: geçersiz, süresi dolmuş,
kullanılmış token — üçü de "geçersiz ya da süresi dolmuş" diyor.

### INVARIANT 4 ihlal edilmiyor, ama farklı bir yoldan

Bu tek mail **Resend/`email.ts`'ten geçmiyor** — Supabase'in kendi
mailer'ından çıkıyor. `degismezler.test.ts`'in `api.resend.com` taraması bu
yüzden etkilenmiyor. Reddedilen alternatif: `admin.generateLink` ile
link'i üretip markalı maili `email.ts`'ten göndermek — bedeli
`service_role` key'ini Worker'a sokmak, kazanç yalnızca marka tutarlılığı.

### `/giris`'e üçüncü link DEĞİL, şifre kutusunun yanına

"Şifremi unuttum" `KimlikKabugu`'nun `alt` dizisine eklenmedi: `/giris` orada
zaten iki çıkış taşıyor (Faz P kararı, müşteri/işletme ayrımı) ve üçüncüsü o
çatalı bulanıklaştırırdı. Link şifre etiketinin yanında.

### Elle yapılan (kod dışı)

- [x] Supabase custom SMTP kuruldu (Resend, `bildirim@randevu.enesmemduhoglu.tech`).
- [x] **Mail şablonu değiştirildi — 13 Eylül 2026**, Management API
      (`PATCH /v1/projects/<ref>/config/auth`) ile. Link
      `{{ .SiteURL }}/sifre-yenile?token_hash={{ .TokenHash }}&type=recovery`.
      Konu ve metin de Türkçeye çevrildi ("Şifrenizi yenileyin"); o güne
      kadar Supabase'in İngilizce varsayılanıydı. Geri okunarak doğrulandı.
      Bu repo dışında yaşayan bir ayar, hiçbir test onu göremiyor.
      Değiştirilmeden linkler Supabase'in kendi `/verify` ucuna düşüyordu ve
      `token_hash` hiç gelmiyordu.
- [x] E-posta OTP/recovery süresi **zaten 3600 sn** (1 saat). 13 Eylül'de
      okunduğunda öyleydi; bu satır ne zaman değiştiği bilinmeden açık kalmıştı.
- [x] Auth rate limit'ler okundu, **varsayılanlarında bırakıldı** (13 Eylül):
      e-posta gönderimi saatte 30, doğrulama 30, OTP 30, anonim kullanıcı
      30, token yenileme 150. Kullanıcı yokken ölçülecek bir yük yok. Faz Q
      (kalkan 2) bunlara dokunmadı; lansmandan önce yeniden bakılmalı.
- [ ] **End-to-end henüz denenmedi:** gerçek bir kutuya sıfırlama maili
      isteyip link'in `/sifre-yenile?token_hash=` ile açıldığını ve yeni
      şifreyle girişin çalıştığını görmek.

### Elle doğrulandı — 7 Eylül 2026

- [x] `POST /api/sifre/sifirla`, kayıtsız adresle → 200, aynı sabit response
- [x] `POST /api/sifre/sifirla`, production demo hesabıyla → 200 (gerçek Supabase
      Auth'a gidiyor — local `.env` de aynı bulut projesine bağlı, yalnızca
      DB ayrı). **Mail teslimi doğrulanamadı** — şablon henüz `token_hash`
      biçimine geçmedi (yukarıdaki elle iş).
- [x] `/sifremi-unuttum`, `/sifremi-unuttum/gonderildi`, `/sifre-yenile`,
      `/sifre-yenile?token_hash=...` → hepsi 200
- [x] `/giris`'te "Şifremi unuttum" link'i görünüyor
- [x] `npm run tip && npm run lint && npm test && npm run build` temiz —
      750 test geçti

### Bilerek kapsam dışı

- **Session içi şifre değiştirme** (`/panel/ayarlar`). Ayrı akış: mevcut
  şifreyi sormak ve yeniden authentication gerektiriyor.
- **Markalı sıfırlama maili** (`email.ts` üzerinden). `service_role`
  key'ini Worker'a sokmayı gerektiriyor.
- **`/api/sifre/yenile`'ye ek local rate limit.** Bilerek yok: yeni şifresini
  birkaç kez zayıf giren meşru kullanıcı, bir saatlik tek token'ıyla
  kilitlenmesin.
- **`/api/sifre/sifirla`'ya Turnstile eklendi** (kapsam dışı değil, bu PR'a
  girdi) — `/api/randevu` ile aynı gerekçe, mail gönderim kotasını korumak.

### Bundle bütçesi

`cf:kur` + `wrangler deploy --dry-run`: **gzip 1869,43 KiB** (bütçe 3 MiB).
P2b sonundaki 1859,17 KiB'den **+10,26 KiB**.

## Düzeltme — dizin filtresi temizlenmiyordu (PR #38)

`/dizin`'de "Filtreleri temizle" link'i yalnızca arama kutusunu
boşaltıyordu; İl ve Kategori kutuları eski seçimde kalıyordu.

### Sebep: `defaultValue` bir kez uygulanıyor

Filtre formu bilerek kontrolsüz ve JavaScript'siz (gerekçesi
`dizin-filtresi.tsx` başlığında). React `defaultValue`'yu yalnızca bağlanma
anında uyguluyor. "Filtreleri temizle" aynı sayfaya **yumuşak geçiş** yaptığı
için React aynı DOM düğümlerini koruyordu:

- `<input>`, kullanıcı yazmadıysa React'in güncellediği `value` niteliğini
  alıyor → arama kutusu temizleniyordu
- `<select>` için `defaultValue` güncellemede hiç yeniden uygulanmıyor →
  il ve kategori duruyordu

Tutarsızlık yanıltıcıydı: ekranda duran o iki filtre "Ara"ya basıldığında
gerçekten gönderiliyordu.

### Karar: kontrollü kutu değil, forma `key`

Kutuları kontrollü yapmak formu client component'ine çevirirdi ve dosyanın kendi
gerekçesini (yavaş bağlantıda çalışan, paylaşılabilir URL üreten düz GET formu)
bozardı. Bunun yerine forma URL filtrelerinden türetilen bir `key` konuldu:
filtre değişince React formu baştan kuruyor, bütün alanlar server'ın söylediği
değerle geliyor. Çözüm server component'inde kalıyor.

### Otomatik test yok — bilerek

Vitest bu repo'da `environment: "node"` ve `include` yalnızca `src/**/*.ts`;
`.tsx` component testi altyapısı hiç yok. Hata React'in DOM uzlaştırmasında
yaşıyor, yani ancak bir tarayıcı/jsdom render'ıyla yakalanabilirdi — o altyapıyı
tek bir düzeltme için kurmak bu PR'ın kapsamı değil. Elle doğrulandı.

### Elle doğrulandı — 8 Eylül 2026

- [x] `/dizin?il=Bursa&kategori=Kuaför&arama=saç` → üç kutu da dolu
- [x] "Filtreleri temizle" → URL `/dizin`, arama boş, "Tüm iller",
      "Tüm kategoriler"
- [x] `npm run tip && npm run lint && npm test` temiz — 750 test geçti

---

## Faz P2 — smoke test ve health check

**Kapandı:** Deploy pipeline artık "Worker yüklendi"de değil "Worker çalışıyor"da
bitiyor, ve canlı site deploy anı dışında da yoklanıyor. PR #36'nın "bilerek
kapsam dışı" bıraktığı madde; o gün ayrı tutulmasının sebebi `/api/saglik`'in
canlıda henüz olmamasıydı.

### Tek script, iki çağıran

`scripts/duman.ts`: `/api/saglik` 200 dönene kadar 12 × 5 sn dener, ardından
`/`, `/dizin`, `/giris`, `/isletmeler-icin`, `/saglik`'in **redirect'siz**
200 döndüğüne bakar. `yayinla` job'ının son adımı ve `nabiz.yml` aynı script'i
çağırıyor. **Bağımlılığı yok** (node'un `fetch`'i): health check job'ı `npm ci` koşmuyor,
sparse checkout ile yalnızca bu dosyayı çekiyor.

Redirect takip edilmiyor, çünkü `/giris`'e ya da bir hata sayfasına atan
bir yol "200 geldi" diye geçmemeli.

### Version id — eski version'ın 200'ü yeni deploy'un kanıtı değil

Deploy'dan hemen sonra gelen 200'ü henüz yerini bırakmamış eski version da
verebilir. Version id olmadan smoke test kırık bir deploy'u birkaç saniyelik
pencerede "sağlıklı" geçirebilirdi — ve testin tek işi tam olarak o deploy'u
yakalamak.

- `wrangler.jsonc > version_metadata` → `SURUM` binding'i
- `src/lib/surum.ts > workerSurumu()` — Cloudflare context'i yoksa `null`
- `/api/saglik` kimliği **body'ye değil** `X-Worker-Surum` başlığına koyuyor:
  kamu body'sinin key kümesi `saglik.test.ts`'te kilitli ve bu alan sağlık
  bilgisi değil. Context yokken başlık **hiç gitmiyor** (boş değer değil) —
  testte kilitli.
- CI kimliği `wrangler deployments status --json`'dan okuyor ve yalnızca
  `%100` trafik taşıyan version'ı kabul ediyor. **JSON'un tamamı basılmıyor:**
  içinde deploy'u yapanın e-postası (`author_email`) var ve repo public.
- Boş bir `--surum` sessizce version'sız kontrole düşmüyor, script 2 ile çıkıyor —
  yoksa kimlik okunamadığında smoke test eski davranışa dönüp yeşil yanardı.

Kimlik opak bir uuid; secret değil.

### Otomatik geri alma BİLEREK yok

Smoke test kırmızıysa deploy çıkmış demektir. `wrangler rollback` otomatik
koşmuyor, çünkü en olası kırmızı sebebi schema (`/api/saglik` → 503) ve schema
bozuksa eski kod da bozuk çalışır — geri alma yalnızca belirtiyi saklardı.
Karar insana bırakıldı; komut `docs/yayin.md`'de.

### Health check: 30 dakika, üçüncü parti yok

Planın zaten koyduğu karar: repo public, zamanlanmış Actions ücretsiz, başarısız
run bildirim gönderiyor. 30 dakika seçildi, daha sık değil: site düştüğünde
saatte dört ayrı bildirim yeterince gürültü.

GitHub'ın iki bilinen davranışı `nabiz.yml` başlığında yazılı: zamanlanmış
run'lar gecikebiliyor, ve **public repo'da 60 gün hareket olmazsa zamanlanmış
workflow'lar kendiliğinden kapanıyor.** Bildirim cron satırını en son
değiştirene gidiyor.

### Bilerek kapsam dışı

- **`/r/<slug>` smoke test listesinde yok.** Plan onu da sayıyordu, ama production'da
  sabit, silinmeyeceği garanti bir işletme yok (bugün 2 işletme, 0'ı dizinde).
  Script'e gömülü bir slug, o işletme kapandığı gün deploy'u kırmızıya düşürür.
- **Uyarı/hata takibi** (tek error gate + `onRequestError`) — P2'nin son
  maddesi, ayrı PR.
- **Health check'in Supabase'i uyanık tuttuğu** — `/api/saglik` her run'da gerçek bir
  query atıyor, yani free tier'ın "bir hafta hareketsiz" duraklatmasını
  muhtemelen engelliyor. **Ölçülmedi**, bu yüzden plandaki risk satırı
  kapatılmadı.
- **Deploy öncesi schema gate'i** — PR #36'daki gerekçe aynen geçerli
  (`SUPABASE_DB_URL` deploy job'ına girmiyor).

### Elle doğrulandı — 11 Eylül 2026

- [x] Canlıya karşı version'sız: `/api/saglik` 200 (`goc 6/6`), beş sayfa 200,
      çıkış 0
- [x] Canlıya karşı yanlış `--surum`: 12 denemede kırmızı, çıkış 1; olmayan
      adres (404) kırmızı; argümansız çağrı çıkış 2
- [x] `cf:onizle` (workerd): `X-Worker-Surum` geliyor, request'ler arasında sabit;
      script o kimlikle çıkış 0
- [x] `cf:onizle`: test container'ı durdurulunca `/api/saglik` **503**, geri
      açılınca 200
- [x] CI adımındaki satır içi JS kabuksuz test edildi: normal çıktıdan yalnızca
      kimlik çıkıyor, kademeli deploy'da (%60/%40) ve bozuk JSON'da çıkış 1
- [x] `npm run tip && npm run lint && npm test` temiz — 750 test, 54 dosya

### Merge sonrası bakıldı — 11 Eylül 2026

- [x] İlk `yayinla` run'ında smoke test adımı yeşil (run 34535080337).
      **Version karşılaştırmasının gerekli olduğu ilk run'da görüldü:** deneme 1
      hâlâ trafik taşıyan ESKİ version'a denk geldi (başlık yok, `surum=-`), bir
      sonraki deneme yeni version'ı gördü. Kimlik karşılaştırması olmasaydı ilk
      200 yeni deploy'un kanıtı sayılacaktı. Log'da e-posta yok.
- [x] Elle tetiklenen ilk health check yeşil (run 34535481109) — GitHub
      koşucusundan gelen request Cloudflare'in bot kurallarına takılmadı

### Bundle bütçesi

`cf:kur` + `wrangler deploy --dry-run`: **gzip 1869,57 KiB** (bütçe 3 MiB).
P2c sonundaki 1869,43 KiB'den **+0,14 KiB**.

---

## Faz P2 — hata takibi

**Kapandı:** Production'da bir request patladığında artık birisi duyuyor. Teknik borç
maddesi 3'ün (*"log düşüyor ama uyarı çıkmıyor ve kimse panele bakmıyor"*) son
yarısı; `/saglik`'in schema kontrolü P2b'de, health check P2d'de kapanmıştı. P2'nin son
maddesi.

### Tek gate: `src/lib/hata.ts > hataBildir(kaynak, hata)`

`email.ts > gonder()` pattern'ının hata yolundaki karşılığı — TODOS'un kendi
cümlesi: *"filter tek bir gate'ten geçmeli"*. İki yerden çağrılıyor:

- `src/instrumentation.ts > onRequestError` — `catch` görmeyen her hata
  (route handler, server component'i, server action)
- Kendi `catch`'i olan dört yol (`kayit`, `kayit/tamamla`, `uye-ol`,
  `uye-ol/tamamla`). Önceden sabit bir `console.error` metni basıyorlardı ve o
  satır hiçbir şeye sayılmıyordu.

İki çıkışı var: `console.error` ile tek satır JSON (Workers Logs — "ne oldu")
ve `HATA` binding'i ile Analytics Engine'e bir veri noktası ("kaç tane").
`degismezler.test.ts` `console.error`'un ve `writeDataPoint`'in `src` altında
başka yerde geçmesini yasaklıyor.

### Gate MESAJ TAŞIMIYOR — neden pattern'la temizlemek değil

Drizzle'ın `DrizzleQueryError`'u mesaja query'nin **parametrelerini** ekliyor
(`params: ali@ornek.com,0555...`). Mesajı bir pattern listesiyle temizlemek
mümkündü ama liste bir gün eksik kalır; mesajın hiç alınmaması eksik kalmaz.
Taşınanlar: kaynak, tür, Postgres kodu (network hatalarında `ECONNREFUSED` gibi Node
kodu), constraint adı, React'in `digest`'i. Ayrıntı kaybolmuyor — Next aynı hatayı
kendi satırına basıyor ve `digest` ikisini eşleştiriyor (ama bkz. aşağıdaki
bulgu).

Kaynak route'un **dosya yolu** (`route /api/musaitlik`, `render /dizin`),
request'in yolu değil: `istek.path` query dizesini taşıyor ve iptal token'ı,
`token_hash` orada; `istek.headers` session cookie'sini taşıyor.

### Neden veritabanı değil, neden log query'si değil

- **Veritabanı:** en olası hata veritabanının kendisi (Supabase duraklatıldı,
  Hyperdrive connection'ı kaybetti). Hatayı DB'ye yazan gate tam o anda düşerdi.
  Üstelik schema migration'ı gerektirirdi.
- **Workers Logs query'si:** log satırını metinle aramak, satırın biçimi
  değiştiği gün sessizce **sıfır** döndürür ve health check yeşil yanar. Analytics
  Engine'de counter ayrı bir kayıt; SQL API tek satır query ve tek okuma izni.
  Ücretsiz planda günde 100 bin yazma, 10 bin query — health check günde 48 query.

### Uyarı kanalı: health check'in ikinci adımı

`scripts/hata-say.ts` son **60 dakikadaki** hataları sayıyor, sıfırdan büyükse
1 ile çıkıyor; başarısız run bildirim gönderiyor. Smoke test kırmızıyken de koşuyor
(`!cancelled()`) — iki sinyal birbirinin yerini tutmuyor.

- **Pencere > aralık, bilerek.** GitHub zamanlanmış run'ları geciktiriyor;
  pencere 30 dakika olsaydı iki run arası 30'u aştığında aradaki hatalar
  hiç sayılmazdı. Bedeli: aynı hata iki run'da görünür.
- **Eşik sıfır.** Her server hatası bir bildirim. Gürültü çıkarsa eşik o gün
  ölçülerek konur — bugün gürültünün ne olacağı bilinmiyor.
- **Public log'a yalnızca toplam basılıyor.** Hangi route'un patladığı P2b'deki
  gerekçeyle (drift bilgisi saldırgana harita) basılmıyor; ayrıntı Workers
  Logs'ta.
- **Ayrı, yalnızca okuyan token** (`CLOUDFLARE_ANALIZ_TOKENI`, Account
  Analytics Read). Deploy token'ı otuz dakikada bir koşan bir işe girmiyor.
- **Token yoksa 2 ile çıkıyor, sessizce geçmiyor** — Faz L'deki
  `TURNSTILE_MODU` dersi.
- `console.warn` sayılmıyor: `turnstile.ts`'teki uyarı bot denemesinin izi,
  uygulama hatası değil.

### `cf:onizle`'de ölçülenler — iki varsayım yanlış çıktı

Test container'ı durdurularak `/dizin` (render) ve `/api/musaitlik` (route)
500'e düşürüldü, local workerd'in log'u gözlem API'sinden okundu:

- `onRequestError` workerd'de **tetikleniyor** — OpenNext instrumentation
  dosyasını statik `require`'a çeviriyor. `routePath` pattern olarak geliyor
  (`/dizin`, `/api/musaitlik`), `render` hatasında `digest` dolu.
- **`constructor.name` → `"a2"`.** Worker bundle'ında sınıf adları küçültülüyor.
- **`instanceof DrizzleQueryError` → tutmadı.** Bundle'da sınıfın birden fazla
  kopyası var. Tür artık biçimden tanınıyor (`query` metni + `params` alanı);
  ölçümde iki yol da `DrizzleQueryError` verdi.
- `HATA` binding'i local'de de bağlanıyor (`Analytics Engine Dataset local`).

### `tsconfig > moduleDetection: "force"`

`scripts/hata-say.ts` ile `scripts/duman.ts`'in ikisinde de import yok;
TypeScript onları tek küresel kapsamda görüp aynı adlı sabitlerde hata verdi.
`export {}` eklemek çare değildi (ölçüldü): Node dosyayı ESM olarak yeniden
ayrıştırıyor, her run'da uyarı basıyor ve Windows'ta üst seviye
`process.exit` libuv assertion'ına düşüyor. Runtime değil compiler
ayarı değişti.

### BULGU — Next'in kendi hata satırı query parametrelerini taşıyor

Ölçüm sırasında görüldü: Next yakalanmamış hatayı kendi `console.error`'uyla
da basıyor ve Drizzle'ın mesajını olduğu gibi yazıyor —
`Failed query: select ... from "isletme" where "slug" = $1 ... params: yok,true,1`.
Parametre ziyaretçinin yazdığı slug'dı; aynı satır bir e-posta, telefon ya da
**ham iptal token'ı** da taşıyabilir (`randevu.iptal_token` query'ye düz
giriyor, `musteri-db.ts` ve `scoped-db.ts`).

Bu PR'ın gate'i temiz; leak Next'in varsayılan log'unda ve bu faz öncesinden
beri var. Log hesaba özel ve ücretsiz planda üç gün tutuluyor, yani ciddiyeti
orta-düşük — ama INVARIANT 5'in lafzına aykırı. **Ayrı iş**, çünkü çözümü
başka bir konu: ya DB layer'ında Drizzle hatasını parametresiz bir hataya
çevirmek, ya da Next'in log'unu susturmak. İkisi de ölçülmeden seçilmemeli.

> **Kapandı — 15 Eylül 2026** (`Faz P2 — log'daki query parametreleri`, en
> sonda): ölçüldü, kaynakta düzeltildi.

### Bilerek kapsam dışı

- **Next'in log satırındaki parametreler** — yukarıdaki bulgu, ayrı iş.
- **Tarayıcı hataları.** `onRequestError` yalnızca server. Client component'inde
  patlayan bir şey sayılmıyor; `error.tsx`/`global-error.tsx` bu repo'da yok.
- **`bildirim_kuyrugu` başarısız mail counter'ı** — PR #36'daki gerekçe aynen:
  bu bir iş sinyali, sağlık sinyali değil.
- **Hangi route'un patladığını bildirimde göstermek.** Public log'a basılmıyor;
  özel bir kanal (e-posta) üçüncü parti ya da secret demek.

### Elle doğrulandı — 11 Eylül 2026

- [x] `cf:onizle`, DB kapalı: `render /dizin` ve `route /api/musaitlik` gate'ten
      geçti, tür `DrizzleQueryError`, log satırında query metni ve parametre yok
- [x] `hata-say.ts` token'sız çıkış 2; `duman.ts` argümansız hâlâ çıkış 2 ve
      uyarısız (moduleDetection değişikliğinden sonra)
- [x] `npm run tip && npm run lint && npm test` temiz — 767 test, 55 dosya
      (P2d'ye göre +17)

### Merge öncesi elle iş — yapıldı, 11 Eylül 2026

- [x] Cloudflare'de yalnızca **Account Analytics Read** izinli token,
      GitHub'a `CLOUDFLARE_ANALIZ_TOKENI` secret'ı
- [x] **Analytics Engine hesapta etkinleştirildi.** Branch'te koşulan ilk health check
      (34541249091) `API 403 - Authorization error` verdi: token doğruydu,
      özellik hesapta kapalıydı. Topluluk bildirimlerine göre aynı durumda
      `HATA` binding'li bir deploy da `403 [10089] "You need to enable
      Analytics Engine"` ile düşüyor — **ölçmeden merge edilseydi merge anı
      kırık bir deploy anı olurdu** (deploy pipeline'da approval gate yok). Bu kısım
      topluluktan, bizde ölçülmedi.
- [x] Etkinleştirmeden sonra health check branch'te yeşil (34604357887): SQL API
      dataset **henüz yokken hata dönmüyor, boş sonuç dönüyor** ve script
      bunu "hata yok" okuyor.

Son maddenin bedeli: adı yanlış yazılmış bir dataset de hata vermez, sonsuza
dek sıfır sayar — yani `hata-say.ts > VERI_SETI` ile `wrangler.jsonc >
dataset` ayrışırsa health check kör olur. `degismezler.test.ts` iki adın aynı
olduğunu arıyor.

### Merge sonrası bakılacak

- [x] İlk `yayinla` run'ı yeşil — `HATA` binding'li ilk gerçek deploy
      (CI run'ı 34604897458, 11 Eylül 2026; Faz Q başlarken bakıldı)
- [ ] End-to-end yazma production'da **henüz gözlenmedi**: local'de binding bağlandı
      ve gate çağrıldı, ama Analytics Engine'e düşen ilk veri noktası ilk
      gerçek hatayla görülecek. O gün health check kırmızı olmalı ve Workers Logs'ta
      `olay = "hata"` satırı bulunmalı.

### Bundle bütçesi

`cf:kur` + `wrangler deploy --dry-run`: **gzip 1872,68 KiB** (bütçe 3 MiB).
P2d sonundaki 1869,57 KiB'den **+3,11 KiB**.

---

## Faz Q — kalkan 2

**Kapandı:** Session'sız `POST /api/randevu` yoluna numara değiştiren bota karşı
iki veritabanı tavanı ve panelde bir yoğunluk uyarısı. Faz J'de "misafir
randevusu kalıyor, kalkan ayrı fazda güçlenecek" kararının karşılığı — orada
sayılan dört adımın üçü yapıldı, biri ölçüye dayanarak reddedildi.

### Neden veritabanı, neden kenar değil

Mevcut üç kat numarayı her request'te değiştiren **yavaş** bir script'i görmüyor:
Turnstile token başına maliyet üretmiyor, IP rate limit yaklaşık ve kolo
başına (Faz L'de production'da ilk 429 **22. request'te** geldi), açık randevu sınırı
ve gelmedi kısıtı ise numaraya bağlı. Bu script'i durduracak tek yer yazılan
satırların kendisi. Schema migration'ı gerekmedi: `randevu` ve `musteri` tablolarında
`olusturma_tarihi` zaten vardı.

### İki tavan (`src/lib/randevu-kotasi.ts`)

| Tavan | Değer | Kapattığı delik |
|---|---|---|
| Numara başına, son 24 saatte oluşturulan randevu | 5 | Al → iptal et → yeniden al. Açık sınır (3) hiç aşılmadan takvimde gezinmek ve her turda bildirim üretmek |
| İşletme başına, son 24 saatte çevrim içi randevu alan **yeni** müşteri | 20 | Numara değiştiren script; her request yeni bir müşteri |

Sabitler route'tan ayrı bir dosyada, çünkü panel de aynı tavana bakıyor. İki
yerde iki sabit, panelin "20'ye ulaşırsa" dediği gün gate'in 30'da kapanması
demekti. Açık randevu sınırı (`EN_COK_ACIK_RANDEVU`) da aynı dosyaya taşındı.

### Kararlar

- **Tavan dolunca yeni müşteri REDDEDİLİYOR** (kullanıcı kararı, 13 Eylül
  2026). Üç seçenek konuşuldu: reddet, yalnızca panel uyarısı, tavandan
  sonrasını onaya düşür. Onaya düşürmek işe yaramıyor, çünkü `BEKLIYOR` da
  slotu tutuyor (`EXCLUDE` constraint'inin `WHERE`'i) ve takvim yine doluyor.
  Yalnızca uyarı ise zararı sınırlamıyor. **Bedel bilerek kabul edildi:** bot
  tavanı doldurduğu gün o işletmeye gelen gerçek yeni müşteri de reddediliyor
  ve işletmeyi aramaya yönlendiriliyor. Kayıtlı müşteri etkilenmiyor. Tavan bu
  yüzden cömert (20); hedef kitle çevrim içi yolla günde birkaç yeni müşteri
  kazanıyor.

- **IP rate limit SIKILAŞTIRILMADI** (kullanıcı kararı). Plandaki madde buydu
  ama iki gerekçe tersini söylüyor: Türkiye'de mobil operatörler CGNAT
  kullanıyor, yani çok sayıda gerçek müşteri aynı IP'yi paylaşıyor; ve
  production'daki counter zaten yaklaşık — 5'i 3 yapmak ölçülen davranışı pek
  değiştirmez, CGNAT arkasındaki müşteriyi ise gerçekten etkiler.

- **Pencere veritabanı saatiyle** (`now() - interval '24 hours'`), route'un
  `simdi`siyle değil. Sayılan kolon `defaultNow()` ile Postgres'in saatinden
  yazılıyor; pencere başka bir saatle ölçülse Worker ile Postgres arasındaki
  kayma pencereyi kaydırırdı. L3'te kısıt süresinin `now()` ile hesaplanmasının
  gerekçesiyle aynı.

- **Kayan pencere, takvim günü değil.** Takvim günü işletmenin saat dilimine
  çevirmeyi gerektirirdi (INVARIANT 7) ve gece yarısı counter'ı sıfırlayan bir
  gate script'e tam olarak ne zaman döneceğini söylerdi. Müşteri mesajı bu
  yüzden "bugün" değil "son 24 saatte" diyor; "yarın deneyin" deyip gece
  yarısında yine reddetmek yanlış bir söz olurdu.

- **İptal edilen randevular günlük sayıma GİRİYOR.** Tavanın var olma sebebi
  tam olarak al-iptal et döngüsü.

- **`kaynak: ISLETME` hiçbir tavana girmiyor.** İşletmenin panelden eklediği
  randevu müşterinin kotasını yemiyor; telefonla arayanları deftere geçiren
  işletme de kendi çevrim içi tavanını doldurmuyor. "Yeni müşteri" bu yüzden
  "son 24 saatte oluşmuş VE en az bir `kaynak: MUSTERI` randevusu olan müşteri
  satırı".

- **Yeni müşteri gate'i müşteri satırı YAZILMADAN önce.** Reddedilen request
  transaction'ı hatasız bitiriyor; gate sonra olsaydı commit edilen şey
  randevusu olmayan bir müşteri kaydı olurdu. Testi var: reddedilen numaranın
  satırı veritabanında yok.

- **Günlük sınır açık sınırdan ÖNCE.** İkisi birden dolduysa açık sınırın
  "önce birini iptal edin" mesajı yanlış yol gösterirdi — iptal edilen de
  sayılıyor.

- **Mesajlar sayı ve sebep taşımıyor.** Public yol session'sız; "bu işletme
  bugün 20 yeni müşteri aldı" hem hacmi dışarı verir hem script'e kotasını
  öğretir. Yeni müşteri mesajı işletmenin telefonunu taşıyor — müşterinin
  yapabileceği tek şey aramak. Testler mesajda sayının geçmediğini arıyor.

- **Sayım SERIALIZABLE değil.** Aynı anda gelen request'ler tavanı birkaç kişi
  aşabilir; açık randevu sınırındaki gerekçeyle kabul edildi.

- **İki taraf aynı sayım fonksiyonu** (`cevrimIciYeniMusteriSay`): yazma gate'i
  ve panel. Ayrışsalar panel "sınıra üç kişi kaldı" derken gate çoktan
  kapanmış olurdu.

- **Panel uyarısı yalnızca `/panel` ana sayfasında** ve eşik tavanın yarısı
  (10). Tavan dolmadan başlıyor ki işletme tanımadığı kayıtları iptal edip
  gate'in kapanmasını önleyebilsin. Eşiğin altında hiçbir şey çizilmiyor.
  Düzene konmadı: her panel sayfasına bir query eklerdi ve Next'in dokümanına
  göre düzen sayfalar arası geçişte yeniden çizilmiyor, yani uyarı zaten
  tazelenmezdi. Renk amber (`durum-bekliyor`): tasarım sisteminde "bekleyen
  durum ve uyarı" rengi.

### Kasıtlı ihlalle test edildi

İki mutation denendi, ikisi de yakalandı ve geri alındı: kayıtlı müşteri
muafiyeti kaldırılınca hem gate hem route testi kırmızı; günlük sayımdan
`kaynak` filtresi kaldırılınca "işletmenin elle eklediği randevu kotayı
yemiyor" testi kırmızı.

### Bilerek kapsam dışı

- **İşletmeye özel ayarlanabilir tavan.** Schema migration'ı gerektirir (`isletme`e
  iki kolon) ve bugün hiçbir işletme farklı bir değer istemiyor. Gerçek
  bir işletme 20'ye çarptığında o gün ölçülerek konuşulur.
- **SMS/e-posta koduyla doğrulama.** Faz J'de reddedilen üçüncü seçenek; kod
  üretimi, süre aşımı ve temizlik işi gerektiriyor. SMS Faz K'de.
- **Tavan dolduğunda işletmeye e-posta.** Bildirim altyapısı var ama "tavan
  doldu" olayı için yeni bir şablon ve bir kez gönderme kuralı gerekiyor; panel
  uyarısı bugünkü ölçekte yeterli.
- **Numara başına işletmeler ARASI tavan.** Tenant'lar arası sayım INVARIANT 1'i
  delerdi; tavanlar tenant'a özel (IDOR testleri bunu arıyor).
- **Next'in log satırındaki query parametreleri** (P2e bulgusu) — ayrı iş,
  hâlâ açık.

### Doğrulama

- `npm run tip` temiz, `npm run lint` hata yok (iki uyarı bu işten önce de
  vardı, `panel-randevu-girdi.test.ts`)
- `npm test` — **782 test, 55 dosya** (P2e'ye göre +15): gate layer'ında 13
  (sınır, iptallerin sayılması, 24 saat penceresi, `kaynak` ayrımı, sahipsiz
  müşteri satırı, sıra, iki IDOR, panel sayımı ve IDOR'u), route'ta 2 (gerçek
  tavanlarla 429, mesajda sayı yok, kayıtlı müşteri geçiyor)

### Elle doğrulandı — 13 Eylül 2026 (`next dev`, local `randevu_dev`)

Yeni müşteriler SQL ile değil **gerçek `POST /api/randevu`** ile oluşturuldu
(`isil-guzellik-salonu`, her request ayrı numara).

- [x] 0 yeni müşteride panelde uyarı yok
- [x] 10'da eşik metni ("olağan dışı bir yoğunluk", "Son 24 saatte 10 yeni
      müşteri…"); 20'de tavan metni ("Yeni müşteriler şu anda çevrim içi
      randevu alamıyor")
- [x] Kontrast ölçüldü (canvas ile, koyu temada yarı saydam zemin sayfa
      rengiyle birleştirilerek): açık tema başlık/ikon **5,42:1**, metin
      **15,4:1**; koyu tema başlık **6,49:1**, metin **13,25:1**. Hepsi AA üstü
- [x] 390px (aynı kökenden iframe; medya query'leri iframe genişliğine göre
      çalışıyor): yatay taşma yok, kutu sarıyor
- [x] **Ölçümün bulduğu hata:** "Müşterileri gör" link'i 20px yükseklikteydi,
      tasarım sisteminin 44px dokunma hedefinin altında. `min-h-11` ile
      düzeltildi, yeniden ölçüldü: 98×44
- [x] Müşteri tarafı, 390px formda: 21. yeni numara formun üstünde "Bu
      işletmeden şu anda çevrim içi randevu alınamıyor. Randevu için işletmeyi
      arayabilirsiniz: 0532 123 45 67" gördü; reddedilen numaranın `musteri`
      satırı **oluşmadı**, counter 20'de kaldı
- [x] Aynı formda kayıtlı bir müşterinin numarası tavan doluyken randevu aldı
- [x] Doğrulamanın kayıtları (20 müşteri, 21 randevu, 63 queue satırı) sonra
      local veritabanından silindi

Günlük numara tavanının müşteri ekranı tarayıcıda denenmedi: mesaj aynı
yoldan (server'ın metni olduğu gibi) gösteriliyor ve metnin kendisi route
testinde kilitli.

### Bundle bütçesi

`cf:kur` + `wrangler deploy --dry-run`: **gzip 1873,98 KiB** (bütçe 3 MiB).
P2e sonundaki 1872,68 KiB'den **+1,30 KiB**.

## Faz P2 — health check scheduler

**Kapandı:** Health check'in saati GitHub'dan Cloudflare'e taşındı. Kontroller ve
bildirim kanalı değişmedi.

### Bulgu — `*/30` gerçekte 2–5,5 saatti

P2e'den sonra run'lara bakıldığında görüldü: 10–13 Eylül 2026 arasında
`nabiz.yml`'nin 22 zamanlanmış run'ı arasındaki aralık 2 ile 5,5 saat,
ortalaması ~3 saatti (ör. 13 Eylül 03:36 → 09:08 arasında hiç run yok).
GitHub zamanlanmış run'ları "mümkün olunca" başlatıyor.

İki sonucu vardı:

- **Hata sayımı kördü.** `hata-say.ts`'in 60 dakikalık penceresi "run'lar
  biraz gecikebilir" varsayımıyla seçilmişti. 3 saatlik aralıkta bu, sürenin
  üçte ikisinde çıkan hataların hiç sayılmaması demekti. P2e'nin "pencere >
  aralık" gerekçesi bu yüzden hiç tutmadı.
- **Site çöktüğünde** bu, 30 dakika içinde değil saatler içinde fark ediliyordu.

### Karar — saat Cloudflare'de, kontrol GitHub'da

Worker'ın Cron Trigger'ı 30 dakikada bir `nabiz.yml`'yi `workflow_dispatch`
ile tetikliyor (`worker-girisi.ts > scheduled` → `src/lib/zamanlayici.ts`).
Bu tür run zamanlanmış run gibi ertelenip düşürülmüyor.

**Reddedilen: her şeyi Cloudflare'de yapmak** (kontroller ve uyarı e-postası
Worker'ın içinde). İki sebep:

- Gözcü gözlediği şeyin içinde kalırdı. Worker bozuk deploy edilirse, DNS ya da
  sertifika giderse uyarı da susardı.
- Uyarı kanalını sıfırdan yazmak gerekirdi: `email.ts` üzerinden e-posta ve
  site düştüğünde her 30 dakikada bir mail atmamak için bir "bildirdim"
  durumu. GitHub'ın başarısız run e-postası bunu bedavaya yapıyor.

**Reddedilen: pencereyi "son run'dan bu yana" yapmak.** İlk öneri buydu.
Hata sayımını düzeltirdi ama sitenin saatlerce düşük kalmasını düzeltmezdi;
sorun pencerede değil saatteydi.

### Neden ayrı Worker değil

Plan Faz K'nin hatırlatıcısını "adaptörün iç yapısına bağımlılık" gerekçesiyle
ayrı bir Worker'a koymuştu. OpenNext bu pattern'ı artık belgeliyor
(opennext.js.org/cloudflare/howtos/custom-worker): giriş dosyası üretilen
Worker'ın `fetch`'ini aynen geçiriyor, `scheduled` ekliyor. Ayrı Worker ise
ikinci bir deploy adımı, ikinci bir secret seti ve ikinci bir wrangler dosyası
demekti. `plan.md > Faz K` buna göre güncellendi; hatırlatıcının nerede
duracağı Faz K'nin kararı.

Adlandırılmış export'lar (OpenNext'in Durable Object sınıfları) `export *`
ile geçiyor. Tek tek yazılsaydı OpenNext ileride yeni bir sınıf eklediğinde
burada unutulurdu.

### Sessizce ölemiyor — iki layer

1. **Trigger koşuyor ama başarısız** (token yok, süresi dolmuş, GitHub cevap
   vermiyor): `hataBildir("cron nabiz", ..., env)`. `kod` alanı `JETON_YOK`,
   `HTTP_<durum>` ya da network hatasının türü. Token ve GitHub'ın response body'si
   hiçbir yere konmuyor.
2. **Trigger hiç koşmuyor** (silindi, Worker patlıyor, işlemci sınırı): gate'e
   da yazılamaz. `nabiz.yml`'nin fallback zamanlanmış run'ı (6 saatte bir) son
   `workflow_dispatch` run'ına bakıyor, 90 dakikadan eskiyse kırmızı.

`hataBildir`'e opsiyonel `ortam` parametresi bu yüzden eklendi: counter
`getCloudflareContext`'ten alınıyordu, o da OpenNext'in `fetch`
wrapper'ından geliyor. Cron Trigger o wrapper'dan geçmiyor. Parametre
olmasaydı trigger hatası yalnızca log'a düşer, sayılmazdı. `writeDataPoint` yine
yalnızca `hata.ts`'te.

**Doksan dakika:** trigger 30 dakikada bir, trigger değişikliği Cloudflare'de 15
dakikaya kadar yayılıyor. Tek bir kaçırılmış trigger arıza değil, iki tanesi arıza.

**Fallback neden 6 saat:** fallback'in amacı arızayı hızla duyurmak değil,
scheduler'ın öldüğünü fark etmek. Dakikası 17, çünkü GitHub saat başındaki
yoğunlukta en çok o anı geciktiriyor. Fallback de GitHub'ın saatine tabi; gerçek
aralığı muhtemelen 6 saatten uzun olacak.

### Sınırlar (ücretsiz plan)

Hesap başına 5 Cron Trigger; bu ilki. Zamanlanmış çağrı başına **10 ms
CPU time**. Trigger tek bir `fetch` atıyor ve response beklenirken geçen
süre sayılmıyor. Local'de ölçülemiyor. Aşılırsa çağrı düşer ve 2. layer
yakalar.

### `cf:onizle` ile ölçülenler — 13 Eylül 2026

`wrangler dev --test-scheduled` ile, `/__scheduled` elle tetiklenerek:

- [x] `/`, `/api/saglik`, `/dizin` → 200. `fetch` giriş dosyasından aynen geçiyor
- [x] Token'sız trigger → `{"olay":"hata","kaynak":"cron nabiz","tur":"ZamanlayiciHatasi","kod":"JETON_YOK",...}`
- [x] Sahte token'la trigger **gerçek GitHub'a** gitti → `HTTP_401`. Request
      GitHub'ın authentication'a kadar ulaşıyor (User-Agent ya da biçim
      yüzünden 403/422 değil). Token log'da hiç geçmiyor
- [x] "Zamanlayıcı canlı mı" script'i local'de gerçek repo'ya karşı → son trigger
      3298 dakika önce, çıkış 1
- [x] `npm run tip && npm run lint && npm test` temiz

**Ölçülmedi:** gerçek token'la happy path (204) ve Cron Trigger'ın production'da
kendiliğinden koşması. İkisi de merge sonrası.

### Merge öncesi elle iş

- [x] İnce taneli GitHub token'ı: yalnızca bu repo, yalnızca **Actions: Read and
      write** (`docs/yayin.md > Health check scheduler`) — 14 Eylül 2026
- [x] `wrangler secret put GITHUB_NABIZ_TOKENI` — 14 Eylül 2026, `wrangler
      secret list`'te görüldü. Girilmeden merge edilseydi deploy düşmezdi ama
      trigger her 30 dakikada `JETON_YOK` yazar ve fallback health check kırmızı yanardı.
- [ ] Hesapta başka Cron Trigger var mı (ücretsiz planda 5 hak)

### Merge sonrası bakılacak

- [x] 15 dakika içinde Actions'ta `workflow_dispatch` olaylı ilk Health check run'ı
- [x] Bir gün sonra: tetiklenen run'lar arası gerçekten ~30 dakika mı — 15 Eylül
      2026'da bakıldı: 05:00–14:00 arasındaki run'lar hep :00/:30'da (en fazla
      27 saniye kayma), hepsi yeşil. Tek istisna 11:33'teki run (11:30'unki ~3
      dakika gecikmiş)
- [x] İlk fallback run'da "zamanlayıcı canlı mı" yeşil — 15 Eylül 11:41'deki
      `schedule` run'ı başarılı

### Bilerek kapsam dışı

- **Health check'in kontrollerini değiştirmek.** Smoke test ve hata sayımı aynı.
- **Aynı hatanın iki kez bildirilmesi.** 60 dakikalık pencere ile 30
  dakikalık aralıkta her hata iki run'da görünüyor. Bilerek: kaçırmaktansa
  iki kez duymak (P2e'nin gerekçesi, artık gerçekten geçerli).
- **Next'in log satırındaki query parametreleri** (P2e bulgusu) ayrı iş.

### Bundle bütçesi

`cf:kur` + `wrangler deploy --dry-run`, Faz Q ile birleştikten sonra: **gzip
1877,85 KiB** (bütçe 3 MiB). Faz Q sonundaki 1873,98 KiB'den **+3,87 KiB**
(branch tek başına P2e'nin üstünde de +3,86 ölçülmüştü).

---

## Deployments kaydı geri geldi — 14 Eylül 2026

**Kapandı:** "Approval gate'ler kaldırıldı — 2 Eylül 2026" bölümünde bilerek kabul
edilen ikinci kayıp. Kullanıcı reponun Deployments sekmesini kullanmak istedi;
son kayıt 2 Eylül'deydi, çünkü kaydı açan şey `yayinla` job'ının environment bağıydı.

### `environment:` satırı değil, REST API

Satırı geri koymak tek satırlık iş olurdu ve kaydı GitHub kendisi açardı. Ama
`uretim` environment'ının ayarında zorunlu inceleyici hâlâ duruyor, yani satır gate'i
da geri getirirdi. Gate'i ayardan silmek de 2 Eylül'deki ilkeyi bozardı:
gate'in varlığı yine PR'da görünmeyen bir ayara bağlı kalırdı.

Kayıt `POST /repos/{depo}/deployments` ve `.../statuses` ile açılıp kapatılıyor.
GitHub'ın belgesinde koruma kurallarının API ile açılan deployment'a işlediğine
dair bir şey yok; kurallar environment'a bağlı işler için tanımlı. Bir API çağrısı
zaten bekleyemez: kural işleseydi kayıt adımı düşerdi, deploy değil.

### Ayrıntılar

- **`required_contexts[]` boş dizi.** Verilmezse GitHub commit'in bütün durum
  kontrollerini yeşil istiyor. `yayinla` job'ının kendisi o anda koştuğu için
  request 409 ile dönerdi.
- **`auto_merge=false`.** Ref zaten main'deki SHA; varsayılan `true` main'i
  ref'e birleştirmeyi deniyor.
- **Environment adı `uretim`.** 1–2 Eylül'deki kayıtlar o adın altında, geçmiş
  kesintisiz kalsın.
- **`production_environment` verilmedi** (varsayılan `false`), eski kayıtlarla
  aynı. `auto_inactive` yalnızca production olmayan environment'larda önceki başarılı
  kayıtları `inactive`e çeviriyor, sekmede tek bir aktif kayıt kalıyor.
- **Açıklamada Worker version id.** `wrangler rollback <id>` için gereken
  şey sekmede duruyor. Kimlik opak bir uuid, secret değil (Faz P2).
- **Smoke test kırmızıysa `failure`, ama açıklama "CANLIDA" diyor.** Kırmızı smoke
  test geri alma demek değil; otomatik geri alma bilerek yok.
- **`continue-on-error`.** Kayıt bir gösterge, gate değil.
- **İzin.** Repo varsayılanı `read`. İş düzeyinde `contents: read` +
  `deployments: write`; yeni secret yok.

### Doğrulama

- [x] `actionlint` (shellcheck dahil) üç workflow'da temiz
- [x] `gh api` request'inin body'si var olmayan bir adrese gönderilerek görüldü:
      `required_contexts: []`, `auto_merge: false`
- [x] `degismezler.test.ts` — 93 test (ci.yml'ın taranan bölümü `dogrula`)

**Ölçülmedi:** kaydın gerçekten açılması. `yayinla` PR'da koşmuyor; ilk kanıt
merge sonrası.

### Merge sonrası bakılacak

- [x] Deployments → `uretim` altında merge commit'inin kaydı: `success`,
      açıklamada version id — 15 Eylül 2026'da bakıldı (`surum 54a53413-… -
      duman testi yesil`); ardından gelen iki README commit'i de kayıt açmış
- [ ] **Beklenenden farklı:** merge commit'inin kaydı yeni kayıtlar gelince
      `inactive`e dönmemiş, durum listesinde hâlâ son durum `success`. Yukarıdaki
      `auto_inactive` varsayımı tutmamış olabilir; sekmede birden fazla
      aktif kayıt görünüyorsa sebep bu. Zararsız, bakılmadı
- [x] İki kayıt adımı log'da yeşil. `continue-on-error` bir hatayı yutmuş
      olmasın — son run'da (34787649601) iki adım da `success`
- [ ] "View deployment" link'i siteyi açıyor

### Bilerek kapsam dışı

- **`wrangler rollback`'in sekmeye yansıması.** Rollback elle yapılıyor; kaydı
  da elle güncellemek ikinci bir unutulacak adım olurdu. Kaynak Cloudflare'in
  version listesi (`docs/yayin.md > Deployments kaydı`).
- **Local'den elle deploy'un kaydı.**
- **`uretim` environment'ının ayarları.** Zorunlu inceleyici duruyor ve etkisiz.

---

## Faz P2 — log'daki query parametreleri

**Kapandı:** P2e'nin bulgusu. Next yakalanmamış hatayı kendi log'una basarken
`DrizzleQueryError`'un mesajındaki query parametrelerini de yazıyordu. Bu da
e-posta, telefon ya da ham iptal token'ı demek (INVARIANT 5). Üç fazdır "ayrı iş"
diye bekliyordu. Bununla P2'de açık madde kalmadı.

### Önce ölçüldü — `cf:onizle`, workerd

Geçici bir route ve sayfa (commit edilmedi) üç hata üretti: tip hatası
(`select $1::uuid`, `22P02`), transaction içinde benzersizlik ihlali (`23505`) ve
server component'inde tip hatası. Parametre olarak bir işaret değeri verildi,
log local observability API'sinden okundu.

| | Yamadan önce | Yamadan sonra |
|---|---|---|
| Next'in satırı | `Error: Failed query: select $1::uuid` + `params: GIZLI-…` | `Error: Failed query: select $1::uuid` |
| İşaret değerinin log'da geçme sayısı | 3 hatada 4 kez | **0** |
| Gate'in satırı | `tur: DrizzleQueryError`, `kod`, `kisit` | aynı |

Aynı ölçümün gösterdiği üç şey kararı belirledi:

- **Sızıntı yalnızca mesajda.** workerd `console.error(hata)` için tek satır
  basıyor, `ad: mesaj`. `cause` (Postgres'in `invalid input syntax for type
  uuid: "<girdi>"` mesajı) ve `detail` (`Key (x)=(<değer>) already exists`)
  basılmıyor, stack de basılmıyor.
- **Next log'u `onRequestError`'dan ÖNCE basıyor**
  (`next/dist/server/route-modules/route-module.js > onRequestError`: önce
  `console.error(err)`, sonra instrumentation). Yani mesajı gate'te temizlemek
  mümkün değil, satır o anda çoktan yazılmış oluyor.
- **`instrumentation.ts > register()` workerd'de koşuyor** ve global
  `console.error` sarmalayıcısı Next'in çağrısını görüyor, route'ta da render'da
  da. Aşağıdaki reddedilen seçenek bu yüzden gerçekten uygulanabilirdi.

### Karar — kaynakta: `drizzle-orm` yamalı

`patches/drizzle-orm+0.45.2.patch`, `errors.js` ile `errors.cjs`'te
`DrizzleQueryError` constructor'ının iki satırını değiştiriyor. `postinstall`
önce `patch-package`'i koşuyor. Parametreyi mesaja koyan yer paketin tamamında
yalnızca bu constructor (aranarak doğrulandı).

- **Mesajdaki query metni kaldı.** Hangi query'nin düştüğü hata ayıklamada hâlâ
  okunabiliyor. Metin değer taşımıyor, çünkü Drizzle her değeri `$n` olarak
  geçiyor. Repo'da `sql.raw` yok.
- **`params` silinmedi, sayılamaz yapıldı.** postgres.js'in kendi
  `parameters` alanında yaptığı şeyin aynısı. Nesneyi dolaşan kod (`JSON.stringify`,
  `Object.keys`, inspect) onu görmüyor. `hata.ts` türü biçimden tanıyor
  (`query` + `params` alanı, P2e'de `instanceof` ve sınıf adı ölçülüp elenmişti).
  Alan silinseydi tür sessizce `Error`a dönerdi.
- **İki biçim de yamalı.** P2e bundle'da sınıfın birden fazla kopyası olduğunu
  ölçmüştü. Test ESM ve CJS kopyalarını ayrı ayrı sınıyor.
- **`drizzle-orm` tam sürüme sabitlendi** (`^0.45.2` → `0.45.2`). Yama sürüme
  bağlı. Bu bağı lockfile zaten kuruyordu, `package.json`'da da görünür oldu.
  Drizzle yükseltilirken yama yeniden üretilir.
- **`.gitattributes`: `*.patch text eol=lf`.** Bu makinede `core.autocrlf=true`
  ve yama CRLF ile checkout edilecekti. Ölçüldü: CRLF yama da tutuyor, ama
  `errors.js`'te karışık satır sonu (`CRLF, LF`) bırakıyor. Bu durumda yeniden
  üretilen yamanın diff'i bütün dosyayı değişmiş gösterirdi. CI Linux'ta olduğu için
  orada fark yok.

**Reddedilen: log'da susturmak** (`register()`'da `console.error`
sarmalayıcısı, `hata.ts`'in içinde). Ölçüldü ve çalışıyordu, ama üç sebeple
seçilmedi:

- Yalnızca `console.error`'u kapsıyor. Değer hata nesnesinde kalıyor ve başka bir
  yola (bir response body'si, `console.warn`, yarın eklenen bir logger) taşınabiliyor.
- Global bir monkeypatch. Next'in ya da OpenNext'in `console`'u kendi
  referansıyla tuttuğu gün sessizce devre dışı kalır ve bunu hiçbir şey fark etmez.
- Hatayı tanıyıp yeniden yazmak yine bir biçim tahmini. Kaynaktaki düzeltme
  tahmin gerektirmiyor.

**Reddedilen: iptal token'ını hash'lemek.** Schema migration'ı gerektirir ve yalnızca
token'ı çözer, e-posta ve telefon kalır. Faz tanımı bunu baştan dışarıda
bırakmıştı.

### `hata.test.ts`'in ön koşulu kırmızıya döndü — beklendiği gibi

P2e'nin testi ön koşul olarak *"mesaj GERÇEKTEN kişisel veri taşıyor"* diye
doğruluyordu. Yorumu tam bu günü öngörmüştü (*"Drizzle bir gün bunu
bırakırsa… burada görünsün"*). Yama bunu kırmızıya çevirdi. Gate'in varlık sebebi
artık `cause`'da: fixture Postgres'in gerçek 23505 biçimine (`detail` alanında
değer) çekildi, ön koşul da oraya bakıyor. Gate'in `mesaj taşımıyor` kararı bu
yüzden değişmedi.

### Kasıtlı ihlalle test edildi

`npx patch-package --reverse` ile yama geri alındı: `drizzle-yamasi.test.ts`'in
5 testinin **5'i de** kırmızı. Yeniden uygulanınca yeşil. Temiz bir `npm ci`
yamayı `postinstall`'dan kendiliğinden uyguladı (`drizzle-orm@0.45.2 ✔`).

### Bilerek kapsam dışı

- **Node'da `cause`.** `next dev`/`next start` Node'da koşuyor ve Node'un
  `console.error`'u hatayı inspect ediyor. Yani `cause`'daki Postgres mesajı ve
  `detail` orada basılıyor. Bu yalnızca local log, production workerd ve orada
  yalnızca mesaj satırı çıkıyor (ölçüldü).
- **Production Workers Logs'un biçimi ölçülmedi.** Local observability'deki
  satır ölçüldü. Production'da gerçek bir hata henüz görülmedi (P2e'nin açık
  maddesiyle aynı gün görülecek).
- **Upstream'e issue/PR.** Drizzle mesajı bilerek böyle tasarlamış olabilir
  (hata ayıklama kolaylığı). Bizim sınırımız INVARIANT 5, onların değil.

### Doğrulama

- [x] `npm run tip` temiz, `npm run lint` hata yok (iki uyarı bu işten önce de
      vardı, `panel-randevu-girdi.test.ts`)
- [x] `npm test` — **794 test, 57 dosya** (+5, `drizzle-yamasi.test.ts`)
- [x] `cf:onizle` yamadan önce ve sonra, yukarıdaki tablo

### Merge sonrası bakılacak

- [ ] CI'ın `dogrula` job'ı yeşil. `npm ci` yamayı orada da uyguluyor olmalı,
      uygulamazsa `drizzle-yamasi.test.ts` kırmızı yanar
- [ ] İlk gerçek production hatasında Workers Logs'taki Next satırında `params:`
      yok

### Bundle bütçesi

`cf:kur` + `wrangler deploy --dry-run`: **gzip 1877,82 KiB** (bütçe 3 MiB).
P2f sonundaki 1877,85 KiB'den **−0,03 KiB**.

---

## Faz K — hatırlatıcı

**Kapandı:** kuyruk artık bir request'i beklemeden boşalıyor. Faz I hatırlatma
satırlarını 24 saat öncesine yazıyordu ama onları gönderecek bir şey yoktu:
kuyruk yalnızca o randevuya dokunan bir request'in `after`'ında boşalıyordu.
Hatırlatmanın zamanı geldiğinde böyle bir request yok. Yani **Faz I'den bu yana
hiçbir hatırlatma gitmedi.** Faz K iki PR'a bölündü, bu ilki. SMS (K2) bir
sağlayıcı seçimi gerektiriyor ve ayrı iş.

### Önce ölçüldü — prod kuyruğu, 19 Eylül 2026

Salt okunur bir query: prod'da `BEKLIYOR` durumunda **2 `MUSTERI_HATIRLATMA`**
satırı vardı ve ikisinin de randevusu **çoktan geçmişti**. Hatırlatıcı olduğu
gibi açılsaydı ilk koşusu geçmiş randevulara "Yarınki randevunuz" maili
atardı. Aşağıdaki bayat mesaj kuralını bu ölçüm doğurdu.

### Karar — `scheduled` işi yapmıyor, Worker'ın kendi `fetch`'ine veriyor

Plan "`scheduled` iş mantığını doğrudan çağırabilir, route ve secret
gerekmeyebilir" diyordu. **Tutmadı:** `db.ts` (Hyperdrive), `email.ts` (mod ve
key) ve `hata.ts` (Analytics Engine) env'i `getCloudflareContext` ile okuyor ve o
context'i yalnızca OpenNext'in `fetch` sarmalayıcısı kuruyor
(`runWithCloudflareRequestContext`). Cron Trigger oradan geçmiyor.

Seçilen yol: `scheduled`, `POST /api/cron/hatirlatma`'yı
`openNext.fetch(istek, env, ctx)`'e veriyor. Request ağa çıkmıyor, iş sitenin
geri kalanıyla aynı context'te koşuyor.

**Reddedilen:** üç dosyaya "env'i parametre olarak da al" dalı eklemek. Bu,
production'da yalnızca bir yoldan koşan ve vitest'in hiç görmediği üç dal demekti
(Faz I'de production variable'larının `next dev`e sızması tam bu sınıftandı).

**Paylaşılan secret (`CRON_SIRRI`), `cronKapisi`.** Route internete açık bir
adres. Alternatif, isolate içinde tek kullanımlık bir nonce'tu: secret yönetimi
yoktu ama elle tetiklenemiyordu ve alışılmadık bir pattern'dı. Kullanıcıyla
konuşulup secret seçildi. Karşılaştırma iki tarafın SHA-256 özeti üzerinden ve
sabit süreli.

**`degismezler.test.ts` muaf DOSYA listesi tutmuyor, `cronKapisi(` çağrısını
arıyor.** Listeye eklenen bir route hiçbir kontrol olmadan geçerdi. Ayrı bir test
gate'in gövdesinin gerçekten karşılaştırma yaptığına bakıyor, çünkü `return null`a
indirgenmiş bir gate taramada yeşil kalırdı.

**Ayrı trigger yok.** Mevcut `*/30` iki işi paralel koşuyor (ikisi de hiçbir
zaman fırlatmıyor). Ücretsiz planda hesap başına 5 trigger var. 24 saat önceden
giden bir mesajda yarım saatlik sapma fark edilmiyor.

### Cross-tenant tarama: yalnızca adres (`kuyruk-tarama.ts`)

INVARIANT 12'nin ikinci dosyası. Kuyruğun tamamına bakmak zorunlu, ama dosya
**göndermiyor**, yalnızca `(slug, randevuId)` dönüyor. Gönderim her çift için
`getHalkaAcikDb(slug)` gate'inden ve Faz I'deki `bildirimleriBosalt` ile
yapılıyor. Yani request içi yol ile zamanlanmış yol aynı kodu koşuyor ve
aralarındaki yarışı `bildirimiUstlen`'in conditional UPDATE'i çözüyor.

**Reddedilen:** tek büyük JOIN'le bütün `BekleyenBildirim` satırlarını bu
dosyada okumak (tek query, sıfır ek gidiş-dönüş). O zaman kapsamsız bir dosya
müşteri e-postasını ve ham iptal token'ını taşırdı.

- Yalnızca `bildirim_kuyrugu` + `isletme` okunuyor. `randevu`, `musteri`,
  `kullanici`, `personel` kelime sınırıyla aranıyor (`randevuId` kuyruğun kendi
  kolonu).
- `aktif = true` filtresi var: pasif işletme `getHalkaAcikDb`'de bulunamıyor.
  Taramaya girseydi her koşuda listenin başını işgal ederdi.
- `tur = 'EPOSTA'`: K2'nin SMS satırları aynı sebeple.
- En eski planlanan satır önce, `sinir` kadar. Kalanlar sonraki koşuya kalıyor.

### Bayat mesaj kuralı (`randevuOncesiMesajBayatMi`)

Randevudan **önce** planlanmış bir mesaj, randevu başladıysa gönderilmiyor,
`randevu-basladi` olarak işaretleniyor. Silinmiyor, çünkü panelde "neden gitmedi"
sorusunun cevabı görünür olmalı (`adres-yok` ile aynı pattern). İşaretlemeden
önce satır üstleniliyor, yani aynı satırı o anda gönderen bir koşuyla yarış yok.

**Neden iki koşul, neden yalnızca "randevu başladı mı" değil:** panel geçmiş bir
saate de randevu yazabiliyor (Faz H2, serbest saat). Onun onay mesajının planlanan
zamanı randevudan **sonra** ve bugünkü gibi gitmeli. Yalnızca başlangıca bakan bir
kural onu da yutardı. İki koşul birlikte yalnızca "randevudan önce söylenecek
şeyi geç söylemek" durumunu yakalıyor ve ayarlanacak bir tolerans sabiti
gerektirmiyor.

### Koşu başına sınır ve bekleme (`hatirlatici.ts`)

- **20 randevu.** Ücretsiz planda request başına 50 subrequest var ve her
  gönderim bir `fetch`. Hyperdrive query'lerinin bu sınıra sayılıp sayılmadığı
  **ölçülmedi**, bu yüzden sınır cömert değil. Günde 48 koşu × 20.
- **Randevular arası 500 ms.** Resend istek hızını sınırlıyor, `email.ts` 429'u
  satıra yazıyor ama yeniden denemiyor. Değer ölçülmedi, bekleme ucuz bir sigorta.
- Gate slug başına bir kez açılıyor (workerd'de her `getDb` yeni bir client).

### `cf:onizle` ile ölçülenler — 19 Eylül 2026

`wrangler dev --test-scheduled`, `randevu_dev`'de biri zamanı gelmiş, biri
randevusu 30 saat önce başlamış iki hatırlatma, `/__scheduled` elle:

- [x] Dışarıdan secret'sız ve yanlış secret'la `POST` → 401 `{"hata":"yetkisiz"}`
- [x] Trigger → zamanı gelen satır **`anahtar-yok`**: request `openNext.fetch`
      üzerinden route'a ulaştı, tarama, gate, template ve `gonder` koştu (local'de
      mod `gercek`, key yok; gerçek mail gitmedi). Başlamış randevunun satırı
      **`randevu-basladi`**. `randevu_dev`'deki 3 eski bayat satır da aynı kuralla
      işaretlendi
- [x] **Bulunan hata:** ilk denemede log'da `Uncaught TypeError: This
      ReadableStream is closed`. Sebebi tetiğin yanıt gövdesini `cancel()` ile
      kapatmasıydı: OpenNext'in Node yanıt stream'i o sırada hâlâ kapanıyordu.
      Gövde artık sonuna kadar okunuyor. İkinci ölçümde hata yok, koşu 1128 ms
- [x] Secret'sız Worker: route dışarıya 503 `yapilandirma eksik`, trigger gate'e
      `{"kaynak":"cron hatirlatma","kod":"SIR_YOK"}`
- [x] Ölçüm verisi `randevu_dev`'den silindi

### Kasıtlı ihlalle test edildi

Dört ihlal, hepsi kırmızı:

- bayat kural kapatıldı → 2 kırmızı
- `cronKapisi` her isteği geçiriyor → 401 testi kırmızı
- taramadan `aktif` filtresi silindi → 2 kırmızı (entegrasyon + metin taraması)
- `bildirimiUstlen`'in `durum = 'BEKLIYOR'` koşulu silindi → yarış testi
  "5 gönderim yerine 7" ile kırmızı

### Bilerek kapsam dışı

- **SMS (K2).** Sağlayıcı seçilmedi. Telefonla toplu geçmiş bağlama da onunla.
- **Yeniden deneme.** `HATA` satırları olduğu gibi kalıyor (Faz I'nin kararı).
  Hatırlatıcı altyapısı artık var, ama hangi hatanın tekrar denenmeye değer
  olduğu (429 evet, `adres-yok` hayır) ayrı bir karar.
- **Worker ölürse "gönderildi" kalan satır.** Önce üstlen kararının bilinen bedeli,
  değişmedi.
- **Hatırlatma ayarı.** 24 saat sabit. İşletme ayarı migration demek.
- **Onaylanmamış (`BEKLIYOR`) randevuya hatırlatma** bugünkü gibi gidiyor.
  Metin "randevunuz var" diyor, "onaylandı" demiyor.

### Doğrulama

- [x] `npm run tip` temiz, `npm run lint` hata yok (iki uyarı bu işten önce de
      vardı)
- [x] `npm test` — **818 test, 58 dosya** (+24; `hatirlatici.test.ts` 9,
      `zamanlayici.test.ts` +4, `bildirim.test.ts` +3, `degismezler.test.ts` +8)
- [x] `cf:kur` (içinde `next build`), `/api/cron/hatirlatma` route listesinde

### Merge öncesi elle iş

- [ ] `wrangler secret put CRON_SIRRI` (`docs/yayin.md > Hatırlatıcı`). Girilmeden
      merge edilirse deploy düşmez, ama trigger her 30 dakikada `SIR_YOK` yazar ve
      health check kırmızı yanar

### Merge sonrası bakılacak

- [ ] İlk trigger'dan sonra Workers Logs'ta `cron hatirlatma` satırı yok,
      health check yeşil
- [ ] Prod'daki 2 bayat hatırlatma `HATA / randevu-basladi` oldu (mail gitmedi)
- [ ] Bir sonraki gerçek hatırlatma satırı zamanında `GONDERILDI`

### Bundle bütçesi

`cf:kur` + `wrangler deploy --dry-run`: **gzip 1885,65 KiB** (bütçe 3 MiB).
P2g sonundaki 1877,82 KiB'den **+7,83 KiB**.
