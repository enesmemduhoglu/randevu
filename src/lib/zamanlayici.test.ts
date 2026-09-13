import { afterEach, expect, test, vi } from "vitest";

import { nabziTetikle } from "@/lib/zamanlayici";

// Zamanlayicinin tek sozu: basarisizlik SESSIZ kalmiyor. Testlerin cogu mutlu
// yolu degil, tetik kosamadiginda kapiya bir sey dustugunu kanitliyor - nabiz
// o sayaci okuyor.
//
// `fetch` taklit ediliyor: GitHub'a gercek istek atmak her test kosumunda
// gercek bir nabiz kosumu baslatmak demekti.

const JETON = "github_pat_test_jetonu_sizmamali";

afterEach(() => {
  vi.restoreAllMocks();
});

/// `jeton` bir kutu icinde: duz parametre olsaydi `undefined` varsayilan degere
/// duser ve "jeton yok" durumu hic sinanmazdi. Kutu yoksa anahtar hic konmuyor -
/// sirri girilmemis bir Worker'in `env`'i tam olarak bu.
function sahteOrtam(jeton?: { deger: unknown }) {
  const noktalar: Array<{ blobs?: string[]; indexes?: string[] }> = [];
  const ortam: Record<string, unknown> = {
    HATA: { writeDataPoint: (n: { blobs?: string[]; indexes?: string[] }) => noktalar.push(n) },
  };
  if (jeton) ortam.GITHUB_NABIZ_TOKENI = jeton.deger;
  return { noktalar, ortam };
}

const jetonlu = () => sahteOrtam({ deger: JETON });

function logSatirlari(): string[] {
  const cikan: string[] = [];
  vi.spyOn(console, "error").mockImplementation((...parcalar: unknown[]) => {
    cikan.push(parcalar.map(String).join(" "));
  });
  return cikan;
}

test("mutlu yol: nabiz is akisi main dalinda tetikleniyor, kapiya bir sey dusmuyor", async () => {
  const { ortam, noktalar } = jetonlu();
  const log = logSatirlari();
  const istek = vi.fn(async () => new Response(null, { status: 204 }));

  expect(await nabziTetikle(ortam, istek)).toBe(true);

  expect(istek).toHaveBeenCalledOnce();
  const [adres, secenek] = istek.mock.calls[0] as unknown as [string, RequestInit];
  expect(adres).toBe(
    "https://api.github.com/repos/enesmemduhoglu/randevu/actions/workflows/nabiz.yml/dispatches",
  );
  expect(secenek.method).toBe("POST");
  expect(JSON.parse(String(secenek.body))).toEqual({ ref: "main" });
  const basliklar = new Headers(secenek.headers);
  expect(basliklar.get("Authorization")).toBe(`Bearer ${JETON}`);
  expect(basliklar.get("User-Agent")).toBeTruthy();

  expect(noktalar).toHaveLength(0);
  expect(log).toHaveLength(0);
});

test("jeton yoksa istek atilmiyor ama sessizce de gecilmiyor", async () => {
  // Anahtar hic yok (sir girilmemis) ve bos metin.
  for (const jeton of [undefined, { deger: "" }]) {
    const { ortam, noktalar } = sahteOrtam(jeton);
    logSatirlari();
    const istek = vi.fn(async () => new Response(null, { status: 204 }));

    expect(await nabziTetikle(ortam, istek)).toBe(false);

    expect(istek).not.toHaveBeenCalled();
    expect(noktalar).toHaveLength(1);
    expect(noktalar[0].blobs).toEqual(["cron nabiz", "ZamanlayiciHatasi", "JETON_YOK", ""]);
  }
});

test("GitHub reddederse durum kodu kapiya dusuyor, jeton hicbir yere dusmuyor", async () => {
  const { ortam, noktalar } = jetonlu();
  const log = logSatirlari();
  // GitHub'in hata govdesi de tasinmiyor: kapi mesaj almiyor, burada govdeye
  // bakilmiyor bile.
  const istek = vi.fn(
    async () => new Response(`{"message":"Bad credentials ${JETON}"}`, { status: 401 }),
  );

  expect(await nabziTetikle(ortam, istek)).toBe(false);

  expect(noktalar).toHaveLength(1);
  expect(noktalar[0].blobs).toEqual(["cron nabiz", "ZamanlayiciHatasi", "HTTP_401", ""]);
  expect(noktalar[0].indexes).toEqual(["cron nabiz"]);
  expect(log).toHaveLength(1);
  expect(log.join("\n")).not.toContain(JETON);
  expect(JSON.stringify(noktalar)).not.toContain(JETON);
});

test("istek duserse firlatmiyor, kapiya hatanin turu dusuyor", async () => {
  const { ortam, noktalar } = jetonlu();
  logSatirlari();
  const istek = vi.fn(async () => {
    throw new TypeError(`fetch failed (Authorization: Bearer ${JETON})`);
  });

  expect(await nabziTetikle(ortam, istek)).toBe(false);

  expect(noktalar).toHaveLength(1);
  expect(noktalar[0].blobs?.[1]).toBe("TypeError");
  expect(JSON.stringify(noktalar)).not.toContain(JETON);
});
