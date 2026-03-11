import { chromium } from "playwright-core";

export interface SBIHolding {
  category: "domestic" | "us" | "fund";
  code: string;
  name: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  marketValue: number;
  pnl: number;
  pnlPercent: number;
  currency?: string;
}

export interface SBIAccount {
  holdings: SBIHolding[];
  cashBalance: number;
  buyingPower: number;
  totalAssets: number;
  fetchedAt: string;
}

export async function scrapeSBI(userId: string, password: string): Promise<SBIAccount> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "ja-JP",
  });
  const page = await context.newPage();

  try {
    // 1. Login
    await page.goto("https://site1.sbisec.co.jp/ETGate/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Fill login form
    await page.fill('input[name="user_id"]', userId);
    await page.fill('input[name="user_password"]', password);
    await page.click('input[name="ACT_login"]');
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 });

    const holdings: SBIHolding[] = [];

    // 2. Navigate to portfolio page (口座管理 → 保有証券)
    // SBI uses frame-based navigation
    try {
      await page.goto(
        "https://site1.sbisec.co.jp/ETGate/?_ControlID=WPLETacR001Control&_DataStoreID=DSWPLETacR001Control&_ActionID=DefaultAID&getFlg=on",
        { waitUntil: "domcontentloaded", timeout: 15000 }
      );
    } catch {
      // Alternative navigation
      const portfolioLink = page.locator('a:has-text("口座管理")').first();
      if (await portfolioLink.isVisible()) {
        await portfolioLink.click();
        await page.waitForLoadState("domcontentloaded");
      }
    }

    // 3. Scrape domestic stocks (国内株式)
    const domesticRows = await page.locator(
      'table.md-l-table-01 tbody tr, table[class*="stock"] tbody tr'
    ).all();

    for (const row of domesticRows) {
      try {
        const cells = await row.locator("td").allTextContents();
        if (cells.length >= 6) {
          const code = cells[0]?.trim().replace(/\D/g, "");
          const name = cells[1]?.trim();
          if (code && code.length === 4 && name) {
            holdings.push({
              category: "domestic",
              code: `${code}.T`,
              name,
              quantity: parseNumber(cells[2]),
              avgPrice: parseNumber(cells[3]),
              currentPrice: parseNumber(cells[4]),
              marketValue: parseNumber(cells[5]),
              pnl: cells.length > 6 ? parseNumber(cells[6]) : 0,
              pnlPercent: cells.length > 7 ? parseNumber(cells[7]) : 0,
            });
          }
        }
      } catch {
        continue;
      }
    }

    // 4. Try to get US stocks (米国株式)
    try {
      const usLink = page.locator('a:has-text("米国"), a:has-text("外国株")').first();
      if (await usLink.isVisible({ timeout: 3000 })) {
        await usLink.click();
        await page.waitForLoadState("domcontentloaded");

        const usRows = await page.locator("table tbody tr").all();
        for (const row of usRows) {
          try {
            const cells = await row.locator("td").allTextContents();
            if (cells.length >= 5) {
              const code = cells[0]?.trim();
              const name = cells[1]?.trim();
              if (code && /^[A-Z]{1,5}$/.test(code)) {
                holdings.push({
                  category: "us",
                  code,
                  name: name || code,
                  quantity: parseNumber(cells[2]),
                  avgPrice: parseNumber(cells[3]),
                  currentPrice: parseNumber(cells[4]),
                  marketValue: cells.length > 5 ? parseNumber(cells[5]) : 0,
                  pnl: cells.length > 6 ? parseNumber(cells[6]) : 0,
                  pnlPercent: cells.length > 7 ? parseNumber(cells[7]) : 0,
                  currency: "USD",
                });
              }
            }
          } catch {
            continue;
          }
        }
      }
    } catch {
      // US stocks page not accessible
    }

    // 5. Get account summary
    let cashBalance = 0;
    let buyingPower = 0;
    let totalAssets = 0;

    try {
      const summaryTexts = await page.locator("body").textContent();
      if (summaryTexts) {
        const cashMatch = summaryTexts.match(/(?:現金|預り金|MRF)[^\d]*([0-9,]+)/);
        if (cashMatch) cashBalance = parseNumber(cashMatch[1]);

        const powerMatch = summaryTexts.match(/(?:買付余力)[^\d]*([0-9,]+)/);
        if (powerMatch) buyingPower = parseNumber(powerMatch[1]);

        const totalMatch = summaryTexts.match(/(?:資産合計|評価額合計)[^\d]*([0-9,]+)/);
        if (totalMatch) totalAssets = parseNumber(totalMatch[1]);
      }
    } catch {
      // Summary extraction failed
    }

    if (totalAssets === 0) {
      totalAssets = holdings.reduce((sum, h) => sum + h.marketValue, 0) + cashBalance;
    }

    return {
      holdings,
      cashBalance,
      buyingPower,
      totalAssets,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}

function parseNumber(s: string | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[,、円＋▲△▼\s%]/g, "").replace(/−/g, "-")) || 0;
}
