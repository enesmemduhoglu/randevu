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
