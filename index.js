import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json());

app.post("/crawl", async (req, res) => {
  const { url, sections } = req.body;
  if (!url || !sections) {
    return res.status(400).json({ error: "Missing url or sections" });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });

  const results = [];

  for (const section of sections) {
    try {
      const clicked = await page.evaluate((sectionName) => {
        const anchors = Array.from(document.querySelectorAll("a"));
        const match = anchors.find(a =>
          a.innerText.trim().toLowerCase().includes(sectionName.trim().toLowerCase())
        );
        if (match) {
          match.click();
          return true;
        }
        return false;
      }, section);

      if (!clicked) {
        results.push({ name: section, url: null, error: "No clickable element found" });
        continue;
      }

      const prevUrl = page.url();
      await new Promise(r => setTimeout(r, 2000));
      let newUrl = page.url();

      // Fallback for SPA menus
      if (newUrl === prevUrl) {
        const html = await page.content();
        const match = html.match(/data-id="(\d+)"/);
        if (match) {
          const base = new URL(prevUrl).origin + new URL(prevUrl).pathname.replace(/\/$/, "");
          newUrl = `${base}/menu/${match[1]}`;
        }
      }

      results.push({ name: section, url: newUrl });
      await page.goBack({ waitUntil: "networkidle2" });
      await new Promise(r => setTimeout(r, 1000));

    } catch (err) {
      results.push({ name: section, url: null, error: err.message });
    }
  }

  await browser.close();
  res.json({ results });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log(`✅ Puppeteer crawler ready on port ${PORT}`)
);
