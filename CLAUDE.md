@AGENTS.md

# Randevu — depo sozlesmesi

Kucuk isletmeler icin cok kiracili randevu SaaS'i. Next.js 16 App Router,
Drizzle + Postgres (Supabase), Cloudflare Workers uzerinde yayinlanir.

Ayrintili plan: `docs/plan.md`. Karar gunlugu: `TODOS.md` - bir tasarim kararini
sorgulamadan once oraya bak, is bitirdiginde oraya yaz. Yayin hatti, gereken
sirlar ve prod gocunun sirasi: `docs/yayin.md`.

## Dil

Kod yorumlari, commit mesajlari, PR aciklamalari ve UI metinleri **Turkce**.
Tablo ve alan adlari da Turkce (`isletme`, `saat_dilimi`, `olusturma_tarihi`).
Yorumlar "ne yaptigini" degil **"neden boyle yaptigini"** anlatir.

## Degismezler

**1. `src/app` altinda ham `db` yok.** Kiraciya bagli her sorgu
`src/lib/scoped-db.ts` uzerinden gider; o her sorguya oturumun `isletmeId`
filtresini enjekte eder. Yeni bir sorgu tipi gerekiyorsa route'a ham Drizzle
yazma, `scoped-db.ts`'e metot ekle. Muaf dosyalar: `src/lib/db.ts`,
`src/lib/scoped-db.ts`, `src/lib/auth.ts`, `src/lib/kayit.ts`,
`src/lib/saglik.ts`.

> **Zorlayan: ESLint `no-restricted-imports`** (`eslint.config.mjs`).
> `src/app/**` icinden `@/lib/db` import etmek hata veriyor. Kapsam route
> handler'lardan GENIS: sunucu bilesenleri de sorgu yapabiliyor ve yanlis
> kiracinin verisini okuma riski birebir ayni.
>
> Faz B'de Drizzle'a gecerken bu kural bir sure zorlanamamisti - `warden`
> degismez kapisi Prisma'nin `db.model.method(` bicimini ariyor, Drizzle'in
> `db.select().from()` bicimini yakalamiyor. Faz D'de eslint kuraliyla geri
> geldi.

**2. Mutasyon route'unda `checkOrigin`.** POST/PUT/PATCH/DELETE'te CSRF ikinci
katmani. `SameSite=Lax` tek basina yetmez: `multipart/form-data` kabul eden
yollar CORS'un "basit istek" sinifina girer. Paylasilan sirla gelen makine
yollari (Cron) muaftir.

> Panel route'lari bunu `src/lib/panel-kapisi.ts` uzerinden aliyor
> (checkOrigin -> oturum -> govde, bu sirayla). Yani `checkOrigin` route
> dosyasinda GORUNMEYEBILIR ve warden'in metin arayan kapisi uyari verir -
> yardimci kullaniliyorsa bu uyari beklenen bir sey. Gercek zorlama
> `src/lib/degismezler.test.ts`'te: her route dosyasini okuyup kapinin
> varligini ariyor.

**3. Karar degistiren yollarda kosullu UPDATE.** Once-oku-sonra-yaz yapma;
beklenen durumu `where`'e koy ve etkilenen satir sayisi 0 ise 409 don. Ayni
anda gelen ikinci karar boylece kaybeder.

**4. E-posta yalnizca `src/lib/email.ts > gonder()`, SMS yalnizca
`src/lib/sms.ts > gonder()`.** `resend.emails.send`'i dogrudan cagirma: SDK API
hatasinda throw etmez, `{ data, error }` doner ve donusu okumayan cagri
reddedilen gonderimi iz birakmadan yutar. *(warden kapisi bloklar.)*

**5. Sirlar log'a ve hata metinlerine girmez.** Token, anahtar ve baglanti
dizesi hicbir `console.*` ya da kullaniciya donen hata govdesinde tasinmaz.

**6. `session.isletmeId` duz string kalir.** Bu sozlesmeyi bozan tip ya da
erisim deseni getirme.

**7. Randevu zamanlari DB'de `timestamptz`, yani UTC.** Yerel saate cevirme
yalnizca `src/lib/zaman.ts` uzerinden ve isletmenin `saatDilimi` alaniyla
yapilir. Sunucunun saat dilimine hicbir yerde guvenilmez.

**8. Cakisma engeli veritabaninda.** Ayni personelin cakisan iki aktif randevusu
`EXCLUDE USING gist` kisitiyla imkansiz (Faz E, `drizzle/0002_*.sql`). Aralik
`'[)'`: bitisik randevular cakisma DEGIL. `WHERE durum IN ('BEKLIYOR','ONAYLI')`:
iptal edilen saat bosaliyor. Uygulama katmanindaki kontrol kullaniciya erken
geri bildirim icindir, **garanti degildir**; kisit ihlali yakalanip 409'a
cevrilir - hata kodunu okurken `src/lib/pg-hata.ts` kullan, Drizzle hatayi
sarmaliyor ve `hata.code` sarmalayicida YOK.

**9. `auth.users`'a foreign key yok.** Supabase Auth yalnizca kimlik saglar;
`kullanici.auth_user_id` duz bir uuid string olarak durur. Boylece migration'lar
tum semaya tek basina sahip olur ve testler kendi JWT'lerini imzalayabilir.

**10. Renk degeri kodda sabit yazilmaz.** Bilesenler semantic token kullanir,
e-posta sablonlari `src/lib/marka.ts`'ten okur.

**11. Cookie'lerin `Domain` niteligi koke genisletilmez.** Oturum cookie'si
yalnizca `randevu.enesmemduhoglu.tech` host'una bagli kalir;
`.enesmemduhoglu.tech` yazmak oturumu kokteki baska projeyle paylasmak demektir.

## Komutlar

```bash
npm run db:hazirla       # .env'deki veritabanlarini olusturur (Docker Postgres ayakta olmali)
npm run db:goc           # drizzle-kit generate - sema degisiminde SQL uretir
npm run db:uygula        # drizzle-kit migrate - yerel veritabanina uygular
npm run db:uygula:prod -- --onayla   # PROD'a (Supabase) uygular
npm run tip              # tsc --noEmit
npm run lint             # eslint
npm test                 # vitest run - gercek Postgres'e kosar
npm run build            # next build
npm run cf:kur           # opennextjs-cloudflare build
npm run cf:onizle        # build + yerel workerd'de calistir
npm run cf:yayinla       # build + Cloudflare'e deploy
npm run cf:tip           # wrangler types
```

Test veritabani Docker konteynerinde: `randevu-test-pg`, port **5455**,
`postgres:17-alpine` (prod Supabase de 17). Ayni konteynerde iki veritabani:
`randevu_dev` ve `randevu_test`.

**Windows notu:** `cf:kur` symlink olusturuyor; Windows'ta **Gelistirici Modu
acik olmali**, yoksa build EPERM ile duser. Ayrica `wrangler dev` calisirken
`.open-next` dizini kilitli kalir - build'den once surecleri kapat.

## Test kurallari

- Entegrasyon testleri gercek Postgres'e kosar, mock'a degil. `fileParallelism: false`.
- Her route en az dort durumla gelir: mutlu yol, oturumsuz 401,
  **baska isletmenin kaydi 404/403 (IDOR)**, yarisan ikinci karar 409.
- IDOR testi atlanmaz: iki isletme olustur, birinin kaydini digerinin oturumuyla
  iste, sizmadigini gor.
