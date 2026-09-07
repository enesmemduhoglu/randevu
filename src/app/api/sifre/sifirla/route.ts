import { epostaDogrula } from "@/lib/girdi";
import { govdeOku, govdeOkunamadi } from "@/lib/govde";
import { hizSiniriAsildiMi } from "@/lib/hiz-siniri";
import { checkOrigin } from "@/lib/origin";
import { supabaseSunucu } from "@/lib/supabase/sunucu";
import { istekIpsi, turnstileDogrula } from "@/lib/turnstile";

// Sifre sifirlama TALEBI: adres istiyor, Supabase'in kendi mailer'ini
// (custom SMTP - Faz P2 elle kurulum) tetikliyor.
//
// ADIM SIRASI checkOrigin -> hiz siniri -> govde -> Turnstile -> Supabase,
// /api/randevu ile ayni gerekce: ucuz kontroller pahali olandan (ag cagrisi,
// mail gonderimi) once.
//
// KULLANICI NUMARALANDIRMASI (enumeration) YOK: kayitli adres, kayitsiz
// adres, kayitli ama `kullanici` satiri olmayan hesap - UCU DE ayni yaniti
// aliyor. `resetPasswordForEmail` KOSULSUZ cagriliyor; kendi tablomuzda on
// kontrol yapmiyoruz, cunku (a) yanit suresini hesabin varligina gore ayirip
// zamanlama kanali acardi, (b) Supabase'de hesabi olup bizde kaydi olmayan
// biri (kayit akisi yarim kalmis) sifirlama hakkini kaybederdi.

export async function POST(istek: Request) {
  const engel = checkOrigin(istek);
  if (engel) return engel;

  const ip = istekIpsi(istek);
  if (await hizSiniriAsildiMi("SIFRE_SINIRI", ip)) {
    return Response.json(
      { hata: "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin." },
      { status: 429 },
    );
  }

  const govde = await govdeOku(istek);
  if (!govde) return govdeOkunamadi();

  const kapi = await turnstileDogrula(govde.turnstile, ip);
  if (!kapi.gecti) {
    return Response.json(
      { hata: "Doğrulama tamamlanamadı. Sayfayı yenileyip yeniden deneyin." },
      { status: 403 },
    );
  }

  const eposta = epostaDogrula(govde.eposta);
  if (!eposta.tamam) return Response.json({ hata: eposta.hata }, { status: 400 });

  const supabase = await supabaseSunucu();
  // Donus DEGERI OKUNMUYOR - hata olsa bile ayni yanit donuyor (enumeration).
  // DEGISMEZ 4'u ihlal etmiyor: bu mail Resend/email.ts'ten degil, Supabase'in
  // kendi mailer'indan cikiyor.
  await supabase.auth.resetPasswordForEmail(eposta.deger);

  return Response.json({ yon: "/sifremi-unuttum/gonderildi" });
}
