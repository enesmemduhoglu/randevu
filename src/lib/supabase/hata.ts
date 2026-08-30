// Supabase Auth hatalarini kullaniciya soylenebilir cumlelere ceviren tek yer.
//
// Neden tek bir "bir sorun oldu" mesaji yetmiyor: buradaki durumlarin cogu
// kullanicinin YAPABILECEGI bir sey oldugunu gosteriyor - baska adres yaz,
// daha guclu sifre sec, biraz bekle. Hepsini "baglanti sorunu" diye gostermek
// kullaniciyi ayni dugmeye tekrar tekrar bastirir. Ilk elle denemede tam
// olarak bu oldu: Supabase `.test` uzantili adresi reddetti ve ekranda
// "bağlantıda bir sorun oldu" yazdi.
//
// DEGISMEZ 5 korunuyor: saglayicinin METNI hicbir zaman tasinmiyor. Yalnizca
// bilinen hata KODU kendi cumlemize esleniyor; tanimadigimiz kod genel
// mesaja dusuyor.

export type HataYaniti = { hata: string; durum: number };

const GENEL: HataYaniti = {
  hata:
    "İşlem tamamlanamadı. Bağlantıda bir sorun oldu, birkaç saniye sonra " +
    "tekrar deneyin.",
  durum: 502,
};

const COK_DENEME: HataYaniti = {
  hata: "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.",
  durum: 429,
};

/// Hata nesnesinden kod alani. Tip bildirimi yerine alan kontrolu: AuthError'in
/// `code` alani SDK surumuyle birlikte geldi ve `as` ile daraltmak, bir gun
/// baska bir sey gelirse derleyicinin uyarmayacagi bir yalan olurdu.
export function hataKodu(hata: unknown): string | undefined {
  if (typeof hata !== "object" || hata === null) return undefined;
  const kod = (hata as { code?: unknown }).code;
  return typeof kod === "string" ? kod : undefined;
}

/// Hiz siniri mi? Ayri duruyor cunku hem giriste hem kayitta ayni anlama
/// geliyor ve ikisinde de "sifre yanlis" ya da "baglanti koptu" demek yanlis
/// olurdu.
export function hizSiniriMi(hata: unknown): boolean {
  const kod = hataKodu(hata);
  return kod === "over_request_rate_limit" || kod === "over_email_send_rate_limit";
}

export function hizSiniriYaniti(): HataYaniti {
  return COK_DENEME;
}

/// signUp hatasi -> yanit.
export function kayitHatasi(hata: unknown): HataYaniti {
  const kod = hataKodu(hata);

  if (kod === "email_address_invalid") {
    return {
      hata: "Bu e-posta adresi kabul edilmedi. Farklı bir adres deneyin.",
      durum: 400,
    };
  }

  if (kod === "weak_password") {
    return {
      hata: "Şifre çok kolay tahmin ediliyor. Daha uzun bir şifre seçin.",
      durum: 400,
    };
  }

  if (hizSiniriMi(hata)) return COK_DENEME;

  return {
    hata:
      "Kayıt tamamlanamadı. Bağlantıda bir sorun oldu, birkaç saniye sonra " +
      "tekrar deneyin.",
    durum: GENEL.durum,
  };
}

/// Supabase "bu e-posta zaten kayitli" diyor mu?
///
/// Iki yol var: `code` alani (yeni SDK surumleri) ve mesaj metni (eskiler).
/// Ikisini de okumak, SDK yukseltmesinde bu dalin sessizce olmesini engelliyor.
export function zatenKayitliMi(hata: unknown): boolean {
  if (hataKodu(hata) === "user_already_exists") return true;
  if (typeof hata !== "object" || hata === null) return false;

  const mesaj = (hata as { message?: unknown }).message;
  return (
    typeof mesaj === "string" &&
    mesaj.toLowerCase().includes("already registered")
  );
}
