# RainDogs üretim kontrol listesi

## Yayından önce zorunlu

- Supabase projesi açılır ve `supabase/schema.sql` uygulanır.
- Tarayıcıda saklanan demo şifreleri gerçek ortama taşınmaz; Supabase Auth kullanılır.
- Sadece public/anon anahtarı istemciye konur. Service-role anahtarı hiçbir zaman uygulamaya eklenmez.
- Profil fotoğrafı, etkinlik ve duyuru görselleri özel Storage bucket'larında tutulur; imzalı URL ile gösterilir.
- KVKK aydınlatma metni, açık rıza kapsamı, veri saklama süresi ve hesap silme süreci hukuk kontrolünden geçer.
- Gerçek kurul listesi ve National görev sahipleri canlıya geçmeden önce admin tarafından atanır.
- Demo hesapları ve örnek kişisel veriler üretim veritabanına aktarılmaz.

## Güvenlik

- RLS bütün kullanıcı tablolarında açık kalır; istemci tarafındaki rol kontrolleri tek güvenlik katmanı sayılmaz.
- Yönetim işlemleri `admin_logs` tablosuna yazılır.
- Yoklama kilometresi yalnızca `finalize_event_attendance` sunucu fonksiyonu üzerinden eklenir.
- Girişte e-posta/telefon doğrulaması ve yönetim onayı birlikte kullanılır.
- Yönetim hesaplarında çok faktörlü doğrulama zorunlu tutulur.
- Supabase Auth hız sınırlamaları, CAPTCHA ve sızdırılmış parola koruması açılır.
- Günlük otomatik veritabanı yedeği ve aylık geri yükleme testi yapılır.
- Hata izleme aracına şifre, telefon, acil durum kartı veya yönetim notu gönderilmez.

## Yayın

- HTTPS zorunludur ve `_headers` dosyasındaki güvenlik başlıkları yayın ortamında doğrulanır.
- Uygulama önce yalnızca davetli test grubuna açılır.
- Hangaround, Prospect, Member, Charter yönetimi, National ve uygulama admini hesaplarıyla kabul testi yapılır.
- Test onayından sonra alan adı bağlanır ve iOS/Android paketleme aşamasına geçilir.

## Mevcut durum

Supabase veritabanı, Auth ve Edge Function katmanı üretim projesine bağlanmış ve dağıtılmıştır. Merkezi oturum açıldığında üye, etkinlik, duyuru, rota, kilometre ve yönetim verileri yalnızca Supabase kaynaklarından yüklenir; cihazdaki demo verileri üretim listelerine karıştırılmaz. Hangaround, Prospect, Member, Charter yönetimi, National ve uygulama admini hesaplarıyla uçtan uca ekran testi yayın öncesindeki son zorunlu adımdır.
