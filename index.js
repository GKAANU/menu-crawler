import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json({ limit: "2mb" }));

// Health check endpoint (Render.com için)
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "playwright-crawler" });
});

// Section bulma fonksiyonu - Playwright ile (direkt text eşleştirme - encoding sorunu yok)
const findSectionByText = async (page, sectionName) => {
  // sectionName'i gelen data'dan direkt kullan - encoding sorunu olmaması için
  console.log(`🔍 Searching for section: "${sectionName}" (length: ${sectionName.length})`);
  
  try {
    // Önce getByText ile direkt bulmayı dene (exact match)
    try {
      const exactMatch = page.getByText(sectionName, { exact: true });
      const isVisible = await exactMatch.isVisible({ timeout: 1000 }).catch(() => false);
      if (isVisible) {
        console.log(`✅ Found exact match for "${sectionName}"`);
        return exactMatch;
      }
    } catch (e) {
      // Exact match bulunamadı, devam et
    }

    // Contains match ile dene
    try {
      const containsMatch = page.getByText(sectionName, { exact: false });
      const isVisible = await containsMatch.isVisible({ timeout: 1000 }).catch(() => false);
      if (isVisible) {
        console.log(`✅ Found contains match for "${sectionName}"`);
        return containsMatch;
      }
    } catch (e) {
      // Contains match bulunamadı, devam et
    }

    // Locator ile tüm clickable elementlerde ara - evaluate ile direkt text eşleştirme
    const foundElement = await page.evaluate(({ sectionName }) => {
      const getXPath = (element) => {
        if (element.id) {
          return `//*[@id="${element.id}"]`;
        }
        if (element === document.body) {
          return '/html/body';
        }
        let ix = 0;
        const siblings = element.parentNode.childNodes;
        for (let i = 0; i < siblings.length; i++) {
          const sibling = siblings[i];
          if (sibling === element) {
            return getXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
          }
          if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
            ix++;
          }
        }
      };

      const clickableSelectors = ['button', 'a', 'li', 'div', 'span', '[role="button"]'];
      const allMatches = [];
      
      // Social media domain kontrolü
      const isSocialMediaLink = (href) => {
        if (!href) return false;
        const socialMediaDomains = [
          'instagram.com', 'facebook.com', 'twitter.com', 'linkedin.com',
          'youtube.com', 'tiktok.com', 'pinterest.com', 'snapchat.com',
          'whatsapp.com', 'telegram.org'
        ];
        const lowerHref = href.toLowerCase();
        return socialMediaDomains.some(domain => lowerHref.includes(domain));
      };
      
      // sectionName'i trim et (whitespace'leri temizle)
      const targetText = sectionName.trim();
      
      for (const selector of clickableSelectors) {
        const elements = Array.from(document.querySelectorAll(selector));
        for (const el of elements) {
          const text = (el.innerText || el.textContent || '').trim();
          
          // Social media linki mi kontrol et - eğer href varsa ve social media ise atla
          const href = el.href || el.getAttribute('href') || '';
          if (href && isSocialMediaLink(href)) {
            continue; // Social media linki ise atla
          }
          
          // Exact match - direkt eşleştirme
          if (text === targetText) {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            if (rect.width > 0 && rect.height > 0 && 
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                style.pointerEvents !== 'none') {
              const xpath = getXPath(el);
              allMatches.push({ xpath: xpath, score: 100, text: text });
            }
          }
          // Contains match - sectionName içeriyor mu? (hem text içinde targetText, hem targetText içinde text)
          else if (text.includes(targetText) || targetText.includes(text)) {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            if (rect.width > 0 && rect.height > 0 && 
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                style.pointerEvents !== 'none') {
              const xpath = getXPath(el);
              // Text uzunluğuna göre score - daha kısa text = daha spesifik
              const score = text.length <= targetText.length ? 90 : 80;
              allMatches.push({ xpath: xpath, score: score, text: text });
            }
          }
        }
      }
      
      // Score'a göre sırala
      allMatches.sort((a, b) => b.score - a.score);
      
      if (allMatches.length > 0) {
        const bestMatch = allMatches[0];
        return { found: true, xpath: bestMatch.xpath, text: bestMatch.text, score: bestMatch.score };
      }
      
      return { found: false };
    }, { sectionName });
    
    if (foundElement.found) {
      console.log(`✅ Found "${sectionName}" via evaluate (score: ${foundElement.score})`);
      // XPath ile element'i bul
      try {
        const element = page.locator(`xpath=${foundElement.xpath}`);
        
        // Social media linki mi kontrol et
        const href = await element.getAttribute('href').catch(() => null);
        if (href && isSocialMediaLink(href)) {
          console.log(`⚠️ Skipping social media link for section "${sectionName}": ${href}`);
          return null;
        }
        
        const isVisible = await element.isVisible({ timeout: 1000 }).catch(() => false);
        if (isVisible) {
          return element;
        }
      } catch (e) {
        console.log(`⚠️ Could not locate element by xpath:`, e.message);
      }
    }

    return null;
  } catch (err) {
    console.log(`⚠️ Error finding section "${sectionName}":`, err.message);
    return null;
  }
};

// Menu button bulma fonksiyonu - direkt text eşleştirme (social media linklerini filtrele)
const findMenuButton = async (page, buttonText) => {
  try {
    // Önce getByText ile direkt bulmayı dene (exact match)
    try {
      const exactMatch = page.getByText(buttonText, { exact: true });
      const isVisible = await exactMatch.isVisible({ timeout: 1000 }).catch(() => false);
      if (isVisible) {
        // Social media linki mi kontrol et
        const href = await exactMatch.getAttribute('href').catch(() => null);
        if (!href || !isSocialMediaLink(href)) {
          console.log(`✅ Menu button found via exact match: "${buttonText}"`);
          return exactMatch;
        }
      }
    } catch (e) {}

    // Contains match ile dene
    try {
      const containsMatch = page.getByText(buttonText, { exact: false });
      const isVisible = await containsMatch.isVisible({ timeout: 1000 }).catch(() => false);
      if (isVisible) {
        // Social media linki mi kontrol et
        const href = await containsMatch.getAttribute('href').catch(() => null);
        if (!href || !isSocialMediaLink(href)) {
          console.log(`✅ Menu button found via contains match: "${buttonText}"`);
          return containsMatch;
        }
      }
    } catch (e) {}

    // Locator ile ara - direkt text eşleştirme (social media linklerini filtrele)
    const clickableSelectors = ['button', 'a', 'div', 'span', '[role="button"]'];
    
    for (const selector of clickableSelectors) {
      try {
        const elements = page.locator(selector);
        const count = await elements.count();
        
        for (let i = 0; i < count; i++) {
          const element = elements.nth(i);
          const text = (await element.textContent().catch(() => '')).trim();
          const targetText = buttonText.trim();
          
          // Exact match öncelikli
          if (text === targetText || text.includes(targetText)) {
            // Social media linki mi kontrol et
            const href = await element.getAttribute('href').catch(() => null);
            if (href && isSocialMediaLink(href)) {
              console.log(`⚠️ Skipping social media link: ${href}`);
              continue; // Social media linki ise atla
            }
            
            // Element'in görünür olup olmadığını kontrol et
            const isVisible = await element.isVisible({ timeout: 500 }).catch(() => false);
            if (isVisible) {
              console.log(`✅ Menu button found via locator: "${text}" (selector: ${selector})`);
              return element;
            }
          }
        }
      } catch (e) {
        // Continue searching
      }
    }

    return null;
  } catch (err) {
    console.log(`⚠️ Error finding menu button "${buttonText}":`, err.message);
    return null;
  }
};

// Social media link kontrolü
const isSocialMediaLink = (href) => {
  if (!href) return false;
  const socialMediaDomains = [
    'instagram.com',
    'facebook.com',
    'twitter.com',
    'linkedin.com',
    'youtube.com',
    'tiktok.com',
    'pinterest.com',
    'snapchat.com',
    'whatsapp.com',
    'telegram.org'
  ];
  const lowerHref = href.toLowerCase();
  return socialMediaDomains.some(domain => lowerHref.includes(domain));
};

app.post("/crawl", async (req, res) => {
  // n8n'den gelen yeni format: array of objects
  let data = req.body;
  if (!Array.isArray(data)) {
    data = [req.body];
  }

  const results = [];

  for (const item of data) {
    const { parent_page_url, sections, menu_button, needs_crawl } = item;

    if (!needs_crawl) {
      // Eğer crawl gerekmiyorsa, mevcut datayı olduğu gibi döndür
      results.push({
        parent_page_url,
        sections: sections.map(s => ({ name: s.name, selector: s.selector, url: s.url })),
        needs_crawl: false,
        menu_button,
      });
      continue;
    }

    if (!parent_page_url || !parent_page_url.startsWith("http")) {
      results.push({
        parent_page_url,
        sections: sections.map(s => ({ name: s.name, selector: null, url: null, error: `Invalid URL: ${parent_page_url}` })),
        needs_crawl: true,
        menu_button,
        error: `Invalid URL: ${parent_page_url}`,
      });
      continue;
    }

    if (!Array.isArray(sections) || sections.length === 0) {
      results.push({
        parent_page_url,
        sections: [],
        needs_crawl: true,
        menu_button,
        error: "Sections must be a non-empty array",
      });
      continue;
    }

    let browser;
    try {
      // Playwright browser launch
      if (process.env.NODE_ENV === "production") {
        // Render.com için: chromium'un executable path'ini açıkça belirt
        // Playwright'ın otomatik olarak chromium-headless-shell kullanmasını önle
        try {
          const chromiumPath = chromium.executablePath();
          console.log(`🔍 Chromium executable path: ${chromiumPath}`);
          
          browser = await chromium.launch({
            executablePath: chromiumPath, // Açıkça chromium path'ini belirt
            headless: true,
            args: [
              '--disable-dev-shm-usage', 
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-gpu',
              '--ignore-certificate-errors',
              '--ignore-ssl-errors',
              '--ignore-certificate-errors-spki-list',
              '--disable-extensions',
              '--single-process' // Render.com için daha iyi
            ],
          });
        } catch (pathErr) {
          // executablePath hata verirse, normal launch dene
          console.log(`⚠️ executablePath failed, using default launch: ${pathErr.message}`);
          browser = await chromium.launch({
            headless: true,
            args: [
              '--disable-dev-shm-usage', 
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-gpu',
              '--ignore-certificate-errors',
              '--ignore-ssl-errors',
              '--ignore-certificate-errors-spki-list',
              '--disable-extensions',
              '--single-process'
            ],
          });
        }
      } else {
        // 🧑‍💻 Lokal ortam - headless: false ile görebilirsiniz
        browser = await chromium.launch({
          headless: false,
          slowMo: 150,
          args: [
            '--ignore-certificate-errors',
            '--ignore-ssl-errors',
            '--ignore-certificate-errors-spki-list'
          ],
        });
      }
    } catch (err) {
      console.error("🚨 Browser launch failed:", err.message);
      results.push({
        parent_page_url,
        sections: sections.map(s => ({ name: s.name, selector: null, url: null, error: err.message })),
        needs_crawl: true,
        menu_button,
        error: err.message,
      });
      continue;
    }

    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
      ignoreHTTPSErrors: true, // SSL sertifika hatalarını yoksay
    });
    
    const page = await context.newPage();
    
    try {
      console.log(`🌐 Navigating to: ${parent_page_url}`);
      await page.goto(parent_page_url, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForLoadState("domcontentloaded");
      
      // URL kontrolü - redirect olup olmadığını kontrol et
      const currentUrl = page.url();
      console.log(`📍 Current URL after navigation: ${currentUrl}`);
      
      if (!currentUrl.includes(new URL(parent_page_url).hostname)) {
        console.error(`⚠️ URL redirect detected! Expected: ${parent_page_url}, Got: ${currentUrl}`);
        // Eğer redirect olmuşsa tekrar orijinal URL'ye git
        await page.goto(parent_page_url, { waitUntil: "domcontentloaded", timeout: 90000 });
        await page.waitForLoadState("domcontentloaded");
      }
    } catch (err) {
      console.error("⚠️ Initial navigation failed:", err.message);
    }

    // Section results'ı orijinal section objelerini kopyalayarak başlat
    const sectionResults = sections.map(s => ({ ...s }));

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      const sectionName = section.name || section;
      let clicked = false;
      let newUrl = null;

      try {
        console.log(`\n🔹 [${sectionIndex + 1}/${sections.length}] Trying section: ${sectionName}`);
        
        // Sayfanın yüklenmesini bekle - her section için sayfa hazır olmalı
        await page.waitForLoadState("domcontentloaded");
        await page.waitForLoadState("networkidle").catch(() => {}); // Network idle olmasını bekle
        await page.waitForTimeout(2000); // Sayfanın tam yüklenmesi için daha uzun bekle
        
        console.log(`📍 Current URL before section search: ${page.url()}`);

        // 1️⃣ İlk önce section'ı direkt bulmayı dene ve visible kontrolü yap
        try {
          // Debug: Sayfadaki tüm tıklanabilir elementleri listele
          const debugElements = await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll("button, a, li, div, span, [role='button']"));
            return els.slice(0, 30).map(el => ({
              tag: el.tagName,
              text: (el.innerText || el.textContent || '').trim().substring(0, 50),
              visible: el.offsetWidth > 0 && el.offsetHeight > 0
            })).filter(el => el.text.length > 0);
          });
          console.log(`📋 Found ${debugElements.length} clickable elements on page:`, JSON.stringify(debugElements, null, 2));
          
          const sectionElement = await findSectionByText(page, sectionName);
          
          if (sectionElement) {
            // ÖNEMLİ: Element'in gerçekten visible olup olmadığını kontrol et
            const isVisible = await sectionElement.isVisible({ timeout: 1000 }).catch(() => false);
            
            // Element'in gerçekten görünür olup olmadığını kontrol et (viewport'ta olmasa bile scroll ile görülebilir)
            const isActuallyVisible = await sectionElement.evaluate((el) => {
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              return rect.width > 0 && rect.height > 0 && 
                     style.display !== 'none' &&
                     style.visibility !== 'hidden' &&
                     style.opacity !== '0' &&
                     style.pointerEvents !== 'none';
            }).catch(() => false);
            
            console.log(`🔍 Section "${sectionName}" found - isVisible: ${isVisible}, isActuallyVisible: ${isActuallyVisible}`);
            
            if (isVisible && isActuallyVisible) {
              try {
                await sectionElement.scrollIntoViewIfNeeded();
                await sectionElement.click({ timeout: 5000 });
                clicked = true;
                await page.waitForTimeout(800);
                console.log(`✅ Section "${sectionName}" clicked successfully`);
              } catch (err) {
                console.log(`⚠️ Click failed for "${sectionName}":`, err.message);
              }
            } else {
              console.log(`⚠️ Section "${sectionName}" found but NOT visible - will try menu button`);
              clicked = false; // Menu button'a gitmek için false yap
            }
          } else {
            console.log(`❌ Section "${sectionName}" not found on page`);
          }
        } catch (err) {
          console.log(`⚠️ Search failed for "${sectionName}":`, err.message);
        }

        // 2️⃣ Eğer section bulunamadıysa ve menu_button varsa, menu butonuna tıkla ve action sheet'i aç
        // ÖNEMLİ: Her section için menu button kontrolü yapılmalı çünkü action sheet kapalı olabilir
        if (!clicked && menu_button && menu_button.text) {
          console.log(`⚙️ Section "${sectionName}" not found directly — trying menu button "${menu_button.text}" to open action sheet...`);
          
          try {
            console.log(`🔍 Searching for menu button with text: "${menu_button.text}"`);
            const menuButtonElement = await findMenuButton(page, menu_button.text);
            
            if (menuButtonElement) {
              console.log(`✅ Menu button found, attempting to click...`);
              try {
                await menuButtonElement.scrollIntoViewIfNeeded();
                await page.waitForTimeout(300); // Scroll için kısa bekle
                await menuButtonElement.click({ timeout: 5000 });
                console.log(`✅ Menu button clicked successfully`);
                
                // Action sheet açılmasını bekle - daha kısa süre ama polling ile kontrol
                let actionSheetOpen = false;
                for (let i = 0; i < 10; i++) {
                  await page.waitForTimeout(300);
                  // Action sheet açıldı mı kontrol et - modal, overlay veya action sheet class'ı var mı?
                  const hasActionSheet = await page.evaluate(() => {
                    const modals = document.querySelectorAll('[class*="modal"], [class*="overlay"], [class*="action"], [class*="sheet"], [class*="menu"]');
                    return Array.from(modals).some(el => {
                      const style = window.getComputedStyle(el);
                      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                    });
                  });
                  if (hasActionSheet) {
                    actionSheetOpen = true;
                    console.log(`✅ Action sheet opened after ${(i + 1) * 300}ms`);
                    break;
                  }
                }
                
                if (!actionSheetOpen) {
                  console.log(`⚠️ Action sheet might not be visible, continuing anyway...`);
                  await page.waitForTimeout(1000); // Yine de biraz bekle
                }
                
                // Debug: Action sheet açıldıktan sonra tüm elementleri listele
                const debugAfterMenu = await page.evaluate(() => {
                  const els = Array.from(document.querySelectorAll("button, a, li, div, span, [role='button']"));
                  return els.slice(0, 30).map(el => ({
                    tag: el.tagName,
                    text: (el.innerText || el.textContent || '').trim().substring(0, 50),
                    visible: el.offsetWidth > 0 && el.offsetHeight > 0
                  })).filter(el => el.text.length > 0);
                });
                console.log(`📋 Found ${debugAfterMenu.length} clickable elements after menu open:`, JSON.stringify(debugAfterMenu, null, 2));
                
                // 3️⃣ Menu açıldıktan sonra section'ı HIZLICA bul ve tıkla (action sheet kapanmadan)
                try {
                  // Önce section'ı bul - gelen sectionName'i direkt kullan (encoding sorunu olmaması için)
                  console.log(`🔍 Searching for section: "${sectionName}" (original text from data)`);
                  const sectionElement = await findSectionByText(page, sectionName);
                  
                  if (sectionElement) {
                    // Hızlı visible kontrolü - timeout'u kısa tut
                    const isVisible = await sectionElement.isVisible({ timeout: 1000 }).catch(() => false);
                    
                    if (isVisible) {
                      try {
                        // Hemen tıkla - scroll ve bekleme sürelerini kısalt
                        await sectionElement.scrollIntoViewIfNeeded();
                        await page.waitForTimeout(200); // Kısa bekle
                        await sectionElement.click({ timeout: 3000, force: true }); // Force click
                        clicked = true;
                        console.log(`✅ Section "${sectionName}" clicked successfully after menu open`);
                        // Navigate olması için bekle
                        await page.waitForTimeout(2000);
                      } catch (err) {
                        console.log(`⚠️ Click failed after menu open for "${sectionName}":`, err.message);
                        // Fallback: evaluate ile direkt tıkla
                        try {
                          await sectionElement.evaluate(el => el.click());
                          clicked = true;
                          await page.waitForTimeout(2000);
                          console.log(`✅ Section "${sectionName}" clicked via evaluate fallback`);
                        } catch (evalErr) {
                          console.log(`⚠️ Evaluate click also failed:`, evalErr.message);
                        }
                      }
                    } else {
                      console.log(`⚠️ Section "${sectionName}" found after menu open but NOT visible`);
                    }
                  } else {
                    console.log(`❌ Section "${sectionName}" not found after menu open`);
                    // Debug: sectionName ile eşleşen text'leri listele
                    const matchingTexts = await page.evaluate((sectionName) => {
                      const els = Array.from(document.querySelectorAll("button, a, li, div, span"));
                      return els.map(el => {
                        const text = (el.innerText || el.textContent || '').trim();
                        return {
                          text: text.substring(0, 50),
                          matches: text.includes(sectionName) || sectionName.includes(text),
                          visible: el.offsetWidth > 0 && el.offsetHeight > 0
                        };
                      }).filter(item => item.text.length > 0 && item.matches);
                    }, sectionName);
                    console.log(`🔍 Matching texts for "${sectionName}":`, JSON.stringify(matchingTexts, null, 2));
                  }
                } catch (err) {
                  console.log(`⚠️ Search failed after menu open for "${sectionName}":`, err.message);
                }
              } catch (err) {
                console.log(`⚠️ Menu button click failed:`, err.message);
              }
            } else {
              console.log(`❌ Menu button not found with text: "${menu_button.text}"`);
              // Debug: Sayfadaki tüm button'ları listele
              const allButtons = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll("button, a, div, span"));
                return buttons.slice(0, 20).map(btn => ({
                  tag: btn.tagName,
                  text: (btn.innerText || btn.textContent || '').trim().substring(0, 50),
                  visible: btn.offsetWidth > 0 && btn.offsetHeight > 0
                })).filter(btn => btn.text.length > 0);
              });
              console.log(`📋 Available buttons on page:`, JSON.stringify(allButtons, null, 2));
            }
          } catch (err) {
            console.log(`⚠️ Search/click failed for menu button "${menu_button.text}":`, err.message);
          }
        }

        // 4️⃣ Eğer hâlâ tıklanamadıysa hata döndür
        if (!clicked) {
          sectionResults[sectionIndex].url = null;
          sectionResults[sectionIndex].error = "No clickable element found";
          console.log(`❌ Section "${sectionName}" could not be clicked`);
          continue;
        }

        // 5️⃣ URL değişimini kontrol et ve browser URL bar'ından URL'yi al
        const prevUrl = page.url();
        console.log(`📍 Current URL before navigation for "${sectionName}": ${prevUrl}`);
        
        // URL değişimini bekle - polling ile kontrol et
        let urlChanged = false;
        for (let i = 0; i < 15; i++) {
          await page.waitForTimeout(500);
          const currentUrl = page.url();
          if (currentUrl !== prevUrl && currentUrl !== parent_page_url && currentUrl !== 'about:blank') {
            urlChanged = true;
            console.log(`✅ URL changed for "${sectionName}" after ${(i + 1) * 500}ms: ${currentUrl}`);
            break;
          }
        }
        
        // Playwright'ın waitForURL ile URL değişimini bekle (eğer henüz değişmediyse)
        if (!urlChanged) {
          try {
            await page.waitForURL(
              (url) => url.toString() !== prevUrl && url.toString() !== parent_page_url && url.toString() !== 'about:blank',
              { timeout: 5000, waitUntil: "domcontentloaded" }
            ).catch(() => {});
          } catch (err) {
            console.log(`⚠️ URL wait timeout for "${sectionName}":`, err.message);
          }
        }
        
        // URL'yi browser URL bar'ından direkt al
        const browserUrl = page.url();
        console.log(`📍 Browser URL bar for "${sectionName}": ${browserUrl}`);
        
        // URL'yi sectionResults array'indeki ilgili section'a direkt yaz
        // Sadece parent_page_url değilse ve geçerli bir URL ise kaydet
        if (browserUrl && browserUrl !== parent_page_url && browserUrl !== 'about:blank' && browserUrl.startsWith('http')) {
          sectionResults[sectionIndex].url = browserUrl;
          console.log(`✅ URL saved for "${sectionName}": ${browserUrl}`);
        } else {
          sectionResults[sectionIndex].url = null;
          console.log(`⚠️ Invalid URL for "${sectionName}", not saving`);
        }

        // 6️⃣ Ana sayfaya geri dön - URL alındıktan sonra MUTLAKA geri dön (son section değilse)
        // Son section değilse mutlaka ana sayfaya geri dön
        if (sectionIndex < sections.length - 1) {
          const currentUrlAfterSave = page.url();
          console.log(`📍 Current URL after saving URL: ${currentUrlAfterSave}`);
          console.log(`📍 Parent page URL: ${parent_page_url}`);
          
          // Ana sayfaya geri dön - her zaman (zaten ana sayfada değilsek)
          const parentHostname = new URL(parent_page_url).hostname;
          const currentHostname = new URL(currentUrlAfterSave).hostname;
          
          if (currentUrlAfterSave === parent_page_url) {
            console.log(`📍 Already on parent page, waiting for next section...`);
            await page.waitForTimeout(1000);
          } else {
            // Ana sayfada değilsek, MUTLAKA ana sayfaya geri dön
            console.log(`🔙 Navigating back to parent page: ${parent_page_url}`);
            console.log(`   Current: ${currentUrlAfterSave}`);
            console.log(`   Target: ${parent_page_url}`);
            
            try {
              // Navigate et
              await page.goto(parent_page_url, { waitUntil: "domcontentloaded", timeout: 60000 });
              
              // Sayfanın yüklendiğinden emin ol
              await page.waitForLoadState("domcontentloaded");
              await page.waitForLoadState("networkidle").catch(() => {}); // Network idle olmasını bekle
              
              // URL'yi kontrol et
              const finalUrl = page.url();
              console.log(`📍 Final URL after navigation: ${finalUrl}`);
              
              // Eğer hala ana sayfada değilsek, tekrar dene
              if (finalUrl !== parent_page_url && !finalUrl.includes(parentHostname)) {
                console.log(`⚠️ Still not on parent page, retrying...`);
                await page.goto(parent_page_url, { waitUntil: "domcontentloaded", timeout: 60000 });
                await page.waitForLoadState("domcontentloaded");
                await page.waitForTimeout(2000);
              } else {
                await page.waitForTimeout(2000); // Sayfanın tam yüklenmesi için bekle
              }
              
              // Debug: Ana sayfaya döndükten sonra menu button'u kontrol et
              if (menu_button && menu_button.text) {
                const menuButtonCheck = await findMenuButton(page, menu_button.text);
                if (menuButtonCheck) {
                  console.log(`✅ Menu button found after returning to parent page`);
                } else {
                  console.log(`⚠️ Menu button NOT found after returning to parent page`);
                }
              }
              
              const verifiedUrl = page.url();
              console.log(`✅ Returned to parent page, verified URL: ${verifiedUrl}`);
              console.log(`✅ Ready for next section: ${sections[sectionIndex + 1]?.name || 'N/A'}`);
            } catch (err) {
              console.error(`❌ Navigation to parent failed: ${err.message}`);
              console.log(`⚠️ Retrying navigation to parent...`);
              try {
                await page.goto(parent_page_url, { waitUntil: "domcontentloaded", timeout: 60000 });
                await page.waitForLoadState("domcontentloaded");
                await page.waitForTimeout(2000);
                console.log(`✅ Retry successful, now on: ${page.url()}`);
              } catch (retryErr) {
                console.error(`❌ Failed to navigate back to parent page after retry: ${retryErr.message}`);
              }
            }
          }
        } else {
          console.log(`✅ Last section processed, no need to go back`);
        }

      } catch (err) {
        console.error(`❌ Error on section ${sectionName}:`, err.message);
        sectionResults[sectionIndex].url = null;
        sectionResults[sectionIndex].error = err.message;
      }
    }

    await browser.close();

    results.push({
      parent_page_url,
      sections: sectionResults,
      needs_crawl: false,
      menu_button,
    });
  }

  res.json(results);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Playwright crawler ready on port ${PORT}`);
});
