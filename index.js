import express from "express";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.post("/crawl", async (req, res) => {
  const { url, sections } = req.body;

  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ error: `Invalid URL: ${url}` });
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    return res.status(400).json({ error: "Sections must be a non-empty array" });
  }

  console.log("🌐 Navigating to:", url);
  const browser = await puppeteer.launch({
    args: chromium.args.concat(["--disable-dev-shm-usage", "--no-sandbox"]),
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  try {
    // sayfayı yükle (yavaş siteler için 90sn bekleme)
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector("body", { timeout: 60000 });
  } catch (err) {
    console.error("⚠️ Initial navigation failed:", err.message);
  }

  const results = [];

  for (const section of sections) {
    try {
      console.log(`🔹 Trying to click section: ${section}`);

      // Menü kapalıysa aç (action sheet/drawer menü)
      await page.evaluate(() => {
        const toggles = document.querySelectorAll(
          ".menu-toggle, .mh-menu, button[aria-label*='menu'], .navbar-toggler"
        );
        if (toggles.length) toggles[0].click();
      });
      await new Promise(r => setTimeout(r, 1500));

      // Menüdeki link veya butonları tara
      const clicked = await page.evaluate((sectionName) => {
        const candidates = Array.from(
          document.querySelectorAll(
            "a, button, .action-sheet a, .action-sheet button, .menu-drawer a, .menu-drawer button"
          )
        );
        const match = candidates.find(el =>
          el.innerText.trim().toLowerCase().includes(sectionName.trim().toLowerCase())
        );
        if (match) {
          match.scrollIntoView({ behavior: "instant", block: "center" });
          match.click();
          return true;
        }
        return false;
      }, section);

      if (!clicked) {
        console.warn(`⚠️ No clickable element found for "${section}"`);
        results.push({ name: section, url: null, error: "No clickable element found" });
        continue;
      }

      const prevUrl = page.url();
      await new Promise(r => setTimeout(r, 3000)); // tıklama sonrası bekleme
      let newUrl = page.url();

      // URL değişmediyse data-id fallback
      if (newUrl === prevUrl) {
        const html = await page.content();
        const match = html.match(/data-id="(\d+)"/);
        if (match) {
          const base = new URL(prevUrl).origin + new URL(prevUrl).pathname.replace(/\/$/, "");
          newUrl = `${base}/menu/${match[1]}`;
        }
      }

      results.push({ name: section, url: newUrl });
      console.log(`✅ Found URL for "${section}": ${newUrl}`);

      // Geri dön (bazı menüler modal değilse geri gidebilir)
      try {
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 60000 });
        await new Promise(r => setTimeout(r, 1500));
      } catch {
        console.log("↩️ Could not goBack(), reloading main page...");
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      }

    } catch (err) {
      console.error(`❌ Error on section "${section}":`, err);
      results.push({ name: section, url: null, error: err.message });
    }
  }

  await browser.close();
  console.log("✅ Done. Results:", results);
  res.json({ results });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Puppeteer crawler ready on port ${PORT}`);
});
