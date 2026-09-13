// Oturumsuz randevu yolunun (`POST /api/randevu`) kotalari.
//
// NEDEN AYRI DOSYA: ayni sayilari iki taraf okuyor. Route onlari yazma kapisina
// veriyor, panel ise isletmeye "sinira yaklastiniz" demek icin ayni tavana
// bakiyor. Iki yerde iki ayri sabit, panelin "20'ye ulasirsa" dedigi gun
// kapinin 30'da kapanmasi demekti.
//
// HEPSI VERITABANINDAN SAYILIYOR, hiz siniri gibi kenarda degil. Sebep tehdidin
// sekli: Workers'in hiz siniri IP basina ve yaklasik (Faz L'de uretimde ilk 429
// 22. istekte geldi), Turnstile ise jeton basina maliyet uretmiyor. Numarayi
// her istekte degistiren yavas bir betik ikisinden de gecer; onu durduracak tek
// yer yazilan satirlarin kendisi.
//
// Uygulanan yer `scoped-db.ts > randevuYaz`: sayim ile yazma ayni transaction'da.
// Isletmenin kendi ekledigi randevu (`kaynak: ISLETME`) hicbir kotaya girmiyor -
// bunlar oturumsuz yolun kotuye kullanimina karsi, isletme kendi takvimine yaziyor.

/// Ayni musterinin ayni isletmede acik tutabilecegi randevu sayisi.
///
/// Neden bir sinir var: bu yol oturumsuz, yani numarayi yazan herkes takvime
/// yazabiliyor. Sinirsiz birakmak, gunu elli randevuyla doldurup hicbirine
/// gelmeyen kullanimi mumkun kilardi ve isletme bunu ancak gun sonunda fark
/// ederdi. Neden 3: kucuk isletmede mesru musteri en fazla birkac randevuyu
/// ayni anda acik tutuyor (kesim + boya + esinin randevusu gibi); dorduncusu
/// artik olagan degil.
export const EN_COK_ACIK_RANDEVU = 3;

/// Ayni numaranin ayni isletmede SON 24 SAATTE olusturabilecegi randevu sayisi,
/// durumundan bagimsiz (Faz Q).
///
/// Acik randevu sinirinin kapatmadigi delik: al - iptal et - yeniden al. Her
/// iptal bir yer bosaltiyor, yani acik sayisi hic 3'u gecmeden ayni numara
/// takvimde durmadan gezinebiliyor ve her tur isletmeye bir bildirim, musteri
/// alanina yazilan adrese bir mail uretiyor. Iptal edilenler bu yuzden SAYILIYOR.
///
/// Neden 5: acik sinirin ustunde, cunku mesru musteri de bir kez yanlis saat
/// secip duzeltebilir. Ikinci duzeltmeden sonrasi artik olagan degil.
export const EN_COK_GUNLUK_RANDEVU = 5;

/// Bir isletmenin SON 24 SAATTE cevrim ici randevu alan YENI musteri sayisi
/// (Faz Q).
///
/// Numara basina sinirlarin hicbiri numarayi her istekte degistiren betigi
/// gormuyor; her istek yeni bir musteri. Bu tavan o betigin bir gunde
/// verebilecegi zarari sinirliyor.
///
/// BEDELI BILEREK KABUL EDILDI: tavan doldugunda o isletmeye o gun gelen GERCEK
/// yeni musteri de reddediliyor ve isletmeyi aramaya yonlendiriliyor. Kayitli
/// musteri etkilenmiyor. Karsiligi panel uyarisi - isletme durumu ilk bakista
/// goruyor (`YOGUNLUK_UYARI_ESIGI`).
///
/// Neden 20: hedef kitlenin (tek-uc koltuklu salon) cevrim ici yolla bir gunde
/// kazandigi yeni musteri bugun birkac kisi. Tavan comert tutuldu: mesru bir
/// yogunluk gununu kesmek, engelledigi saldiridan pahali olurdu.
export const EN_COK_GUNLUK_YENI_MUSTERI = 20;

/// Panelin "olagan disi yogunluk" uyarisini gostermeye basladigi sayi.
///
/// Tavanin YARISI: uyari tavan doldugunda degil, dolmadan once gelmeli ki
/// isletme sahte kayitlari iptal edip gercek musterinin reddedilmesini
/// onleyebilsin.
export const YOGUNLUK_UYARI_ESIGI = EN_COK_GUNLUK_YENI_MUSTERI / 2;
