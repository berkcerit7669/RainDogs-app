# RainDogs App

RainDogs için mobil öncelikli web uygulaması. Kimlik doğrulama Supabase Auth üzerinden nick ve şifreyle yapılır.

## Mevcut backend durumu

- Giriş ve oturum yönetimi Supabase'e bağlıdır.
- Üyeler yalnızca onaylı ve aktif hesaplarıyla giriş yapabilir.
- Üye, etkinlik, duyuru, rota, kilometre ve kulüp evi modüllerinin merkezi veritabanına taşınması devam etmektedir.

Gerçek şifreler veya gizli Supabase anahtarları kaynak koduna eklenmemelidir. Tarayıcı yapılandırmasında yalnızca publishable key kullanılabilir.

## Telefonda kullanım

Uygulama bir web adresinde yayınlandıktan sonra iPhone'da Safari ile açılabilir. **Paylaş → Ana Ekrana Ekle** seçildiğinde uygulama benzeri tam ekran görünümde çalışır.

## Yerel test verisini temizleme

Uygulama içinde **Menü → Uygulama Ayarları → Demo Verisini Sıfırla** kullanılabilir. Alternatif olarak yayın adresinin sonuna `?reset=1` eklenebilir.

## Geçiş notu

Kimlik doğrulama merkezi olsa da uygulama modüllerinin bir bölümü halen tarayıcı verisini kullanır. Bu modüller Supabase tablolarına geçirilmeden çok cihazlı üretim kullanımı tamamlanmış sayılmaz.
