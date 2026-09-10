import { NextResponse } from "next/server";

import { kamuyaAcilanYoklama, veritabaniniYokla } from "@/lib/saglik";
import { workerSurumu } from "@/lib/surum";

// Makine yolu. `/saglik` sayfasi HTML donuyor ve durum kodu tasimiyor - deploy
// sonrasi duman testi gibi bir `curl -f` bunu tek satirda okuyamiyor. Bu route
// AYNI suzgecten (kamuyaAcilanYoklama) gecen govdeyi durum koduyla birlikte
// veriyor.
//
// GET, mutasyon yok - DEGISMEZ 2 (checkOrigin) kapsami disinda.
//
// `robots.ts` `/api/` yolunu zaten tumden engelliyor, ek satir gerekmiyor.

export async function GET() {
  const [yoklama, surum] = await Promise.all([veritabaniniYokla(), workerSurumu()]);
  const govde = kamuyaAcilanYoklama(yoklama);

  const basliklar: Record<string, string> = { "Cache-Control": "no-store" };
  if (surum) basliklar["X-Worker-Surum"] = surum;

  return NextResponse.json(govde, {
    status: govde.durum === "saglikli" ? 200 : 503,
    headers: basliklar,
  });
}
