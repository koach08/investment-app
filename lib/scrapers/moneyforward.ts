import { chromium } from "playwright-core";

export interface MFAsset {
  category: string;
  institution: string;
  name: string;
  amount: number;
  currency: string;
}

export interface MFAccount {
  assets: MFAsset[];
  totalAssets: number;
  totalLiabilities: number;
  netAssets: number;
  monthlyIncome?: number;
  monthlyExpense?: number;
  fetchedAt: string;
}

export async function scrapeMoneyForward(
  email: string,
  password: string
): Promise<MFAccount> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "ja-JP",
  });
  const page = await context.newPage();

  try {
    // 1. Login
    await page.goto("https://moneyforward.com/sign_in", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Click email login if needed
    try {
      const emailLoginBtn = page.locator(
        'a:has-text("メールアドレス"), button:has-text("メールアドレス")'
      ).first();
      if (await emailLoginBtn.isVisible({ timeout: 3000 })) {
        await emailLoginBtn.click();
        await page.waitForLoadState("domcontentloaded");
      }
    } catch {
      // Already on email login form
    }

    await page.fill('input[type="email"], input[name="mfid_user[email]"]', email);

    // Some flows have a "next" button before password
    try {
      const nextBtn = page.locator('button:has-text("次へ"), input[type="submit"]').first();
      if (await nextBtn.isVisible({ timeout: 2000 })) {
        await nextBtn.click();
        await page.waitForLoadState("domcontentloaded");
      }
    } catch {
      // Password field already visible
    }

    await page.fill('input[type="password"], input[name="mfid_user[password]"]', password);
    await page.click('button[type="submit"], input[type="submit"]');
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 });

    // 2. Navigate to balance summary (資産総額)
    await page.goto("https://moneyforward.com/bs/portfolio", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    const assets: MFAsset[] = [];

    // 3. Scrape asset categories
    const assetSections = await page.locator(
      '.bs-detail-table, table.table, [class*="asset"] table'
    ).all();

    for (const section of assetSections) {
      const rows = await section.locator("tbody tr").all();
      for (const row of rows) {
        try {
          const cells = await row.locator("td").allTextContents();
          if (cells.length >= 2) {
            const name = cells[0]?.trim();
            const amountStr = cells[cells.length - 1]?.trim() || cells[1]?.trim();
            if (name && amountStr) {
              assets.push({
                category: await getCategoryFromSection(section),
                institution: "",
                name,
                amount: parseNumber(amountStr),
                currency: "JPY",
              });
            }
          }
        } catch {
          continue;
        }
      }
    }

    // 4. Get totals
    let totalAssets = 0;
    let totalLiabilities = 0;

    try {
      const bodyText = await page.locator("body").textContent();
      if (bodyText) {
        const totalMatch = bodyText.match(/(?:資産総額|総資産)[^\d]*([0-9,]+)/);
        if (totalMatch) totalAssets = parseNumber(totalMatch[1]);

        const liabMatch = bodyText.match(/(?:負債総額|負債)[^\d]*([0-9,]+)/);
        if (liabMatch) totalLiabilities = parseNumber(liabMatch[1]);
      }
    } catch {
      // Total extraction failed
    }

    if (totalAssets === 0) {
      totalAssets = assets.reduce((sum, a) => sum + a.amount, 0);
    }

    // 5. Try to get monthly summary
    let monthlyIncome: number | undefined;
    let monthlyExpense: number | undefined;

    try {
      await page.goto("https://moneyforward.com/cf", {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });
      const cfText = await page.locator("body").textContent();
      if (cfText) {
        const incomeMatch = cfText.match(/(?:収入)[^\d]*([0-9,]+)/);
        if (incomeMatch) monthlyIncome = parseNumber(incomeMatch[1]);

        const expenseMatch = cfText.match(/(?:支出)[^\d]*([0-9,]+)/);
        if (expenseMatch) monthlyExpense = parseNumber(expenseMatch[1]);
      }
    } catch {
      // Monthly data not available
    }

    return {
      assets,
      totalAssets,
      totalLiabilities,
      netAssets: totalAssets - totalLiabilities,
      monthlyIncome,
      monthlyExpense,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}

async function getCategoryFromSection(
  section: import("playwright-core").Locator
): Promise<string> {
  try {
    const header = await section.locator("th, caption, thead td").first().textContent();
    return header?.trim() || "その他";
  } catch {
    return "その他";
  }
}

function parseNumber(s: string | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[,、円＋▲△▼\s%]/g, "").replace(/−/g, "-")) || 0;
}
