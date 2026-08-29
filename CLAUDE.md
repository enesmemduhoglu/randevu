@AGENTS.md

# Randevu — depo sozlesmesi

Kucuk isletmeler icin cok kiracili randevu SaaS'i. Next.js 16 App Router,
Prisma 7 + Postgres, Cloudflare Workers uzerinde yayinlanir.

Ayrintili plan: `docs/plan.md`. Karar gunlugu: `TODOS.md` - bir tasarim kararini
sorgulamadan once oraya bak, is bitirdiginde oraya yaz.

## Dil

Kod yorumlari, commit mesajlari, PR aciklamalari ve UI metinleri **Turkce**.
Model ve alan adlari da Turkce (`Isletme`, `saatDilimi`, `olusturmaTarihi`).
Yorumlar "ne yaptigini" degil **"neden boyle yaptigini"** anlatir.

## Degismezler

Ilk dordunu `warden` kapisi (PreToolUse hook) deterministik olarak durdurur ya da
uyarir; gerisi bu belgeye bagli.

**1. Route handler'da ham `db.*` yok.** Kiraciya bagli her sorgu
`src/lib/scoped-db.ts` uzerinden gider; o her sorguya oturumun `isletmeId`
filtresini enjekte eder. Yeni bir sorgu tipi gerekiyorsa route'a ham Prisma
yazma, `scoped-db.ts`'e metot ekle. Muaf dosyalar: `src/lib/db.ts`,
`src/lib/scoped-db.ts`, `src/lib/auth.ts`.

**2. Mutasyon route'unda `checkOrigin`.** POST/PUT/PATCH/DELETE'te CSRF ikinci
katmani. `SameSite=Lax` tek basina yetmez: `multipart/form-data` kabul eden
yollar CORS'un "basit istek" sinifina girer. Paylasilan sirla gelen makine
yollari (Cron) muaftir.

**3. Karar degistiren yollarda kosullu UPDATE.** Once-oku-sonra-yaz yapma;
beklenen durumu `where`'e koy ve `count === 0` ise 409 don. Ayni anda gelen
ikinci karar boylece kaybeder.

**4. E-posta yalnizca `src/lib/email.ts > gonder()`, SMS yalnizca
`src/lib/sms.ts > gonder()`.** `resend.emails.send`'i dogrudan cagirma: SDK API
hatasinda throw etmez, `{ data, error }` doner ve donusu okumayan cagri
reddedilen gonderimi iz birakmadan yutar.

**5. Sirlar log'a ve hata metinlerine girmez.** Token, anahtar ve baglanti
dizesi hicbir `console.*` ya da kullaniciya donen hata govdesinde tasinmaz.

**6. `session.isletmeId` duz string kalir.** Bu sozlesmeyi bozan tip ya da
erisim deseni getirme.

**7. Randevu zamanlari DB'de `timestamptz`, yani UTC.** Yerel saate cevirme
yalnizca `src/lib/zaman.ts` uzerinden ve isletmenin `saatDilimi` alaniyla
yapilir. Sunucunun saat dilimine hicbir yerde guvenilmez.

**8. Cakisma engeli veritabaninda.** Ayni personelin cakisan iki aktif randevusu
`EXCLUDE USING gist` kisitiyla imkansiz. Uygulama katmanindaki kontrol
kullaniciya erken geri bildirim icindir, **garanti degildir**; kisit ihlali
yakalanip 409'a cevrilir.

**9. `auth.users`'a foreign key yok.** Supabase Auth yalnizca kimlik saglar;
`Kullanici.authUserId` duz bir uuid string olarak durur. Boylece Prisma tum
semaya tek basina sahip olur ve testler kendi JWT'lerini imzalayabilir.

**10. Renk degeri kodda sabit yazilmaz.** Bilesenler semantic token kullanir,
e-posta sablonlari `src/lib/marka.ts`'ten okur.

**11. Cookie'lerin `Domain` niteligi koke genisletilmez.** Oturum cookie'si
yalnizca `randevu.enesmemduhoglu.tech` host'una bagli kalir; `.enesmemduhoglu.tech`
yazmak oturumu kokteki baska projeyle paylasmak demektir.

## Komutlar

```bash
npm run db:hazirla   # .env'deki veritabanlarini olusturur (Docker Postgres ayakta olmali)
npm run db:goc       # prisma migrate dev - sema degisiminde
npm run db:uret      # prisma generate
npm run tip          # tsc --noEmit
npm test             # vitest run - gercek Postgres'e kosar
npm run build        # next build
```

Test veritabani Docker konteynerinde: `randevu-test-pg`, port **5455**.
`warden`'in SessionStart hook'u konteyneri ayaga kaldirir; **Docker Desktop acik
olmali**. Ayni konteynerde iki veritabani var: `randevu_dev` ve `randevu_test`.

## Test kurallari

- Entegrasyon testleri gercek Postgres'e kosar, mock'a degil. `fileParallelism: false`.
- Her route en az dort durumla gelir: mutlu yol, oturumsuz 401,
  **baska isletmenin kaydi 404/403 (IDOR)**, yarisan ikinci karar 409.
- IDOR testi atlanmaz: iki isletme olustur, birinin kaydini digerinin oturumuyla
  iste, sizmadigini gor.
