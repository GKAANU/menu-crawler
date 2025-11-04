import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json());

app.post("/crawl", async (req, res) => {
  const { url, sections } = req.body;
  if (!url || !sections) {
    return res.status(400).json({ error: "Missing url or sections" });
  }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });

  const results = [];
  for (const section of sections) {
    try {
      await page.evaluate((sectionName) => {
        const el = [...document.querySelectorAll("a")].find(a => a.innerText.includes(sectionName));
        if (el) el.click();
      }, section);
      await page.waitForTimeout(2000);
      const currentUrl = page.url();
      results.push({ name: section, url: currentUrl });
      await page.goBack({ waitUntil: "networkidle2" });
    } catch (err) {
      results.push({ name: section, url: null, error: err.message });
    }
  }

  await browser.close();
  res.json({ results });
});

app.listen(8080, () => console.log("✅ Puppeteer crawler running on port 8080"));
