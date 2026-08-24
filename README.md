# RainDogs App

RainDogs için mobil öncelikli web uygulaması. Kimlik doğrulama Supabase Auth üzerinden nick ve şifreyle yapılır; merkezi oturumlarda uygulama verileri Supabase'den yüklenir.

## Mevcut backend durumu

- Giriş ve oturum yönetimi Supabase'e bağlıdır.
- Üyeler yalnızca onaylı ve aktif hesaplarıyla giriş yapabilir.
- Üye, rol, etkinlik, duyuru, rota, yoklama, kilometre, kulüp evi, finans-disiplin, yardım ve bildirim modülleri merkezi veritabanına bağlıdır.

Gerçek şifreler veya gizli Supabase anahtarları kaynak koduna eklenmemelidir. Tarayıcı yapılandırmasında yalnızca publishable key kullanılabilir.

## Telefonda kullanım

Uygulama bir web adresinde yayınlandıktan sonra iPhone'da Safari ile açılabilir. **Paylaş → Ana Ekrana Ekle** seçildiğinde uygulama benzeri tam ekran görünümde çalışır.

## Yerel test verisini temizleme

Uygulama içinde **Menü → Uygulama Ayarları → Demo Verisini Sıfırla** kullanılabilir. Alternatif olarak yayın adresinin sonuna `?reset=1` eklenebilir.

## Geçiş notu

Merkezi oturum; üyeler, roller, içerikler, katılım/yoklama, kilometre, kulüp evi, finans-disiplin, yardım talepleri, bildirimler ve özel medya bağlantılarını Supabase üzerinden yönetir. Eski tarayıcı verileri yalnızca giriş yapılmamış prototip/demoya aittir ve merkezi oturuma karıştırılmaz.

## Üretim sınırları

- Uygulama içi bildirim merkezi çalışır. Telefonun kilit ekranına gerçek push göndermek için ayrıca Web Push/FCM/APNs sağlayıcısı, servis worker ve kullanıcı izin kaydı gerekir.
- Oturum açmış kullanıcı profilinden şifresini değiştirebilir. “Şifremi unuttum” e-posta akışı için tüm hesaplarda gerçek e-posta ve Supabase SMTP/redirect ayarı gerekir; sentetik `@accounts.raindogs.local` hesaplarda e-posta kurtarma yapılamaz.
- Publishable key istemci kodunda bulunabilir; service-role anahtarı ve veritabanı parolası hiçbir zaman repoya veya tarayıcıya konmaz.
