# Playwright Menu Crawler - Apify Actor

Bu actor, web sayfalarındaki menü bölümlerini otomatik olarak bulup URL'lerini çıkaran Playwright tabanlı bir crawler'dır.

## Özellikler

- ✅ Web sayfalarındaki menü bölümlerini otomatik bulma
- ✅ Mobil görünüm desteği (375x667 viewport)
- ✅ Action sheet/modal menü desteği
- ✅ Social media linklerini filtreleme
- ✅ Akıllı text eşleştirme (exact ve contains match)
- ✅ XPath tabanlı element bulma

## Kullanım

### Input Formatı

```json
{
  "data": [
    {
      "parent_page_url": "https://example.com/menu",
      "sections": [
        {
          "name": "YİYECEK MENÜSÜ",
          "selector": null,
          "url": null
        },
        {
          "name": "İÇECEK MENÜSÜ",
          "selector": null,
          "url": null
        }
      ],
      "needs_crawl": true,
      "menu_button": {
        "text": "Menüye Git",
        "selector_hint": "button:contains('Menüye Git')",
        "url": null
      },
      "hints": {
        "language": "tr",
        "menu_container_selector": null
      }
    }
  ]
}
```

### Output Formatı

Actor, her item için aşağıdaki formatta sonuç döner:

```json
{
  "parent_page_url": "https://example.com/menu",
  "sections": [
    {
      "name": "YİYECEK MENÜSÜ",
      "selector": null,
      "url": "https://example.com/menu/food"
    },
    {
      "name": "İÇECEK MENÜSÜ",
      "selector": null,
      "url": "https://example.com/menu/drinks"
    }
  ],
  "needs_crawl": false,
  "menu_button": {
    "text": "Menüye Git",
    "selector_hint": "button:contains('Menüye Git')",
    "url": null
  }
}
```

## Yerel Geliştirme

### Gereksinimler

- Node.js 18+
- npm veya yarn

### Kurulum

```bash
npm install
```

### Çalıştırma

Apify CLI ile:

```bash
# Apify CLI'yi kurun (eğer yoksa)
npm install -g apify-cli

# Actor'u çalıştırın
apify run
```

Veya direkt Node.js ile:

```bash
node main.js
```

## Apify Platform'a Yükleme

1. **Apify hesabınıza giriş yapın:**
   ```bash
   apify login
   ```

2. **Actor'u yükleyin:**
   ```bash
   apify push
   ```

3. **Actor'u Apify Console'dan çalıştırın** ve input JSON'unuzu girin.

## Teknik Detaylar

- **Playwright**: Web scraping ve browser automation için
- **Apify SDK**: Actor yönetimi ve data storage için
- **Mobil Viewport**: 375x667 (iPhone benzeri)
- **User Agent**: Mobile Safari user agent kullanılır

## Sorun Giderme

### Browser Launch Hatası

Eğer browser başlatılamıyorsa, Apify platform'da yeterli memory olduğundan emin olun (minimum 2048 MB önerilir).

### Section Bulunamıyor

- Section name'in doğru yazıldığından emin olun
- Menu button varsa ve section görünmüyorsa, menu button'un doğru text'ine sahip olduğundan emin olun
- Debug logları kontrol edin

### URL Bulunamıyor

- Section'a tıklandıktan sonra URL değişimini bekleme süresi yeterli olmayabilir
- Sayfanın SPA (Single Page Application) olup olmadığını kontrol edin

## Lisans

Bu proje MIT lisansı altında lisanslanmıştır.

