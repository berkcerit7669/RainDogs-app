# RainDogs yedekleme ve geri yükleme planı

## Mevcut durum

Supabase Free plan zamanlanmış proje yedekleri sunmuyor. Üretim verisi oluşmadan önce proje Pro plana geçirilirse günlük yedekler ve yedi güne kadar geri dönüş penceresi etkinleştirilmeli.

Free planda kalındığı sürece aşağıdaki manuel prosedür uygulanır:

1. Her yayın öncesi ve ayda en az bir kez veritabanı `pg_dump --format=custom` ile dışa aktarılır.
2. Çıktı şifreli, erişimi sınırlı ve uygulama deposunun dışında saklanır.
3. En az iki nesil yedek korunur; daha eski kopyalar KVKK saklama planına göre güvenli biçimde silinir.
4. Üç ayda bir boş bir test projesine `pg_restore --clean --if-exists` ile geri yükleme provası yapılır.
5. Prova; profil, yetki, etkinlik, katılım, kilometre ve kulüp evi kayıtlarının sayısal karşılaştırmasıyla doğrulanır.

Bağlantı parolası, service-role anahtarı ve yedek dosyaları GitHub'a veya istemci koduna kesinlikle eklenmez.

## Olay anı sırası

1. Yazma işlemlerini durdur.
2. Etkilenen zaman aralığını ve son sağlam yedeği belirle.
3. Yeni ve izole bir projeye geri yükle.
4. Yetki/RLS testlerini çalıştır.
5. Uygulama bağlantısını yalnızca doğrulamadan sonra değiştir.
6. İşlem ve kararları admin loguna/olay kaydına ekle.
