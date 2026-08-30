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
- [ ] Cloudflare'e yayınlarken `NEXT_PUBLIC_SUPABASE_URL` ve
      `NEXT_PUBLIC_SUPABASE_ANON_KEY` **derleme anında** ortamda olmalı;
      `NEXT_PUBLIC_` önekli değişkenler `cf:kur` adımında gömülüyor.
- [ ] Deploy kararı ve custom domain bağlantısı (Faz B'den devrediyor).

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
- [ ] `randevu_dev` veritabanına örnek işletme tohumlandı (`isil-guzellik`,
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
