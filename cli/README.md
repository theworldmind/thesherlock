# THESHERLOCK CLI 7.0

Bilgisayarında çalışan tam site yedekleyici. Tarayıcı sürümünün takıldığı CORS ve proxy sınırları burada yok: sitenin bütün sayfalarını ve bütün dosyalarını doğrudan indirir.

## Kurulum

[Node.js](https://nodejs.org) 18 veya üstü yeterli; başka paket gerekmez.

```bash
git clone https://github.com/theworldmind/thesherlock
cd thesherlock/cli
node sherlock.mjs https://siten.com
```

JavaScript ile oluşan içeriği de yakalamak için (React, Next.js, Vue siteleri) bir kerelik:

```bash
npm i playwright
npx playwright install chromium
node sherlock.mjs https://siten.com --render
```

## Ne yapar

- `robots.txt` ve tüm sitemap'leri okur, sayfalardaki linkleri izleyerek aynı alan adındaki bütün sayfaları gezer.
- Her sayfanın sunucudan gelen ham HTML'ini kaydeder.
- JS, CSS, font, görsel, source map, ikon, manifest dosyalarını indirir. CSS içindeki `@import`/`url()` ve JS içinde geçen ek parçaları da izler.
- `--render` ile her sayfayı gerçek Chrome'da açar, sayfayı aşağı kaydırır; JS çalıştıktan sonraki HTML'i, sonradan yüklenen dosyaları ve sayfanın çağırdığı JSON/API yanıtlarını da kaydeder.
- HTML ve JS içindeki API/endpoint adreslerini listeler.
- Bağlantıları yerel dosyalara çevrilmiş, çevrimdışı gezilebilir bir kopya üretir.

## Seçenekler

| Seçenek | Açıklama |
|---|---|
| `--pages N` | En fazla N sayfa (varsayılan 200) |
| `--out KLASÖR` | Çıktı klasörü |
| `--render` | Gerçek tarayıcıyla aç (Playwright gerekir) |
| `--chrome YOL` | Kurulu Chrome/Chromium yolunu kullan |
| `--no-images` | Görselleri atla |
| `--max-file MB` | Tek dosya üst sınırı (varsayılan 50) |
| `--concurrency N` | Aynı anda istek (varsayılan 4) |
| `--delay MS` | İstekler arası bekleme (varsayılan 100) |
| `--ignore-robots` | robots.txt yasaklarını yok say — yalnızca kendi sitende |

## Çıktı

```
offline/     çevrimdışı kopya — offline/index.html dosyasından başla
pages/       ham HTML (dokunulmamış)
rendered/    JS çalıştıktan sonraki HTML (--render)
api/         sayfaların çağırdığı JSON yanıtları (--render)
assets/      tüm dosyalar, alan adına göre
manifest.json, report.json, README.txt
```

Çevrimdışı kopyayı en iyi şekilde görmek için çıktı klasöründe `python -m http.server 8000` çalıştırıp `http://localhost:8000/offline/` adresini aç.

## Sınırlar

- Sunucu tarafı kod, veritabanı ve giriş gerektiren sayfalar dışarıdan alınamaz. Kendi sitenin eksiksiz yedeği için hosting panelinden ya da kaynak kod deposundan da yedek al.
- Çevrimdışı kopyada formlar, arama ve canlı API'ye bağlı bölümler çalışmaz.
- Bot koruması olan sitelerde istekler engellenebilir; kendi sitense kendi IP'ni izin listesine ekle.

## Sorumlu kullanım

Yalnızca sahibi olduğun ya da yedekleme izni bulunan siteleri tara. Başkasına ait içerik ve tasarımın yeniden yayımlanması telif ve marka haklarını ihlal edebilir.
