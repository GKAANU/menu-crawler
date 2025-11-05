import { Actor } from 'apify';
import { chromium } from 'playwright';

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

// Crawl işlemi
const crawlItem = async (item) => {
  const { parent_page_url, sections, menu_button, needs_crawl } = item;

  if (!needs_crawl) {
    // Eğer crawl gerekmiyorsa, mevcut datayı olduğu gibi döndür
    return {
      parent_page_url,
      sections: sections.map(s => ({ name: s.name, selector: s.selector, url: s.url })),
      needs_crawl: false,
      menu_button,
    };
  }

  if (!parent_page_url || !parent_page_url.startsWith("http")) {
    return {
      parent_page_url,
      sections: sections.map(s => ({ name: s.name, selector: null, url: null, error: `Invalid URL: ${parent_page_url}` })),
      needs_crawl: true,
      menu_button,
      error: `Invalid URL: ${parent_page_url}`,
    };
  }

  if (!Array.isArray(sections) || sections.length === 0) {
    return {
      parent_page_url,
      sections: [],
      needs_crawl: true,
      menu_button,
      error: "Sections must be a non-empty array",
    };
  }

  let browser;
  try {
    // Playwright browser launch - Apify ortamında headless olmalı
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
      ],
    });
  } catch (err) {
    console.error("🚨 Browser launch failed:", err.message);
    return {
      parent_page_url,
      sections: sections.map(s => ({ name: s.name, selector: null, url: null, error: err.message })),
      needs_crawl: true,
      menu_button,
      error: err.message,
    };
  }

  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    ignoreHTTPSErrors: true,
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

    try {
      console.log(`\n🔹 [${sectionIndex + 1}/${sections.length}] Trying section: ${sectionName}`);
      
      // Sayfanın yüklenmesini bekle
      await page.waitForLoadState("domcontentloaded");
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(2000);
      
      console.log(`📍 Current URL before section search: ${page.url()}`);

      // 1️⃣ İlk önce section'ı direkt bulmayı dene
      try {
        const sectionElement = await findSectionByText(page, sectionName);
        
        if (sectionElement) {
          const isVisible = await sectionElement.isVisible({ timeout: 1000 }).catch(() => false);
          
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
            clicked = false;
          }
        } else {
          console.log(`❌ Section "${sectionName}" not found on page`);
        }
      } catch (err) {
        console.log(`⚠️ Search failed for "${sectionName}":`, err.message);
      }

      // 2️⃣ Eğer section bulunamadıysa ve menu_button varsa, menu butonuna tıkla
      if (!clicked && menu_button && menu_button.text) {
        console.log(`⚙️ Section "${sectionName}" not found directly — trying menu button "${menu_button.text}" to open action sheet...`);
        
        try {
          console.log(`🔍 Searching for menu button with text: "${menu_button.text}"`);
          const menuButtonElement = await findMenuButton(page, menu_button.text);
          
          if (menuButtonElement) {
            console.log(`✅ Menu button found, attempting to click...`);
            try {
              await menuButtonElement.scrollIntoViewIfNeeded();
              await page.waitForTimeout(300);
              await menuButtonElement.click({ timeout: 5000 });
              console.log(`✅ Menu button clicked successfully`);
              
              // Action sheet açılmasını bekle
              let actionSheetOpen = false;
              for (let i = 0; i < 10; i++) {
                await page.waitForTimeout(300);
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
                await page.waitForTimeout(1000);
              }
              
              // Menu açıldıktan sonra section'ı bul ve tıkla
              try {
                console.log(`🔍 Searching for section: "${sectionName}" (original text from data)`);
                const sectionElement = await findSectionByText(page, sectionName);
                
                if (sectionElement) {
                  const isVisible = await sectionElement.isVisible({ timeout: 1000 }).catch(() => false);
                  
                  if (isVisible) {
                    try {
                      await sectionElement.scrollIntoViewIfNeeded();
                      await page.waitForTimeout(200);
                      await sectionElement.click({ timeout: 3000, force: true });
                      clicked = true;
                      console.log(`✅ Section "${sectionName}" clicked successfully after menu open`);
                      await page.waitForTimeout(2000);
                    } catch (err) {
                      console.log(`⚠️ Click failed after menu open for "${sectionName}":`, err.message);
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
                }
              } catch (err) {
                console.log(`⚠️ Search failed after menu open for "${sectionName}":`, err.message);
              }
            } catch (err) {
              console.log(`⚠️ Menu button click failed:`, err.message);
            }
          } else {
            console.log(`❌ Menu button not found with text: "${menu_button.text}"`);
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

      // 5️⃣ URL değişimini kontrol et
      const prevUrl = page.url();
      console.log(`📍 Current URL before navigation for "${sectionName}": ${prevUrl}`);
      
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
      
      const browserUrl = page.url();
      console.log(`📍 Browser URL bar for "${sectionName}": ${browserUrl}`);
      
      if (browserUrl && browserUrl !== parent_page_url && browserUrl !== 'about:blank' && browserUrl.startsWith('http')) {
        sectionResults[sectionIndex].url = browserUrl;
        console.log(`✅ URL saved for "${sectionName}": ${browserUrl}`);
      } else {
        sectionResults[sectionIndex].url = null;
        console.log(`⚠️ Invalid URL for "${sectionName}", not saving`);
      }

      // 6️⃣ Ana sayfaya geri dön (son section değilse)
      if (sectionIndex < sections.length - 1) {
        const currentUrlAfterSave = page.url();
        console.log(`📍 Current URL after saving URL: ${currentUrlAfterSave}`);
        
        if (currentUrlAfterSave === parent_page_url) {
          console.log(`📍 Already on parent page, waiting for next section...`);
          await page.waitForTimeout(1000);
        } else {
          console.log(`🔙 Navigating back to parent page: ${parent_page_url}`);
          
          try {
            await page.goto(parent_page_url, { waitUntil: "domcontentloaded", timeout: 60000 });
            await page.waitForLoadState("domcontentloaded");
            await page.waitForLoadState("networkidle").catch(() => {});
            await page.waitForTimeout(2000);
            
            const verifiedUrl = page.url();
            console.log(`✅ Returned to parent page, verified URL: ${verifiedUrl}`);
            console.log(`✅ Ready for next section: ${sections[sectionIndex + 1]?.name || 'N/A'}`);
          } catch (err) {
            console.error(`❌ Navigation to parent failed: ${err.message}`);
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

  return {
    parent_page_url,
    sections: sectionResults,
    needs_crawl: false,
    menu_button,
  };
};

// Apify Actor Main
await Actor.init();

const input = await Actor.getInput();
const { data } = input;

if (!Array.isArray(data) || data.length === 0) {
  throw new Error('Input must contain a non-empty "data" array');
}

const results = [];

for (const item of data) {
  const result = await crawlItem(item);
  results.push(result);
  
  // Her sonucu dataset'e kaydet
  await Actor.pushData(result);
}

console.log(`✅ Crawling completed. Processed ${results.length} items.`);

await Actor.exit();

