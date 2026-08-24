# RainDogs yayın kontrol listesi

## Otomatik kontroller

- `npm test` başarılı olmalı.
- GitHub Actions `quality` işi yeşil olmalı.
- Supabase Security Advisor kritik hata göstermemeli.
- RLS ve rol matrisi testleri başarılı olmalı.

## Fiziksel cihaz kabul testi

En az bir güncel iPhone/Safari ve bir Android/Chrome cihazında:

- giriş, beni hatırla, çıkış ve şifre sıfırlama;
- boş etkinlik, haber ve rota ekranları;
- Member, Prospect, Hangaround, Charter yönetimi, National ve uygulama admini erişimleri;
- bildirim izni, arka planda push alma ve bildirime dokununca doğru ekrana geçiş;
- fotoğraf ve ekran görüntüsü yükleme;
- kulüp evi giriş/çıkış, misafir sayısı ve canlı liste;
- etkinlik katılımı, kesin yoklama ve kilometre aktarımı;
- hesap kapatma talebi;
- iOS geri kaydırma, klavye açıkken formlar ve küçük ekran taşmaları

kontrol edilmelidir. Fiziksel cihaz testi tamamlanmadan mağaza/üretim kabulü verilmez.

## Supabase üretim ayarları

- TOTP MFA açık.
- AAL1 oturum süresi sınırı açık.
- Leaked Password Protection açık.
- CAPTCHA için Turnstile veya hCaptcha site anahtarı tanımlı.
- VAPID public/private anahtar çifti Edge Function secrets içinde tanımlı.
- `014_privacy_and_account_deletion.sql` ve `015_security_advisor_hardening.sql` uygulanmış.
- `app-api` son kodla deploy edilmiş.

## Yayın ve geri dönüş

- Yayın öncesi yedek alınmış.
- Son çalışan commit SHA kaydedilmiş.
- GitHub Pages dağıtımı ve canlı CSP kontrol edilmiş.
- Kritik hata durumunda önceki commit yeniden deploy edilerek veri yazımı durdurulmuş.
