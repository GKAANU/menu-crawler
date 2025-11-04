import express from "express";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.post("/crawl", async (req, res) => {
  const { url, sections, menu_button } = req.body;

  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ error: `Invalid URL: ${url}` });
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    return res.status(400).json({ error: "Sections must be a non-empty array" });
  }

  let executablePath;
  try {
    executablePath = await chromium.executablePath();
  } catch {
    executablePath = "/usr/bin/chromium-browser";
  }

  const browser = await puppeteer.launch({
    args: chromium.args.concat(["--disable-dev-shm-usage", "--no-sandbox"]),
    executablePath,
    headless: chromium.headless,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector("body", { timeout: 60000 });

    // 🔹 Bekle: DOM’da “menü” kelimesi geçene kadar
    await page.waitForFunction(() => {
      const texts = Array.from(document.querySelectorAll("*")).map(el => el.textContent.toLowerCase());
      return texts.some(t => t.includes("menü") || t.includes("menu"));
    }, { timeout: 20000 }).catch(() => console.log("⚠️ Menü kelimesi DOM'da bulunamadı, devam ediliyor..."));
  } catch (err) {
    console.error("⚠️ Initial navigation failed:", err.message);
  }

  const results = [];

  // 🔹 Menü butonunu tıkla (varsa)
  if (menu_button && menu_button.text) {
    console.log(`🧭 Clicking menu button: "${menu_button.text}"`);
    await page.evaluate((btnText) => {
      const els = Array.from(document.querySelectorAll("a, button, div, span"));
      const btn = els.find(el =>
        el.innerText && el.innerText.toLowerCase().includes(btnText.toLowerCase())
      );
      if (btn) btn.click();
    }, menu_button.text);
    await new Promise(r => setTimeout(r, 3000));

    // Menü açılınca “yiyecek / tatlı / içecek” kelimelerini bekle
    await page.waitForFunction(() => {
      const texts = Array.from(document.querySelectorAll("*")).map(el => el.textContent.toLowerCase());
      return texts.some(t =>
        t.includes("yiyecek") || t.includes("tatlı") || t.includes("içecek") || t.includes("menu")
      );
    }, { timeout: 15000 }).catch(() => console.log("⚠️ Sectionlar görünmedi, yine de devam ediliyor..."));
  }

  for (const section of sections) {
    let clicked = false;
    let newUrl = null;

    try {
      console.log(`🔹 Trying section: ${section}`);
      await new Promise(r => setTimeout(r, 2000)); // kısa bekleme

      // 1️⃣ Section’ı DOM’da arayıp tıkla
      clicked = await page.evaluate((sectionName) => {
        const els = Array.from(document.querySelectorAll("a, button, div"));
        const match = els.find(el =>
          el.innerText && el.innerText.trim().toLowerCase().includes(sectionName.trim().toLowerCase())
        );
        if (match) {
          match.scrollIntoView({ behavior: "instant", block: "center" });
          match.click();
          return true;
        }
        return false;
      }, section);

      // 2️⃣ Tıklanamadıysa menü butonuna basıp tekrar dene
      if (!clicked && menu_button && menu_button.text) {
        console.log(`⚙️ Couldn't click section, retrying after menu button...`);
        await page.evaluate((btnText) => {
          const els = Array.from(document.querySelectorAll("a, button, div, span"));
          const btn = els.find(el =>
            el.innerText && el.innerText.toLowerCase().includes(btnText.toLowerCase())
          );
          if (btn) btn.click();
        }, menu_button.text);
        await new Promise(r => setTimeout(r, 2500));

        clicked = await page.evaluate((sectionName) => {
          const els = Array.from(document.querySelectorAll("a, button, div"));
          const match = els.find(el =>
            el.innerText && el.innerText.trim().toLowerCase().includes(sectionName.trim().toLowerCase())
          );
          if (match) {
            match.scrollIntoView({ behavior: "instant", block: "center" });
            match.click();
            return true;
          }
          return false;
        }, section);
      }

      if (!clicked) {
        results.push({ name: section, url: null, error: "No clickable element found" });
        continue;
      }

      // 3️⃣ URL değişti mi kontrol et
      const prevUrl = page.url();
      await new Promise(r => setTimeout(r, 3500));
      newUrl = page.url();

      // 4️⃣ Eğer URL aynıysa data-id fallback
      if (newUrl === prevUrl) {
        const html = await page.content();
        const match = html.match(/data-id="(\d+)"/);
        if (match) {
          const base = new URL(prevUrl).origin + new URL(prevUrl).pathname.replace(/\/$/, "");
          newUrl = `${base}/menu/${match[1]}`;
        }
      }

      results.push({ name: section, url: newUrl });
      console.log(`✅ Found URL for ${section}: ${newUrl}`);

      // 5️⃣ Geri dön ya da reload et
      try {
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 60000 });
        await new Promise(r => setTimeout(r, 1500));
      } catch {
        console.log("↩️ Could not goBack(), reloading main page...");
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      }

    } catch (err) {
      console.error(`❌ Error on section "${section}": ${err.message}`);
      results.push({ name: section, url: null, error: err.message });
    }
  }

  await browser.close();
  res.json({ results });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Puppeteer crawler ready on port ${PORT}`);
});
