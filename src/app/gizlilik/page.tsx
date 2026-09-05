import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { AltBilgi } from "@/components/genel/alt-bilgi";
import { UstBar } from "@/components/genel/ust-bar";
import { MARKA_ADI } from "@/lib/marka";

// KVKK aydinlatma metni (Faz P).
//
// NEDEN VAR: urun ad, telefon ve e-posta topluyor ve Turkiye'de tuketiciye
// aciktan hizmet veriyor. Bugune kadar formda tek satir bilgilendirme, alt
// bilgide tek bir baglanti yoktu - yani veri isleniyor ama hicbir yerde
// anlatilmiyordu.
//
// ⚠️ BU METIN BIR TASLAKTIR ve HUKUKI INCELEME BEKLIYOR. Yazan kisi hukukcu
// degil. Icerik uydurulmadi - her madde deponun GERCEKTEN yaptigi seyden
// turetildi (asagidaki her satirin kod karsiligi var) - ama bir uyum belgesi
// olarak yeterli olup olmadigina hukukcu karar vermeli.
//
// DOLDURULMASI GEREKEN IKI ALAN var ve ikisi de bilerek yer tutucu olarak
// birakildi; uydurulmus bir sirket unvani ya da saklama suresi, olmayan bir
// taahhut demek olurdu:
//   - Veri sorumlusunun unvani ve adresi
//   - Basvuru icin iletisim adresi
//
// Sayfa VERITABANINA DOKUNMUYOR, yani statik uretilebiliyor. Ust bar `auth()`
// okudugu icin pratikte dinamik kaliyor (gerekcesi ust-bar.tsx'te).

export const metadata: Metadata = {
  title: "Gizlilik ve KVKK aydınlatma metni",
  description:
    "Randevu alırken ve üye olurken hangi bilgileri topladığımız, neden " +
    "topladığımız ve kimlerle paylaştığımız.",
  alternates: { canonical: "/gizlilik" },
};

/// Yer tutucu: metin yayina cikmadan once doldurulmali.
const DOLDURULACAK = "[doldurulacak]";

function Bolum({ baslik, children }: { baslik: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-xl font-semibold tracking-tight">
        {baslik}
      </h2>
      {children}
    </section>
  );
}

export default function GizlilikSayfasi() {
  return (
    <div className="flex flex-1 flex-col">
      <UstBar />

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pt-8 pb-16">
        <div className="space-y-2 pb-8">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Gizlilik ve KVKK aydınlatma metni
          </h1>
          <p className="text-base text-muted-foreground">
            {MARKA_ADI} olarak hangi bilgileri topladığımızı, neden
            topladığımızı ve kimlerle paylaştığımızı burada anlatıyoruz.
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
          <Bolum baslik="Veri sorumlusu">
            <p>
              Veri sorumlusu {DOLDURULACAK}. Bu metindeki haklarınızı
              kullanmak için {DOLDURULACAK} adresinden bize ulaşabilirsiniz.
            </p>
          </Bolum>

          <Bolum baslik="Hangi bilgileri topluyoruz">
            <p>
              <span className="font-medium text-foreground">
                Randevu alırken:
              </span>{" "}
              ad soyad ve telefon numarası zorunlu; e-posta adresi ve
              işletmeye iletmek istediğiniz not isteğe bağlı. Randevu almak
              için hesap açmanız gerekmiyor.
            </p>
            <p>
              <span className="font-medium text-foreground">Üye olurken:</span>{" "}
              ad soyad ve e-posta adresi. Şifreniz bize hiç ulaşmıyor; kimlik
              doğrulaması Supabase üzerinden yürüyor.
            </p>
            <p>
              <span className="font-medium text-foreground">
                İşletme kaydında:
              </span>{" "}
              yukarıdakilere ek olarak işletme adı ve — dizinde görünmeyi
              seçerseniz — il, ilçe, kategori, adres ve telefon gibi işletmeye
              ait bilgiler. Bunlar tanımı gereği herkese açıktır.
            </p>
            <p>
              Çerez olarak yalnızca oturumunuzu ayakta tutan çerezleri
              kullanıyoruz. Reklam ya da izleme çerezi kullanmıyoruz, üçüncü
              taraf analiz aracı çalıştırmıyoruz.
            </p>
          </Bolum>

          <Bolum baslik="Neden topluyoruz">
            <p>
              Randevunuzu oluşturmak, işletmeye iletmek, size onay ve
              hatırlatma göndermek ve randevunuzu iptal edebilmeniz için. Üye
              hesabı açtıysanız randevularınızı tek listede gösterebilmek için.
              Bunların hepsi sözleşmenin kurulması ve ifası için gereken
              işlemedir; pazarlama amaçlı kullanım yapmıyoruz.
            </p>
          </Bolum>

          <Bolum baslik="Kimlerle paylaşıyoruz">
            <p>
              <span className="font-medium text-foreground">
                Randevu aldığınız işletme
              </span>{" "}
              adınızı, telefonunuzu, seçtiğiniz hizmeti ve varsa notunuzu
              görür. Randevunun kendisi bu demektir.
            </p>
            <p>
              Bunun dışında verileriniz yalnızca hizmeti çalıştırabilmek için
              kullandığımız altyapı sağlayıcılarında bulunur:{" "}
              <span className="font-medium text-foreground">Supabase</span>{" "}
              (veritabanı ve kimlik doğrulama),{" "}
              <span className="font-medium text-foreground">Cloudflare</span>{" "}
              (barındırma ve bot koruması) ve{" "}
              <span className="font-medium text-foreground">Resend</span>{" "}
              (e-posta gönderimi). Verilerinizi hiçbir üçüncü tarafa satmıyor
              ve reklam amacıyla paylaşmıyoruz.
            </p>
          </Bolum>

          <Bolum baslik="Ne kadar saklıyoruz">
            <p>
              Randevu kayıtları, işletmenin geçmişini görebilmesi için
              randevudan sonra da saklanır; saklama süresi {DOLDURULACAK}. Üye
              hesabınızı sildirdiğinizde hesabınıza bağlı kişisel bilgiler
              silinir.
            </p>
          </Bolum>

          <Bolum baslik="Haklarınız">
            <p>
              KVKK 11. madde uyarınca kişisel verilerinizin işlenip
              işlenmediğini öğrenme, işlenmişse bilgi talep etme, düzeltilmesini
              veya silinmesini isteme ve işlemeye itiraz etme haklarına
              sahipsiniz. Başvurularınızı {DOLDURULACAK} adresine
              iletebilirsiniz.
            </p>
          </Bolum>

          <Bolum baslik="Randevunuzun bağlantısı">
            <p>
              Hesap açmadan aldığınız randevuya, size verilen bağlantı
              üzerinden ulaşırsınız. Bu bağlantı tek başına randevunuzu
              görüntüleme ve iptal etme yetkisi taşır — başkasıyla
              paylaşmayın. Bu adresleri arama motorlarına kapattık.
            </p>
          </Bolum>
        </div>

        <p className="pt-10 text-sm text-muted-foreground">
          Sorunuz varsa{" "}
          <Link
            href="/isletmeler-icin"
            className="font-medium text-primary underline underline-offset-4"
          >
            bize ulaşın
          </Link>
          .
        </p>
      </main>

      <AltBilgi />
    </div>
  );
}
