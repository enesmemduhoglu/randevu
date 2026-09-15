@AGENTS.md

# Randevu — repo sozlesmesi

Kucuk isletmeler icin multi-tenant randevu SaaS'i. Next.js 16 App Router,
Drizzle + Postgres (Supabase), Cloudflare Workers uzerinde deploy edilir.

Ayrintili plan: `docs/plan.md`. Decision log: `TODOS.md` - bir tasarim kararini
sorgulamadan once oraya bak, is bitirdiginde oraya yaz. Deploy pipeline, gereken
secret'lar ve prod migration'inin sirasi: `docs/yayin.md`.

## Dil

Kod yorumlari, commit mesajlari, PR aciklamalari ve UI metinleri **Turkce**.
Tablo ve kolon adlari da Turkce (`isletme`, `saat_dilimi`, `olusturma_tarihi`).
Yorumlar "ne yaptigini" degil **"neden boyle yaptigini"** anlatir.

## Invariant'lar

**1. `src/app` altinda ham `db` yok.** Tenant'a bagli her query
`src/lib/scoped-db.ts` uzerinden gider; o her query'ye session'in `isletmeId`
filtresini enjekte eder. Yeni bir query tipi gerekiyorsa route'a ham Drizzle
yazma, `scoped-db.ts`'e metot ekle. Muaf dosyalar: `src/lib/db.ts`,
`src/lib/scoped-db.ts`, `src/lib/musteri-db.ts`, `src/lib/auth.ts`,
`src/lib/kayit.ts`, `src/lib/saglik.ts`.

> **Ikinci eksen: `src/lib/musteri-db.ts` (Faz J).** Musterinin randevulari
> tanimi geregi MULTI-TENANT - iki ayri salondan randevu almis biri ikisini de
> tek listede goruyor - yani `isletmeId` filtresi orada dogru soruyu soramiyor.
> `getMusteriDb` ayni disiplini `kullaniciId` uzerinde tekrarliyor: filtre yine
> parametre degil CLOSURE VARIABLE'I, cagiran taraf veremiyor. INVARIANT 12 gibi
> bir MUAFIYET degil; gate'in kendisi, baska bir eksende.
>
> Karsiligi yine yuzeyin dar tutulmasi: yalnizca `randevu` yazilabiliyor ve o
> da iki kolonda (`durum`, `kullanici_id`), okunan alanlar elle yazili ve
> kapali, `musteri.not` ile `musteri.telefon` hic donmuyor.

> **Zorlayan: ESLint `no-restricted-imports`** (`eslint.config.mjs`).
> `src/app/**` icinden `@/lib/db` import etmek hata veriyor. Kapsam route
> handler'lardan GENIS: server component'leri de query yapabiliyor ve yanlis
> tenant'in verisini okuma riski birebir ayni.
>
> Faz B'de Drizzle'a gecerken bu kural bir sure zorlanamamisti - `warden`
> invariant gate Prisma'nin `db.model.method(` bicimini ariyor, Drizzle'in
> `db.select().from()` bicimini yakalamiyor. Faz D'de eslint kuraliyla geri
> geldi.

**2. Mutation route'unda `checkOrigin`.** POST/PUT/PATCH/DELETE'te CSRF ikinci
layer'i. `SameSite=Lax` tek basina yetmez: `multipart/form-data` kabul eden
yollar CORS'un "basit request" sinifina girer. Paylasilan secret'la gelen makine
yollari (Cron) muaftir.

> Panel route'lari bunu `src/lib/panel-kapisi.ts` uzerinden aliyor
> (checkOrigin -> session -> body, bu sirayla). Yani `checkOrigin` route
> dosyasinda GORUNMEYEBILIR ve warden'in metin arayan gate'i uyari verir -
> helper kullaniliyorsa bu uyari beklenen bir sey. Gercek zorlama
> `src/lib/degismezler.test.ts`'te: her route dosyasini okuyup gate'in
> varligini ariyor.

**3. Karar degistiren yollarda conditional UPDATE.** Once-oku-sonra-yaz yapma;
beklenen durumu `where`'e koy ve etkilenen satir sayisi 0 ise 409 don. Ayni
anda gelen ikinci karar boylece kaybeder.

**4. E-posta yalnizca `src/lib/email.ts > gonder()`.** (SMS icin ayni kural
`src/lib/sms.ts > gonder()`'de olacak - **o dosya henuz YOK**, Faz K'de
geliyor. Bugun SMS kanali yok: butun bildirimler e-postayla gidiyor.)
`resend.emails.send`'i dogrudan cagirma: SDK API
hatasinda throw etmez, `{ data, error }` doner ve donusu okumayan cagri
reddedilen gonderimi iz birakmadan yutar. *(warden gate'i bloklar.)*

> **Faz I'de bu gate de metin arayamaz hale geldi.** `email.ts` SDK degil duz
> `fetch` kullaniyor - `resend` package'i bundle'a giriyor ve kullanilan yuzey tek
> bir POST. Yani warden'in aradigi `resend.emails.send` bicimi hic olusmuyor.
> Gercek zorlama `src/lib/degismezler.test.ts`'te: `api.resend.com` YALNIZCA
> `email.ts`'te gecebiliyor. Ayni sey Faz B ve Faz E'de de yasandi - gate'in
> gormedigi kural testle geri geliyor.
>
> Queue'ya yazma ve bosaltma `src/lib/bildirim.ts`'te, metin uretimi
> `src/lib/bildirim-sablon.ts`'te (saf: DB ve network yok). Queue metotlari
> `scoped-db.ts`'in ICINDE ve iki gate'te de ayni kod.

**5. Secret'lar log'a ve hata metinlerine girmez.** Token, key ve connection
string'i hicbir `console.*` ya da kullaniciya donen hata body'sinde tasinmaz.

> **Hata yolu tek gate'ten: `src/lib/hata.ts > hataBildir()`** (Faz P2).
> `console.error(hata)` yazma - Drizzle'in hata MESAJI query parametrelerini
> (e-posta, telefon, iptal token'i) tasiyor ve gate mesaji bu yuzden hic almiyor.
> Yakalanmamis hatalar `src/instrumentation.ts > onRequestError` ile oraya
> geliyor, kendi `catch`'i olan yol `hataBildir`'i dogrudan cagiriyor. Gate
> Analytics Engine'e de yaziyor ve health check oradan sayiyor - gate'ten gecmeyen hata
> uyari da uretmez. *(Zorlayan: `degismezler.test.ts`, `console.error` yalnizca
> `hata.ts`'te.)*
>
> **`drizzle-orm` yamali** (Faz P2g, `patches/drizzle-orm+0.45.2.patch`).
> Next yakalanmamis hatanin mesajini gate'i beklemeden kendi log'una basiyor ve
> `DrizzleQueryError` mesaji query parametrelerini tasiyordu. Yama onlari
> mesajdan cikariyor, `postinstall`'daki `patch-package` uyguluyor. Drizzle'i
> yukseltirken yama yeniden uretilir; `drizzle-orm` bu yuzden tam surume
> sabitli. *(Zorlayan: `drizzle-yamasi.test.ts` - yama tutmazsa kirmizi.)*

**6. `session.isletmeId` duz string kalir.** Bu sozlesmeyi bozan tip ya da
erisim pattern'i getirme.

**7. Randevu zamanlari DB'de `timestamptz`, yani UTC.** Local saate cevirme
yalnizca `src/lib/zaman.ts` uzerinden ve isletmenin `saatDilimi` alaniyla
yapilir. Server'in saat dilimine hicbir yerde guvenilmez.

**8. Cakisma engeli veritabaninda.** Ayni personelin cakisan iki aktif randevusu
`EXCLUDE USING gist` constraint'iyle imkansiz (Faz E, `drizzle/0002_*.sql`). Aralik
`'[)'`: bitisik randevular cakisma DEGIL. `WHERE durum IN ('BEKLIYOR','ONAYLI')`:
iptal edilen saat bosaliyor. Uygulama layer'indaki kontrol kullaniciya erken
geri bildirim icindir, **garanti degildir**; constraint ihlali yakalanip 409'a
cevrilir - hata kodunu okurken `src/lib/pg-hata.ts` kullan, Drizzle hatayi
sarmaliyor ve `hata.code` wrapper'da YOK.

**9. `auth.users`'a foreign key yok.** Supabase Auth yalnizca kimlik saglar;
`kullanici.auth_user_id` duz bir uuid string olarak durur. Boylece migration'lar
tum schema'ya tek basina sahip olur ve testler kendi JWT'lerini imzalayabilir.

**10. Renk degeri kodda sabit yazilmaz.** Component'ler semantic token kullanir,
e-posta sablonlari `src/lib/marka.ts`'ten okur.

**11. Cookie'lerin `Domain` niteligi koke genisletilmez.** Session cookie'si
yalnizca `randevu.enesmemduhoglu.tech` host'una bagli kalir;
`.enesmemduhoglu.tech` yazmak session'i kokteki baska projeyle paylasmak demektir.

**12. Cross-tenant okuma yalnizca `src/lib/dizin.ts`'te ve dar.** Marketplace dizini
tanimi geregi butun isletmeleri listeliyor, yani INVARIANT 1'in kapsamasi orada
YOK. Karsiligi, sizabilecek yuzeyin daraltilmasi:

- Yalnizca `isletme` ve `hizmet` okunuyor. `randevu`, `musteri`, `kullanici`,
  `bildirim_kuyrugu` bu dosyada GECMIYOR - kisisel veri buradan cikamaz.
- `hizmet` FILTRELENEBILIR ama DONDURULEMEZ. Arama hizmet adina bakiyor (Faz P),
  karta ise yalnizca TOPLAMA giriyor (adet, en dusuk fiyat); tek tek hizmet
  satiri hicbir zaman donmuyor. Ayrim onemli: bir kolona gore suzmek o kolonun
  icerigini disari vermiyor - ziyaretci zaten elindeki metni soruyor.
- Donen tip elle yazilmis ve kapali. `$inferSelect` kullanilmadi: schema'ya yarin
  eklenen bir kolon buradan sessizce sizmasin.
- Cagiran taraf tablo ya da kolon adi VEREMIYOR; il ve kategori kapali listeye
  karsi dogrulaniyor.
- SALT OKUNUR. Bu dosyaya asla yazma metodu eklenmeyecek.

> **Zorlayan: `src/lib/degismezler.test.ts`** dosyanin metnini tariyor - izinli
> import listesi, yasakli tablo adlarinin hic gecmemesi, iki gorunurluk
> kosulunun varligi, yazma metodu olmamasi. Yorumlar SOYULARAK taraniyor:
> dosyanin kendi basligi yasakli tablolari kurali anlatmak icin aniyor ve ham
> metin taransaydi test kendi gerekcesinin yazilmasini cezalandirirdi.

## Komutlar

```bash
npm run db:hazirla       # .env'deki veritabanlarini olusturur (Docker Postgres ayakta olmali)
npm run db:goc           # drizzle-kit generate - schema degisiminde migration SQL'i uretir
npm run db:uygula        # drizzle-kit migrate - local veritabanina uygular
npm run db:uygula:prod -- --onayla   # PROD'a (Supabase) uygular
npm run tip              # next typegen + tsc --noEmit
npm run lint             # eslint
npm test                 # vitest run - gercek Postgres'e kosar
npm run build            # next build
npm run cf:kur           # opennextjs-cloudflare build
npm run cf:onizle        # build + local workerd'de calistir
npm run cf:yayinla       # build + Cloudflare'e deploy
npm run cf:tip           # wrangler types
npm run duman -- <adres> [--surum <id>]   # canli sitede smoke test (deploy sonrasi + health check)
node scripts/hata-say.ts # son saatin server error'lari (CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_ANALIZ_TOKENI)
```

Test veritabani Docker container'inda: `randevu-test-pg`, port **5455**,
`postgres:17-alpine` (prod Supabase de 17). Ayni container'da iki veritabani:
`randevu_dev` ve `randevu_test`.

**Windows notu:** `cf:kur` symlink olusturuyor; Windows'ta **Gelistirici Modu
acik olmali**, yoksa build EPERM ile duser. Ayrica `wrangler dev` calisirken
`.open-next` klasoru kilitli kalir - build'den once process'leri kapat.

## Test kurallari

- Integration test'ler gercek Postgres'e kosar, mock'a degil. `fileParallelism: false`.
- Her route en az dort durumla gelir: happy path, session'siz 401,
  **baska isletmenin kaydi 404/403 (IDOR)**, yarisan ikinci karar 409.
- IDOR testi atlanmaz: iki isletme olustur, birinin kaydini digerinin session'iyla
  iste, sizmadigini gor.
