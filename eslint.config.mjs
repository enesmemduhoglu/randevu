import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Uretilen build ciktilari: bizim kodumuz degil, lint edilmemeli.
    ".open-next/**",
    ".wrangler/**",
    "cloudflare-env.d.ts",
  ]),

  // DEGISMEZ 1 — kiraci izolasyonu.
  //
  // Prisma'dayken bu kurali warden'in degismez kapisi zorluyordu: route
  // handler'da `db.model.method(` gorunce blokluyordu. Drizzle'in
  // `db.select().from()` bicimini o regex yakalamiyor, yani kural Faz B'den
  // beri yalnizca incelemeye bagliydi. Burasi o borcu kapatiyor.
  //
  // Kapsam route handler'lardan genis tutuldu: sunucu bilesenleri de sorgu
  // yapabiliyor ve yanlis kiracinin verisini okuma riski birebir ayni.
  {
    files: ["src/app/**/*.ts", "src/app/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db",
              message:
                "src/app altinda ham veritabani istemcisi kullanilmaz: kiraci " +
                "filtresi unutulabilir. Kiraciya bagli sorgular icin " +
                "@/lib/scoped-db > getScopedDb(oturum), oturumsuz halka acik " +
                "okumalar icin getHalkaAcikDb(slug) kullan. Gereken sorgu " +
                "yoksa route'a ham sorgu yazma, scoped-db'ye metot ekle.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
