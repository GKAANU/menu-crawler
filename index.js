app.post("/crawl", async (req, res) => {
  const { url, sections, menu_button } = req.body;

  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ error: `Invalid URL: ${url}` });
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    return res.status(400).json({ error: "Sections must be a non-empty array" });
  }

  const browser = await puppeteer.launch({
    args: chromium.args.concat(["--disable-dev-shm-usage", "--no-sandbox"]),
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector("body", { timeout: 60000 });
  } catch (err) {
    console.error("⚠️ Initial navigation failed:", err.message);
  }

  const results = [];

  for (const section of sections) {
    let clicked = false;
    let newUrl = null;

    try {
      console.log(`🔹 Trying section: ${section}`);

      // 🔸 1️⃣ Section tıklamayı dene
      clicked = await page.evaluate((sectionName) => {
        const els = Array.from(
          document.querySelectorAll(
            "a, button, .menu a, .menu button, .action-sheet a, .action-sheet button"
          )
        );
        const match = els.find(el =>
          el.innerText.trim().toLowerCase().includes(sectionName.trim().toLowerCase())
        );
        if (match) {
          match.scrollIntoView({ behavior: "instant", block: "center" });
          match.click();
          return true;
        }
        return false;
      }, section);

      // 🔸 2️⃣ Eğer tıklayamadıysa menu_button varsa onu tıkla ve tekrar dene
      if (!clicked && menu_button && menu_button.text) {
        console.log(`⚙️ Couldn't click section, trying menu button "${menu_button.text}"...`);
        await page.evaluate((btnText) => {
          const els = Array.from(document.querySelectorAll("a, button, div, span"));
          const btn = els.find(el =>
            el.innerText.trim().toLowerCase().includes(btnText.trim().toLowerCase())
          );
          if (btn) btn.click();
        }, menu_button.text);
        await new Promise(r => setTimeout(r, 2500));

        // menu_button’a bastıktan sonra section’ı tekrar dene
        clicked = await page.evaluate((sectionName) => {
          const els = Array.from(
            document.querySelectorAll(
              "a, button, .menu a, .menu button, .action-sheet a, .action-sheet button"
            )
          );
          const match = els.find(el =>
            el.innerText.trim().toLowerCase().includes(sectionName.trim().toLowerCase())
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

      // 🔸 3️⃣ URL değişimini takip et
      const prevUrl = page.url();
      await new Promise(r => setTimeout(r, 3000));
      newUrl = page.url();

      // Fallback: data-id’den URL tahmini
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

      // 🔸 4️⃣ Geri dön, diğer section için devam et
      try {
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 60000 });
        await new Promise(r => setTimeout(r, 1500));
      } catch {
        console.log("↩️ Could not goBack(), reloading main page...");
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      }

    } catch (err) {
      results.push({ name: section, url: null, error: err.message });
    }
  }

  await browser.close();
  res.json({ results });
});
