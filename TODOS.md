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

- **Proxy YETKİLENDİRME YAPMIYOR.** OpenNext Node middleware'i desteklemediği
  için edge'de koşuyor, yani veritabanı yok. Yalnızca token yeniliyor (sunucu
  bileşenleri cookie yazamıyor) ve oturum cookie'si hiç olmayanı ucuzca
  kesiyor. Cookie'nin varlığı kimlik kanıtı DEĞİL; gerçek yetki her zaman
  sunucuda `auth()` ile — panelde bu karar `src/app/panel/layout.tsx`'te.

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

- **Supabase'de *Confirm email* hâlâ AÇIK.** Elle denemede ortaya çıktı: kayıt
  isteği `over_email_send_rate_limit` ile döndü, yani Supabase doğrulama maili
  göndermeye çalışıyor ve yerleşik SMTP'nin saatte 2 mesaj sınırına takılıyor.
  Kapatılana kadar kayıt akışı ilk iki denemeden sonra tıkanıyor. Kod bu
  duruma hazır (`data.session` yoksa kullanıcı `/giris`'e mesajla
  yönlendiriliyor) ama üretim davranışı bu olmamalı.
- **Uçtan uca mutlu yol elle doğrulanmadı** — yukarıdaki sınır yüzünden.
  Doğrulanan: CSRF kapısı (403), doğrulama hataları (400), olmayan hesapla
  giriş (401, gerçek Supabase'e ulaşarak), oturumsuz `/panel` ve
  `/kayit/tamamla` yönlendirmeleri (307 → `/giris?devam=…`).
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

- [ ] **PR #3 merge edilince prod'a migration uygula:**
      `npm run db:uygula:prod -- --onayla`
      Göç yalnızca EKLEME (rol enum'u + kullanıcı + personel tabloları), mevcut
      işletme tablosuna dokunmuyor, veri kaybı yok. Geri alma: iki `drop table`
      ve bir `drop type`.
- [ ] **Supabase panelinde *Confirm email* KAPATILMALI** (Authentication →
      Sign In / Providers → Email). Şu an açık ve kayıt akışını tıkıyor.
      Yerleşik SMTP saatte 2 mail ile sınırlı; domain + Resend custom SMTP
      bağlanana kadar (Faz I) kapalı kalmalı.
- [ ] Confirm email kapatıldıktan sonra **uçtan uca elle doğrulama**: kayıt →
      panel, çıkış, tekrar giriş, `?devam=` ile korunan sayfaya dönüş.
- [ ] Cloudflare'e yayınlarken `NEXT_PUBLIC_SUPABASE_URL` ve
      `NEXT_PUBLIC_SUPABASE_ANON_KEY` **derleme anında** ortamda olmalı;
      `NEXT_PUBLIC_` önekli değişkenler `cf:kur` adımında gömülüyor.
- [ ] Deploy kararı ve custom domain bağlantısı (Faz B'den devrediyor).
