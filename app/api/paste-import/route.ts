import { NextRequest, NextResponse } from "next/server";

interface ParsedHolding {
  source: string;
  code: string;
  name: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  marketValue: number;
  pnl: number;
  pnlPercent: number;
  category: string;
  currency: string;
}

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    if (!text) {
      return NextResponse.json({ error: "テキストが空です" }, { status: 400 });
    }

    const holdings = parsePastedText(text);

    return NextResponse.json({
      holdings,
      count: holdings.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `解析失敗: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}

function parsePastedText(text: string): ParsedHolding[] {
  const allHoldings: ParsedHolding[] = [];

  // Detect and parse each type
  if (text.includes("ラップ") || text.includes("AI投資") || text.includes("匠の運用")) {
    allHoldings.push(...parseWrapAccount(text));
  }
  if (text.includes("金・銀・プラチナ") || text.includes("保有資産合計") && (text.includes("金額表示") || text.includes("金/") || text.includes("プラチナ/"))) {
    allHoldings.push(...parseMetalsAccount(text));
  }
  // If nothing matched above, try foreign stocks
  if (allHoldings.length === 0) {
    allHoldings.push(...parseSBIForeignText(text));
  }

  return allHoldings;
}

function parseWrapAccount(text: string): ParsedHolding[] {
  const holdings: ParsedHolding[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const seenProducts = new Set<string>();

  const PRODUCT_NAMES = ["AI投資", "匠の運用", "レバナビ", "レバチョイス", "ALL株式"];

  let totalPnl = 0;
  let totalPnlPct = 0;
  let foundFirstProduct = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Parse individual wrap products
    // Must match exact product name AND have "資産残高" immediately after, then an amount
    if (PRODUCT_NAMES.includes(line) && !seenProducts.has(line)) {
      const name = line;

      // Look ahead: expect "資産残高" then "X円"
      let amount = 0;
      let foundBalance = false;
      let pnl = 0;
      let pnlPct = 0;

      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        // Stop if we hit another product name
        if (j > i + 1 && PRODUCT_NAMES.includes(lines[j])) break;

        if (lines[j] === "資産残高" || lines[j].includes("資産残高")) {
          foundBalance = true;
          continue;
        }

        // Only capture amount if we've seen 資産残高 for THIS product
        if (foundBalance && amount === 0) {
          const amtMatch = lines[j].match(/^([0-9,]+)円$/);
          if (amtMatch) {
            amount = parseFloat(amtMatch[1].replace(/,/g, ""));
            continue;
          }
        }

        // Capture P&L for this product
        if (lines[j].includes("通算損益")) {
          for (let k = j + 1; k < Math.min(j + 3, lines.length); k++) {
            const pnlMatch = lines[k].match(/^([+\-])([0-9,]+)円$/);
            if (pnlMatch) {
              pnl = parseFloat(pnlMatch[2].replace(/,/g, "")) * (pnlMatch[1] === "-" ? -1 : 1);
            }
            const pctMatch = lines[k].match(/^([+\-])([0-9.]+)%$/);
            if (pctMatch) {
              pnlPct = parseFloat(pctMatch[2]) * (pctMatch[1] === "-" ? -1 : 1);
            }
          }
          break;
        }
      }

      if (amount > 0) {
        seenProducts.add(name);
        foundFirstProduct = true;
        holdings.push({
          source: "sbi-wrap",
          code: "",
          name: `SBIラップ ${name}`,
          quantity: 1,
          avgPrice: 0,
          currentPrice: amount,
          marketValue: amount,
          pnl: pnl,
          pnlPercent: pnlPct,
          category: "SBIラップ",
          currency: "JPY",
        });
      }
    }

    // Parse overall 通算損益 (before first product = overall P&L)
    if (!foundFirstProduct && line.includes("通算損益")) {
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const pnlMatch = lines[j].match(/^([+\-])([0-9,]+)円$/);
        if (pnlMatch) {
          totalPnl = parseFloat(pnlMatch[2].replace(/,/g, "")) * (pnlMatch[1] === "-" ? -1 : 1);
        }
        const pctMatch = lines[j].match(/^([+\-])([0-9.]+)%$/);
        if (pctMatch) {
          totalPnlPct = parseFloat(pctMatch[2]) * (pctMatch[1] === "-" ? -1 : 1);
        }
      }
    }
  }

  // If individual products don't have their own P&L, distribute overall P&L proportionally
  if (holdings.length > 0 && holdings.every((h) => h.pnl === 0) && totalPnl !== 0) {
    const totalMV = holdings.reduce((s, h) => s + h.marketValue, 0);
    holdings.forEach((h) => {
      const ratio = totalMV > 0 ? h.marketValue / totalMV : 0;
      h.pnl = Math.round(totalPnl * ratio);
      h.pnlPercent = totalPnlPct;
    });
  }

  return holdings;
}

function parseMetalsAccount(text: string): ParsedHolding[] {
  const holdings: ParsedHolding[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let totalValue = 0;
  let totalPnl = 0;
  let totalPnlPct = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Parse "保有資産合計 (現物評価額)" followed by amount
    if (line.includes("保有資産合計")) {
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const amtMatch = lines[j].match(/^([0-9,]+)$/);
        if (amtMatch) {
          totalValue = parseFloat(amtMatch[1].replace(/,/g, ""));
          break;
        }
        const amtMatch2 = lines[j].match(/^([0-9,]+)円$/);
        if (amtMatch2) {
          totalValue = parseFloat(amtMatch2[1].replace(/,/g, ""));
          break;
        }
      }
    }

    // Parse "保有資産評価損益" followed by "+335,456円(+84.99 %)"
    if (line.includes("保有資産評価損益")) {
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const pnlMatch = lines[j].match(/^([+\-])([0-9,]+)円\(([+\-])([0-9.]+)\s*%\)$/);
        if (pnlMatch) {
          totalPnl = parseFloat(pnlMatch[2].replace(/,/g, "")) * (pnlMatch[1] === "-" ? -1 : 1);
          totalPnlPct = parseFloat(pnlMatch[4]) * (pnlMatch[3] === "-" ? -1 : 1);
          break;
        }
        // Also try just the yen amount on its own line
        const pnlMatch2 = lines[j].match(/^([+\-])([0-9,]+)円/);
        if (pnlMatch2) {
          totalPnl = parseFloat(pnlMatch2[2].replace(/,/g, "")) * (pnlMatch2[1] === "-" ? -1 : 1);
        }
        const pctMatch = lines[j].match(/([+\-])([0-9.]+)\s*%/);
        if (pctMatch) {
          totalPnlPct = parseFloat(pctMatch[2]) * (pctMatch[1] === "-" ? -1 : 1);
        }
      }
    }
  }

  if (totalValue > 0) {
    holdings.push({
      source: "sbi-metals",
      code: "",
      name: "金・銀・プラチナ（SBI）",
      quantity: 1,
      avgPrice: 0,
      currentPrice: totalValue,
      marketValue: totalValue,
      pnl: totalPnl,
      pnlPercent: totalPnlPct,
      category: "金・貴金属",
      currency: "JPY",
    });
  }

  return holdings;
}

function parseSBIForeignText(text: string): ParsedHolding[] {
  const holdings: ParsedHolding[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let currentSection = "";
  let currentCurrency = "USD";
  let currentMarket = "米国株";

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Detect section
    if (line.includes("米国株式") && line.includes("特定預り")) {
      currentSection = "特定口座";
      currentCurrency = "USD";
      currentMarket = "米国株";
      i++;
      continue;
    }
    if (line.includes("米国株式") && line.includes("NISA")) {
      currentSection = "NISA";
      currentCurrency = "USD";
      currentMarket = "米国株";
      i++;
      continue;
    }
    if (line.includes("シンガポール株式")) {
      currentSection = line.includes("NISA") ? "NISA" : "特定口座";
      currentCurrency = "SGD";
      currentMarket = "シンガポール株";
      i++;
      continue;
    }
    if (line.includes("中国株式") || line.includes("香港株式")) {
      currentSection = line.includes("NISA") ? "NISA" : "特定口座";
      currentCurrency = "HKD";
      currentMarket = "中国/香港株";
      i++;
      continue;
    }

    // Skip headers and UI elements
    if (line.includes("保有数量") || line.includes("取得単価") ||
        line.includes("現在値") || line.includes("外貨建評価損益") ||
        line.includes("株価：") || line.includes("株式(現物)") ||
        line.includes("MMF") || line.includes("債券") ||
        line.includes("表示") || line.includes("評価額") ||
        line.includes("円換算") || line === "現買" || line === "現売" || line === "積立") {
      i++;
      continue;
    }

    // Try to detect a stock entry pattern:
    // Line: "TICKER銘柄名" or "TICKER 銘柄名"
    // Then skip "現買", "現売", "積立" lines
    // Then: quantity, avgPrice, currentPrice, pnl

    // Check if this line looks like a ticker + name
    const tickerMatch = line.match(/^([A-Z]{1,5})(.+)/);
    if (tickerMatch && currentSection) {
      const ticker = tickerMatch[1];
      const name = tickerMatch[2].trim();

      // Collect numeric values after skipping action buttons
      const numValues: number[] = [];
      let j = i + 1;
      while (j < lines.length && numValues.length < 4) {
        const val = lines[j];
        // Skip action buttons
        if (val === "現買" || val === "現売" || val === "積立") {
          j++;
          continue;
        }
        // Try to parse as number
        const num = parseFloat(val.replace(/[,+]/g, ""));
        if (!isNaN(num)) {
          numValues.push(num);
          j++;
        } else {
          break;
        }
      }

      if (numValues.length >= 4) {
        const quantity = numValues[0];
        const avgPrice = numValues[1];
        const currentPrice = numValues[2];
        const pnl = numValues[3];
        const marketValue = currentPrice * quantity;

        holdings.push({
          source: "sbi-foreign",
          code: ticker,
          name,
          quantity,
          avgPrice,
          currentPrice,
          marketValue,
          pnl,
          pnlPercent: avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0,
          category: `${currentMarket}（${currentSection}）`,
          currency: currentCurrency,
        });

        i = j;
        continue;
      }
    }

    i++;
  }

  return holdings;
}
