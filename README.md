# THESHERLOCK 7.1

Kendi sitelerini incelemek ve yedeklemek için iki parçalı araç:

- **Tarayıcı sürümü (`index.html`):** Kurulum gerektirmez, tek dosya. Sayfaları, metinleri, erişilebilen dosyaları, teknoloji ve endpoint izlerini toplar; ZIP olarak indirir.
- **[CLI (`cli/`)](cli/README.md):** Bilgisayarında çalışır. Tarayıcının CORS sınırı olmadığı için bütün sayfaları ve bütün dosyaları indirir; `--render` ile JS ile oluşan içeriği ve API yanıtlarını da kaydeder. **"Her şey" gerekiyorsa bunu kullan.**

## Tarayıcı sürümü

- **Sayfa keşfi:** İç linkler, `robots.txt` ve `sitemap.xml` üzerinden aynı alan adındaki sayfaları bulur; her turda yeni sayfalardan link toplayarak (çok seviyeli) 60 sayfaya kadar tarar. `fbclid`, `utm_*` gibi izleme parametrelerini temizler.
- **Kod öncelikli ve hızlı:** Görseller varsayılan olarak kapalı; önce JS, CSS ve source map dosyaları indirilir. Çalışmayan proxy ve erişilemeyen alan adları birkaç denemeden sonra atlanır. Geçen süre ve tahmini kalan süre canlı gösterilir.
- **Engelli sitelerde yedek yol:** Sitenin kendi HTML'ine ulaşılamazsa sayfayı Jina Reader'ın render ettiği HTML'den alır; sitemap'i ve inmeyen JS/CSS dosyalarını da aynı yoldan metin olarak okur (boşluk ve satır sonları özgünden farklı olabilir). İstekler sıraya alınır, sınır aşılırsa beklenip yeniden denenir.
- **Ham HTML + render edilmiş metin:** Her sayfanın sunucudan gelen HTML'ini ve `r.jina.ai` üzerinden render edilmiş Markdown metnini alır.
- **Varlık arşivi:** JS, CSS, font, görsel ve source map dosyalarının içeriklerini indirir. CSS içindeki `@import` / `url(...)` başvurularını ve JS içinde geçen ek parçaları (lazy chunk) da izler.
- **Çevrimdışı gezilebilir kopya:** Bağlantıları yerel dosyalara çevrilmiş ikinci bir kopya üretir; `offline/index.html` dosyasından açılır. Özgün dosyalar ayrıca dokunulmadan saklanır.
- **Yerel analiz (anahtarsız):** Teknoloji izleri, API/endpoint adresleri, üçüncü taraf alan adları ve pasif güvenlik gözlemleri (SRI eksikliği, karışık içerik, açık source map'ler) tarayıcıda hesaplanır.
- **Kanıta dayalı yapay zekâ raporu (isteğe bağlı):** Gemini API anahtarı girilirse mimari, ürün/fiyat ve risk özetini üretir; her iddia kaynağı ve güven düzeyiyle (`verified` / `inference` / `low`) listelenir.
- **Dışa aktarım:** ZIP arşivi, tam JSON raporu, okunabilir HTML raporu ve tek dosyalık site planı (`BLUEPRINT.md`).

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
| `report.json`, `report.html`, `BLUEPRINT.md` | Analiz raporu ve site planı |

Modül script'leri `file://` altında çalışmayabilir. En iyi sonuç için arşiv klasöründe yerel bir sunucu aç (`python -m http.server`) ve `/offline/` adresine git.

## Ayarlar

| Ayar | Açıklama |
|---|---|
| Gemini modeli | Varsayılan `gemini-flash-latest`; başka bir model adı yazılabilir. |
| Maksimum sayfa | Taranacak sayfa sayısı. |
| Varlık / görsel indirme | Arşive JS-CSS-font ve görsellerin alınıp alınmayacağı. |
| Lazy chunk izleme | JS içinde geçen ek `.js` / `.css` adreslerinin de denenmesi. |
| Maksimum varlık | İndirilecek dosya sayısı sınırı (tek dosya 8 MB, toplam 80 MB). |
| Jina API key | İsteğe bağlı; daha yüksek istek sınırı. |
| Özel CORS proxy | Kendi proxy'nin öneki; hedef URL sonuna eklenir. |

## Sınırlar

- Yalnızca tarayıcıya gönderilen içerik alınır. Sunucu kodu, veritabanı ve oturum arkasındaki sayfalar arşive girmez; çevrimdışı kopyada formlar, arama ve API'ye bağlı bölümler çalışmaz.
- Tarayıcı CORS kuralları nedeniyle istekler önce doğrudan, olmazsa herkese açık proxy'lerden (`allorigins`, `corsproxy.io`, `codetabs`), en son Jina üzerinden geçer. Jina sayfanın HTML'ini verir ama JS/CSS/görsel dosyalarını indirmez; site izin vermiyorsa bu dosyalar tarayıcıdan alınamaz. Bunlar için CLI'yi kullan.
- Jina'dan gelen sayfalar render edilmiş kopyadır, sunucunun gönderdiği özgün HTML değildir; sayfa haritasında "render kopya" olarak işaretlenir.
- Lazy chunk izleme tahmine dayanır; her parçayı bulamayabilir.
- HTTP yanıt başlıkları (CSP, HSTS) tarayıcıdan okunamadığı için güvenlik gözlemleri HTML ile sınırlıdır. Bu araç bir zafiyet tarayıcısı değildir.
- Taranan içerik üçüncü taraf servislerden geçer (`r.jina.ai`, proxy'ler, anahtar girildiyse Gemini API).
- API anahtarı yalnızca tarayıcının `localStorage` alanında tutulur, depoya yazılmaz.

## Sorumlu kullanım

Yalnızca sahibi olduğun ya da inceleme izni bulunan siteleri tara. Başkasına ait içerik ve tasarımın yeniden yayımlanması telif ve marka haklarını ihlal edebilir.
