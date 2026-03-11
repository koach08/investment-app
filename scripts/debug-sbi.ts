import { chromium } from "playwright-core";

async function debug() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  });

  await page.goto("https://site1.sbisec.co.jp/ETGate/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  // Get all input fields
  const inputs = await page.locator("input").evaluateAll((els) =>
    els.map((el) => ({
      name: el.getAttribute("name"),
      id: el.getAttribute("id"),
      type: el.getAttribute("type"),
      placeholder: el.getAttribute("placeholder"),
      class: el.getAttribute("class"),
    }))
  );
  console.log("Input fields:", JSON.stringify(inputs, null, 2));

  // Get page title and URL
  console.log("Title:", await page.title());
  console.log("URL:", page.url());

  // Check for frames
  const frames = page.frames();
  console.log("Frames:", frames.length);
  for (const frame of frames) {
    console.log("  Frame URL:", frame.url());
    const frameInputs = await frame.locator("input").evaluateAll((els) =>
      els.map((el) => ({
        name: el.getAttribute("name"),
        id: el.getAttribute("id"),
        type: el.getAttribute("type"),
      }))
    );
    if (frameInputs.length > 0) {
      console.log("  Frame inputs:", JSON.stringify(frameInputs, null, 2));
    }
  }

  await browser.close();
}

debug().catch(console.error);
