import { chromium } from 'playwright';
import TurndownService from 'turndown';

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

// HTML'i markdown'a çevir
// sectionName parametresi opsiyonel - eğer verilirse sadece o section'ın içeriğini extract eder
// sections parametresi - tüm section isimlerini içeren array (bir sonraki section'ı tespit etmek için)
const convertPageToMarkdown = async (page, sectionName = null, sections = []) => {
  try {
    const html = await page.content();
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
      strongDelimiter: '**',
    });
    
    // Body içeriğini al (script, style, nav, footer gibi elementleri temizle)
    const markdown = await page.evaluate(({ sectionName, sections }) => {
      // Script ve style taglerini kaldır
      const scripts = document.querySelectorAll('script, style, noscript');
      scripts.forEach(el => el.remove());
      
      // Nav, footer, header gibi navigasyon elementlerini kaldır (opsiyonel)
      const navElements = document.querySelectorAll('nav, footer, header');
      navElements.forEach(el => {
        // Eğer çok küçükse (sadece logo vs) bırak, büyükse kaldır
        if (el.textContent.trim().length > 100) {
          el.remove();
        }
      });
      
      // Eğer sectionName verilmişse, sadece o section'ın içeriğini extract et
      if (sectionName) {
        // Section başlığını bul
        let sectionElement = null;
        const allElements = document.querySelectorAll('*');
        
        for (const el of allElements) {
          const text = (el.innerText || el.textContent || '').trim();
          if (text === sectionName) {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            if (rect.width > 0 && rect.height > 0 && 
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                style.opacity !== '0') {
              sectionElement = el;
              break;
            }
          }
        }
        
        if (sectionElement) {
          // Section başlığından sonraki içeriği bul
          // Önce section'ın parent container'ını bul
          let container = sectionElement.parentElement;
          let sectionStart = sectionElement;
          let sectionEnd = null;
          
          // Section başlığından sonraki tüm kardeş elementleri kontrol et
          let current = sectionElement.nextElementSibling;
          const sectionContent = [];
          
          // Section başlığını ekle
          sectionContent.push(sectionElement.outerHTML);
          
          // Section başlığından sonraki içeriği topla (bir sonraki section başlığına kadar)
          while (current) {
            const currentText = (current.innerText || current.textContent || '').trim();
            
            // Bir sonraki section başlığı mı kontrol et - sadece dinamik sections array'ini kullan
            // Eğer sections array'i yoksa veya boşsa, hiçbir şey yapma (tüm içeriği al)
            let isNextSection = false;
            if (sections && sections.length > 0) {
              isNextSection = sections.some(sec => {
                const secName = typeof sec === 'string' ? sec : sec.name;
                return currentText === secName && currentText !== sectionName;
              });
            }
            
            if (isNextSection) {
              break;
            }
            
            // Görünür elementleri ekle
            const rect = current.getBoundingClientRect();
            const style = window.getComputedStyle(current);
            if (rect.width > 0 && rect.height > 0 && 
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                style.opacity !== '0') {
              sectionContent.push(current.outerHTML);
            }
            
            current = current.nextElementSibling;
          }
          
          // Eğer section içeriği yeterli değilse, parent container'dan al
          if (sectionContent.length <= 1) {
            // Section'ın parent'ından başlayarak içeriği topla
            const parent = sectionElement.parentElement;
            if (parent) {
              let foundSection = false;
              const children = Array.from(parent.children);
              
              for (const child of children) {
                const childText = (child.innerText || child.textContent || '').trim();
                
                // Section başlığını bulduktan sonra içeriği topla
                if (childText === sectionName) {
                  foundSection = true;
                  sectionContent.push(child.outerHTML);
                  continue;
                }
                
                if (foundSection) {
                  // Bir sonraki section başlığı mı kontrol et - sadece dinamik sections array'ini kullan
                  let isNextSection = false;
                  if (sections && sections.length > 0) {
                    isNextSection = sections.some(sec => {
                      const secName = typeof sec === 'string' ? sec : sec.name;
                      return childText === secName && childText !== sectionName;
                    });
                  }
                  
                  if (isNextSection) {
                    break;
                  }
                  
                  // Görünür elementleri ekle
                  const rect = child.getBoundingClientRect();
                  const style = window.getComputedStyle(child);
                  if (rect.width > 0 && rect.height > 0 && 
                      style.display !== 'none' &&
                      style.visibility !== 'hidden' &&
                      style.opacity !== '0') {
                    sectionContent.push(child.outerHTML);
                  }
                }
              }
            }
          }
          
          // Sadece section içeriğini döndür
          if (sectionContent.length > 0) {
            return sectionContent.join('');
          }
        }
        
        // Section bulunamadı veya içerik yok, sadece görünür içeriği döndür (fallback)
        console.warn(`⚠️ Section "${sectionName}" content not found, returning visible content only`);
        const visibleElements = [];
        const allBodyElements = document.querySelectorAll('body > *');
        for (const el of allBodyElements) {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          if (rect.width > 0 && rect.height > 0 && 
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              style.opacity !== '0') {
            visibleElements.push(el.outerHTML);
          }
        }
        return visibleElements.join('');
      }
      
      return document.body.innerHTML;
    }, { sectionName, sections });
    
    const result = turndownService.turndown(markdown);
    return result;
  } catch (err) {
    console.error('⚠️ Error converting page to markdown:', err.message);
    return null;
  }
};

// Crawl işlemi
const crawlItem = async (item) => {
  // Debug: Gelen item'ı logla
  console.log('🔍 crawlItem received item:', JSON.stringify(item, null, 2));
  
  // menu_data wrapper'ını handle et - hem { menu_data: {...} } hem de direkt {...} formatını destekle
  let menuData;
  if (item.menu_data) {
    menuData = item.menu_data;
    console.log('✅ Found menu_data wrapper, using item.menu_data');
  } else if (item.parent_page_url || item.sections !== undefined) {
    // Direkt menu_data içeriği gelmiş
    menuData = item;
    console.log('✅ Direct menu_data content detected, using item directly');
  } else {
    // Fallback: item'ı kullan
    menuData = item;
    console.log('⚠️ Using item as fallback');
  }
  
  console.log('📋 Parsed menuData:', JSON.stringify(menuData, null, 2));
  
  const { parent_page_url, sections, menu_button, needs_crawl, needs_crawl_reason, type } = menuData;
  
  console.log('🔑 Extracted values:', {
    parent_page_url,
    sections_length: sections?.length || 0,
    menu_button: menu_button ? 'present' : 'null/undefined',
    needs_crawl,
    needs_crawl_reason,
    type
  });
  
  // Debug için (production'da kaldırılabilir)
  if (!menu_button && (needs_crawl_reason === "Navigation page detected" || type === "navigation")) {
    console.log(`⚠️ Warning: Navigation page detected but menu_button is missing or null`);
    console.log(`   menuData keys:`, Object.keys(menuData));
    console.log(`   item keys:`, Object.keys(item));
  }

  // Sections kontrolü: sections undefined veya null ise boş array olarak ayarla
  // Sections boş olabilir, bu normal bir durum
  const validSections = Array.isArray(sections) ? sections : [];

  // Navigation page durumu: 
  // 1. type === "navigation" VEYA
  // 2. needs_crawl_reason === "Navigation page detected" VEYA
  // 3. sections boş ve menu_button varsa
  // Bu durumda:
  //   - Eğer menu_button.url varsa: URL'i aç ve markdown döndür
  //   - Eğer menu_button.url yoksa ama menu_button.text varsa: Button'a tıkla, sayfayı aç ve markdown döndür
  // Bu kontrol needs_crawl kontrolünden ÖNCE yapılmalı çünkü navigation page'de needs_crawl false olsa bile işlem yapılmalı
  const isNavigationPage = type === "navigation" || 
                           needs_crawl_reason === "Navigation page detected" || 
                           ((!validSections || validSections.length === 0) && menu_button);

  if (!needs_crawl && !isNavigationPage) {
    // Eğer crawl gerekmiyorsa ve navigation page değilse, mevcut datayı olduğu gibi döndür
    return {
      parent_page_url,
      sections: validSections.map(s => ({ 
        name: s.name, 
        selector: s.selector, 
        url: s.url, 
        markdown_content: s.markdown_content || null,
        is_singlepage_app: s.is_singlepage_app || false 
      })),
      needs_crawl: false,
      menu_button,
      needs_crawl_reason: needs_crawl_reason || (type === "navigation" ? "Navigation page detected" : null),
      type: type || null,
      combined_markdown: menuData.combined_markdown || null,
      is_singlepage_app: false, // needs_crawl false ise, SPA kontrolü yapılmadı
    };
  }

  if (!parent_page_url || !parent_page_url.startsWith("http")) {
    return {
      parent_page_url,
      sections: validSections.map(s => ({ name: s.name, selector: null, url: null, error: `Invalid URL: ${parent_page_url}`, is_singlepage_app: false })),
      needs_crawl: true,
      menu_button,
      needs_crawl_reason: needs_crawl_reason || (type === "navigation" ? "Navigation page detected" : null),
      type: type || null,
      combined_markdown: menuData.combined_markdown || null,
      error: `Invalid URL: ${parent_page_url}`,
      is_singlepage_app: false,
    };
  }

  // type === "navigation" olduğunda, menu_button null ise hata döndür
  if (isNavigationPage && !menu_button) {
    return {
      parent_page_url,
      sections: [],
      needs_crawl: true,
      menu_button: null,
      needs_crawl_reason: needs_crawl_reason || (type === "navigation" ? "Navigation page detected" : null),
      type: type || null,
      combined_markdown: menuData.combined_markdown || null,
      error: "Navigation page detected but menu_button is required. Please provide menu_button.url or menu_button.text",
      is_singlepage_app: false,
    };
  }
  
  if (isNavigationPage && menu_button) {
    let browser;
    try {
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

      const context = await browser.newContext({
        viewport: { width: 375, height: 667 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        ignoreHTTPSErrors: true,
      });
      
      const page = await context.newPage();
      
      try {
        // Önce parent_page_url'e git
        console.log(`🌐 Navigating to parent page: ${parent_page_url}`);
        await page.goto(parent_page_url, { waitUntil: "domcontentloaded", timeout: 90000 });
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(2000);
        
        // Senaryo 1: menu_button.url varsa direkt URL'i aç
        if (menu_button.url) {
          console.log(`🧭 Navigation page detected, opening menu_button.url: ${menu_button.url}`);
          await page.goto(menu_button.url, { waitUntil: "domcontentloaded", timeout: 90000 });
          await page.waitForLoadState("domcontentloaded");
          await page.waitForTimeout(2000);
        } 
        // Senaryo 2: menu_button.url yoksa ama menu_button.text varsa button'a tıkla
        else if (menu_button.text) {
          console.log(`🧭 Navigation page detected, clicking menu button with text: "${menu_button.text}"`);
          
          // Menu button'u bul ve tıkla
          const menuButtonElement = await findMenuButton(page, menu_button.text);
          
          if (menuButtonElement) {
            console.log(`✅ Menu button found, clicking...`);
            await menuButtonElement.scrollIntoViewIfNeeded();
            await page.waitForTimeout(300);
            await menuButtonElement.click({ timeout: 5000 });
            console.log(`✅ Menu button clicked successfully`);
            
            // URL değişimini bekle
            await page.waitForTimeout(2000);
            
            // URL değişti mi kontrol et
            const currentUrl = page.url();
            if (currentUrl !== parent_page_url && currentUrl !== 'about:blank') {
              console.log(`✅ URL changed after button click: ${currentUrl}`);
            } else {
              console.log(`⚠️ URL didn't change after button click, staying on: ${currentUrl}`);
            }
          } else {
            await browser.close();
            console.error(`❌ Menu button not found with text: "${menu_button.text}"`);
            return {
              parent_page_url,
              sections: [],
              needs_crawl: false,
              menu_button,
              needs_crawl_reason: needs_crawl_reason || (type === "navigation" ? "Navigation page detected" : "Navigation page detected"),
              type: type || null,
              error: `Menu button not found with text: "${menu_button.text}"`,
              is_singlepage_app: false,
            };
          }
        } else {
          await browser.close();
          console.error(`❌ Navigation page detected but neither menu_button.url nor menu_button.text provided`);
          return {
            parent_page_url,
            sections: [],
            needs_crawl: false,
            menu_button,
            needs_crawl_reason: needs_crawl_reason || (type === "navigation" ? "Navigation page detected" : "Navigation page detected"),
            type: type || null,
            error: "Navigation page detected but neither menu_button.url nor menu_button.text provided",
            is_singlepage_app: false,
          };
        }
        
        // Sayfanın tam yüklenmesini bekle
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(2000);
        
        // Markdown içeriğini oluştur
        const markdownContent = await convertPageToMarkdown(page);
        await browser.close();
        
        if (markdownContent) {
          return {
            parent_page_url,
            sections: [],
            needs_crawl: false,
            menu_button,
            needs_crawl_reason: needs_crawl_reason || (type === "navigation" ? "Navigation page detected" : "Navigation page detected"),
            type: type || null,
            combined_markdown: markdownContent,
            is_singlepage_app: false,
          };
        } else {
          return {
            parent_page_url,
            sections: [],
            needs_crawl: false,
            menu_button,
            needs_crawl_reason: needs_crawl_reason || (type === "navigation" ? "Navigation page detected" : "Navigation page detected"),
            type: type || null,
            error: "Failed to generate markdown content",
            is_singlepage_app: false,
          };
        }
      } catch (err) {
        await browser.close();
        console.error(`⚠️ Error processing navigation page: ${err.message}`);
        return {
          parent_page_url,
          sections: [],
          needs_crawl: false,
          menu_button,
          needs_crawl_reason: needs_crawl_reason || (type === "navigation" ? "Navigation page detected" : "Navigation page detected"),
          type: type || null,
          error: err.message,
          is_singlepage_app: false,
        };
      }
    } catch (err) {
      console.error("🚨 Browser launch failed:", err.message);
      return {
        parent_page_url,
        sections: [],
        needs_crawl: false,
        menu_button,
        needs_crawl_reason: needs_crawl_reason || (type === "navigation" ? "Navigation page detected" : "Navigation page detected"),
        type: type || null,
        error: err.message,
        is_singlepage_app: false,
      };
    }
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
      sections: validSections.map(s => ({ name: s.name, selector: null, url: null, error: err.message, is_singlepage_app: false })),
      needs_crawl: true,
      menu_button,
      needs_crawl_reason: needs_crawl_reason || (type === "navigation" ? "Navigation page detected" : null),
      type: type || null,
      combined_markdown: menuData.combined_markdown || null,
      error: err.message,
      is_singlepage_app: false,
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
  const sectionResults = validSections.map(s => ({ ...s }));

  for (let sectionIndex = 0; sectionIndex < validSections.length; sectionIndex++) {
    const section = validSections[sectionIndex];
    const sectionName = section.name || section;
    let clicked = false;

    try {
      console.log(`\n🔹 [${sectionIndex + 1}/${validSections.length}] Trying section: ${sectionName}`);
      
      // Sayfanın yüklenmesini bekle
      await page.waitForLoadState("domcontentloaded");
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(2000);
      
      console.log(`📍 Current URL before section search: ${page.url()}`);
      
      // prevUrl'i tıklamadan ÖNCE al (URL değişikliğini doğru tespit etmek için)
      let prevUrl = page.url();
      console.log(`📍 URL before clicking section "${sectionName}": ${prevUrl}`);

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
              // prevUrl'i menu açıldıktan sonra ama section'a tıklamadan ÖNCE al
              const prevUrlAfterMenu = page.url();
              console.log(`📍 URL before clicking section "${sectionName}" (after menu open): ${prevUrlAfterMenu}`);
              
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
                      // prevUrl'i güncelle (menu açıldıktan sonraki URL'yi kullan)
                      prevUrl = prevUrlAfterMenu;
                    } catch (err) {
                      console.log(`⚠️ Click failed after menu open for "${sectionName}":`, err.message);
                      try {
                        await sectionElement.evaluate(el => el.click());
                        clicked = true;
                        await page.waitForTimeout(2000);
                        console.log(`✅ Section "${sectionName}" clicked via evaluate fallback`);
                        // prevUrl'i güncelle (menu açıldıktan sonraki URL'yi kullan)
                        prevUrl = prevUrlAfterMenu;
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
        sectionResults[sectionIndex].is_singlepage_app = false;
        console.log(`❌ Section "${sectionName}" could not be clicked`);
        continue;
      }

      // 5️⃣ URL değişimini kontrol et
      // prevUrl zaten tıklamadan önce alındı, sadece logla
      console.log(`📍 Current URL after clicking "${sectionName}": ${page.url()}`);
      
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
          // waitForURL sonrasında URL değişmiş olabilir, tekrar kontrol et
          const currentUrlAfterWait = page.url();
          if (currentUrlAfterWait !== prevUrl && currentUrlAfterWait !== parent_page_url && currentUrlAfterWait !== 'about:blank') {
            urlChanged = true;
            console.log(`✅ URL changed after waitForURL for "${sectionName}": ${currentUrlAfterWait}`);
          }
        } catch (err) {
          console.log(`⚠️ URL wait timeout for "${sectionName}":`, err.message);
        }
      }
      
      const browserUrl = page.url();
      console.log(`📍 Browser URL bar for "${sectionName}": ${browserUrl}`);
      
      // URL'nin gerçekten değişip değişmediğini kontrol et (prevUrl ile direkt karşılaştır)
      // urlChanged flag'ine güvenme, çünkü waitForURL timeout olabilir ama URL değişmiş olabilir
      const actualUrlChanged = browserUrl !== prevUrl && browserUrl !== parent_page_url && browserUrl !== 'about:blank';
      
      // YENİ DAVRANIŞ: Her zaman markdown döndür (URL yerine)
      if (clicked) {
        // Sayfa içeriğini markdown'a çevir - sadece bu section'ın içeriğini extract et
        console.log(`📝 Converting page content to markdown for section "${sectionName}"...`);
        await page.waitForTimeout(1000); // Sayfanın tam yüklenmesini bekle
        // Tüm section isimlerini array olarak geç (bir sonraki section'ı tespit etmek için)
        const allSectionNames = validSections.map(s => s.name || s);
        const markdownContent = await convertPageToMarkdown(page, sectionName, allSectionNames);
        
        if (markdownContent) {
          sectionResults[sectionIndex].markdown_content = markdownContent;
          console.log(`✅ Markdown content generated for section "${sectionName}" (${markdownContent.length} characters)`);
        } else {
          console.log(`⚠️ Failed to generate markdown content for section "${sectionName}"`);
        }
        
        // URL bilgisini de sakla (opsiyonel, ama markdown öncelikli)
        if (actualUrlChanged && browserUrl && browserUrl.startsWith('http')) {
          sectionResults[sectionIndex].url = browserUrl;
          sectionResults[sectionIndex].is_singlepage_app = false;
          console.log(`✅ URL saved for "${sectionName}": ${browserUrl}`);
        } else if (!actualUrlChanged && (browserUrl === prevUrl || browserUrl === parent_page_url)) {
          sectionResults[sectionIndex].is_singlepage_app = true;
          sectionResults[sectionIndex].url = null;
          console.log(`✅ Section "${sectionName}" clicked successfully but URL didn't change - this is a Single Page App`);
        } else {
          sectionResults[sectionIndex].url = null;
          sectionResults[sectionIndex].is_singlepage_app = false;
          console.log(`⚠️ URL not saved for "${sectionName}" (prevUrl: ${prevUrl}, browserUrl: ${browserUrl})`);
        }
      } else {
        sectionResults[sectionIndex].url = null;
        sectionResults[sectionIndex].is_singlepage_app = false;
        console.log(`⚠️ Section "${sectionName}" was not clicked, no markdown generated`);
      }

      // 6️⃣ Ana sayfaya geri dön (son section değilse)
      if (sectionIndex < validSections.length - 1) {
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
      sectionResults[sectionIndex].is_singlepage_app = false;
    }
  }

  await browser.close();

  // Genel SPA kontrolü: Eğer en az bir section başarıyla tıklandı ama hiçbirinde URL değişmediyse, bu bir SPA'dır
  const clickedSections = sectionResults.filter(s => !s.error);
  const sectionsWithUrlChange = sectionResults.filter(s => s.url && s.url !== parent_page_url);
  const isSinglePageApp = clickedSections.length > 0 && sectionsWithUrlChange.length === 0;

  return {
    parent_page_url,
    sections: sectionResults,
    needs_crawl: false,
    menu_button,
    needs_crawl_reason: needs_crawl_reason || (type === "navigation" ? "Navigation page detected" : null),
    type: type || null,
    combined_markdown: menuData.combined_markdown || null,
    is_singlepage_app: isSinglePageApp,
    single_url_app: isSinglePageApp, // SPA durumu için
  };
};

// Apify Actor Main
// Test modu kontrolü
const isTestMode = process.env.NODE_ENV === 'test' || process.argv.includes('--test');

let Actor;
if (isTestMode) {
  // Test modu için mock Actor
  const fs = await import('fs');
  Actor = {
    async init() {
      console.log('🎭 Mock Apify Actor initialized (Test Mode)');
    },
    async getInput() {
      const inputData = JSON.parse(fs.readFileSync('test-input.json', 'utf-8'));
      // Eğer input wrapper'ı varsa, içindeki data'yı döndür
      return inputData.input || inputData;
    },
    async pushData(data) {
      console.log('📤 Mock pushData:', JSON.stringify(data, null, 2));
      // Markdown içeriğini de göster
      if (data.sections) {
        data.sections.forEach((section, index) => {
          if (section.markdown_content) {
            console.log(`\n📝 Section "${section.name}" Markdown Content (first 500 chars):`);
            console.log(section.markdown_content.substring(0, 500) + '...\n');
          }
        });
      }
    },
    async exit() {
      console.log('👋 Mock Apify Actor exited');
    }
  };
} else {
  Actor = (await import('apify')).Actor;
}

await Actor.init();

const input = await Actor.getInput();
console.log('📥 Received input:', JSON.stringify(input, null, 2));

// Input validation
if (!input) {
  throw new Error('Input is missing or undefined');
}

// Input formatını handle et: hem { data: [...] } hem de direkt array olabilir
// Ayrıca [{ data: [...] }] formatını da destekle
let data;
if (input.data) {
  data = input.data;
} else if (Array.isArray(input)) {
  // Eğer array'in ilk elemanı { data: [...] } formatındaysa
  if (input.length > 0 && input[0].data && Array.isArray(input[0].data)) {
    data = input[0].data;
  } else {
    // Direkt array formatı
    data = input;
  }
} else {
  // menu_data wrapper'ı olabilir
  data = [input];
}

if (!Array.isArray(data)) {
  console.error('❌ Data is not an array. Type:', typeof data, 'Value:', data);
  throw new Error(`Input "data" must be an array, got ${typeof data} instead. Value: ${JSON.stringify(data)}`);
}

if (data.length === 0) {
  console.error('❌ Data array is empty');
  throw new Error('Input "data" array is empty. Please provide at least one item.');
}

console.log(`✅ Input validated. Found ${data.length} item(s) to process.`);

const results = [];

for (const item of data) {
  const result = await crawlItem(item);
  results.push(result);
  
  // Her sonucu dataset'e kaydet
  await Actor.pushData(result);
}

console.log(`✅ Crawling completed. Processed ${results.length} items.`);

await Actor.exit();

