import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterEach, expect, test, vi } from "vitest";

import { hataBildir, hataOzeti } from "@/lib/hata";

// Hata kapisinin tek sozu: DEGISMEZ 5. Buradaki testlerin cogu "ne tasiniyor"u
// degil "ne TASINMIYOR"u kanitliyor - kapinin degeri, sizdirmadigi seyde.

afterEach(() => {
  vi.restoreAllMocks();
});

/// Drizzle'in gercek sarmalayicisi, postgres.js'in hatasini `cause`'da tasiyor.
/// Mesaj sorgunun parametrelerini iceriyor - kapinin var olma sebebi bu.
function drizzleBenzersizIhlali(): DrizzleQueryError {
  const pg = Object.assign(new Error("duplicate key value violates unique constraint"), {
    name: "PostgresError",
    code: "23505",
    constraint_name: "kullanici_eposta_benzersiz",
  });
  return new DrizzleQueryError(
    'insert into "kullanici" ("eposta", "telefon") values ($1, $2)',
    ["ali@ornek.com", "05551234567"],
    pg,
  );
}

function logSatirlari(): { cikan: string[] } {
  const cikan: string[] = [];
  vi.spyOn(console, "error").mockImplementation((...parcalar: unknown[]) => {
    cikan.push(parcalar.map(String).join(" "));
  });
  return { cikan };
}

test("Drizzle hatasi: tur ve Postgres kodu var, sorgu parametreleri yok", async () => {
  const hata = drizzleBenzersizIhlali();
  // On kosul: mesaj GERCEKTEN kisisel veri tasiyor. Drizzle bir gun bunu
  // birakirsa test yine gecer ama yanlis bir seyi kanitlamaz - burada gorunsun.
  expect(hata.message).toContain("ali@ornek.com");

  const { cikan } = logSatirlari();
  await hataBildir("kayit", hata);

  expect(cikan).toHaveLength(1);
  const satir = JSON.parse(cikan[0]) as Record<string, unknown>;
  expect(satir).toEqual({
    olay: "hata",
    kaynak: "kayit",
    tur: "DrizzleQueryError",
    kod: "23505",
    kisit: "kullanici_eposta_benzersiz",
    digest: null,
  });
  expect(cikan[0]).not.toContain("ali@ornek.com");
  expect(cikan[0]).not.toContain("0555");
  expect(cikan[0]).not.toContain("insert into");
});

test("sinifin baska kopyasindan gelen Drizzle hatasi da taniniyor", () => {
  // Worker paketinde instanceof tutmadi (cf:onizle, TODOS.md > Faz P2); bu
  // nesne o durumu taklit ediyor: sinif baska, bicim ayni.
  const kopya = Object.assign(new Error("Failed query: select 1\nparams: gizli"), {
    query: "select 1",
    params: ["gizli"],
  });
  expect(hataOzeti("kayit", kopya).tur).toBe("DrizzleQueryError");
  expect(hataOzeti("kayit", new Error("x")).tur).toBe("Error");
});

test("mesajdaki baglanti dizesi log'a dusmuyor", async () => {
  const hata = new TypeError(
    "baglanti kurulamadi: postgresql://postgres:cok-gizli-sifre@db.ornek.co:5432/postgres",
  );
  const { cikan } = logSatirlari();
  await hataBildir("route /api/randevular", hata);

  expect(cikan[0]).not.toContain("cok-gizli-sifre");
  expect(cikan[0]).not.toContain("postgresql://");
  expect(JSON.parse(cikan[0])).toMatchObject({ tur: "TypeError", kod: null });
});

test("ag hatasinin kodu tasiniyor - 'veritabanina ulasilamadi' ayirt edilsin", () => {
  const hata = Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:5432"), {
    code: "ECONNREFUSED",
  });
  expect(hataOzeti("kayit", hata)).toMatchObject({ kod: "ECONNREFUSED", kisit: null });
});

test("kaynaktaki sorgu dizesi kesiliyor", () => {
  // Kaynak bir route DOSYA yolu olmali; yanlislikla istek yolu verilirse
  // iptal baglantisinin jetonu log'a dusmesin.
  const ozet = hataOzeti("/r/salon/iptal?token=gizli-jeton", new Error("x"));
  expect(ozet.kaynak).toBe("/r/salon/iptal");
  expect(JSON.stringify(ozet)).not.toContain("gizli-jeton");
});

test("kaynak Analytics Engine index sinirinda kesiliyor", () => {
  const ozet = hataOzeti("a".repeat(500), new Error("x"));
  expect(ozet.kaynak).toHaveLength(96);
});

test("React'in digest'i tasiniyor - Next'in kendi log satiriyla eslessin", () => {
  const hata = Object.assign(new Error("render patladi"), { digest: "1234567890" });
  expect(hataOzeti("render /panel", hata).digest).toBe("1234567890");
});

test("Error olmayan deger: yalnizca tipi, icerigi degil", async () => {
  const { cikan } = logSatirlari();
  await hataBildir("route /api/x", "eposta=ali@ornek.com");
  expect(JSON.parse(cikan[0])).toMatchObject({ tur: "string" });
  expect(cikan[0]).not.toContain("ali@ornek.com");
});

test("okunurken firlatan nesne kapiyi dusurmuyor", async () => {
  const tuhaf = {
    get code(): string {
      throw new Error("getter patladi");
    },
  };
  expect(hataOzeti("route /api/x", tuhaf)).toMatchObject({ tur: "okunamadi" });

  logSatirlari();
  await expect(hataBildir("route /api/x", tuhaf)).resolves.toBeUndefined();
});

test("console.error'un kendisi patlasa da hataBildir firlatmiyor", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {
    throw new Error("konsol yok");
  });
  await expect(hataBildir("kayit", new Error("x"))).resolves.toBeUndefined();
});
