# Marka: ses tonu ve metin dili

Bu belge arayüzde, e-postada ve hata mesajlarında **nasıl konuştuğumuzu** tanımlar.
Renk ve tipografi kararları `docs/tasarim-sistemi.md`'de.

Marka adı henüz belirlenmedi. Wordmark yer tutucu olarak "Randevu" ile çalışıyor;
ad netleştiğinde `src/components/marka/logo.tsx` ve `src/lib/marka.ts` değişir,
bu belgedeki hiçbir karar değişmez.

## Kime konuşuyoruz

**Birincil: işletme sahibi.** Kuaför, berber, güzellik uzmanı, terapist, özel
ders veren eğitmen. Yazılımcı değil. Paneli günde saatlerce açık tutuyor,
çoğu zaman müşterisiyle ilgilenirken telefondan bakıyor. Kendi işini bizden
iyi biliyor.

**İkincil: randevu alan müşteri.** Bizi tanımıyor, tanımak da istemiyor.
Telefondan giriyor ve 30 saniyede işini bitirmek istiyor. Onun için biz bir
ürün değil, o işletmeye ulaşmanın yoluyuz.

## Nasılız

| Özellik | Ne demek | Böyle | Böyle değil |
|---|---|---|---|
| **Açık** | Teknik terim yok. Kullanıcı okumadan da ne olacağını anlar. | "Bu saat dolu" | "Slot müsait değil" |
| **Sakin** | Ünlem ve aciliyet üretmeyiz. Panel gün boyu açık duracak. | "Randevu oluşturuldu" | "Harika! Randevunuz hazır! 🎉" |
| **Saygılı** | Ne yapması gerektiğini söylemeyiz, ne olduğunu söyleriz. | "Çalışma saatleri henüz tanımlı değil" | "Çalışma saatlerinizi tanımlamayı unutmuşsunuz" |
| **Sorumluluk alan** | Hata bizdeyse örtmeyiz; ne olduğunu ve sırada ne olduğunu söyleriz. | "Randevu kaydedilemedi. Bağlantı koptu, tekrar deneyin." | "Bir hata oluştu" |

## Hitap

**"Siz" kullanılır**, ama zamir yazılmaz — Türkçede ek zaten taşır.

- ✅ "Randevunuz oluşturuldu."
- ❌ "Sizin randevunuz oluşturuldu."
- ❌ "Randevun oluşturuldu." (sen)

**Buton ve menü etiketleri kısa emir kipidir.** Bu hitap değil, etikettir; "siz"
ile çelişmez ve Türkçe arayüzlerde beklenen biçimdir.

- ✅ `Kaydet` · `Randevu al` · `İptal et` · `Personel ekle`
- ❌ `Kaydediniz` · `Randevu alınız`

## Terim sözlüğü

Aynı kavram her yerde aynı kelimeyle anılır. Bu tablo bağlayıcıdır.

| Kavram | Kullan | Kullanma |
|---|---|---|
| appointment | **randevu** | rezervasyon, booking |
| service | **hizmet** | servis, işlem |
| staff member | **personel** | çalışan, ekip üyesi, uzman |
| time slot | **saat** / **uygun saat** | slot, zaman dilimi, seans |
| business | **işletme** | firma, şirket, salon, mekân |
| customer | **müşteri** | danışan, misafir, kullanıcı, client |
| dashboard | **panel** | kontrol paneli, dashboard, yönetim ekranı |
| working hours | **çalışma saatleri** | mesai, açılış saatleri |
| booking page | **randevu sayfası** | rezervasyon sayfası, profil |
| cancel | **iptal et** | vazgeç, sil, kaldır |
| sign in / sign up | **giriş yap** / **kayıt ol** | oturum aç, üye ol |

"Kullanıcı" kelimesi arayüzde hiç geçmez — kim olduğu bellidir: müşteri, personel
ya da işletme sahibi.

## Biçim kuralları

**Tarih ve saat.** `29 Ağustos Cumartesi, 14:30`. Ay adları büyük harfle, 24
saat düzeni, saat iki haneli. Bugün ve yarın için gün adı yerine "Bugün" /
"Yarın" yazılır.

**Para.** `350 ₺` — simge sonda ve boşlukla. Ondalık virgül: `1.250,50 ₺`.
Kuruş sıfırsa yazılmaz.

**Süre.** `45 dk`, `1 sa 30 dk`. "dakika" açık yazılmaz.

**Telefon.** `0532 123 45 67` biçiminde gösterilir, veritabanında sadece rakam.

**Emoji arayüzde kullanılmaz.** E-postada da kullanılmaz.

**Noktalama.** Tek cümlelik bildirimlerde nokta yok (`Randevu oluşturuldu`),
iki ve daha fazla cümlede var. Ünlem hiç yok.

## Hata mesajları

Üç parça: **ne oldu**, **neden**, **şimdi ne yapılabilir**. Üçü de her zaman
gerekmez ama sıra bu.

| Durum | ✅ | ❌ |
|---|---|---|
| Geçersiz telefon | "Telefon numarası 10 haneli olmalı — 5xx xxx xx xx" | "Geçersiz telefon" |
| Slot kapıldı | "Bu saat az önce doldu. Başka bir saat seçin." | "Çakışma hatası (409)" |
| Ağ hatası | "Randevu kaydedilemedi. Bağlantı koptu, tekrar deneyin." | "Bir şeyler ters gitti" |
| Yetkisiz | "Bu sayfaya erişiminiz yok" | "403 Forbidden" |

Teknik ayrıntı (hata kodu, stack, bağlantı bilgisi) kullanıcıya **hiç**
gösterilmez — bu aynı zamanda bir güvenlik değişmezidir (`CLAUDE.md` #5).

## Boş durumlar

İki parça: **neyin olmadığı**, ve **tek bir eylem**. Suçlama ve espri yok.

- ✅ "Henüz hizmet yok. Müşterilerinizin randevu alabilmesi için en az bir hizmet
  tanımlayın." + `Hizmet ekle`
- ❌ "Burası biraz boş görünüyor 👀"

## Örnek yeniden yazımlar

**Randevu onayı (müşteriye)**
- Önce: "Rezervasyonunuz başarıyla oluşturulmuştur!"
- Sonra: "Randevunuz alındı — 29 Ağustos Cumartesi, 14:30"

**Panel boş takvim**
- Önce: "Gösterilecek kayıt bulunamadı."
- Sonra: "Bugün randevu yok"

**İptal onayı**
- Önce: "Bu işlemi gerçekleştirmek istediğinizden emin misiniz?"
- Sonra: "Randevu iptal edilecek. Müşteriye bilgi maili gidecek." + `İptal et` / `Vazgeç`

**Çalışma saati uyarısı**
- Önce: "Uyarı: Çalışma saatleri eksik!"
- Sonra: "Pazartesi için çalışma saati tanımlı değil — o gün randevu alınamaz."
