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
- [x] Deploy karari ve custom domain baglantisi - 30 Agustos 2026'da yapildi,
      ayrinti "Ilk yayin" bolumunde. `wrangler.jsonc` `workers_dev: false` +
      custom domain tasiyor.
- [ ] Supabase access token kullanici tarafindan silindi - yeni bir islem
      gerekirse yenisi lazim. (Kapanmiyor: duran bir kosul, yapilacak is
      degil.)

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

## Faz D — kimlik ve kiracı

**Kapandı:** şema (kullanıcı, personel), kiracı izolasyon katmanı, IDOR
guardrail'inin eslint kuralıyla geri getirilmesi, CSRF origin kontrolü, kimlik
katmanı ve proxy, işletme kayıt akışı, giriş/kayıt/kayıt-tamamlama ekranları,
kimlik API route'ları, panel iskeleti, kök sayfa.

### Kararlar

- **IDOR guardrail'i geri geldi.** Drizzle'a geçerken kaybettiğimiz warden
  kapısının yerine eslint `no-restricted-imports`: `src/app` altından
  `@/lib/db` import etmek yasak. Kapsam route handler'lardan GENİŞ tutuldu —
  sunucu bileşenleri de sorgu yapabiliyor ve risk birebir aynı. Kural kasıtlı
  bir ihlalle doğrulandı.

- **Kimlik Supabase'den, yetki bizden.** `auth()` JWT'den yalnızca `sub`
  alıyor, rol ve `isletmeId`'yi kendi `kullanici` tablomuzdan okuyor. Custom
  Access Token Hook bilerek kullanılmadı: claim'e yazmak istek başına bir
  sorgu tasarruf ettirirdi ama rol değişince bayat claim sorunu ve ikinci bir
  migration yüzeyi getirirdi.

- **`getClaims()`, `getSession()` değil.** getSession cookie'den geleni
  DOĞRULAMADAN döndürüyor; Supabase kendi dokümanında ona güvenilmemesi
  gerektiğini yazıyor. getClaims imzayı doğruluyor ve asimetrik anahtarlarda
  bunu yerelde WebCrypto ile yapıyor — JWKS önbellekli, istek başına ağ turu
  yok.

- **Next 16'da `middleware.ts` DEĞİL `proxy.ts`.** Export adı da `proxy`.
  Eğitim verisinden yazılsa yanlış olurdu; `AGENTS.md` uyarısı üzerine paketin
  kendi dokümanı okundu (`node_modules/next/dist/docs`).

- **Proxy YETKİLENDİRME YAPMIYOR.** Yalnızca token yeniliyor (sunucu
  bileşenleri cookie yazamıyor) ve oturum cookie'si hiç olmayanı ucuzca
  kesiyor. Cookie'nin varlığı kimlik kanıtı DEĞİL; gerçek yetki her zaman
  sunucuda `auth()` ile — panelde bu karar `src/app/panel/layout.tsx`'te.

  > **Faz E'de düzeltildi:** buradaki "OpenNext Node middleware'i
  > desteklemediği için edge'de koşuyor" cümlesi ölçümle değil varsayımla
  > yazılmıştı ve yanlıştı. Next 16'da proxy zorunlu olarak Node.js
  > runtime'ında koşuyor, OpenNext destekliyor ve bedeli Worker bundle'ında
  > 1358 KiB gzip'ti. Proxy Faz E'de kaldırıldı; ayrıntı Faz E bölümünde.

- **`/api` proxy kapsamının DIŞINDA.** Proxy'nin tek işi cookie yenilemek ve
  route handler'lar bunu kendileri yapabiliyor (`cookies().set` orada
  çalışıyor, sunucu bileşenlerinin aksine). İkisi aynı yanıta cookie yazarsa
  hangi `Set-Cookie`'nin sonda kalacağı belirsizleşiyordu — çıkış isteğinde bu,
  oturumu hiç temizlememek anlamına gelirdi.

- **Türkçe slug için harf tablosu, NFD değil.** Noktasız i ve noktalı I tek
  kod noktası, ayrılabilir aksanları yok — NFD onları çözemiyor. NFD adımı
  yine de duruyor, Türkçe olmayan aksanlı adlar için.

- **`x-forwarded-proto` okunuyor.** TLS Cloudflare'de sonlanıyor, uygulamaya
  istek düz http geliyor ama tarayıcının gönderdiği Origin https. Yalnızca
  `req.url`'e güvenilseydi her meşru mutasyon 403 yerdi.

- **Kimlik akışlarının tamamı sunucuda.** Formlar kendi route'larımıza POST
  atıyor; Supabase çağrısını sunucu yapıyor, cookie'yi de o yazıyor. Bedeli:
  formlar JS gerektiriyor. Karşılığı: şifre tarayıcıdaki bir SDK'ya hiç
  girmiyor, cookie yazma tek yerde kalıyor ve dört route da `checkOrigin` ile
  aynı CSRF kapısından geçiyor (server action olsaydı o kapı Next'in kendi
  kontrolüne devredilirdi). `createBrowserClient` sarmalayıcısı hiç
  çağrılmadığı için silindi.

- **Route'larda adım sırası sözleşme:** `checkOrigin` → gövde ayrıştırma →
  girdi doğrulama → *ancak sonra* Supabase/veritabanı. İlk üç adım ağa
  çıkmadığı için o dilim Postgres'siz ve Supabase'siz sınanabiliyor; testler
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
  ayrımını yapmak hesap sayımına (enumeration) kapı açar.

- **Supabase hata kodları kendi cümlelerimize eşleniyor** (`src/lib/supabase/
  hata.ts`). Sağlayıcının metni hiçbir zaman taşınmıyor (değişmez 5), yalnızca
  bilinen KOD eşleniyor. Bu eşleme elle denemeden doğdu: Supabase `.test`
  uzantılı adresi reddetti ve ekranda "bağlantıda bir sorun oldu" yazdı —
  kullanıcıya düzeltebileceği bir şey olduğunu hiç söylemeyen bir mesaj.

- **Çıkış kapsamı `local`, varsayılan `global` değil.** `global` kullanıcının
  tüm cihazlarındaki yenileme token'larını iptal ediyor: telefonundan çıkan
  biri masaüstünden de atılmış oluyor. "Tüm cihazlardan çık" ayrı ve açıkça
  seçilen bir işlem olmalı.

- **Route'lar `Response.redirect` dönmüyor.** fetch ile atılan bir istekte 30x
  yanıtını tarayıcı sessizce izliyor ve istemci nereye gidildiğini
  öğrenemiyor. Sözleşme: hata `{ hata }`, başarı `{ yon }` — yönlendirmeyi
  istemci yapıyor ve ardından `router.refresh()` çağırıyor (cookie yeni
  yazıldı, sunucu bileşenlerinin çıktısı bayat).

- **`auth()` ve `authKimligi()` React `cache`'ine alındı.** Panel düzeni ve
  içindeki sayfa aynı istekte ikisi de oturumu soruyor; sarmadan her biri
  kendi JWT doğrulamasını ve kendi sorgusunu yapardı. İstek başına önbellek,
  yani bayat oturum riski yok.

- **`isletmeKaydiOlustur` benzersizlik ihlalini yakalıyor.** Transaction önce
  "bu authUserId kayıtlı mı" diye bakıyor ama iki istek aynı anda gelirse
  ikisi de boş görüyor; kesin cevabı `kullanici_auth_user_id_idx` veriyor
  (değişmez 3). Slug çarpışması bilerek yakalanmıyor: o kadar dar bir pencere
  için yeniden deneme döngüsü taşımak, hiç koşulmayan — yani sınanmamış — kod
  demekti.

- **Zod eklenmedi.** Doğrulanan alan sayısı az ve mesajların tamamı Türkçe;
  kütüphanenin ürettiği metni yine elle yazacaktık. Form katmanı
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

- **İstemcide ağır doğrulama yok.** Kuralların tek sahibi sunucudaki
  `girdi.ts`. Aynı kuralı iki yerde tutmak, ikisinin zamanla ayrışması ve
  kullanıcının sunucuda göremediği bir hatayla karşılaşması demekti.

### Bilinen durum

- ~~Supabase'de *Confirm email* hâlâ açık.~~ **Faz F sırasında kapatıldı ve
  akış uçtan uca doğrulandı** — bkz. "Uçtan uca doğrulama" bölümü. Kod her iki
  duruma da hazır: `data.session` yoksa kullanıcı `/giris`'e mesajla
  yönlendiriliyor.
- Supabase'de `faz-d-deneme@example.com` için sahipsiz bir hesap kalmış
  olabilir (istek e-posta gönderimi adımında düştü). Yerel veritabanında
  karşılığı yok — kontrol edilip silinebilir.

### Bilerek kapsam dışı

- **Şifre sıfırlama akışı yok.** Kayıt ve giriş çalışır durumda; sıfırlama
  gerçek e-posta gönderimi gerektiriyor ve o altyapı Faz I'de kuruluyor.
  Şimdi yazılsa yerleşik SMTP'nin saatte 2 mesaj sınırına çarpardı.
- **Müşteri rolü için ekran yok.** `MUSTERI` rolü şemada ve `auth()`'ta var,
  panele girişi engelleniyor; `/randevularim` Faz J'de.
- **Kök sayfa geçici.** Gerçek tanıtım sayfası ürün çalışır hale gelince
  yazılacak; bugün anlatılacak bir şey yok ve uydurulmuş bir özellik listesi
  sonradan düzeltilecek bir borç olurdu.
- **`/saglik` halka açık kaldı.** Vitrin panel altına taşındı ama sağlık
  sayfası dışarıdan izleme için anlamlı ve sızdırdığı tek şey PostgreSQL major
  sürümü ile gidiş-dönüş süresi; hata metni zaten bastırılıyor.

### Doğrulama

- `npm run tip`, `npm run lint` temiz
- `npm test` — **90 test geçti** (10 dosya, gerçek Postgres)
- `npm run build` başarılı; 13 route üretiliyor
- **Elle (`next dev`):** `/`, `/giris`, `/kayit` 200; oturumsuz `/panel` ve
  `/kayit/tamamla` → 307 `/giris?devam=…`; `/api/giris` Origin'siz ve yabancı
  Origin'le 403, doğru Origin'le olmayan hesapta 401 (gerçek Supabase'e
  ulaşarak); kayıtta Supabase hata kodları doğru cümleye eşleniyor

### Elle yapılması gerekenler (Faz D)

- [x] **Prod'a uygulandı** (30 Ağustos 2026, Faz E göçüyle birlikte). Göç
      yalnızca EKLEME'ydi (rol enum'u + kullanıcı + personel tabloları); mevcut
      işletme tablosuna dokunmadı. Geri alma: iki `drop table`, bir `drop type`.
- [x] **Supabase'de *Confirm email* KAPATILDI** (30 Ağustos 2026,
      Management API: `mailer_autoconfirm: true`). Yerleşik SMTP saatte 2 mail
      ile sınırlı; domain + Resend custom SMTP bağlanana kadar (Faz I) kapalı
      kalmalı. Açılırsa kayıt akışı ilk iki denemeden sonra tıkanır.
- [x] **Uçtan uca elle doğrulama yapıldı** (30 Ağustos 2026). Ayrıntı aşağıda
      "Uçtan uca doğrulama" bölümünde.
- [x] Cloudflare'e yayınlarken `NEXT_PUBLIC_SUPABASE_URL` ve
      `NEXT_PUBLIC_SUPABASE_ANON_KEY` **derleme anında** ortamda olmalı;
      `NEXT_PUBLIC_` önekli değişkenler `cf:kur` adımında gömülüyor. İlk
      yayında sağlandı — ama bu bir kerelik iş değil, **her `cf:kur` için
      geçerli duran bir kural**. Faz G2'nin
      `NEXT_PUBLIC_TURNSTILE_SITE_KEY`'i de aynı sınıfta.
- [x] Deploy kararı ve custom domain bağlantısı (Faz B'den devrediyordu) —
      30 Ağustos 2026, "İlk yayın" bölümü.

---

## Faz E — şema ve panel CRUD

**Kapandı:** yedi yeni tablo, `EXCLUDE` çakışma kısıtı, hizmet / personel /
çalışma saatleri / ayarlar ekranları ve route'ları, değişmez tarayıcısı,
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
  gerektiğinde hem şemayı hem arayüzü hem dönüşümü yeniden yazmak gerekirdi.

- **Para kuruş cinsinden tam sayı ve dönüşüm SUNUCUDA.** Ondalık sayıda
  `0.1 + 0.2` problemi tutara sızardı; `numeric` ise JS tarafında string olarak
  gelir. İstemci "350,50" için 35050'yi kendisi hesaplasaydı dönüşüm kayan
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
  istek ikisini de "son değil" görüp ikisini birden pasifleyebilirdi.

- **Toplu yazma (önce sil, sonra ekle), satır bazlı API değil.** Haftalık düzen
  ve hizmet eşlemesi kullanıcının kafasında tek bir şey; satır bazlı bir API
  yarım uygulanmış bir hafta bırakabilirdi. Yabancı bir id geldiğinde isteğin
  tamamı reddediliyor — sessizce atlamak "kaydettim" deyip yarım küme bırakmak
  olurdu.

- **Saat dilimi ve randevu aralığı kapalı liste**, `Intl.supportedValuesOf`
  değil: workerd'in ICU derlemesi tam değil ve orada liste eksik dönebiliyor —
  kullanıcının kayıtlı saat dilimi bir gün "geçersiz" sayılırdı. Aynı sebeple
  `paraBicimle` de `Intl.NumberFormat` kullanmıyor.

- **Telefon veritabanında yalnızca rakam ve tek biçimde**; baştaki `0` ve `90`
  kırpılıyor. `musteri` tablosunda telefon benzersiz olduğu için iki yazım iki
  ayrı müşteri kaydı üretir ve geçmiş ikiye bölünürdü.

- **Gün içi çakışan çalışma aralıkları reddediliyor.** Bu kuralın işi Faz F'deki
  müsaitlik motorunun girdisini korumak: motor çakışan aralıkları çözerken aynı
  slotu iki kez üretir ya da sessizce düşürür. Bitişik aralıklar (13:00 biten ve
  13:00 başlayan) çakışma sayılmıyor — kullanıcının öğleden önce/sonra ayrımını
  görmek istemesi meşru.

### Çakışma kısıtı (DEĞİŞMEZ 8 artık gerçek)

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "randevu" ADD CONSTRAINT "randevu_cakisma_yok"
  EXCLUDE USING gist ("personel_id" WITH =,
                      tstzrange("baslangic","bitis",'[)') WITH &&)
  WHERE ("durum" IN ('BEKLIYOR','ONAYLI'));
```

Drizzle `EXCLUDE`'u ifade edemiyor; kısıt migration'a elle yazıldı. İki ayrıntı
kasıtlı: aralık `'[)'` olduğu için bitişik randevular çakışma sayılmıyor
(10-11 ile 11-12 birlikte alınabiliyor), `WHERE` koşulu iptal ve gelmedi
durumlarını dışarıda bıraktığı için iptal edilen saat boşalıyor. Sekiz test bu
davranışların her birini ayrı ayrı kilitliyor.

Göç hem **boş** hem **Faz D verisiyle dolu** bir veritabanında sınandı; ikisinde
de uygulandı ve mevcut veri korundu.

### Ortaya çıkan iki gerçek hata

1. **Drizzle, Postgres hatasını sarmalıyor.** `DrizzleQueryError`'da `code`
   alanı YOK; o yalnızca en içteki nesnede duruyor. Yani Faz D'de yazılan
   `hata.code === "23505"` kontrolü **hiçbir zaman eşleşmiyordu** — kayıt yarışı
   sadece yedek mesaj kontrolü sayesinde çalışıyordu. `src/lib/pg-hata.ts`
   `cause` zincirini geziyor ve testi uydurulmuş bir nesne değil, gerçek bir
   Drizzle hatası kullanıyor.

2. **Test temizliği şema büyüyünce sessizce bozuldu.** Her dosya kendi bildiği
   tabloları siliyordu; `randevu` personele `ON DELETE restrict` ile bağlı
   olduğu için bir dosya randevu bırakınca sonraki dosyanın `delete(personel)`
   çağrısı düşüyordu. Testler tek tek geçerken hep birlikte düşüyorlardı — en
   pahalı hata türü. `TRUNCATE ... CASCADE` zinciri Postgres'e çözdürüyor.

### Proxy kaldırıldı — ölçülmüş bir karar

Cloudflare bundle'ı 3 MiB'lik ücretsiz plan sınırının **100 KiB altına**
inmişti (2969.80 KiB gzip). Sebep tek bir dosya çıktı: proxy kaldırılınca
**1611.40 KiB**'a düştü, yani proxy tek başına **1358 KiB** — bütçenin %44'ü.

Neden bu kadar pahalı: Next 16'da proxy **zorunlu olarak Node.js runtime'ında**
koşuyor. Paketin kendi dokümanı açık yazıyor: *"Proxy defaults to using the
Node.js runtime. The `runtime` config option is not available in Proxy files.
Setting the `runtime` config option in Proxy will throw an error."* OpenNext de
onun için Next sunucu runtime'ının ikinci bir kopyasını paketliyor. Kaçış yolu
yok; seçim "proxy var ya da yok".

**Faz D'deki not yanlıştı:** "OpenNext Node middleware'i desteklemediği için
edge'de koşuyor" cümlesi ölçümle değil varsayımla yazılmıştı.

Proxy'nin iki işi vardı ve ikisi de karşılandı:
1. Token tazeleme → `POST /api/oturum` + `OturumTazeleyici` istemci bileşeni
   (25 dakikada bir ve sekme öne geldiğinde). Sunucu bileşenleri cookie
   yazamıyor, route handler'lar yazabiliyor.
2. Cookie'siz isteği `/panel`den ucuzca çevirme → zaten **kesin bir kontrol
   değildi** (cookie'nin varlığı kimlik kanıtı değil) ve gerçek karar hep panel
   düzenindeydi.

**Kaybedilen tek şey:** derin bağlantıya dönüş. Önce `/panel/hizmetler`e
oturumsuz giren kişi girişten sonra oraya dönüyordu, şimdi `/panel`e dönüyor.
Sunucu bileşeni kendi yolunu güvenilir biçimde okuyamıyor; bedeli 1358 KiB'a
değmez.

### Değişmez tarayıcısı

`panelKapisi` üç adımı (checkOrigin → oturum → gövde) tek yere aldı ve bunun
bir bedeli oldu: `checkOrigin` artık route dosyalarında **görünmüyor**, yani
warden'ın metin arayan kapısı onu yakalayamıyor. Aynı şey Faz B'de bir kez
yaşandı (Prisma'dan Drizzle'a geçerken kiracı kapısı sessizce zorlanamaz hale
geldi ve iki faz incelemeye bağlı kaldı).

Tekrarlanmasın diye `src/lib/degismezler.test.ts` eklendi: `src/app` altındaki
her route dosyasını okuyup mutasyon metodu olan her birinde kapının varlığını
arıyor, `panelKapisi`nin gerçekten `checkOrigin` çağırdığını doğruluyor ve
hiçbir dosyanın `@/lib/db` import etmediğini kontrol ediyor. **Kasıtlı bir
ihlalle sınandı — yakaladı.**

### Bilerek kapsam dışı

- **Randevu CRUD'u yok.** Tablo ve kısıt hazır ama randevu yazan tek yol Faz
  F-G'de gelecek (müsaitlik motoru + halka açık sayfa). Panelden elle randevu
  ekleme Faz H'de.
- **`bildirim_kuyrugu` tablosu boş duruyor.** Faz I'de kullanılacak; şimdi
  oluşturuldu ki o faz migration gerektirmesin.
- **`kapali` (izin/tatil) tablosunun ekranı yok.** Müsaitlik motoru onu Faz
  F'de okuyacak; ekranı o zaman anlamlı olacak.
- **Hizmet sırası elle düzenlenemiyor.** Şemada `sira` var ve liste ona göre
  sıralanıyor; sürükle-bırak arayüzü bu fazın kazancına değmezdi.
- **Personel hesabı davet etme yok.** `personel.kullaniciId` şemada duruyor ama
  personeli sisteme davet etme akışı yazılmadı; şu an işletme sahibi herkesi
  kendi adına yönetiyor.

### Doğrulama

- `npm run tip`, `npm run lint` temiz
- `npm test` — **189 test geçti** (18 dosya, gerçek Postgres)
- `npm run build` başarılı, 23 route
- `npm run cf:kur` + `wrangler deploy --dry-run`: **1612 KiB gzip** (3 MiB
  sınırının 1460 KiB altında)
- Göç boş ve dolu veritabanında ayrı ayrı sınandı
- Elle (`next dev`): `/`, `/giris` 200; oturumsuz `/panel`, `/panel/hizmetler`
  → 307 `/giris?devam=/panel`; `/kayit/tamamla` → 307 `/giris`;
  `/api/oturum` Origin'siz 403

### Elle yapılması gerekenler (Faz E)

- [x] **Prod'a uygulandı** (30 Ağustos 2026). Göç yalnızca EKLEME'ydi (yedi
      tablo, dört enum, `btree_gist` uzantısı ve `isletme`ye `DEFAULT` değerli
      kolonlar). Geri alma: yedi `drop table`, dört `drop type`, `isletme`
      kolonlarında `drop column`.
- [x] **`btree_gist` Supabase'de sorunsuz kuruldu** — yetki hatası çıkmadı,
      göçün ilk satırı (`CREATE EXTENSION IF NOT EXISTS`) yetti.
- [x] Faz D'den devreden madde kapandı: Confirm email kapatıldı ve akış uçtan
      uca doğrulandı.

---

## Faz F — müsaitlik motoru

**Kapandı:** `src/lib/zaman.ts`, `src/lib/musaitlik.ts`, `src/lib/musaitlik-sorgu.ts`,
`GET /api/musaitlik`. Ürünün kalbi ve testlerin en yoğun olduğu faz: bu üç
dosya için **76 test** yazıldı.

### Zaman katmanı (`zaman.ts`)

**Sunucunun saat dilimine hiçbir yerde güvenilmiyor.** `new Date()` dışında
hiçbir yerel-zaman API'si kullanılmıyor: Worker'ın dilimi UTC, geliştirici
makinesininki Europe/Istanbul, testlerinki bir başkası olabilir. Aynı kod üç
yerde üç farklı sonuç üretirse hata ancak üretimde görünür.

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
- ICU bazı sürümlerde `hour12: false` ile gece yarısını **"24"** veriyor.
  Düzeltilmezse 00:15 randevusu önceki günün 24:15'i gibi görünürdü.
- `Date.UTC` taşırma yapıyor: `"2026-02-29"` (2026 artık yıl değil) sessizce
  1 Mart olurdu ve kullanıcı istemediği bir günün saatlerini görürdü. Ayrıştırma
  geri okuyup aynı gün mü diye bakıyor.

### Motor (`musaitlik.ts`)

**Saf fonksiyon** — `simdi` bile dışarıdan veriliyor. İçeride okunsaydı yaz
saati geçişi, gün sınırı ve minimum bildirim süresi ancak o anları bekleyerek
sınanabilirdi.

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
- **Çakışma testi yarım açık `[)`** — veritabanındaki `EXCLUDE` kısıtıyla aynı.
  İkisi ayrışırsa motor "boş" dediği bir slotu kısıt reddeder ve kullanıcı
  sebebini anlamaz.
- **`slotAraligiDk <= 0` boş dönüyor.** Değer kullanıcı ayarından geliyor ve
  döngü sonsuza giderdi.

**Motor bir garanti değil.** İki müşteri aynı saniyede aynı slotu isterse ikisi
de "boş" görür; kesin cevabı `EXCLUDE` kısıtı veriyor (DEĞİŞMEZ 8).

### Sorgu katmanı (`musaitlik-sorgu.ts`)

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
- **Dolu kümesi yalnızca `BEKLIYOR` ve `ONAYLI`** — `EXCLUDE` kısıtının `WHERE`
  koşuluyla aynı. İptal ve gelmedi saati boşaltıyor.

### `GET /api/musaitlik`

Oturumsuz ve halka açık: müşteri randevu almak için hesap açmıyor. Kiracı
oturumdan değil `isletme` slug'ından çözülüyor ve `getHalkaAcikDb` filtreyi yine
kapanış değişkeni olarak tutuyor.

- **GET olduğu için `checkOrigin` yok** — DEĞİŞMEZ 2 yalnızca mutasyonlar için.
  Kötüye kullanım (başka bir salonun doluluk takvimini kazımak) CSRF ile değil
  hız sınırıyla engelleniyor; Cloudflare kuralı Faz G'de bu yola konacak.
- **Yanıt önbelleklenmiyor** (`cache-control: no-store`). Müsaitlik yazma
  kararını besliyor: bir saniye bayat veri, dolu bir slotu boş gösterip
  müşteriyi 409'a götürür. Hyperdrive'ın sorgu önbelleği de aynı sebeple kapalı.
- Kapalı ya da hiç olmayan işletme **aynı** cevabı alıyor: hangi slug'ların
  kayıtlı olduğunu sızdırmanın faydası yok.

### Bilerek kapsam dışı

- **Randevu yazma yok.** `POST /api/randevu` ve iptal akışı Faz G'de.
- **Çok günlü müsaitlik sorgusu yok.** Uç tek gün veriyor; takvimde "hangi
  günler dolu" göstergesi gerekirse Faz G'de eklenecek. Şimdi eklemek,
  kullanılmayan bir sorgu şekli sınamak olurdu.
- **`kapali` (izin) ekranı hâlâ yok.** Motor tabloyu okuyor ama işletme henüz
  izin giremiyor; ekran Faz H'de takvimle birlikte anlamlı olacak.
- **Hız sınırı konmadı.** Cloudflare kuralı Faz G'de, `POST /api/randevu` ile
  birlikte.

### Doğrulama

- `npm run tip`, `npm run lint` temiz
- `npm test` — **266 test geçti** (21 dosya)
  - `zaman.test.ts` 23, `musaitlik.test.ts` 33, `musaitlik-sorgu.test.ts` 20
  - sorgu testlerinin beşi halka açık yolun **IDOR** testi
- **Elle, gerçek veriyle** (`next dev` + tohumlanmış `randevu_dev`): 45 dk'lık
  hizmet öğle arasında kesiliyor (son sabah slotu 11:15, öğleden sonra 13:00'te
  başlıyor), son slot 17:15; 120 dk'lık hizmet 18 slot üretiyor; cumartesi
  10:00-16:00; pazar, geçmiş gün ve pencere dışı boş; Ayşe 10:00-10:45 dolu
  olunca o saatler Ali'ye düşüyor ve **10:45 bitişik olduğu için** Ayşe'ye geri
  dönüyor; bilinmeyen slug/hizmet 404, bozuk tarih ve eksik parametre 400

### Elle yapılması gerekenler (Faz F)

- [x] Faz D'den devreden madde kapandı: `mailer_autoconfirm: true` yapıldı ve
      kayıt → panel akışı uçtan uca doğrulandı.
- [x] `randevu_dev` veritabanına örnek işletme tohumlandı (`isil-guzellik`,
      iki personel, iki hizmet, haftalık çalışma düzeni, bir randevu). Faz G
      geliştirmesi için duruyor; prod'a gitmiyor.

---

## Uçtan uca doğrulama — 30 Ağustos 2026

Faz D'den beri bekleyen engel kalktı: Supabase'de *Confirm email* kapatıldı
(`mailer_autoconfirm: true`, Management API üzerinden). Ardından Faz D-E-F'nin
tamamı **çalışan uygulamada, gerçek Supabase ve gerçek Postgres'e karşı**
sınandı. Aşağıdakilerin hepsi `next dev` üzerinde gözlendi.

### Kimlik akışı

| Adım | Sonuç |
|---|---|
| Kayıt (yeni e-posta) | `200 {"yon":"/panel"}`, dört `sb-*` cookie'si yazıldı |
| Oturumla `/panel` | 200 |
| Çıkış | `200 {"yon":"/giris"}`, cookie'ler temizlendi |
| Çıkış sonrası `/panel` | `307 → /giris?devam=/panel` |
| Yanlış şifreyle giriş | `401 "E-posta ya da şifre hatalı"` — hangisinin yanlış olduğu **söylenmiyor** |
| Doğru şifre + `devam=/panel/hizmetler` | `200 {"yon":"/panel/hizmetler"}` |
| **Açık yönlendirme denemesi** `devam=//kotu.site` | `200 {"yon":"/panel"}` — kapı tuttu |

### Panel

Altı sayfa da oturumla 200 dönüyor: `/panel`, `/panel/hizmetler`,
`/panel/personel`, `/panel/calisma-saatleri`, `/panel/ayarlar`,
`/panel/gelistirici/vitrin`.

Mutasyonlar: hizmet eklendi (`"150,50"` → `fiyatKurus: 15050`, yani para
ayrıştırması uçtan uca doğru), personel eklendi, ayarlar güncellendi.

### IDOR — gerçek oturumla, çapraz kiracı

Bir işletmenin oturumuyla **başka** bir işletmenin kayıtlarına üç ayrı saldırı
denendi. Üçü de reddedildi ve kurban kayıtlar veritabanında **değişmedi**:

| Deneme | Yanıt | Kurban kayıt |
|---|---|---|
| `PATCH /api/hizmetler/<başkasının-id>` | `404 "Hizmet bulunamadı"` | `Saç kesimi, 45 dk, aktif` — değişmedi |
| `DELETE /api/hizmetler/<başkasının-id>` | `404 "Hizmet bulunamadı"` | aynı |
| `PUT /api/personel/<başkasının-id>/calisma-saatleri` | `404 "Personel bulunamadı"` | 0 satır eklendi |

404 mesajı bilerek "yetkiniz yok" demiyor: başka kiracıya ait bir kaydı istemek
ile hiç olmayan bir kaydı istemek çağırana aynı görünmeli, yoksa kaydın varlığı
sızar.

### Müsaitlik motoru (Faz F)

Tohumlanmış `randevu_dev` verisiyle (`isil-guzellik`, iki personel, iki hizmet,
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

Son satır `'[)'` aralık semantiğinin uçtan uca doğru olduğunu gösteriyor: kısıt,
motor ve sorgu katmanı aynı kuralı uyguluyor.

### Bu doğrulamanın bıraktıkları

- Supabase'de test hesapları kaldı (`deneme-<zaman>@example.com`). Silinmesi
  gerekmiyor ama isteniyorsa Supabase panelinden Authentication → Users.
- `randevu_dev` içinde iki örnek işletme var (`isil-guzellik` tohumu ve test
  kaydı). Yalnızca geliştirme veritabanı; prod'a gitmiyor.

### Prod göçü — 30 Ağustos 2026

PR #3 ve #4 merge edildikten sonra `npm run db:uygula:prod -- --onayla`
çalıştırıldı. Öncesinde prod'da yalnızca `isletme` tablosu ve tek bir göç
vardı (Faz A); tablo boştu, yani veri riski yoktu.

**Sonuç:** 10 tablo, 5 enum, `btree_gist` uzantısı, 3 göç uygulanmış durumda.
`isletme`ye eklenen yedi kolonun hepsi `DEFAULT` değerli; mevcut satırlar
etkilenmedi (zaten yoktu).

`btree_gist` Supabase'de **yetki hatası çıkarmadan** kuruldu — göçün ilk
satırındaki `CREATE EXTENSION IF NOT EXISTS` yetti. Panelden elle açmaya gerek
kalmadı.

#### Çakışma kısıtı PROD'da sınandı

DEĞİŞMEZ 8'in üretimde gerçekten tuttuğu, **geri alınan bir transaction**
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

Yani kısıt, motor ve sorgu katmanı üretimde de aynı kuralı uyguluyor.

### workerd doğrulaması — 30 Ağustos 2026

Faz F'nin en büyük **doğrulanmamış** varsayımı kapandı: müsaitlik motorunun
tamamı `Intl.DateTimeFormat` + IANA saat dilimi verisine dayanıyor ve workerd'in
ICU derlemesinin tam olduğu **varsayılmıştı, ölçülmemişti**. (Aynı şüpheyle
`ayar-girdi.ts`'te saat dilimi listesi kapalı tutulmuştu.)

`npm run cf:onizle` ile gerçek workerd'de sınandı — deploy gerekmedi:

| Senaryo | Beklenen | workerd |
|---|---|---|
| `Europe/Istanbul`, salı, 45 dk hizmet | 28 slot, öğle arası kesik, son 17:15 | **birebir aynı** |
| Berlin kış (+1), pazar 09:00 yerel | `08:00Z` | ✓ |
| Berlin **ileri geçiş günü** (2027-03-28) | `07:00Z` | ✓ |
| Berlin yaz (+2) | `07:00Z` | ✓ |
| Berlin **geri geçiş günü** (2027-10-31) | `08:00Z` | ✓ |

Yani workerd'de **tam IANA yaz saati kuralları var**; motor Node'daki testlerle
aynı sonucu üretiyor. Zaman katmanını yeniden yazma riski yok.

Aynı koşumda doğrulanan diğerleri:
- `/saglik`: Hyperdrive → Supavisor → Postgres 17, gidiş-dönüş **17 ms**
- Oturumsuz `/panel` → 307 `/giris?devam=/panel`
- Origin'siz POST → 403 (DEĞİŞMEZ 2 üretim çalışma zamanında da tutuyor)
- Gerçek Supabase'e giriş → 200, cookie'ler yazıldı, panel doğru veriyle geldi
- Bundle **1621 KiB gzip** (3 MiB sınırının 1451 KiB altında)

**Sonuç:** deploy'un önünde teknik bir bilinmeyen kalmadı.

### İlk yayın — 30 Ağustos 2026

**Canlı: https://randevu.enesmemduhoglu.tech**

Faz B'den beri bekleyen deploy yapıldı. Version ID `58a1e2ab`, Worker açılış
süresi **25 ms**, bundle **1621 KiB gzip**.

#### workers.dev kapatıldı, tek adres custom domain

`wrangler deploy` ilk denemede hesap ayarına takıldı: bu hesapta workers.dev
alt alan adı kayıtlı değildi ve wrangler'ın otomatik denediği `randevu` adı
küresel olarak alınmış. İki yol vardı; **custom domain** seçildi.

`wrangler.jsonc`'ye `"workers_dev": false` ve `custom_domain: true` ile
`randevu.enesmemduhoglu.tech` yazıldı. Cloudflare DNS kaydını ve sertifikayı
kendisi yönetiyor. **Kök alan adına dokunulmadı** — orada başka bir proje ve
Email Routing'in MX kayıtları duruyor (`docs/plan.md`).

Tek adres olması ayrıca bilinçli: iki adresten servis edilen bir uygulama
`checkOrigin` listesini ve paylaşılan bağlantıları ikiye böler.

#### Windows tuzağı tekrar çıktı

İlk `cf:yayinla` `.open-next` üzerinde **EPERM** ile düştü. `CLAUDE.md`'de
yazan tuzak: `wrangler dev` çalışırken dizin kilitli kalıyor. Bu sefer kilidi
tutan şey `cf:onizle`'nin süreç ağacıydı — port dinleyen süreci öldürmek
yetmedi, `taskkill /T` ile ağacın tamamını kapatmak gerekti (wrangler ölen
workerd'yi yeniden başlatıyor).

#### Üretimde doğrulananlar

| | |
|---|---|
| DNS + TLS | geçerli sertifika, kök sayfa 200 |
| `/saglik` | Hyperdrive → Supavisor → Postgres 17, gidiş-dönüş **228 ms** |
| Oturumsuz `/panel` | 307 → `/giris?devam=/panel` |
| Origin'siz POST | **403** — DEĞİŞMEZ 2 üretimde de tutuyor |
| Kayıt → panel | 200, panel doğru veriyle geldi |
| Para ayrıştırma | `400,25` → `40025` kuruş |
| Müsaitlik (oturumsuz) | 26 slot, öğle arası kesik (11:00 → 13:00), son 17:00 |
| `Cache-Control` | `no-store` |

Duman testi verisi üretimden **silindi** (`isletme` silinince kiracıya bağlı
her şey cascade ile gidiyor). Üretim veritabanı yine boş.

#### Yayın sonrası kalanlar

- [x] Supabase `site_url` → `https://randevu.enesmemduhoglu.tech` yapıldı.
- [x] `uri_allow_list` → `http://localhost:3000/**`. Faz I'de şifre sıfırlama
      gelince yerel geliştirmenin de çalışması için; üretim adresi zaten
      `site_url` üzerinden izinli.
- [x] PR #6 merge edildi; üretim ve `main` hizalandı.
- [x] Duman testi auth kullanıcıları silindi. Supabase'de yalnızca
      `demo@ornek.com` duruyor — yerel tarayıcı testleri için, satırları
      `randevu_dev`'de.
- [ ] `/api/musaitlik` üzerinde hız sınırı yok. **Faz G2'ye taşındı** ve orada
      Cloudflare WAF kuralı olarak duruyor — kod tarafında değil, bilerek
      (gerekçe: Faz G2 → "Bilerek kapsam dışı").

---

## Oturum sonu durumu — 30 Ağustos 2026

**Canlı:** https://randevu.enesmemduhoglu.tech · **Tek dal:** `main` ·
**270 test** (21 dosya) · bundle **1621 KiB gzip**

| Faz | Durum |
|---|---|
| A — iskele | kapandı |
| B — Cloudflare zemini | kapandı (deploy dahil) |
| C — tasarım dili | kapandı |
| D — kimlik ve kiracı | kapandı |
| E — şema ve panel CRUD | kapandı |
| F — müsaitlik motoru | kapandı |
| **G — halka açık randevu sayfası** | **sıradaki** |
| H, I, J, K | bekliyor |

### Ne çalışıyor, ne çalışmıyor

**Çalışıyor:** işletme kaydı, giriş/çıkış, panel (hizmetler, personel, çalışma
saatleri, ayarlar), müsaitlik motoru ve `GET /api/musaitlik`.

**Çalışmıyor:** müşteri hiçbir şekilde randevu ALAMIYOR — `/r/[slug]` yok
(Faz G). İşletme sahibi randevu göremiyor (Faz H). Bildirim ve şifre sıfırlama
yok (Faz I).

### Yakın zamanda kaybedilmesi kolay iki ayrıntı

- **`wrangler.jsonc` üretim yapılandırmasını taşıyor** (`workers_dev: false` +
  custom domain). Bu dosya bir kez `main`'e girmeden merge edilip dal
  silindiği için neredeyse kayboluyordu; commit'ler yerelden cherry-pick ile
  kurtarıldı. Deploy'dan önce bu iki alanın yerinde olduğunu doğrula.
- **`.open-next` Windows'ta kilitleniyor.** `cf:onizle`'nin süreç ağacını
  `taskkill /T` ile kapatmak gerekiyor; yalnızca portu dinleyen süreci
  öldürmek yetmiyor, wrangler ölen workerd'yi yeniden başlatıyor.

### Faz G'ye başlarken

- Motor ve sorgu katmanı hazır. `POST /api/randevu` yazmadan hemen önce
  `slotUygunMu()` çağırmalı: müşterinin gördüğü liste ile kabul edilen randevu
  ayrışmamalı.
- Route oturumsuz olacak: `getHalkaAcikDb(slug)`, `checkOrigin` şart
  (DEĞİŞMEZ 2), çakışma ihlali `pgHata.cakismaIhlaliMi` ile yakalanıp
  **409**'a çevrilecek (DEĞİŞMEZ 8).
- `musteri` telefon üzerinden tekilleniyor; normalizasyon
  `ayar-girdi.ts > telefonDogrula`'da.
- `randevu.iptalToken` şemada var ve benzersiz. **Tahmin edilemez olmalı ve
  id'den türetilmemeli.**
- Hız sınırı ve Turnstile bu fazda; `/api/musaitlik` şu an korumasız.
- Çalışma saatleri ekranındaki `<input type="time">` işletim sistemi yereline
  göre AM/PM gösterebiliyor (marka kuralı 24 saat). Karar verilmedi:
  native alan mı, 15 dakikalık açılır liste mi.

---

## Faz G — halka açık randevu sayfası

**Dal:** `faz-g/halka-acik-randevu` · **3 commit** (veri katmanı → route'lar →
arayüz) · **321 test** (23 dosya), bunun **49'u** bu fazın route testleri.

Müşteri artık randevu **alabiliyor**. Oturum sonu notundaki "müşteri hiçbir
şekilde randevu ALAMIYOR" satırı kapandı.

### Ne geldi

| Parça | Ne yapıyor |
|---|---|
| `src/lib/iptal-token.ts` | 160 bitlik iptal sırrı, id'den türetilmiyor |
| `src/lib/randevu-girdi.ts` | gövde doğrulaması, id'ler Postgres'e gitmeden eleniyor |
| `musaitlik-sorgu.ts > slotSec()` | istenen anı aynı motorla yeniden sınar |
| `scoped-db.ts` | `randevuOlustur`, `randevuTokenIleGetir`, `randevuIptalEt` |
| `POST /api/randevu` | oturumsuz yazma |
| `POST /api/randevu/iptal` | koşullu UPDATE ile iptal |
| `/r/[slug]` | hizmet → personel → gün/saat → bilgiler → onay |
| `/r/[slug]/randevu/[token]` | müşterinin iptal sayfası |

### Kararlar

**Müşteri telefonla tekilleniyor, ama mevcut kaydın adı GÜNCELLENMİYOR.** Bu
yol oturumsuz: numarayı bilen herkes buraya yazabiliyor. Güncelleseydik bir
yabancı, işletmenin müşteri kaydındaki adı değiştirebilirdi. İşletme farklı
bir ad görmek isterse panelden kendi düzeltir.

**Müşteri + randevu tek transaction.** Müşteri yazılıp randevu yazılamazsa
geriye sahibi olmayan bir müşteri kaydı kalırdı; işletme onu panelde "hiç
gelmemiş biri" gibi görürdü.

**Personel ve bitiş motordan geliyor, istemciden değil.** Bitişi route'ta
yeniden hesaplamak, yaz saati geçişinde motorunkinden farklı bir değer
üretebilirdi ve çakışma kısıtı o farkı görmezdi.

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
Sayım transaction içinde ama SERIALIZABLE değil: aynı anda gelen iki istek
sınırı bir aşabilir. Kabul edildi — bunun bedeli fazladan bir randevu,
kilitlemenin bedeli ise her yazımda müşteri satırını kilitlemek.

### 40P01 — yarışan iki POST testinin ortaya çıkardığı gerçek hata

İki istek **çakışan** aralıkları aynı anda yazınca Postgres 23P01
üretemiyor: her işlem önce kendi satırını yazıyor, sonra `EXCLUDE` kısıtını
doğrularken diğerinin işlemini bekliyor. İkisi birbirini bekleyince Postgres
birini kurban seçip **40P01 (deadlock_detected)** fırlatıyor — yani "çakıştı"
değil "sırayı çözemedim" diyor.

Yakalanmadığı sürece yarışı kaybeden müşteri **500 görüyordu**. Şimdi en çok
3 kez yeniden deneniyor. Neden doğrudan 409 değil: kurban işlem hiçbir şey
yazmadan geri alınıyor, yani ikinci deneme kesin bir cevap alıyor — saat
gerçekten doluysa 23P01 ile "dolu", değilse randevu yazılıyor. Doğrudan 409
demek, yazılabilecek bir randevuyu reddetmek olurdu.

DEĞİŞMEZ 8'in "uygulama katmanı garanti değildir" cümlesinin pratikteki
karşılığı bu: motor slotu uygun gördü, kısıt reddetti, müşteri doğru mesajı
gördü.

### Bilerek kapsam dışı

- **Turnstile ve hız sınırı — Faz G2.** `/api/randevu` ve `/api/musaitlik`
  şu an bot korumasız. Açık randevu sınırı bunun yerini **tutmuyor**:
  numarayı değiştiren bir bot sınırı görmeden geçer. Ayrı faz, çünkü
  Cloudflare panelinden site key + secret alınmasını gerektiriyor ve o iş
  koddan bağımsız.
- **Panelde randevuyu görmek — Faz H.** İşletme şu an gelen randevuyu
  yalnızca veritabanında görebiliyor. Faz G'nin uçtan uca elle
  doğrulamasının "panelde göründüğünü gör" adımı bu yüzden Faz H'ye kaldı.
- **Bildirim yok — Faz I.** Randevu alındığında müşteriye e-posta gitmiyor;
  iptal linki yalnızca 201 gövdesinde dönüyor. Müşteri o sayfayı kapatırsa
  linki kaybediyor.
- **`npm run build` bu oturumda koşturulmadı.** Tip kontrolü, lint ve 321
  testin tamamı yeşil; prod build merge öncesi koşturulmalı.

### Elle yapılması gerekenler (Faz G)

- [ ] `npm run build` ve ardından `npm run cf:onizle` ile workerd'de
      `/r/<slug>` akışını gör.
- [ ] Uçtan uca elle doğrulama: kaydol → hizmet + çalışma saati tanımla →
      gizli sekmede `/r/<slug>` → randevu al → iptal linkiyle iptal et.
      **Aynısı mobil genişlikte** — hedef kitle telefondan giriyor.
- [ ] `design-review` skill'i (plan.md: Faz G ve H sonrası koşturulur).
- [ ] Çalışma saatleri ekranındaki `<input type="time">` AM/PM sorunu hâlâ
      karara bağlanmadı — native alan mı, 15 dakikalık açılır liste mi.

---

## Faz G2 — bot koruması

**Dal:** `faz-g2/bot-korumasi` (Faz G'den dallandı, `main`'den değil) ·
**2 commit** · **341 test** (24 dosya), bunun **20'si** bu fazın.

Faz G'nin kodu bu işi kendi yorumlarında "G2'de gelecek" diye işaretlemişti;
o satırlar artık gerçek.

### Neden ayrı bir katman gerekliydi

Faz G'deki "aynı numarayla en çok 3 açık randevu" sınırı bot korumasının
yerini **tutmuyor**. Sınır numaraya bağlı; numarayı her istekte değiştiren
bir betik onu hiç görmeden geçiyor ve takvimi doldurabiliyor. Sınır kötü
kullanan **müşteriyi** durduruyor, Turnstile **betiği**.

Turnstile seçildi çünkü hesapta zaten var, ücretsiz ve çoğu ziyaretçiye
hiçbir şey göstermiyor. Randevu alan kitle telefondan geliyor; resim
seçtiren bir kapı, engellediğinden fazla meşru müşteri kaybettirirdi.

### Kararlar

**`TURNSTILE_MODU` varsayılanı `sahte`, ve yalnızca tam olarak "gercek"
yazılmışsa gerçek.** Tanımsızken gerçeğe düşmek, yeni geliştiricinin ilk
gününde her randevuyu 403'e çevirirdi. "acik"/"true"/"1" de gerçek
sayılmıyor: yazım hatası olan bir env sessizce bütün randevuları kapatmasın.
`BILDIRIM_MODU` ile aynı desen.

**Gerçek modda sır yoksa kapı KAPALI.** Yanlış yapılandırılmış bir üretim
dağıtımının korumasız çalışmasından iyidir: sessizce açık kalan bir kapıyı
kimse fark etmez, kapalı kapı ilk istekte görünür.

**Ağ hatasında da kapalı.** Alternatifi, Cloudflare'e ulaşılamadığı her anda
kapının kendiliğinden açılmasıydı — saldırganın tetikleyebileceği bir durumu,
korumanın kapanma koşulu yapmak olurdu.

**Üç sebep (eksik / geçersiz / ulaşılamadı) kullanıcıya aynı metni
gösteriyor.** "Sunucu Cloudflare'e ulaşamadı" demek meşru müşteriye yardım
etmiyor, botun ise hangi dalda olduğunu öğretiyor. Yapılabilecek tek şey her
durumda aynı: yenile, tekrar dene.

**Kapı slug çözümünden ÖNCE.** Geçemeyen istek veritabanına tek sorgu bile
açtırmıyor — bir betiğin saniyede yüzlerce istek atması Postgres'e değil
Cloudflare'e maliyet yazıyor. Testi de bu: olmayan slug + jetonsuz istek 404
değil **403** alıyor.

**IP `CF-Connecting-IP`'den okunuyor, `X-Forwarded-For` bilerek
okunmuyor** — ikincisini istemci serbestçe yazıyor ve jetonu IP'ye bağlama
güvencesini sahte bir değerle yok ederdi.

**Widget örtük (implicit) render.** Jetonu forma `cf-turnstile-response`
adıyla kendisi yazıyor. Açık render daha fazla denetim verirdi ama script'in
yüklenmesini beklemek, iki kez çalışmamasını sağlamak ve React yeniden
çiziminde widget'i temizlemek bize düşerdi — üç ayrı hata kaynağı,
ihtiyacımız olmayan bir esneklik karşılığında.

**Hatadan sonra widget sıfırlanıyor.** Jeton tek kullanımlık: 403 ya da 409
sonrası müşteri "tekrar dene" dediğinde aynı harcanmış jetonu gönderirdi ve
ikinci deneme, sebebi görünmeden her zaman başarısız olurdu.

**İki taraf aynı koşulda açılıp kapanıyor.** Anahtar tanımsızsa widget hiç
çizilmiyor ve sunucu `sahte` moda düşüyor — yerelde randevu almak için
Cloudflare hesabı gerekmiyor.

### Bilerek kapsam dışı

- **Hız sınırı koda girmedi, Cloudflare kuralı olarak kalıyor.** `plan.md`
  zaten böyle tarif ediyordu. Worker'ın `ratelimit` binding'iyle kod
  tarafında yapmak mümkün ama `wrangler.jsonc` üretim yapılandırmasını
  taşıyor ve bu oturumda `cf:onizle` ile **ölçülemedi**; ölçülmemiş bir
  runtime varsayımını o dosyaya sokmak bu depoda daha önce üç kez yanlış
  çıktı. Elle yapılacaklar listesinde.
- **Panel ve kimlik yollarında Turnstile yok.** `/api/giris` ve `/api/kayit`
  de halka açık, ama oturum açma denemesinin kendi geri bildirimi var ve
  kayıt e-posta doğrulamasına bağlanacak (Faz I). Ayrı bir karar olarak
  kalsın.
- **`npm run build` ve `cf:onizle` bu oturumda koşturulmadı.**

### Elle yapılması gerekenler (Faz G2)

- [ ] Cloudflare paneli → Turnstile → yeni site (`randevu.enesmemduhoglu.tech`).
      Widget türü **Managed**. Çıkan iki değer:
      - site key → `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. **Derleme anında**
        gömülüyor, yani `npm run cf:kur` adımında ortamda olmalı.
      - secret → `npx wrangler secret put TURNSTILE_SECRET`. `.env`'e
        yazılmıyor.
- [ ] Üretimde `TURNSTILE_MODU=gercek`. Bu satır girilene kadar kod yayında
      olsa bile kapı **açık** — koda bakıp "koruma var" demek yetmiyor.
- [ ] Cloudflare paneli → Security → WAF → **Rate limiting rules**. Ücretsiz
      planda tek kural hakkı var; `/api/randevu` ve `/api/musaitlik`
      yollarını tek ifadede eşleştir, sayaç karakteristiği **IP**. Süre ve
      eşik seçenekleri plana göre değişiyor, panelde görünen listeden en kısa
      pencere seçilsin.
- [ ] `cf:onizle` ile workerd'de gerçek modu ölç: sır `wrangler secret`
      üzerinden geldiği için `process.env`'de **görünmüyor**, binding
      dalının gerçekten çalıştığı ölçülmeden varsayılmasın.

      **Ölçerken `.env` değil `.dev.vars`.** workerd'de kod
      `getCloudflareContext().env`'i okuyor ve wrangler orayı `.dev.vars`'tan
      dolduruyor; `.env`'e yazılan `TURNSTILE_SECRET` `cf:onizle`'de
      görünmez ve kapı "sır yok" dalına düşüp her randevuyu 403 yapar —
      yani koda değil yanlış dosyaya bakmış olursun. `.env`'deki satır
      yalnızca `next dev` içindir.

---

## Faz H — panel takvimi

**Dal:** `faz-h/panel-takvimi` · **406 test** (28 dosya), bunun **65'i** bu
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
düğmeleri göstereceğini `GECISLER`'den, veritabanı koşullu UPDATE'in
`where`'ini `kaynakDurumlar()`'dan alıyor ve ikincisi birincisinden
**türetiliyor**. İki liste elle yazılsaydı birine eklenen geçiş diğerinde
unutulabilirdi ve hata "düğme görünüyor ama basınca hep 409 dönüyor" şeklinde,
sebebi hiçbir yerde yazılı olmadan ortaya çıkardı.

**Kaynak durum kümesi `scoped-db`'ye parametre olarak GEÇMİYOR.**
`randevuDurumunuDegistir(id, hedef)` kümeyi kendisi üretiyor. Parametre olsaydı
bir route "IPTAL → ONAYLI"yı kendi başına mümkün kılabilirdi ve kural iki yerde
yaşardı.

**Üç durum terminal: IPTAL, TAMAMLANDI, GELMEDI.** Bu bir ürün tercihi değil,
kısıt. İptali geri açmak slotu yeniden doldurmak demek ve o slot bu arada
başkasına verilmiş olabilir — `EXCLUDE` kısıtı 23P01 ile reddeder. Doğru
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
biten kayıt dışarıda, `EXCLUDE` kısıtının `'[)'` aralığıyla aynı kabul.

**Liste TÜM durumları döndürüyor, IPTAL dahil.** İşletme iptali görmek istiyor
("müşteri gelmedi mi, iptal mi etti"); hangisinin gösterileceği arayüzün
filtresi, verinin işi değil.

**Yol adı `/api/randevular` (çoğul), `/api/randevu` değil.** Halka açık ve
oturumsuz olan yollar tekil kalıyor. Ayrımı adreste tutmak, bir gün bu iki
sınıfın yanlışlıkla aynı kapıyı paylaşmasını zorlaştırıyor — panel yolunu
`/api/randevu/[id]/durum` yazsaydık oturumsuz bir yolun altına oturumlu bir yol
aşılamış olurduk.

**409 açıklaması randevunun MEVCUT durumunu söylüyor, istenen hedefi değil.**
Kullanıcının aradığı cevap "neden olmadı" ve cevap her zaman "kayıt artık başka
bir durumda" — çoğunlukla başka bir sekmede ya da müşteri iptal linkini
kullandığı için. 409'dan sonra çekmece bilerek **açık** kalıyor ve
`router.refresh()` çağrılıyor: mesaj okunsun, düğmeler gerçek duruma göre
yeniden çizilsin.

**Takvim durumu URL'de, bileşende değil.** `?gorunum=&tarih=&personel=`.
`useState` daha az kod olurdu; URL üç somut şey kazandırıyor: adres
paylaşılabiliyor, yer imine konabiliyor ve tarayıcının geri tuşu çalışıyor (ay
görünümünden bir güne inip geri dönmek refleks). Veri zaten sunucudan geldiği
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
client"; panel takviminin **sunucu** bileşeni aynı ay adını yazmak için oradan
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

**Şema göçü YOK.** Faz E'nin şeması takvimi olduğu gibi taşıyor;
`randevu_isletme_baslangic_idx` zaten "bu işletmenin şu tarih aralığındaki
randevuları" için konmuştu.

### Bilerek kapsam dışı

- **Elle randevu ekleme ve müşteri listesi — Faz H2.** Ekleme, `musaitlik.ts`'i
  panel tarafına bağlamayı gerektiriyor ve `musaitlik-sorgu.ts` şu an
  `getHalkaAcikDb`'ye kilitli: `getScopedDb`'de `kapaliAraliklariListele`,
  `doluRandevulariListele` ve `hizmetiVerenPersoneller` **yok**. İki yol var —
  sorgu katmanını yapısal bir arayüze gevşetmek, ya da eksik üç metodu
  `getScopedDb`'ye eklemek. Karar Faz H2'nin ilk işi.
- **Kapalı aralıklar (izin/tatil) takvimde görünmüyor.** `kapali` tablosu
  duruyor ama takvim yalnızca randevu çiziyor; işletme izin günlerini panelde
  göremiyor. Ayrı iş, çünkü kendi CRUD ekranı da yok.
- **Randevunun saatini/personelini panelden değiştirme yok.** `EXCLUDE`
  kısıtına çarpacağı için müsaitlik kontrolü gerektiriyor — elle eklemeyle aynı
  aile, aynı faz.
- **Route'un mutlu yol / 401 / IDOR testleri route dosyasında değil.** Depodaki
  kalıp: vitest'in node ortamında `cookies()` bağlamı yok, o yüzden route
  testleri yalnızca CSRF dilimini sınıyor; iş mantığı `scoped-db-randevu.test.ts`'te
  (17 test, IDOR ve koşullu UPDATE dahil).
- **`cf:onizle` bu oturumda koşturulmadı.** `npm run build` koştu ve temiz,
  ama workerd tarafı yine ölçülmedi.

### Elle yapılması gerekenler (Faz H)

- [ ] Uçtan uca: kaydol → hizmet + çalışma saati → gizli sekmede `/r/<slug>` →
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

## Oturum sonu durumu — 31 Ağustos 2026

**Canlı:** https://randevu.enesmemduhoglu.tech (G öncesi sürüm) ·
**Tek dal:** `main` · **341 test** (24 dosya)

Bu oturumda Faz G ve G2 kapandı: PR #7 ve #8 merge edildi, dalları silindi.

| Faz | Durum |
|---|---|
| A — iskele | kapandı |
| B — Cloudflare zemini | kapandı |
| C — tasarım dili | kapandı |
| D — kimlik ve kiracı | kapandı |
| E — şema ve panel CRUD | kapandı |
| F — müsaitlik motoru | kapandı |
| G — halka açık randevu sayfası | **kapandı** (PR #7) |
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

**Yayında değil:** `main` G ve G2'yi taşıyor ama prod'a deploy edilmedi.
Canlıdaki sürüm hâlâ Faz G öncesi — yani `/r/<slug>` üretimde 404.

### Bu oturumda ölçülmeyenler

Dürüstçe: `npm run build` ve `cf:onizle` **hiç koşmadı**. Tip kontrolü, lint
ve 341 testin tamamı yeşil, ama workerd tarafı ölçülmedi. Turnstile'ın
Cloudflare binding dalı da bu yüzden ölçülmemiş durumda.

### En kolay kaybedilecek üç ayrıntı

- **Turnstile kodu yayında olsa bile `TURNSTILE_MODU=gercek` girilene kadar
  kapı AÇIK.** Koda bakıp "koruma var" demek yetmiyor.
- **`cf:onizle`'de sır `.dev.vars`'tan okunuyor, `.env`'den değil.** Yanlış
  dosyaya yazılan sır sessizce "sır yok" dalına düşürür.
- **`NEXT_PUBLIC_` önekli her değişken derleme anında gömülüyor.** Site
  anahtarı `cf:kur` adımında ortamda olmalı; sonradan tanımlamak işe
  yaramaz.

### Faz H'ye başlarken

Veri katmanı büyük ölçüde hazır: `scoped-db.ts` randevu yazma ve iptal
metotlarını taşıyor, `randevuTokenIleGetir` join'leri (hizmet, personel,
müşteri) panelin de ihtiyaç duyacağı şekli gösteriyor.

Durum değiştirme **koşullu UPDATE** olacak (DEĞİŞMEZ 3) — iptalde kullanılan
desen birebir geçerli. Elle randevu ekleme aynı `EXCLUDE` kısıtına çarpacak,
yani 40P01 yeniden deneme mantığı orada da gerekli; `randevuOlustur`
paylaşılabilir.

---

## Altyapı — CI/CD

**Kapandı:** GitHub Actions ile doğrulama (`tip` → `lint` → `test` → `cf:kur`),
main'e merge sonrası onay kapılı Cloudflare yayını ve elle tetiklenen prod göç
iş akışı. Kullanım ve gereken sırlar: `docs/yayin.md`.

**Harfsiz dal (`altyapi/ci-cd`).** Plandaki I, J, K harfleri bildirim
altyapısı, müşteri hesabı ve SMS'e ayrılmış durumda; sıradaki fazın harfini
çalmak plan ile günlüğü kalıcı olarak ayırırdı. `duzeltme/...` dallarında
kullanılan kalıp izlendi.

### Kararlar

- **Doğrulama ve yayın aynı dosyada (`ci.yml`), göç ayrı (`goc.yml`).**
  Doğrulama ile yayın ayrı dosyalara bölünseydi ikisi de `on: push` ile aynı
  anda başlardı ve yayın, testlerin yeşil olduğunu bilemezdi — `needs:` dosya
  sınırını geçmiyor. Göç ise farklı bir tetikleyiciye sahip, orada böyle bir
  bağ yok.

- **Yayın onay kapılı, otomatik değil.** `uretim` GitHub Environment'ında
  zorunlu inceleyici var: iş kuyruğa girer ve "Approve" bekler. Gerekçe
  günlükte zaten yazılıydı — main uzun süre G ve G2'yi taşıyıp bilerek
  yayınlanmamıştı. Ayrıca `NEXT_PUBLIC_*` değerleri derlemeye gömülü olduğu
  için geri alma yeniden derleme demek, yani ucuz değil.

- **Prod göçü hatta değil, ayrı ve elle.** Drizzle migration'larının otomatik
  geri alma yolu yok. Kodu geri almak eski sürümü yeniden deploy etmek, şemayı
  geri almak elle SQL yazmak demek — aynı boruya konmamaları bu yüzden. İki
  kapı var: onay kutusuna `uygula` yazmak (koşum kaydında niyet izi bırakır) ve
  `uretim` ortam onayı (tetiği çekenin yetkisini doğrular).

- **CI `npm run build` değil `npm run cf:kur` koşuyor.** `cf:kur` önce
  `next build` çalıştırıyor, yani onun kapsadığı her şeyi kapsıyor; üstüne
  OpenNext'in worker paketini de üretiyor. Günlükte üst üste üç oturum
  "workerd tarafı ölçülmedi" notu düşülmüştü — paketleme hatası artık yayın
  anında değil PR'da çıkıyor.

- **Postgres servisi 5455 portuna eşlendi.** GitHub'ın varsayılanı 5432'ydi;
  yerel konteynerle aynı portu kullanmak, bağlantı dizesinin
  `.env.example`'daki satırın birebir aynısı olmasını sağlıyor. İki ortam
  arasında gidip gelirken "burada port kaçtı" sorusu hiç doğmuyor.

- **CI'da `DATABASE_URL` bilerek tanımsız.** `vitest.setup.ts` onu zaten
  `TEST_DATABASE_URL`'e eşitliyor. `randevu_test` veritabanını da
  `vitest.global-setup.ts` kendisi CREATE ediyor, yani `db:hazirla` adımına
  gerek kalmadı.

- **Node 24'e sabitlendi.** Tercih değil zorunluluk: `scripts/*.ts` ve
  `vitest.global-setup.ts` `.ts` dosyalarını doğrudan çalıştırıyor (node'un tip
  soyma desteği).

- **`tip` komutu artık `next typegen && tsc --noEmit`.** Hattın ilk koşumunda
  çıkan gerçek bir bulgu: `tsc` tek başına `RouteContext`'i bulamıyor, çünkü o
  tip Next'in ürettiği `.next/types/**` altında duruyor ve `.gitignore`'da.
  Yerelde yıllardır geçiyordu, çünkü `.next` eski build'lerden artakalıyordu —
  yani **temiz bir klonda `npm run tip` bugüne kadar kırıktı** ve bunu kimse
  görmemişti. Düzeltme CI adımına değil komutun kendisine konuldu; CI'a özel
  bir `typegen` adımı, yerel footgun'u yerinde bırakırdı. Maliyet ~2.7 saniye.

- **CI'ın build adımı sahte `NEXT_PUBLIC_SUPABASE_*` değerleriyle koşuyor.**
  Hattın ikinci bulgusu: `/giris` build anında prerender ediliyor ve
  `supabaseSunucu()` çağırıyor, değişkenler yoksa `ayarlar()` fırlatıp build'i
  düşürüyor. Yani "build ortam değişkeni istemez" varsayımı yanlıştı — bu da
  ölçümle çıktı, muhakemeyle değil. Sahte değer güvenli, çünkü hiçbir ağ
  çağrısı yapılmıyor: oturum cookie'si olmadan `getClaims()` token bulamayıp
  hemen dönüyor ve `cookies()` çağrısı sayfayı zaten dinamiğe düşürüyor.
  **Bedeli:** bu adım "değerler doğru mu" sorusunu yanıtlamıyor, yalnızca
  "kod derleniyor ve paketleniyor mu" sorusunu yanıtlıyor.

- **`NEXT_PUBLIC_*` değerleri secret değil repository variable.** Tanımı gereği
  halka açıklar — tarayıcıya gitmek üzere üretildiler ve kiracı izolasyonu
  onlara değil `scoped-db` katmanına dayanıyor. Secret olarak saklamak yanlış
  bir güvenlik hissi verirdi. Yayın işinin ilk adımı varlıklarını kontrol edip
  eksikse duruyor: eksik bir `NEXT_PUBLIC_*` build'i **düşürmüyor**,
  `undefined` gömülüyor ve hata canlıda giriş ekranında çıkıyor.

### Bilerek kapsam dışı

- **Dal koruması (branch protection) kurulmadı.** `dogrula` işini main'e merge
  için zorunlu kılmak repo ayarı, kod değişikliği değil; PR'ın diff'ine
  girmediği için ayrı ve görünür bir adım olarak bırakıldı.

- **Uçtan uca / tarayıcı testi yok.** Hat yalnızca depodaki mevcut doğrulama
  setini koşuyor. Playwright eklemek kendi başına bir iş ve `cf:onizle`
  üzerinde koşan bir smoke testi ancak yayın adresi kararlıyken anlamlı.

- **Yayın sonrası duman testi (canlı adrese istek) yok.** `/saglik` sayfası bu
  iş için hazır duruyor ama deploy'un DNS'e yayılma süresi belirsiz; sabit bir
  bekleme koymak yanlış negatif üretirdi.

- **Otomatik geri alma yok.** Yanlış giden bir yayında yol: önceki commit'i
  main'e al ve yayını yeniden onayla. Cloudflare panelindeki "Rollback" da
  çalışır ama o, deponun taşıdığı sürümle canlıdaki sürümü ayırır.

- **`wrangler.jsonc`'ye `vars` bloğu eklenmedi.** `TURNSTILE_MODU` ve
  `BILDIRIM_MODU` üretimde hâlâ tanımsız — yani Turnstile kapısı açık. Bu
  hattın değil, ayrı bir kararın konusu.

### Elle yapılması gerekenler (CI/CD)

- [x] `uretim` GitHub Environment'ı kuruldu: required reviewer + deployment
      branch policy `main`. İkincisi asıl olarak `goc`'u koruyor —
      `workflow_dispatch` herhangi bir daldan tetiklenebiliyor.
- [x] Secret'lar: `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_DB_URL` girildi
      (değerler `.env`'den ve `wrangler whoami`'den alındı).
- [x] Variable'lar: `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` girildi.
- [ ] **`CLOUDFLARE_API_TOKEN` eksik — yayını bloke eden tek şey.** Yerelde
      yok: `wrangler` OAuth ile giriş yapmış ve o jeton kısa ömürlü, CI'da
      kullanılamaz. Cloudflare panelinden *Edit Cloudflare Workers* şablonuyla
      üretilip `gh secret set CLOUDFLARE_API_TOKEN` ile girilmeli. Şablonun
      Hyperdrive iznini kapsamaması olası; deploy yetki hatası verirse
      **Hyperdrive: Edit** eklenir.
- [ ] `NEXT_PUBLIC_TURNSTILE_SITE_KEY` girilmedi, çünkü **widget hiç
      oluşturulmamış** (Faz G2'nin açık maddesi, bkz. yukarısı). Yayını
      durdurmuyor: `yayinla`nın kontrol adımı bu değişkeni aramıyor ve
      `TURNSTILE_MODU` üretimde zaten tanımsız, yani kapı bugünkü davranışıyla
      açık kalıyor.
- [ ] İlk yayından sonra canlıda `/saglik` ve `/r/<slug>` sayfalarını gözle
      doğrula — üretimdeki sürüm hâlâ Faz G öncesi, yani `/r/<slug>` şu an 404.

---

## Faz L — kalkan

Dizin (pazaryeri) açılmadan önce halka açık yolların savunması. Sıra bilinçli:
dizin her işletmeyi keşfedilebilir yapıp saldırı yüzeyini bir anda büyütüyor.

### Doğurduğu bulgu: Turnstile üretimde sessizce kapalıydı

`turnstile.ts` yalnızca `"gercek"` yazan değeri gerçek sayıyor, başka her değer
— ve tanımsızlık — kapıyı açıyor. `wrangler.jsonc`'de `vars` bloğu **hiç
yoktu**, yani üretimde `TURNSTILE_MODU` tanımsızdı ve bot kapısı Faz G2'den
beri koşulsuz geçiriyordu.

Kod doğruydu. Eksik olan bir satır değil, bir satırın **yokluğuydu** — ve
yokluk kod incelemesinde görünmüyor. `docs/yayin.md` durumu zaten yazmıştı;
eksik olan bilgi değil, kapatan bir değişiklikti.

### Yapılanlar

- `wrangler.jsonc > vars > TURNSTILE_MODU: "gercek"`.
- `wrangler.jsonc > ratelimits`: `RANDEVU_SINIRI` (5/dk, yazma) ve
  `MUSAITLIK_SINIRI` (60/dk, okuma). Panel WAF kuralı **değil** — bu dosya
  PR'da inceleniyor ve `wrangler dev` ile yerelde de koşuyor.
- `src/lib/hiz-siniri.ts` — sınırlayıcının tek çıkış noktası.
- `degismezler.test.ts`: **yapılandırma da sınanıyor.** İki binding'in ve
  `TURNSTILE_MODU="gercek"` satırının varlığı test koşumunda aranıyor; ayrıca
  wrangler'daki binding adıyla koddaki union üyesinin ayrışmadığı doğrulanıyor.
- `ci.yml`'e "turnstile iki yakası tutarlı mı" adımı (aşağıda).

### Ölçüm — `cf:onizle`, workerd

Varsayılmadı, ölçüldü (bkz. "ölçmeden runtime varsayımı yapma"):

| Ölçüm | Sonuç |
|---|---|
| `env.TURNSTILE_MODU` | `"gercek"` olarak bağlandı |
| `env.RANDEVU_SINIRI` / `MUSAITLIK_SINIRI` | ikisi de bağlandı |
| Jetonsuz `POST /api/randevu` | **403** (önce kapıdan geçiyordu) |
| Yabancı Origin | 403 (CSRF bozulmadı) |
| `CF-Connecting-IP` ile 8 POST | 1–5 → 403, 6–8 → **429** |
| Başlıksız 8 POST *(ilk sürüm)* | hepsi 403 — **sınır hiç ateşlemedi** |

Son satır bir tasarım hatasını açığa çıkardı: `istekIpsi()` yerel workerd'de
`null` dönüyordu ve kod "anahtar yoksa geçir" diyordu. Üretimde Cloudflare o
başlığı hep koyuyor, yani kod "çalışıyordu" — ama bu tam olarak Turnstile'ı
aylarca sessizce açık bırakan şeklin ta kendisiydi, yalnızca başka bir
değişkende. Düzeltildi: binding varken anahtarsız istekler **tek kovaya**
düşüyor, geçmiyor. Yeniden ölçüldü, başlıksız istekler de 6'dan sonra 429.

### Bilerek kapsam dışı

- **"Gelmedi" kısıtı (L3)**: şema göçü gerektiriyor, ayrı risk sınıfı —
  `/goc` ile ayrı faz.
- **SMS OTP (L2)**: `src/lib/sms.ts` henüz yok (Faz K'nin dosyası); adaptörü
  öne çekmek bu PR'ı iki konuya bölerdi.
- **Uygulama içi IP sayacı**: kenarda duran bir kural Postgres'e hiç sorgu
  açtırmıyor, uygulama sayacı ise her istekte bir yazma demekti.

### ELLE YAPILMASI GEREKEN — bu PR merge edilmeden önce

Turnstile'ın iki yakası **birlikte açılıp birlikte kapanacak** şekilde
tasarlanmış: `turnstile-alani.tsx:38` site anahtarı yoksa widget'ı hiç
çizmiyor. Bugüne kadar ikisi de kapalıydı ve simetri sessizce doğruydu. Modu
açmak o simetriyi bozuyor — sunucu jeton istiyor, istemci üretemiyor.

1. Cloudflare → Turnstile → widget oluştur (`randevu.enesmemduhoglu.tech`).
2. Site anahtarını `NEXT_PUBLIC_TURNSTILE_SITE_KEY` repository **variable**
   olarak gir (derleme anında gömülüyor, çalışma anında geç kalır).
3. `wrangler secret put TURNSTILE_SECRET`.

Bu üçü yapılmadan yayın hattı **düşer**: `yayinla` işine eklenen "turnstile iki
yakası tutarlı mı" adımı, `TURNSTILE_MODU=gercek` iken site anahtarı boşsa
derlemeyi reddediyor. Bilerek: sessizce açık bir kapıyı kimse fark etmiyor,
düşen bir yayın ilk denemede görülüyor.

**Durum (aynı oturumda tamamlandı):** widget oluşturuldu, `TURNSTILE_SECRET`
`wrangler secret put` ile Worker'a girildi (`wrangler secret list` ile
doğrulandı), site anahtarı `gh variable set` ile repository variable oldu.
Derlenmiş istemci paketinde site anahtarı görüldü — yani widget artık çiziliyor.

### Yayın sonrası ölçüm: hız sınırı yereldekinden çok daha gevşek

Deploy sonrası canlıda ölçüldü (5/dk sınırı, `POST /api/randevu`):

| Ortam | İlk 429 |
|---|---|
| Yerel workerd | 6. istek |
| **Üretim** | **22. istek**, sonrası kesintili (429, 403, 429) |

Kod doğru, binding bağlı (deploy logunda `env.RANDEVU_SINIRI (5 requests/60s)`).
Fark Cloudflare'in belgelendirdiği davranış: sayaç her isolate'in yerel
önbelleğinde ve kolo başına — *"permissive, eventually consistent... not an
accurate accounting system"*.

**Kabul edildi:** bu kapı kısa patlamayı durdurmuyor, sürekli seli yavaşlatıyor.
Korkulan tehdit (takvimi dolduran betik) dakikalarca istek atmak zorunda, yani
kapsanıyor. Kesin kota gerekirse KV/Durable Object gerekir, bedeli her istekte
bir yazma.

**Ders:** yerel `cf:onizle` ölçümü bu binding için üretimi temsil etmiyor.
"Yerelde 6. istekte tetikledi" demek, üretim hakkında yanlış güven veriyordu.

### Tuzak: `vars` eklemek tip kontrolünü kırdı, ama yalnızca CI'da

PR #13 yerelde dört kapıdan da geçtikten sonra CI'da `tip` adımında düştü.
Sebep: `cloudflare-env.d.ts` **üretilen** bir dosya ve `.gitignore`'da.
Yerelde en son `npm install` sırasında üretilmişti, yani `vars` bloğu eklenmeden
önceki haliyle duruyordu. CI ise `npm ci` → `postinstall` → `wrangler types`
zinciriyle onu yeniden üretti ve yeni tipler geldi.

`wrangler types` varsayılan olarak `vars` değerlerini **literal** tipe
çeviriyordu (`TURNSTILE_MODU: "gercek"`) ve `ProcessEnv`'e zorunlu alan olarak
yazıyordu. İki sonuç: testlerdeki `process.env.TURNSTILE_MODU = "sahte"` artık
tip hatası, `delete process.env.TURNSTILE_MODU` de öyle (TS2790).

Çözüm iki parça:

- `--strict-vars=false` (`cf:tip` ve `postinstall`) → `vars` değerleri `string`
  olarak üretiliyor. Literal tip burada **yanlış bir söz**: `vars` bir derleme
  sabiti değil, çalışma zamanı yapılandırması ve `.dev.vars` ile `process.env`
  onu meşru şekilde eziyor.
- `src/lib/test-ortam.ts > ortamiSil()` → `delete` için gereken cast tek bir
  yerde. Tip aslında doğruydu (üretimde o değişken hep var); testin taklit
  ettiği şey üretim değil, değişkenin hiç tanımlı olmadığı yerel/vitest ortamı.

**Ders:** üretilen ve gitignore'da olan bir dosya, yereli CI'dan sessizce
ayırabiliyor. `wrangler.jsonc` değiştiren bir işten sonra `npm run cf:tip`
koşturmadan "tip temiz" demek yanlış güven veriyor.

### Yan bulgu: yerel `cf:yayinla` sırrı pakete gömüyor

Ölçüldü: `.env` varken `next build` onu `.open-next/server-functions/default/.env`
içine kopyalıyor, yani `TURNSTILE_SECRET` Worker paketinin **içinde** yayınlanır.
İstemci paketine (`assets/`) girmiyor — halka açık sızıntı değil — ama betiği
okuyabilen görüyor ve `wrangler secret` ile döndürmek etkisiz kalıyor.

CI temiz checkout'ta koştuğu için `yayinla` işi bu sorunu yaşamıyor; risk
yalnızca `docs/yayin.md`'de belgelenen **acil yerel yayın** yolunda. Oraya uyarı
düşüldü. Kalıcı çözüm (`.env`'i build'den dışlamak ya da sırrı yalnızca binding'den
okumak) ayrı ve küçük bir iş — bu fazın konusu değil, bilerek ertelendi.
## Faz L3 — "gelmedi" kısıtı

**428 test** (29 dosya), bunun **17'si** bu işin. `npm run tip`, `npm run lint`,
`npm test` ve `npm run cf:tip` yeşil. Göç: `drizzle/0003_gelmedi-kisiti.sql`
(iki `ADD COLUMN`, ikisi de eklemeli).

> Dal önce **Faz L'den önceki** main'den çıkmıştı: worktree açılırken yerel
> `origin/main` referansı bayattı. O haliyle merge edilseydi Faz L'nin tamamını
> (`hiz-siniri.ts`, `wrangler.jsonc`'deki `vars` ve `ratelimits`, CI kapısı)
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

**Kiracıya özel olması ücretsiz geldi.** `musteri` zaten kiracı başına ayrı bir
satır (`musteri_isletme_telefon_idx`), yani aynı telefon numarası iki salonda
iki ayrı kayıt. Bir salonda gelmemek diğerinden randevu almayı engellemiyor ve
bunu iki ayrı IDOR testi arıyor: biri yazma yolunda (başka işletmenin
randevusunu GELMEDI yapmak müşterisini kısıtlamıyor), biri okuma yolunda (A'daki
kısıt B'nin sayfasında görünmüyor).

**Kısıtı yazan UPDATE, durumu değiştiren koşullu UPDATE ile AYNI
transaction'da.** Kısıt randevunun gerçekten GELMEDI'ye geçmesinin sonucu; iki
ayrı istekte yapılsaydı yarışı kaybeden ikinci sekme de cezayı bir kez daha
uzatırdı. Testi var: zaten GELMEDI olan randevuda ikinci çağrı 0 satır etkiliyor
ve kısıt milisaniyesine kadar aynı kalıyor.

**Süre `now()` ile veritabanı saatinden hesaplanıyor**, uygulamadan gelen bir
`Date` ile değil. Worker ile Postgres arasındaki saat kayması cezayı uzatıp
kısaltamıyor. `GREATEST(coalesce(mevcut, now()), now() + gün)`: var olan bir
kısıt KISALTILMIYOR — işletme ayarı 100 günden 30'a indirdiğinde ikinci bir
"gelmedi" cezayı azaltmış olurdu.

**Süre parametre değil, kapanış değişkeni.** `randevuDurumunuDegistir` ayarı
kendisi okuyor, `randevuOlustur` da `sahip.gelmediKisitiGun`'ü kapanıştan
alıyor — `otomatikOnay` gibi çağıran taraftan GELMİYOR. Gerekçe: route bir gün
ayarı geçmeyi unutsa koruma sessizce kalkardı ve hiçbir test bunu göstermezdi,
çünkü ayar alanı panelde dolu görünmeye devam ederdi.

**`gelmediKisitiGun = 0` kayıtlı bitiş tarihini de yok sayıyor.** Ayarı kapatan
işletme mevcut kısıtların da kalkmasını bekliyor. Alanları temizlemek yerine
okumada yok saymak, ayarı tekrar açınca geçmişin geri gelmesi demek — "yanlışlıkla
kapattım" durumunda doğru davranış bu. 0 iken GELMEDI işaretlemek yine de
çalışıyor: 0 "kaydı tutma" değil, "müşteriyi kapıya koyma".

**429 mesajı kısıtın SEBEBİNİ söylemiyor.** `POST /api/randevu` oturumsuz: bir
telefon numarası yazıp cevaba bakan herkes o kişinin bu işletmeye gelmediğini
öğrenirdi. Kısıtın VARLIĞINI gizlemek mümkün değil — meşru müşteriye ne zaman
tekrar deneyeceğini söylemek zorundayız — ama sebebini gizlemenin maliyeti yok:
mesaj tarihi veriyor ve "daha erken bir randevu için işletmeyi arayın" diyor.
Test metinde "gelmedi" kelimesinin geçmediğini de doğruluyor.

**Sınır `>`, yani bitiş anında kısıt bitmiş sayılıyor.** Eşitliği kısıtlı
saymak, "3 Mart 12:00'ye kadar" denen cezayı belirsiz biçimde uzatırdı. Tarih
işletmenin saat diliminde yazılıyor (DEĞİŞMEZ 7); sunucununkine göre yazılsaydı
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
- **Prod'a göç UYGULANMADI.** Göç yalnızca ekleme (`isletme.gelmedi_kisiti_gun`
  DEFAULT 30, `musteri.randevu_kisiti_bitis` nullable); geri alma iki
  `drop column`. `docs/yayin.md`'deki elle iş akışıyla uygulanacak.

### Doğrulama

- `npm run db:goc` + `npm run db:uygula` — yerel `randevu_dev`'e uygulandı
- `npm run cf:tip`, `npm run tip`, `npm run lint` temiz
- `npm test` — **423 test geçti** (28 dosya), üst üste üç koşumda
- Yeni testler: `scoped-db-randevu.test.ts` +11 (kısıtın yazılması ve
  okunması, iki IDOR, `GREATEST`, ayar 0, tam sınır), `randevu.test.ts` +3
  (uçtan uca 429 + mesajın tarih taşıması + sebebin sızmaması),
  `ayar-girdi.test.ts` +2

### Elle yapılması gerekenler (Faz L3)

- [x] **Prod göçü uygulandı** (2 Eylül 2026). Ama SIRA TERSTİ ve bu bir olay
      oldu: PR #16 merge edilip **deploy edildikten sonra** göç uygulandı.
      Arada üretimdeki kod, veritabanında olmayan iki kolonu `select`
      ediyordu — Drizzle açık kolon listesi ürettiği için `isletme` ve
      `musteri` okuyan her sorgu `column does not exist` ile düşüyordu.
      Ayrıntı ve alınan ders: aşağıda "Sıra bozulunca" bölümünde.
- [ ] Uçtan uca: randevu al → panelde "Gelmedi" işaretle → aynı numarayla
      tekrar randevu almayı dene, tarihli 429 mesajını gör → ayarı 0 yapıp
      tekrar dene, geçtiğini gör.
- [ ] Ayarlar ekranındaki yeni alanı mobil genişlikte gözle doğrula.

---

## Sıra bozulunca — 2 Eylül 2026

Faz L3'ün göçü prod'a **deploy'dan sonra** uygulandı. `docs/yayin.md` sırayı
zaten yazıyordu (önce göç, sonra deploy); eksik olan bilgi değil, sırayı
**zorlayan** bir şeydi.

### Neden sessiz kaldı

Deploy sonrası bakılan iki şey de yeşildi:

| Kontrol | Sonuç | Neden yanıltıcı |
|---|---|---|
| `/` | 200 | Kök sayfa hiç sorgu yapmıyor |
| `/saglik` | 200 | Yalnızca `select version()` koşuyor — şemaya bakmıyor |
| Supabase `list_migrations` | `[]` | O tablo Supabase CLI'ın (`supabase_migrations`); Drizzle kendi günlüğünü `drizzle.__drizzle_migrations`'ta tutuyor |

Gerçek durum ancak `information_schema.columns` sorgulanınca göründü:
`isletme` 14 kolon taşıyordu ve `gelmedi_kisiti_gun` aralarında yoktu.

**Drizzle bu hatayı yumuşatmıyor, sertleştiriyor.** `select()` açık kolon
listesi üretiyor; yani eksik bir kolon "o alan `undefined` gelir" değil,
`isletme` ya da `musteri` okuyan **her sorgunun** düşmesi demek —
`scoped-db.ts`'te beş çağrı noktası. Yani panelin ve randevu sayfasının
tamamı. Sessiz bozulma değil, görünmeyen bir tam durma.

### Alınan ders

`/saglik`'in 200 dönmesi bir şema kanıtı **değil**. Bir yayının sağlıklı
olduğunu söyleyen kontrol, uygulamanın gerçekten okuduğu bir tabloya
dokunmalı; `select version()` yalnızca "Postgres ayakta" diyor.

### Bilerek yapılmayan

- **Göçü Supabase MCP `apply_migration` ile uygulamak.** Uygulardı ama
  `drizzle.__drizzle_migrations`'a satır yazmazdı; bir sonraki
  `db:uygula:prod` 0003'ü yeniden koşup "column already exists" ile düşerdi.
  Doğru araç `scripts/prod-goc.ts`.
- **Göçü dal üzerindeyken koşmak.** `prod-goc.ts` `./drizzle` klasörünün
  TAMAMINI uyguluyor; `faz-m/dizin` üzerindeyken koşulsaydı henüz merge
  edilmemiş `0004_dizin.sql` de prod'a giderdi. Önce `origin/main`'e detach
  edildi, sonra dala dönüldü.
- **Deploy öncesi şema kontrolü betiği.** Prod'daki son migration hash'iyle
  `drizzle/meta/_journal.json`'ı karşılaştırıp uyuşmazlıkta deploy'u durduran
  bir adım doğru çözüm ve kullanıcıya önerildi; henüz yazılmadı.

---

## Faz M — pazaryeri dizini

**Kapandı:** şema ve kapalı listeler, kiracı-üstü okuma katmanı, panelde dizin
profili ve yayına çıkma anahtarı, halka açık `/dizin` sayfası.

**456 test** (31 dosya). `npm run tip`, `npm run lint`, `npm test`,
`npm run build` yeşil. `cf:kur` + `wrangler deploy --dry-run`: **1634 KiB
gzip** (3 MiB sınırının 1400 KiB altında). Göç: `drizzle/0004_dizin.sql`.

### Değişmez 1 burada esniyor — ve karşılığı

Bu deponun merkezi değişmezi "her sorgu bir kiracıya kapsanır".
`getScopedDb(oturum)` ve `getHalkaAcikDb(slug)` kiracıyı bir **kapanış
değişkeninde** tutuyor, yani çağıran taraf onu veremiyor. Bir dizin ise tanımı
gereği kiracı-üstü: amacı bütün işletmeleri listelemek.

Kapsama olmadığı için karşılığı, sızabilecek yüzeyin daraltılması
(`src/lib/dizin.ts`):

1. Yalnızca `isletme` ve `hizmet` okunuyor. `randevu`, `musteri`, `kullanici`,
   `bildirim_kuyrugu` bu dosyada **hiç geçmiyor**.
2. `hizmet` yalnızca **toplama** olarak: adet ve en düşük fiyat. Tek tek hizmet
   satırı dönmüyor — kart "4 hizmet, 300 ₺'den başlıyor" diyor, işletmenin
   fiyat listesini dizine kopyalamıyor.
3. Dönen tip (`DizinKarti`) **elle yazılmış ve kapalı**. `$inferSelect`
   kullanılmadı: şemaya yarın eklenen bir kolon buradan sessizce sızmasın.
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
geçerken kiracı kapısı sessizce zorlanamaz hale geldi ve iki faz incelemeye
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
  aynı sette gelseydi bir istek `{ ad: "…", yayinda: true }` gönderip kontrolü
  atlayabilirdi — alan yazılır, koşul bakılmazdı. **Kapatmak koşulsuz:**
  işletme kendini her an dizinden çekebilmeli.

- **Eksikler sayılarak dönüyor, tek bir "olmadı" ile değil.** Neyi
  tamamlaması gerektiğini söylemeyen bir ret, ayarlar ekranında tıkanmış
  kullanıcı demek. Route ham anahtar döndürüyor (`il`, `hizmet`, …), cümleyi
  arayüz kuruyor: her eksiğin yanında gidilecek bir ekran var ve o bağlantı
  route'ta bilinmiyor.

- **Eksik profil 409, 400 değil.** İstek biçimsel olarak doğru, kaydın bugünkü
  durumuyla çatışıyor. 400 deseydik istemci gövdesini düzeltmeye çalışırdı;
  düzeltilmesi gereken gövde değil işletme profili.

- **il/kategori `pgEnum` ya da ayrı tablo DEĞİL**, düz `text` + kapalı TS
  listesi — `ayar-girdi.ts > SAAT_DILIMLERI` emsali. Bunlar durum makinesi
  değil referans alanı. `pgEnum` olsalardı her yeni kategori bir `ALTER TYPE
  … ADD VALUE` göçü (ve o değerin aynı transaction'da kullanılamaması tuzağı)
  isterdi. Ayrı tablo olsalardı her dizin sorgusuna bir join eklerdi.
  **Bedeli:** DB geçersiz bir değeri engellemiyor. Kabul edildi, çünkü bu
  alanlar tek bir yoldan yazılıyor (panel ayarları) ve o yol doğrulamadan
  geçiyor.

- **İlçe serbest metin ve FİLTRE DEĞİL.** ~1000 ilçenin il eşlemesini doğru
  tutmak ayrı bir veri yatırımı; ilçe yalnızca kartta görünen bir etiket ve
  yanlış yazılmış bir ilçe hiçbir sorgunun sonucunu bozmuyor. Filtre olsaydı
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
  sorgunun iki çağrısında farklı sıra üretip sayfalamayı bozardı.

- **Sayfa üst sınırı 200.** Derin `OFFSET` Postgres'te pahalılaşıyor ve dizinde
  binlerce sayfa gezmenin meşru bir kullanımı yok; sınır kazıyıcının maliyetini
  de sabitliyor. Arayüz aynı sınırda duruyor — durmasaydı "Sonraki" sessizce
  aynı sayfayı getirirdi.

- **Filtre düz bir GET formu, istemci bileşeni değil.** Bu sayfa ürünü hiç
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
  önbelleksizlik şart: sayfa bir yazma kararını besliyor ve bayat bir hizmet
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
oradan import etmek, kiracı-üstü dizine bir veritabanı modülünü bağımlılık
yapardı.

**Bu hata elle doğrulamada çıktı, testte değil** — mevcut arama testi
`"berber"` ve `"NISAN"` gibi ASCII adlar kullanıyordu ve ikisi de geçiyordu.

**2. İl listesi `localeCompare(…, "tr")` ile sıralanamıyor.** 81 il panelde
plaka sırasında gösterilemez, ama liste hem sunucuda (workerd) hem tarayıcıda
**aynı** sırayı üretmek zorunda ve workerd'in ICU derlemesi tam değil — iki
taraf farklı sıralarsa React hidrasyonda uyuşmazlık görüyor. Elle yazılmış harf
tablosu (`trKarsilastir`), `SAAT_DILIMLERI` ve `paraBicimle`nin emsalini
izliyor.

### Bilerek kapsam dışı

- **Sıralama seçeneği yok** (ada göre sabit). Gerçek sıralama sinyali
  (yakınlık, doluluk, puan) ürün kararı; puan için değerlendirme sistemi, konum
  için koordinat gerekiyor ve ikisi de bu fazda yok.
- **Harita ve konum araması yok.** İşletmenin koordinatı şemada yok; adres
  serbest metin. Coğrafi arama ayrı bir veri yatırımı (geocoding + PostGIS).
- **Dizin sayfası `robots`/`sitemap` ile beslenmiyor.** Arama motoru
  görünürlüğü ayrı bir konu ve bugün dizinde üç işletme var; boş bir dizini
  indekslettirmenin faydası yok.
- **Hız sınırı konmadı.** `/dizin` bir okuma yolu ve `/api/musaitlik`in aksine
  ucuz; kazıyıcının maliyeti sayfa üst sınırıyla zaten sabitlenmiş durumda.
  Trafik geldiğinde Faz L'nin `hiz-siniri.ts`'i bu yola da bağlanabilir.
- **Kategori listesi küçük başladı** (dokuz kalem). Doldurulamayacak kadar çok
  boş kategoriyle açılan bir dizin boş görünür; talep geldikçe büyür ve göç
  gerektirmiyor.
- **İşletmenin dizindeki görünümünü önizlemesi yok.** Kart, kayıtlı alanlardan
  kuruluyor ve ayarlar ekranı hepsini gösteriyor; ayrı bir önizleme ekranı bu
  fazın kazancına değmezdi.

### Doğrulama

- `npm run tip`, `npm run lint` temiz
- `npm test` — **456 test geçti** (31 dosya, gerçek Postgres)
  - `dizin.test.ts` 16 (görünürlük kapısı, filtreler, toplama, Türkçe arama)
  - `degismezler.test.ts` +4 (dizin.ts'in şeklini zorlayan tarama)
  - `ayar-girdi.test.ts` +5 (dizin alanları ve il sıralaması)
  - `dizin.test.ts` (route) 3 — CSRF dilimi
- `npm run build` başarılı, 34 route
- `cf:kur` + `wrangler deploy --dry-run`: **1634.49 KiB gzip**
- **Elle (`next dev`, tohumlanmış `randevu_dev`):** `/dizin` 200 ve yalnızca
  `yayinda=true` olan üç işletmeyi listeliyor (dördüncüsü yayında değil ve
  görünmüyor); `?il=İstanbul` ikiye, `?kategori=Berber` bire iniyor;
  `?il=Paris` (listede olmayan değer) filtreyi düşürüp tam listeyi veriyor;
  `?arama=%` ve `?arama=_` boş dönüyor (joker kaçışı); `?sayfa=999` boş;
  `Işıl / ışıl / işıl / isil / ISIL` yazımlarının **beşi de** aynı kaydı
  buluyor

### Elle yapılması gerekenler (Faz M)

- [x] **Prod göçü uygulandı — bu sefer DEPLOY'DAN ÖNCE** (2 Eylül 2026 19:22
      UTC, `npm run db:uygula:prod -- --onayla`). Doğrulandı: dört kolon
      yerinde (`yayinda` NOT NULL DEFAULT false), `isletme_dizin_idx` ve
      `isletme_yayin_alanlari_tam` mevcut, journal 5 satır, iki mevcut işletme
      korundu ve ikisi de `yayinda=false` — yani dizine kendileri girene kadar
      görünmüyorlar. Canlıdaki (henüz eski) kod etkilenmedi: `/`, `/r/berber`,
      `/r/demo-guzellik-salonu` 200.

      > **`goc` iş akışı bu göç için KULLANILAMADI** ve bu bir yapılandırma
      > çelişkisi: `goc`, `uretim` ortamına bağlı ve o ortamın deployment
      > branch policy'si yalnızca `main`'e izin veriyor. Ama iş akışının kendi
      > başlığı "önce bu iş akışını koştur, sonra merge et" diyor — yani göç
      > henüz `main`'de olmayan bir dosyayı uygulamak zorunda. İki kural aynı
      > anda sağlanamıyor.
      >
      > Bu sefer `docs/yayin.md`'nin ikinci yolu (yerelden `db:uygula:prod`)
      > kullanıldı; L3'ün elle listesi de ikisini eşdeğer sayıyordu. **Kalıcı
      > çözüm aynı gün verildi:** aşağıdaki "Onay kapıları kaldırıldı"
      > bölümü.
- [ ] Uçtan uca: ayarlarda il + kategori doldur → "Dizine ekle" → `/dizin`'de
      kartı gör → "Dizinden çıkar" → kartın kaybolduğunu ama `/r/<slug>`in
      hâlâ çalıştığını gör.
- [ ] Eksik profille "Dizine ekle" → 409 ve eksikler listesi ekranda görünüyor
      mu, bağlantılar doğru ekrana gidiyor mu.
- [ ] `/dizin` ve ayarlardaki yeni bölümü **mobil genişlikte** ve **koyu
      temada** gözle doğrula. Bu oturumda tarayıcı eklentisi bağlanamadığı için
      görsel doğrulama yapılmadı; kontroller HTTP üzerinden yapıldı.

### Bilinen yerel gürültü

`randevu_dev`'deki `agdas-berber` kaydının adı bozuk kodlanmış
(`Çağdaş Berber` yerine tek bayt hatalı bir dize) ve slug'ı `agdas-berber`.
Önceki bir oturumun elle tohumundan kalma; kod hatası değil. `cagdas` araması
bu yüzden bu kaydı bulmuyor, `agdas` buluyor.

---

## Onay kapıları kaldırıldı — 2 Eylül 2026

**Merge eden yayınlamış olur.** `yayinla` işi artık beklemiyor, `goc` işi de
herhangi bir daldan onaysız koşuyor. Kullanıcı kararı: *"pr'ı merge ettikten
sonra otomatik deploy gerçekleşsin, zaten bir sorun olduğunda önceki deploya
dönebiliriz."*

### Kaldırılan kapının dayandığı varsayım yanlıştı

`docs/yayin.md` onay kapısını şöyle gerekçelendiriyordu: *"`NEXT_PUBLIC_*`
değerleri derlemeye gömülü olduğu için geri alma 'yeniden derleme' demek — yani
ucuz değil."*

Ölçüldü, varsayılmadı: `npx wrangler versions list` üç ayrı sürümü listeliyor
ve `wrangler rollback` bunlardan birine dönüyor. Yani **geri alma yeniden
derleme değil**, saklanmış bir sürüme geçiş. Cümle Faz B'de yazıldığında
Cloudflare'in sürüm geçmişi bu depoda hiç denenmemişti.

### İki kapı, iki farklı sebep

| Kapı | Neden kaldırıldı |
|---|---|
| `yayinla` → `environment: uretim` | Dayandığı varsayım yanlıştı (üstte). Rollback ucuz. |
| `goc` → `environment: uretim` | **Çelişkiliydi ve uygulanamazdı** (altta). |

`goc`'un ortam bağı bir hataydı: `uretim` ortamının branch policy'si yalnızca
`main`'e izin veriyor, ama iş akışının kendi başlığı *"önce bu iş akışını
koştur, sonra merge et"* diyor — yani göç, tanımı gereği henüz `main`'de
**olmayan** bir dosyayı uygulamak zorunda. İki kural aynı anda sağlanamıyordu.

Faz M'de görüldü: `0004_dizin.sql` yalnızca dalda duruyordu ve iş akışı onu
uygulayamadı. L3'te fark edilmemişti, çünkü o göç yanlışlıkla merge *sonrası*
koşulmuştu — **hatanın kendisi çelişkiyi gizlemişti**.

### Kapı dosyadan kaldırıldı, ortam ayarından değil

`uretim` ortamı GitHub'da hâlâ duruyor; ona başvuran bir iş kalmadığı için
hiçbir şeyi etkilemiyor. `environment:` satırları `ci.yml` ve `goc.yml`'dan
silindi.

Gerekçe: kapı görünmez bir depo ayarında değil, PR'da **incelenen** bir dosyada
dursun. Aynı gerekçeyle hız sınırları da WAF kuralı değil `wrangler.jsonc`'de
(Faz L) — ve Faz L'nin bulgusu tam da buydu: `wrangler.jsonc`'de `vars` bloğunun
**yokluğu** kod incelemesinde görünmüyordu ve bot kapısı aylarca sessizce
açıktı. Bir ayarın varlığı ya da yokluğu, ancak baktığın dosyada duruyorsa
okunabilir.

Yan fayda: ortam secret'ı hiç kullanılmıyordu (`CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_DB_URL` üçü de **repository** secret'ı), yani
bağı kaldırmak hiçbir sırrı kırmadı. Kontrol edildi, denenmedi.

### Kaybedilen ve bilerek kabul edilen

- **Kazayla merge edilen bir PR artık doğrudan canlıya çıkıyor.** Karşılığı
  rollback'in ucuz olması. Asıl koruma zaten `dogrula` işiydi: tip, lint, 456
  test ve `cf:kur` yeşil olmadan `yayinla` hiç başlamıyor.
- **GitHub'ın Deployments sekmesindeki ortam geçmişi** artık dolmuyor. Yayın
  geçmişinin gerçek kaynağı zaten Cloudflare'in sürüm listesi.

### Değişmeyen: şema hâlâ tek yön

Rollback'in ucuzluğu **yalnızca kod için** geçerli. `scripts/prod-goc.ts` ileri
gider, geri gitmez; bir yayını geri almak şemayı geri almıyor. Bu yüzden:

- `goc` hâlâ ayrı bir iş akışı ve hâlâ `"uygula"` yazılmasını istiyor. O kapı
  kaldırılmadı: koşum kaydında "bunu isteyerek yaptım" izi bırakıyor.
- Geri alınması gerekebilecek bir göç yazarken **geri alma SQL'i PR
  açıklamasına elle yazılmaya devam ediyor**.
- Sıra artık "önce göç, sonra **merge**" — "sonra yayın" değil. Merge anı yayın
  anı olduğu için aradaki pencere kapandı; göç merge'den önce koşmazsa kolon
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

DEĞİŞMEZ 1 gereği kiracıya bağlı her sorgu buradan geçiyor — dosyanın büyümesi
tasarımın sonucu, hatası değil. Ama 1065 satır okunabilirlik sınırını geçti.

**Bölme ekseni tablo değil, KULLANIM olmalı.** Test dosyaları
(`scoped-db-randevu.test.ts`, `scoped-db-hizmet.test.ts`) bu ayrımı zaten
yapmış; kaynak onları takip etsin.

> **Bölerken dikkat:** `getScopedDb`'nin kapanış değişkeni (`isletmeId`) tek
> yerde kalmalı. Her parça kendi bağlantısını kurarsa değişmez zorlanamaz hale
> gelir — Faz B'de Prisma'dan Drizzle'a geçerken aynı kapı bir kez sessizce
> kaybolmuştu ve iki faz boyunca yalnızca incelemeye bağlı kaldı. ESLint
> `no-restricted-imports` muaf listesi ve `degismezler.test.ts` de
> güncellenmeli.

### 2. `/panel/gelistirici/vitrin` üretimde açık

264 satırlık bileşen vitrini (Faz C'de tasarım doğrulaması için yazıldı) canlıda
erişilebilir. Sızıntı değil — oturum arkasında ve kiracı verisi göstermiyor —
ama üretim yüzeyinde geliştirici aracı durmamalı ve bundle'a giriyor.

Karar: **silme, env bayrağıyla kapat.** Vitrin tasarım değişikliğinde hâlâ işe
yarıyor; yerelde açık, üretimde 404 olsun.

### 3. Uyarı ve hata takibi yok

> **Düzeltme (aynı gün):** bu madde ilk yazıldığında "gözlemlenebilirlik yok"
> deniyordu. Yanlış — `wrangler.jsonc`'de **`observability.enabled: true` zaten
> var**, yani Workers Logs açık ve geçmiş Cloudflare panelinden sorgulanabiliyor.
> Eksik olan log değil, **loga bakan bir şey**.

Üretimde bir hata olsa kimse haberdar olmuyor: log düşüyor ama uyarı çıkmıyor ve
kimse panele bakmıyor. `/saglik` de bu boşluğu kapatmıyor — L3'te gerçek bir
şema sorununu **yakalamadığı** görüldü, çünkü yalnızca `select version()`
koşuyor.

En az gereken: yakalanmamış istisnaların bir kanala düşmesi (hata takibi ya da
Workers Analytics Engine üstüne bir uyarı), `/saglik`'in şemayı gerçekten
kontrol etmesi.

> **DEĞİŞMEZ 5 burada kritik.** Hata takibine giden yükte token, anahtar ve
> bağlantı dizesi olmayacak. Üçüncü parti bir servise gönderiyorsak süzgeç tek
> bir kapıdan geçmeli — `email.ts > gonder()` deseninin aynısı.

### 4. `robots.txt` ve `sitemap.xml` yok

Faz M'de bilerek ertelendi: *"bugün dizinde üç işletme var, boş bir dizini
indekslettirmenin faydası yok."* **Ürün yönü pazaryerine döndüğü için bu gerekçe
artık geçerli değil** — dizinin Google'da bulunması ürünün kendisi.

Gereken: `app/robots.ts` ve `app/sitemap.ts`, `/r/<slug>` sayfalarının sitemap'e
girmesi, ve `/dizin`'in **filtre parametrelerinin indekslenmemesi** — faceted
navigation yinelenen içerik üretiyor ve pazaryeri SEO'sunda en sık görülen
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
eklenti olarak geldi, ürünün kendisi olarak değil.

Kullanıcının cümlesi: *"kullanıcı bu siteyi sadece birinin instasından görüpte
kullanmasın. herhangi bir işini halletmek için randevu almak istediğinde bu
siteye girsin."*

### Araştırmadan gelen üç bulgu

1. **Hepsi arzla başladı.** Booksy tek bir topluluğa (berberler) odaklanıp
   abonelikli SaaS olarak büyüdü — "bir pazaryeri değil ve randevu başına para
   almıyor". Fresha işletmelere **bedava yazılım** verip arzı topladı, tüketici
   pazaryerini sonra ekledi. Sektörün ortak reçetesi: önce arzı tohumla,
   tek-oyunculu modda çalışan bir ürün yap, coğrafi olarak yoğunlaş.
2. **Ama "arz-önce" ile "işletme odaklı arayüz" aynı şey değil.** Booksy bugün
   tamamen tüketici yüzlü. Yani tüketici yüzlü siteyi şimdi kurmakla, büyümeyi
   tek tek salon kaydederek yapmak çelişmiyor. İtirazım bu noktada düzeldi.
3. **Türkiye'de tüketici-önce konum boş.** Kolay Randevu, Salon Randevu (URL'i
   `/isletmeler-icin`), RandevuKur, Hızlıappy, EnRandevu, Kuaförüm Yanımda —
   hepsi "randevu programı/yazılımı" diyor. Tüketiciye konuşan tek örnek
   Online Güzellik.

Para modelinde de ortak desen var: Fresha %20, Booksy %30 (opsiyonel Boost),
Treatwell %35 — hepsi **yalnızca pazaryerinden gelen YENİ müşterinin ilk
randevusunda**, ve **üçü de dönen müşteriden hiçbir şey almıyor**. Pazaryeri
keşfi paraya çeviriyor, kullanımı değil.

### Reddedilen alternatif

**Saf SaaS'ta kalmak** (benim ilk önerimdi). Gerekçesi geçerliydi: pazaryeri bir
özellik değil arz problemi, ve prod'da bugün **2 işletme, 0'ı yayında, 1 randevu
(bizim testimiz)** var. Boş bir pazaryeri ana sayfası bugünkünden kötüdür.

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
  Prisma yok. Bağlantı da "Direct connection" diyordu, oysa Supavisor session
  mode kullanılıyor (direct IPv6-only ve erişilemiyor).
- **Fazlar:** K'de bitiyordu. L, L3 ve M plan dışı kalmıştı.
- **Değişmezler:** 11 madde vardı, ama kod ve test **DEĞİŞMEZ 12**'yi kullanıyordu
  (`degismezler.test.ts:119`, `slug.ts:8`). Test zorluyor, sözleşme bilmiyordu —
  `CLAUDE.md`'ye eklendi.

Yeni faz sırası: ~~**N** (ön kapı)~~ → ~~**I** (bildirim)~~ →
**O** (keşfedilebilirlik) → **J** (müşteri hesabı) → **P** (sağlamlaştırma) →
**K** (SMS).

---

## Faz N — ön kapı

**Kapandı:** halka açık sayfaların ortak üst barı ve alt bilgisi, kök sayfanın
müşteriye çevrilmesi (arama + dokuz kategori kutucuğu + şehir bölümleri),
işletme içeriğinin `/isletmeler-icin`'e taşınması, `/randevularim` yer tutucusu,
metadata'nın müşteri diline geçmesi.

**459 test** (31 dosya). `npm run tip`, `npm run lint`, `npm test`,
`npm run build` yeşil. `cf:kur` + `wrangler deploy --dry-run`: **1635.64 KiB
gzip** (önceki 1634.49 — +1.15 KiB). **Göç yok.**

### Kararlar

- **`enCok` kısabiliyor ama BÜYÜTEMİYOR.** Şehir bölümü altı kart istiyor; üst
  sınır yine `SAYFA_BOYUTU`. Olmasaydı `enCok: 10000` yazan bir çağrı sayfalama
  sınırının etrafından dolaşıp tek istekte bütün dizini çekerdi. `toplam`
  kırpılmadan dönüyor: "N işletmenin tümü" bağlantısı gösterilenden fazlası olup
  olmadığını o sayıdan biliyor; kırpılsaydı bağlantı hiç görünmez ve kalan
  işletmelere gidilemezdi.

- **`VITRIN_ILLERI` kapalı listede ve testle bağlı.** Dizin sorgusu geçersiz bir
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

- **Öneri listesi (autocomplete) yok.** Her tuşa basışta sunucuya soran bir kutu
  hem ana sayfayı istemci bileşenine çevirirdi hem de bugün önerecek bir şey yok.
  Dizin dolunca değer kazanır.

- **`/randevularim` liste göstermiyor** ve bu bilinçli: liste müşteri hesabı
  istiyor (Faz J), bugün randevunun kimliğini token taşıyor — sunucunun elinde
  "bu ziyaretçinin randevuları" diye bir küme yok. Bağlantıyı üst bardan
  çıkarmak yerine sayfa bugünkü cevabı veriyor; kullanıcı önce o başlığı arıyor.

- **"İşletme misiniz?" mobilde üst barda gizli, alt bilgide açık.** Dar ekranda
  üst barın işi müşteriyi randevusuna götürmek.

### Ortaya çıkan gerçek hata

**Tailwind'de `hidden` sessizce eziliyordu.** Paylaşılan bağlantı sınıfı
`inline-flex` içeriyordu ve `` `${BAGLANTI} hidden sm:inline-flex` `` yazıldığında
Tailwind aynı özelliği yazan iki utility arasında **kaynak sırasına değil
üretilen CSS sırasına** bakıyor: `hidden` uygulanmıyordu. 390px genişlikte
ölçüldü — "İşletme misiniz?" mobilde de görünüyor ve barı iki satıra çıkarıyordu.
Çözüm: display sınıfı paylaşılan dizeden çıkarıldı, her bağlantı kendi yazıyor.

**Tarayıcıdan görüldü, testte değil.** Faz M'deki Türkçe arama hatasıyla aynı
sınıf: yalnızca gözle bakılınca çıkan bir kusur.

### Bilerek kapsam dışı

- **`robots.txt` / `sitemap.xml` yok** — Faz O'nun kendisi (teknik borç 4).
- **Sıralama sinyali yok.** Şehir bölümleri de ada göre sıralı; gerçek sıralama
  (yakınlık, doluluk, puan) hâlâ verilmemiş bir ürün kararı.
- **Müşteri hesabı yok** (Faz J). `/randevularim` onun yer tutucusu.
- **Harita, konum ve "yakınımdakiler" yok.** İşletmenin koordinatı şemada yok.
- **Ana sayfada hız sınırı yok.** `/dizin` ile aynı gerekçe: okuma yolu ucuz ve
  kart sayısı sabitlenmiş. Faz L'nin `hiz-siniri.ts`'i trafik geldiğinde bağlanır.
- **Alt bilgi kısa** (hakkımızda/gizlilik/iletişim yok): o sayfalar yazılmadı ve
  olmayan sayfaya bağlantı vermek kullanıcıyı 404'e götürmek olurdu.

### Doğrulama

- `npm run tip`, `npm run lint` temiz
- `npm test` — **459 test geçti** (31 dosya, gerçek Postgres); `dizin.test.ts`
  +3 (`enCok` kırpması, üst sınır, vitrin illerinin geçerliliği)
- `npm run build` başarılı, 36 route (`/isletmeler-icin` ve `/randevularim`
  statik üretiliyor — ikisi de veritabanına dokunmuyor)
- **Elle (`next dev`, tohumlanmış `randevu_dev`, tarayıcı eklentisi):**
  `/`, `/dizin`, `/isletmeler-icin`, `/randevularim` 200; ana sayfada yalnızca
  İstanbul bölümü çiziliyor (Bursa'da yayında işletme yok — boş bölüm
  gösterilmiyor); hero'dan `isil` araması `/dizin?arama=isil`e gidip iki kaydı
  buluyor; **390px genişlik** ve **açık/koyu tema** ikisi de gözle doğrulandı.

### Elle yapılması gerekenler (Faz N)

- [ ] Üretimde `/` artık dizine bakıyor ve prod'da **yayında işletme yok** —
      yani canlıda boş durum görünecek. Beklenen; demo işletmeyi dizine
      çıkarmak isteniyorsa panelden "Dizine ekle".
- [ ] Prod'da `Bursa` bölümü ancak o ilde yayında bir işletme olunca çıkar.

### Not: tasarım zinciri

`/design` çağrıldı; yönlendirme tablosu bu iş için `ui-styling` alt-skill'ine
gidiyor ve o skill `skillOverrides`'ta **model çağrısına kapalı**. Yerleşim ve
UX kararları `ui-ux-pro-max` (product/ux alanları) ve deponun kendi
`docs/tasarim-sistemi.md`'siyle verildi; yeni palet ya da tipografi
üretilmedi — mevcut token'lar kullanıldı.

---

## Faz I — bildirim altyapısı

**Kapandı:** `email.ts > gonder()` adaptörü, `bildirim-sablon.ts` (altı şablon),
`bildirim.ts` (hangi olayda ne kuyruğa girer, kuyruk nasıl boşalır), kuyruk
metotlarının `scoped-db.ts`'e eklenmesi, üç route'un bağlanması ve
`/panel/gelistirici/bildirimler` ekranı.

**489 test** (34 dosya). `npm run tip`, `npm run lint`, `npm test`,
`npm run build` yeşil. `cf:kur` + `wrangler deploy --dry-run`: **1664.74 KiB
gzip** (önceki 1635.64 — +29.1 KiB). **Göç yok** — `bildirim_kuyrugu` tablosu
Faz E'de tam da bu faz göç istemesin diye kurulmuştu.

### Kararlar

- **Resend SDK'sı EKLENMEDİ, düz `fetch` var.** Kullanılan yüzey tek bir POST
  ve bu depo sert bir bundle sınırıyla yaşıyor (3 MiB gzip). Yan etkisi:
  DEĞİŞMEZ 4'ü zorlayan warden kapısı `resend.emails.send` metnini arıyor ve o
  metin artık hiç oluşmuyor — yani kapı bir şey görmüyor. Gerçek zorlama
  `degismezler.test.ts`'e taşındı: `api.resend.com` yalnızca `email.ts`'te
  geçebiliyor. **Aynı hikâyenin üçüncü tekrarı** (Faz B'de Prisma→Drizzle,
  Faz E'de `panelKapisi`): kapının göremediği kural testle geri geliyor.

- **Anahtar yoksa gönderim SAHTEYE DÜŞMÜYOR.** `BILDIRIM_MODU=gercek` ama
  `RESEND_API_KEY` yoksa kuyruğa `anahtar-yok` hatası yazılıyor. Sahteye
  düşseydi üretimde hiçbir mail gitmez ve kuyruk "gönderildi" derdi — Faz L'de
  Turnstile'ın aylarca sessizce kapalı kalmasıyla birebir aynı hata sınıfı.
  `wrangler.jsonc > vars` içindeki `"gercek"` de teste bağlandı.

- **Önce üstlen, sonra gönder.** `bildirimiUstlen` koşullu UPDATE ile satırı
  `BEKLIYOR` → `GONDERILDI` yapıyor; 0 satır dönerse gönderim atlanıyor.
  Alternatif ("gönder, sonra işaretle") aynı mesajı iki kez gönderebilirdi —
  Faz K'nin cron'u istek içi boşaltmayla yarışacak. **Bedeli bilinerek
  seçildi:** işaretledikten sonra Worker ölürse mesaj gönderilmeden
  "gönderildi" kalır. Müşteriye aynı onayı iki kez yollamak, kaybolan bir onay
  mailinden daha görünür ve daha güven kırıcı.

- **Gönderim yanıttan SONRA (`after`).** Müşteriyi "randevunuz alındı"
  ekranına götürmeden önce Resend'in cevabını beklemek, iyi günde yüzlerce ms
  eklerdi. **Ölçüldü, varsayılmadı:** derlenmiş worker'da (`.open-next/
  server-functions/default/handler.mjs`) OpenNext'in `provideNextAfterProvider`
  fonksiyonu `Symbol.for("@next/request-context")`e `waitUntil` bağlıyor — yani
  `after` workerd'de gerçekten yanıttan sonra koşuyor.

- **Kuyruğa yazma yanıt ÖNCESİNDE, tek INSERT.** Satırın var olması garanti
  olsun ki `after` hiç koşmasa bile Faz K'nin cron'u mesajı bulabilsin.

- **Kuyruk yazma hatası YUTULUYOR.** Randevu (ya da iptal, ya da onay) zaten
  yazıldı. Bildirim yüzünden 500 dönmek, müşteriye "olmadı" deyip takvimde
  duran bir randevu bırakmak olurdu — müşteri tekrar dener, bu kez "saat dolu"
  alır ve nedenini anlamaz.

- **Konu satırında işletme adı EK ALMIYOR:** "Randevunuz onaylandı — Çağdaş
  Berber". "Berber'deki randevunuz" istenirdi ama Türkçe'de bu ek ünlü uyumuna
  göre değişiyor ve adı kullanıcı yazıyor. Faz N'de şehir başlıkları için
  verilen kararın aynısı; tire eki gereksiz kılıyor.

- **Şablon metni GÖNDERİM ANINDA üretiliyor, kuyrukta saklanmıyor.**
  Hatırlatma yazılmasıyla gönderilmesi arasında ~24 saat var; metin donmuş
  olsaydı arada personeli değişen bir randevu için yanlış isim taşıyan bir
  hatırlatma giderdi. Bunun bedeli: alıcı adresi de kolon olarak tutulmuyor,
  şablon kimliğinin önekinden (`MUSTERI_` / `ISLETME_`) seçiliyor.

- **Adresi olmayan mesaj sessizce düşürülmüyor, `adres-yok` hatası yazılıyor.**
  Randevu formunda e-posta zorunlu değil (telefon var, SMS Faz K'de) — yani bu
  beklenen bir durum. Ama panelde "neden mail gitmedi" sorusunun görünür bir
  cevabı olmalı.

- **İptalde önce bekleyenler düşürülüyor, sonra iptal mesajları yazılıyor.**
  Sıra ters olsaydı az önce yazılan mesajlar da silinirdi. Düşürülen şey
  pratikte hatırlatma: iptal edilmiş randevu için ertesi gün "yarınki
  randevunuz" maili gitmesi, ürüne duyulan güveni tek başına bitirirdi.
  **Silme, "IPTAL" durumu değil:** enum'da öyle bir değer yok ve eklemek göç
  demekti. Silinen şey zaten hiç gönderilmemiş bir mesaj — geçmiş kaydı değil,
  geleceğe verilmiş bir söz. Gönderilmiş satırlara dokunulmuyor.

- **TAMAMLANDI ve GELMEDI'de mesaj YOK.** İkisi de randevu saatinden sonra
  işaretleniyor ve işletmenin kendi kaydı. "Gelmediniz" diyen bir mail,
  kısıtı zaten uygulanmış birine ikinci kez söylemek olurdu.

- **`bildirimleriListele` yalnızca panel kapısında.** Kuyruk müşteri adı ve
  randevu saati taşıyor; halka açık kapı oturumsuz.

- **Kuyruk metotları iki kapıda da AYNI kod** (`bildirimKapisi` yardımcısı).
  Randevuyu yazan yol oturumsuz, durumunu değiştiren yol oturumlu, ama ikisi de
  aynı kuyruğa yazıyor. İki kopya bir gün ayrışırdı — biri `tur = 'EPOSTA'`
  filtresini unutur ve Faz K'nin SMS satırları e-posta olarak gönderilmeye
  çalışılırdı.

- **`randevuIptalEt` satır sayısı yerine ID dönüyor.** Çağıran taraf iptal
  bildirimleri için randevunun kimliğine ihtiyaç duyuyor; ikinci bir sorguyla
  okumak, bu arada silinmiş bir kayıtla yarışa girmek demekti.

- **Hatırlatma 24 saat önce.** Müşterinin plan değiştirebileceği kadar erken,
  unutmayacağı kadar geç. Yarından yakın randevuya hatırlatma hiç yazılmıyor:
  yazılsaydı ilk boşaltmada hemen gönderilir ve müşteri "yarınki randevunuz"
  mailini randevuyu aldığı dakikada alırdı.

### Ortaya çıkan gerçek hata — üretim değişkenleri `next dev`'e sızıyordu

Faz I'nin bildirim ekranını yerelde denerken çıktı: `/r/<slug>` üzerinden
randevu alınmaya çalışılınca **"Doğrulama tamamlanamadı. Sayfayı yenileyip
yeniden deneyin."** dönüyordu.

**Zincir:** `next.config.ts` içindeki `initOpenNextCloudflareForDev()`,
`next dev` sırasında `getCloudflareContext()`i çalışır kılıyor — amacı yerelde
Hyperdrive binding'ine ulaşmak. Yan etkisi, `wrangler.jsonc > vars` içindeki
**üretim değişkenlerinin de yerelde okunması**. Faz L'de oraya
`TURNSTILE_MODU: "gercek"` yazıldı ve o günden beri `next dev` bot kapısını
gerçek modda koşturuyordu. Üretim site anahtarı yalnızca
`randevu.enesmemduhoglu.tech` için kayıtlı olduğundan widget `localhost`'ta
**Turnstile 110200** (bilinmeyen alan adı) veriyor, jeton hiç üretilmiyor,
sunucu da jetonsuz isteği 403'e çeviriyordu.

`.env.example` "yerelde sahte" diyordu ama bu **ulaşılamaz bir vaatti**:
`cfMod ?? process.env.TURNSTILE_MODU` zincirinde cf değeri önce geliyor, yani
`.env`e ne yazılırsa yazılsın eziliyordu.

**Faz I bunu ikinci kez üretiyordu.** `BILDIRIM_MODU: "gercek"` da aynı yoldan
`next dev`e sızacaktı: yerel denemeler gerçek modda koşup `anahtar-yok`
hatasıyla dolacak, anahtar girilseydi de **gerçek adreslere mail gidecekti**.
Planın "test ve yerel her zaman sahte" sözü tutulmuyordu.

**Çözüm — `src/lib/mod.ts`:** modu seçen kural iki dosyadan çıkarılıp tek yere
alındı ve ortama bağlandı.

- Üretimde (`NODE_ENV === "production"`) karar Cloudflare değişkeninin, `.env`
  yedek. Yerel bir dosyanın üretimin kararını ezmesi istenmiyor — "sessizce
  sahte moda düşmüş üretim" bu deponun iki kez yaşadığı hata.
- Yerelde ve testte **yalnızca** `.env`. Gelistiricinin makinesinde üretim
  yapılandırmasının kendiliğinden devreye girmesi, geliştirmeyi engellemekten
  başka bir şey yapmıyor.
- Gevşetme yönü tek taraflı: bu dal üretimi hiçbir koşulda gevşetemiyor, çünkü
  `NODE_ENV` üretim paketinde `next build` tarafından sabitleniyor.

`turnstile-alani.tsx` de aynı kurala bağlandı: widget artık üretim dışında hiç
çizilmiyor. Sunucu kapısıyla istemci kutusu **aynı anda açılıp kapanmalı** —
ayrışırlarsa ya müşteri çözemeyeceği bir kutuyla karşılaşır ya da kapı jeton
bekler ve kutu hiç çizilmez. (Dosyadaki eski yorum "anahtar yoksa çizilmiyor,
sunucu da aynı koşulda sahte" diyordu; iki yarısı da artık doğru değildi.)

**Neden testler görmedi:** ikisi de `process.env` üzerinden koşuyor ve vitest'te
Cloudflare bağlamı hiç yok — yani testlerin gördüğü dünyada bu çakışma
oluşmuyor. Faz M ve Faz N'deki hatalarla aynı sınıf: yalnızca gerçek tarayıcıda
gerçek ortamda ortaya çıkan bir kusur. `src/lib/mod.test.ts` artık zinciri
kilitliyor (5 test).

**Tarayıcıdan uçtan uca doğrulandı** (`next dev`, tohumlanmış `randevu_dev`):
randevu alma → kuyrukta `MUSTERI_RANDEVU_ONAYLANDI` + `ISLETME_YENI_RANDEVU`
`GONDERILDI`, önizleme HTML'i dolu; iptal → `MUSTERI_RANDEVU_IPTAL` +
`ISLETME_RANDEVU_IPTAL`. Turnstile hata kutusu yok. Yarınki randevuda
hatırlatma satırı **yazılmadı** — hatırlatma zamanı geçmişte kalıyor, tasarlanan
davranış canlıda da doğrulanmış oldu.

### Bilerek kapsam dışı

- **Hatırlatmanın zamanı gelince gönderilmesi.** Kuyruk satırı yazılıyor ama
  onu boşaltacak zamanlayıcı yok: boşaltma bugün yalnızca o randevuya dokunan
  bir istekle tetikleniyor. Faz K'nin `workers/hatirlatici/` cron'u bunu
  bağlayacak — kuyruğun tamamını tarayan sorgu kiracı-üstü olacağı için ayrı
  bir tasarım kararı ve `dizin.ts` gibi kendi dar yüzeyini isteyecek.
- **SMS yok** (`sms.ts` yazılmadı) — Faz K.
- **Yeniden deneme yok.** `HATA` satırı orada kalıyor; kimse tekrar denemiyor.
  Cron gelince "hatalıyı N kez tekrar dene" kararı verilebilir.
- **İşletme bildirimi AÇILIP KAPANAMIYOR.** Sahibin gelen kutusuna her randevu
  düşüyor. Ayar alanı göç demekti ve bugün kaç randevunun geldiği bilinmiyor.
- **Personele bildirim yok.** Sahip rolü seçiliyor; personelin gelen kutusuna
  işletmenin bütün randevuları düşmemeli.
- **Müşterinin göreceği bir "gönderim geçmişi" yok.** Ekran
  `/panel/gelistirici/*` altında, işletmenin günlük işine ait değil.

### Doğrulama

- `npm run tip`, `npm run lint` temiz
- `npm test` — **489 test geçti** (34 dosya, gerçek Postgres); yeni:
  `bildirim-sablon.test.ts` (9), `bildirim.test.ts` (11), `mod.test.ts` (5),
  `degismezler.test.ts` +3, route testlerine +2 (kuyruğa yazıldığı ve iptalde
  hatırlatmanın düştüğü)
- `npm run build` başarılı, 37 route
- `cf:kur` + `wrangler deploy --dry-run`: 1664.74 KiB gzip; `env.BILDIRIM_MODU
  ("gercek")` binding listesinde görünüyor
- **Uçtan uca (tarayıcı, `next dev`):** randevu alma ve iptal akışları gerçekten
  koşturuldu; kuyruğun dört satırı da `GONDERILDI` ve önizleme HTML'leri dolu
- **Gözle (tarayıcı eklentisi):** altı şablonun gerçek HTML'i tek sayfada
  işlendi — Türkçe karakterler, tablo yerleşimi, iptal bağlantısının yalnızca
  müşteri mesajlarında olması, işletme mesajlarında müşteri telefonunun
  biçimlenmiş hali (`0533 987 65 43`) doğrulandı

### Elle yapılması gerekenler (Faz I)

- [ ] **MERGE ETMEDEN ÖNCE:** `wrangler secret put RESEND_API_KEY`. Merge anı
      yayın anı; anahtar girilmezse ilk randevudan itibaren her mesaj kuyruğa
      `anahtar-yok` yazar.
- [ ] `/panel/gelistirici/bildirimler` ekranı **gözle görülmedi** — panele
      girmek için giriş yapmak gerekiyor ve şifre girmek asistanın yapabileceği
      bir şey değil. Sayfa derleniyor, beslediği sorgu testte ve yerel
      `randevu_dev`de artık altı kuyruk satırı hazır duruyor (Işıl Güzellik
      Salonu) — panele girip ekrana bakmak yeterli.
- [ ] Üretimde ilk randevudan sonra kuyruğun `GONDERILDI` gösterdiği ve mailin
      gerçekten geldiği doğrulanmalı (Resend panelinden de bakılabilir).
