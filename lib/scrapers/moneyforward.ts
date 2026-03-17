import { chromium } from "playwright-core";

export interface MFAsset {
  category: string;
  institution: string;
  name: string;
  amount: number;
  currency: string;
}

export interface MFPerformance {
  dayChange: number;
  dayChangePct: number;
  weekChange: number;
  weekChangePct: number;
  monthChange: number;
  monthChangePct: number;
  yearChange: number;
  yearChangePct: number;
}

export interface MFAccount {
  assets: MFAsset[];
  totalAssets: number;
  totalLiabilities: number;
  netAssets: number;
  // Pie chart breakdown from MF
  breakdown: { name: string; amount: number; pct: number }[];
  // Individual institutions
  institutions: { name: string; amount: number; status: string; fetchedAt: string }[];
  // Performance metrics from MF home page
  performance: MFPerformance;
  monthlyIncome?: number;
  monthlyExpense?: number;
  fetchedAt: string;
}

// Use Mizuho-branded MoneyForward (no bot protection)
const BASE_URL = "https://mizuho.x.moneyforward.com";

export async function scrapeMoneyForward(
  email: string,
  password: string
): Promise<MFAccount> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    locale: "ja-JP",
  });
  const page = await context.newPage();

  try {
    // 1. Login via Mizuho MF
    await page.goto(`${BASE_URL}/users/sign_in`, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });

    await page.fill('input[name="sign_in_session_service[email]"]', email);
    await page.fill('input[name="sign_in_session_service[password]"]', password);
    await page.click('input[name="commit"]');
    await page.waitForTimeout(5000);

    // 2. Go to home page (has total assets + pie chart + institutions)
    await page.goto(`${BASE_URL}/`, {
      waitUntil: "networkidle",
      timeout: 15000,
    });
    await page.waitForTimeout(3000);

    const bodyText = (await page.locator("body").textContent()) || "";

    // 3. Extract total assets
    let totalAssets = 0;
    const totalMatch = bodyText.match(/総資産\s*([\d,]+)\s*円/);
    if (totalMatch) totalAssets = parseNumber(totalMatch[1]);

    // 4. Extract performance data (前日比, 今週, 今月, 今年)
    const performance: MFPerformance = {
      dayChange: 0, dayChangePct: 0,
      weekChange: 0, weekChangePct: 0,
      monthChange: 0, monthChangePct: 0,
      yearChange: 0, yearChangePct: 0,
    };

    // 前日比: -1,352,468円（-5.5%）  or  +100,000円（+1.2%）
    const dayMatch = bodyText.match(/前日比[）)]?\s*([+\-＋−▲▼]?[\d,]+)\s*円[（(]\s*([+\-＋−▲▼]?[\d.]+)\s*%/);
    if (dayMatch) {
      performance.dayChange = parseNumber(dayMatch[1]);
      performance.dayChangePct = parseFloat(dayMatch[2].replace(/[＋▲▼]/g, "").replace(/−/g, "-")) || 0;
      if (dayMatch[1].includes("▲") || dayMatch[1].includes("−") || dayMatch[1].includes("-")) {
        performance.dayChange = -Math.abs(performance.dayChange);
        performance.dayChangePct = -Math.abs(performance.dayChangePct);
      }
    }

    // 今週/今月/今年: -6.1%  -1,499,998円
    const periodPatterns = [
      { key: "week" as const, regex: /今週\s*([+\-＋−▲▼]?[\d.]+)\s*%\s*([+\-＋−▲▼]?[\d,]+)\s*円/ },
      { key: "month" as const, regex: /今月\s*([+\-＋−▲▼]?[\d.]+)\s*%\s*([+\-＋−▲▼]?[\d,]+)\s*円/ },
      { key: "year" as const, regex: /今年\s*([+\-＋−▲▼]?[\d.]+)\s*%\s*([+\-＋−▲▼]?[\d,]+)\s*円/ },
    ];
    for (const { key, regex } of periodPatterns) {
      const m = bodyText.match(regex);
      if (m) {
        let pct = parseFloat(m[1].replace(/[＋▲▼]/g, "").replace(/−/g, "-")) || 0;
        let amt = parseNumber(m[2]);
        if (m[1].includes("-") || m[1].includes("−") || m[1].includes("▲")) {
          pct = -Math.abs(pct);
          amt = -Math.abs(amt);
        }
        if (key === "week") { performance.weekChange = amt; performance.weekChangePct = pct; }
        else if (key === "month") { performance.monthChange = amt; performance.monthChangePct = pct; }
        else if (key === "year") { performance.yearChange = amt; performance.yearChangePct = pct; }
      }
    }

    // 5. Extract pie chart breakdown (embedded in JS: initPieData)
    const breakdown: { name: string; amount: number; pct: number }[] = [];
    const pageContent = await page.content();
    const pieMatch = pageContent.match(/initPieData\s*=\s*(\[[\s\S]*?\]);/);
    if (pieMatch) {
      try {
        const pieData = JSON.parse(pieMatch[1].replace(/'/g, '"'));
        for (const item of pieData) {
          if (item.y && item.name) {
            const pct = totalAssets > 0 ? (item.y / totalAssets) * 100 : 0;
            breakdown.push({ name: item.name, amount: item.y, pct });
          }
        }
      } catch {
        // Parse failed, try regex fallback
      }
    }

    // Fallback: extract breakdown from visible text if pieData not found
    if (breakdown.length === 0) {
      // Pattern: "預金・現金・暗号資産6,203,655円26.85%"
      const catRegex = /(預金[^\d]*|株式[^\d]*|投資信託[^\d]*|ポイント[^\d]*|年金[^\d]*|保険[^\d]*)([\d,]+)\s*円\s*([\d.]+)\s*%/g;
      let catMatch;
      while ((catMatch = catRegex.exec(bodyText)) !== null) {
        const name = catMatch[1].trim();
        const amount = parseNumber(catMatch[2]);
        const pct = parseFloat(catMatch[3]) || 0;
        if (amount > 0) {
          breakdown.push({ name, amount, pct });
        }
      }
    }

    // 5. Extract institution data from page text
    const institutions: { name: string; amount: number; status: string; fetchedAt: string }[] = [];
    const assets: MFAsset[] = [];

    // Parse institutions: "InstitutionName取得日時(MM/DD HH:MM)Amount円"
    const instRegex = /([^\n]{2,30}?)取得日時\((\d{2}\/\d{2}\s+\d{2}:\d{2})\)([\d,]+)円/g;
    let instMatch;
    while ((instMatch = instRegex.exec(bodyText)) !== null) {
      // Clean institution name: extract the real institution name from noisy text
      const rawName = instMatch[1].trim();
      // Try to extract known institution name patterns
      let name = rawName;
      const knownInst = name.match(/(SBI新生銀行|みずほ銀行|ゆうちょ銀行|楽天銀行|住信SBIネット銀行|三菱UFJ銀行|三井住友銀行|SBI証券|楽天証券|マネックス証券|松井証券|WealthNavi（ウェルスナビ）|ウェルスナビ|Coincheck|bitFlyer|LINE BITMAX|モバイルSuica|Suica|WESTERポイント|ANAマイレージ|JALマイレージ|Pontaポイント|Amazon\.co\.jp|楽天市場\(my Rakuten\)|楽天カード|三井住友カード|ビューカード)/);
      if (knownInst) {
        name = knownInst[1];
      } else {
        // Fallback: aggressive cleanup
        name = name
          .replace(/.*?(銀行|証券|投信|暗号資産・FX・貴金属|電子マネー・プリペイド|ポイント|通販|カード)/g, "$1")
          .replace(/^(録金融機関|新規登録|一括|金融機関の管理へ|ステータス[:：]?|正常|エラー|取得中|更新中|設定エラー|要認証|要ワンタイムパスワード|タス[:：]?|中)+/g, "")
          .replace(/[\*]+/g, "")
          .replace(/^\d+/g, "")
          .replace(/^中/g, "")
          .replace(/[\s　]+/g, " ")
          .trim();
      }
      const fetchedAt = instMatch[2];
      const amount = parseNumber(instMatch[3]);

      // Determine status
      let status = "正常";
      const statusCheck = bodyText.substring(instMatch.index, instMatch.index + 200);
      if (statusCheck.includes("設定エラー")) status = "設定エラー";
      else if (statusCheck.includes("要ワンタイム")) status = "要認証";

      institutions.push({ name, amount, status, fetchedAt });

      // Categorize for assets
      let category = "その他";
      if (name.includes("銀行") || name.includes("ゆうちょ")) category = "預金・現金";
      else if (name.includes("証券")) category = "証券";
      else if (name.includes("WealthNavi") || name.includes("ウェルスナビ")) category = "投資信託";
      else if (name.includes("Coincheck") || name.includes("bitFlyer") || name.includes("BITMAX")) category = "暗号資産";

      assets.push({
        category,
        institution: name,
        name,
        amount,
        currency: "JPY",
      });
    }

    // 6. Extract card liabilities
    let totalLiabilities = 0;
    const liabRegex = /利用残高:-([\d,]+)円/g;
    let liabMatch;
    while ((liabMatch = liabRegex.exec(bodyText)) !== null) {
      totalLiabilities += parseNumber(liabMatch[1]);
    }

    // 7. Extract manually-entered assets (wallets, foreign currency, etc.)
    const manualRegex = /(財布[^\d]*|外貨[^\d]*|タイちゃん貯金|Fundinno|Metamask|Paypay)([\d,]+)円/g;
    let manualMatch;
    while ((manualMatch = manualRegex.exec(bodyText)) !== null) {
      const name = manualMatch[1].trim();
      const amount = parseNumber(manualMatch[2]);
      if (amount > 0) {
        assets.push({
          category: "手入力",
          institution: name,
          name,
          amount,
          currency: "JPY",
        });
      }
    }

    const netAssets = totalAssets - totalLiabilities;

    return {
      assets,
      totalAssets,
      totalLiabilities,
      netAssets,
      breakdown,
      institutions,
      performance,
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
