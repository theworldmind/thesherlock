# THESHERLOCK V5.0

Tek bir URL'den yola çıkıp bir web sitesinin ön yüzünü analiz eden ve yedekleyen, sunucusuz (tek dosyalık) bir araç. Kendi sitelerini incelemek ve arşivlemek için tasarlandı.

## Ne yapar

- **Sayfa keşfi:** Ana sayfadaki iç linkler, `robots.txt` ve `sitemap.xml` üzerinden aynı alan adındaki sayfaları bulur; ayarlanan sınıra kadar (4–30 sayfa) tarar.
- **Ham HTML + render edilmiş metin:** Her sayfanın sunucudan gelen HTML'ini ve `r.jina.ai` üzerinden render edilmiş Markdown metnini alır.
- **Varlık arşivi:** Tüm sayfalardaki JS, CSS, font, görsel ve bildirilen source map dosyalarının içeriklerini indirir. CSS içindeki `@import` ve `url(...)` başvurularını da izler.
- **ZIP dışa aktarım:** Hepsini `pages/`, `markdown/`, `assets/` klasörleri ve özgün URL → dosya eşlemesini tutan `manifest.json` ile tek ZIP olarak indirir.
- **Teknoloji tespiti:** Kaynak koddaki izlerden framework, CMS ve üçüncü taraf araçları API anahtarı olmadan çıkarır.
- **Yapay zekâ raporu (isteğe bağlı):** Gemini API anahtarı girilirse mimari, ürün/fiyat ve risk özetini üretir.

## Kullanım

1. Sayfayı aç (GitHub Pages ya da `index.html` dosyasını doğrudan tarayıcıda).
2. Hedef URL'yi yaz, tarama modunu seç ve **Tara & Arşivle**'ye bas.
3. Sonuçlardaki **Arşivi İndir (.zip)** düğmesiyle yedeği al.

Yapay zekâ raporu için **⚙️ Ayarlar**'dan bir Gemini API anahtarı gir ([Google AI Studio](https://aistudio.google.com/apikey)). Arayüzü denemek için **🧪 Demo Veri** düğmesi yeterli.

### GitHub Pages ile yayına alma

Depo ayarlarında **Settings → Pages → Branch: `main` / root** seç. Sayfa `https://<kullanıcı>.github.io/thesherlock/` adresinde açılır.

## Ayarlar

| Ayar | Açıklama |
|---|---|
| Gemini modeli | Varsayılan `gemini-flash-latest`; başka bir model adı yazılabilir. |
| Maksimum sayfa | Taranacak sayfa sayısı. |
| Varlık / görsel indirme | Arşive JS-CSS-font ve görsellerin alınıp alınmayacağı. |
| Maksimum varlık | İndirilecek dosya sayısı sınırı (tek dosya 8 MB, toplam 80 MB). |
| Özel CORS proxy | Kendi proxy'nin öneki; hedef URL sonuna eklenir. |

## Sınırlar

- Yalnızca tarayıcıya gönderilen içerik alınır. Sunucu kodu, veritabanı ve oturum arkasındaki sayfalar arşive girmez.
- Tarayıcı CORS kuralları nedeniyle istekler önce doğrudan, olmazsa herkese açık proxy'lerden (`allorigins`, `corsproxy.io`, `codetabs`) geçer. Bu proxy'ler yavaş ya da kapalı olabilir; en güvenilir yol kendi sitende CORS'u açmak ya da kendi proxy'ni tanımlamaktır.
- Arşivdeki HTML dosyaları özgün halleriyle saklanır; bağlantılar yerel yollara yeniden yazılmaz.
- JavaScript'in çalışma anında yüklediği dosyalar (lazy chunk'lar) HTML'de görünmediği için atlanabilir.
- Taranan içerik üçüncü taraf servislerden geçer (`r.jina.ai`, proxy'ler, anahtar girildiyse Gemini API).
- API anahtarı yalnızca tarayıcının `localStorage` alanında tutulur, depoya yazılmaz.

## Sorumlu kullanım

Yalnızca sahibi olduğun ya da inceleme izni bulunan siteleri tara. Başkasına ait içerik ve tasarımın yeniden yayımlanması telif ve marka haklarını ihlal edebilir.
