import { NextResponse } from "next/server";

import { kamuyaAcilanYoklama, veritabaniniYokla } from "@/lib/saglik";

// Makine yolu. `/saglik` sayfasi HTML donuyor ve durum kodu tasimiyor - deploy
// sonrasi duman testi gibi bir `curl -f` bunu tek satirda okuyamiyor. Bu route
// AYNI suzgecten (kamuyaAcilanYoklama) gecen govdeyi durum koduyla birlikte
// veriyor.
//
// GET, mutasyon yok - DEGISMEZ 2 (checkOrigin) kapsami disinda.
//
// `robots.ts` `/api/` yolunu zaten tumden engelliyor, ek satir gerekmiyor.

export async function GET() {
  const yoklama = await veritabaniniYokla();
  const govde = kamuyaAcilanYoklama(yoklama);

  return NextResponse.json(govde, {
    status: govde.durum === "saglikli" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
