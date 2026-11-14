# THESHERLOCK V6.6

Tek bir URL'den yola çıkıp bir web sitesinin ön yüzünü analiz eden ve yedekleyen, sunucusuz (tek dosyalık) bir araç. Kendi sitelerini incelemek ve arşivlemek için tasarlandı. Sunucu, derleme adımı ya da hesap gerektirmez; GitHub Pages üzerinde çalışır.

## Ne yapar

- **Sayfa keşfi:** Ana sayfadaki iç linkler, `robots.txt` ve `sitemap.xml` üzerinden aynı alan adındaki sayfaları bulur; ayarlanan sınıra kadar (4–30 sayfa) tarar.
- **Ham HTML + render edilmiş metin:** Her sayfanın sunucudan gelen HTML'ini ve `r.jina.ai` üzerinden render edilmiş Markdown metnini alır.
- **Varlık arşivi:** JS, CSS, font, görsel ve source map dosyalarının içeriklerini indirir. CSS içindeki `@import` / `url(...)` başvurularını ve JS içinde geçen ek parçaları (lazy chunk) da izler.
- **Çevrimdışı gezilebilir kopya:** Bağlantıları yerel dosyalara çevrilmiş ikinci bir kopya üretir; `offline/index.html` dosyasından açılır. Özgün dosyalar ayrıca dokunulmadan saklanır.
- **Yerel analiz (anahtarsız):** Teknoloji izleri, üçüncü taraf alan adları ve pasif güvenlik gözlemleri (SRI eksikliği, karışık içerik, açık source map'ler) tarayıcıda hesaplanır.
- **Kanıta dayalı yapay zekâ raporu (isteğe bağlı):** Gemini API anahtarı girilirse mimari, ürün/fiyat ve risk özetini üretir; her iddia kaynağı ve güven düzeyiyle (`verified` / `inference` / `low`) listelenir.
- **Dışa aktarım:** ZIP arşivi, tam JSON raporu ve okunabilir HTML raporu.

## Kullanım

1. Sayfayı aç (GitHub Pages ya da `index.html` dosyasını doğrudan tarayıcıda).
2. Hedef URL'yi yaz, tarama modunu seç ve **Tara & Arşivle**'ye bas.
3. Sonuçlardaki **Arşivi İndir (.zip)** düğmesiyle yedeği al.

Yapay zekâ raporu için **⚙️ Ayarlar**'dan bir Gemini API anahtarı gir ([Google AI Studio](https://aistudio.google.com/apikey)). Arayüzü denemek için **🧪 Demo Veri** düğmesi yeterli.

### GitHub Pages ile yayına alma

Depo ayarlarında **Settings → Pages → Deploy from a branch → `main` / root** seç. Sayfa `https://<kullanıcı>.github.io/thesherlock/` adresinde açılır.

## ZIP içeriği

| Yol | İçerik |
|---|---|
| `offline/` | Çevrimdışı gezilebilir kopya; `offline/index.html` dosyasından başla |
| `pages/` | Her sayfanın sunucudan gelen ham HTML'i (dokunulmamış) |
| `markdown/` | Her sayfanın render edilmiş metni |
| `assets/` | JS, CSS, font, görsel ve source map dosyaları, alan adına göre |
| `manifest.json` | Özgün URL → arşiv yolu eşlemesi ve indirilemeyenler |
| `report.json`, `report.html` | Analiz raporu |

Modül script'leri `file://` altında çalışmayabilir. En iyi sonuç için arşiv klasöründe yerel bir sunucu aç (`python -m http.server`) ve `/offline/` adresine git.

## Ayarlar

| Ayar | Açıklama |
|---|---|
| Gemini modeli | Varsayılan `gemini-flash-latest`; başka bir model adı yazılabilir. |
| Maksimum sayfa | Taranacak sayfa sayısı. |
| Varlık / görsel indirme | Arşive JS-CSS-font ve görsellerin alınıp alınmayacağı. |
| Lazy chunk izleme | JS içinde geçen ek `.js` / `.css` adreslerinin de denenmesi. |
| Maksimum varlık | İndirilecek dosya sayısı sınırı (tek dosya 8 MB, toplam 80 MB). |
| Özel CORS proxy | Kendi proxy'nin öneki; hedef URL sonuna eklenir. |

## Sınırlar

- Yalnızca tarayıcıya gönderilen içerik alınır. Sunucu kodu, veritabanı ve oturum arkasındaki sayfalar arşive girmez; çevrimdışı kopyada formlar, arama ve API'ye bağlı bölümler çalışmaz.
- Tarayıcı CORS kuralları nedeniyle istekler önce doğrudan, olmazsa herkese açık proxy'lerden (`allorigins`, `corsproxy.io`, `codetabs`) geçer. Bu proxy'ler yavaş ya da kapalı olabilir; en güvenilir yol kendi sitende CORS'u açmak ya da kendi proxy'ni tanımlamaktır.
- Lazy chunk izleme tahmine dayanır; her parçayı bulamayabilir.
- HTTP yanıt başlıkları (CSP, HSTS) tarayıcıdan okunamadığı için güvenlik gözlemleri HTML ile sınırlıdır. Bu araç bir zafiyet tarayıcısı değildir.
- Taranan içerik üçüncü taraf servislerden geçer (`r.jina.ai`, proxy'ler, anahtar girildiyse Gemini API).
- API anahtarı yalnızca tarayıcının `localStorage` alanında tutulur, depoya yazılmaz.

## Sorumlu kullanım

Yalnızca sahibi olduğun ya da inceleme izni bulunan siteleri tara. Başkasına ait içerik ve tasarımın yeniden yayımlanması telif ve marka haklarını ihlal edebilir.
