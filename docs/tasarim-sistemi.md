# Tasarım sistemi

Renk, tipografi ve bileşen kuralları. Ses tonu ve metin dili `docs/marka.md`'de.
Tek kaynak `src/app/globals.css`; bu belge oradaki kararların gerekçesi.

Canlı referans: **`/panel/gelistirici/vitrin`** — bütün token'lar ve bileşen
durumları tek sayfada. Geliştirici aracı; halka açık bir sayfa değil.

## Yön

Sıcak ve davetkâr. Baskın segmentler kuaför, berber ve güzellik salonu;
müşterinin gördüğü randevu sayfasında sıcaklık güven veriyor. Panel ise günde
saatlerce açık duracak, o yüzden sakin kalıyor.

| | |
|---|---|
| Zemin | `#FAF8F5` sıcak beyaz |
| Metin | `#1C1917` koyu taş |
| Vurgu | `#C2643C` terracotta |
| İkincil | `#2A9D8F` yumuşak teal |
| Başlık | Fraunces |
| Metin | Inter |
| Köşe | 12px |

## Üç katman

```
primitive          semantic              component
--renk-tas-50  →  --background     →  (bilesenler)
--renk-...-600 →  --primary        →  --saat-secili-zemin
```

**Bileşenler yalnızca semantic katmanı kullanır.** Primitive'e dokunan bir
bileşen, tema değişimini kırar. Kendi ürettiğimiz bileşenlerin kendine özgü
değerleri varsa üçüncü katmana yazılır — bileşen dosyası renk kararı vermez.

### Adlandırma: neden yarısı İngilizce

Primitive ve component katmanı Türkçe (`--renk-terracotta-500`,
`--saat-secili-zemin`). **Semantic katman İngilizce** (`--background`,
`--primary`, `--border`) çünkü o isimler shadcn/ui'nin sözleşmesi. Türkçeleştirmek,
depoya eklenen her bileşeni elle düzenlemek demekti — her yeni bileşende tekrar
eden bir maliyet. Üçüncü taraf arayüzü olduğu gibi bırakıldı.

### OKLCH neden

Açık ve koyu tema arasında **ton kayması olmadan** parlaklık ayarlanabiliyor.
`terracotta-600` koyu zeminde okunmuyordu; OKLCH'de tek yapılan `L` değerini
bir basamak açmak, renk aynı kalıyor.

## Renk kararları

**Vurgu seyrek kullanılır.** Terracotta yalnızca birincil eylem, aktif durum ve
seçili saat için. shadcn'in `--accent` token'ı (hover zemini) bilerek nötr
bırakıldı; marka rengine bağlansaydı her hover marka vurgusuna dönerdi.

**Kırmızı, terracotta'dan uzak tutuldu.** Ton 20'ye karşı 43, doygunluk belirgin
daha yüksek. `İptal et` düğmesiyle birincil eylem karıştırılmamalı — bu üründe
ikisi çoğu zaman yan yana duruyor.

**Randevu durumlarında iptal kırmızı değil.** İptal bir hata değil, normal bir
sonuç. Kırmızı yalnızca "gelmedi" için.

### Ölçülen kontrast

Bütün metin/zemin çiftleri WCAG AA (4.5:1) üzerinde. Değerler `oklch` → sRGB →
bağıl parlaklık hesabıyla ölçüldü, göz kararı değil:

| Çift | Açık | Koyu |
|---|---|---|
| foreground / background | 16.51:1 | 17.50:1 |
| muted-foreground / background | 6.24:1 | 7.87:1 |
| durum: bekliyor | 5.39:1 | — |
| durum: onaylı | 5.54:1 | — |
| durum: tamamlandı | 7.71:1 | — |
| durum: iptal | 5.92:1 | — |
| durum: gelmedi | 7.51:1 | — |
| saat: dolu | — | 5.69:1 |

İlk ölçümde dördü kalmıştı; en önemlisi `muted-foreground` (3.92:1) idi, çünkü
bütün yardım metni ve açıklamalar onu kullanıyor. Tonlar bir basamak
koyulaştırıldı.

**Dolu saat devre dışı ama okunabilir tutuldu.** WCAG devre dışı denetimleri
muaf sayıyor, ama müşteri hangi saatin kapalı olduğunu okuyacak — okunmazsa
bileşen işini yapmıyor demektir.

## Tipografi

Fraunces başlıklarda (`h1`–`h3`, `font-heading`), Inter metinde. Üçüncü bir font
yok; mono gerektiğinde sistem yığını kullanılıyor çünkü bundle 3 MiB'lik Worker
sınırına giriyor.

**`latin-ext` subset'i şart.** Türkçe'nin `ğ ı ş İ` karakterleri `latin`
subset'inde yok; eksik olsaydı bu harfler yedek fonta düşer ve başlıklarda
görünür bir karışıklık olurdu. `/panel/gelistirici/vitrin` sayfasındaki örnek
metinler bu karakterleri bilerek içeriyor.

## Bileşen kuralları

**Dokunma hedefi en az 44×44px, aralarında en az 8px.** Saat seçici mobilde
parmakla kullanılacak; `--saat-min-yukseklik` bunu taşıyor.

**Odak halkası kaldırılmaz.** Randevu akışı klavyeyle baştan sona
gezilebilmeli.

**Renk tek başına anlam taşımaz.** Dolu saat hem soluk, hem üstü çizili, hem de
`disabled`. Durum rozetleri metni de yazıyor.

**Boş, yükleniyor ve hata durumları baştan tasarlanır.** Sonradan eklenen boş
durum her zaman kötü görünür.

**Etiket her zaman görünür.** Yer tutucu etiketin yerini almaz.

**Form alanı yüksekliği bağlama göre.** shadcn varsayılanı `h-8`; bu ölçü
panel içi yoğun arayüz için. Müşterinin ya da işletme sahibinin telefondan
doldurduğu formlarda (`/giris`, `/kayit`) `h-10` kullanılır — etiketle
birlikte 44px dokunma hedefine giriyor. Aynı kural buton için de geçerli.

## Yeni token eklerken

1. Ham değer gerekiyorsa **primitive**'e ekle (Türkçe ad, OKLCH).
2. Bir amaca karşılık geliyorsa **semantic**'e takma ad ver.
3. Tek bir bileşene aitse **component** katmanına yaz.
4. Tailwind sınıfı üretmesi gerekiyorsa `@theme inline` bloğuna
   `--color-<ad>: var(--<ad>)` satırını **ekle**.

> **Tuzak:** 4. adım atlanırsa `bg-[--token]` yazmak Tailwind v4'te sınıf
> üretmez ve **hata da vermez** — bileşen sessizce renksiz kalır. Vitrin
> sayfasında saat seçici tam olarak böyle bozuk çıktı. Token'ı `@theme`'e verip
> `bg-saat-secili-zemin` gibi gerçek bir sınıf kullan.

## Marka varlıkları

Wordmark `src/components/marka/logo.tsx`, işaret `currentColor` kullanıyor —
rengi kapsayıcı belirliyor. Favicon `src/app/icon.svg` statik; dinamik
üretilmiyor çünkü `next/og` wasm kullanıyor ve workerd çalışma anında wasm
derlemeye izin vermiyor.

`src/lib/marka.ts` token'ların hex karşılığını tutuyor — yalnızca e-posta
şablonları için, çünkü e-posta istemcileri `var()` çözmüyor ve `oklch()`
bilmiyor. Bileşenler orayı kullanmaz.

**Marka adı henüz yok.** Ad netleştiğinde `logo.tsx` ve `marka.ts` değişir;
başka hiçbir yer etkilenmez.
