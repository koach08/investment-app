import { NextRequest, NextResponse } from "next/server";
import { TextDecoder as NodeTextDecoder } from "util";

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
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const source = (formData.get("source") as string) || "sbi";

    if (!file) {
      return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
    }

    // Read file as binary buffer
    const buffer = await file.arrayBuffer();

    // Try Shift-JIS first (SBI default), fallback to UTF-8
    let text: string;
    try {
      const decoder = new NodeTextDecoder("shift_jis");
      text = decoder.decode(buffer);
    } catch {
      text = new NodeTextDecoder("utf-8").decode(buffer);
    }
    // If still garbled, try UTF-8
    if (text.includes("�")) {
      text = new NodeTextDecoder("utf-8").decode(buffer);
    }

    const lines = text.split(/\r?\n/).filter((l) => l.trim());

    if (lines.length < 2) {
      return NextResponse.json({ error: "CSVが空です" }, { status: 400 });
    }

    // Auto-detect SBI CSV type
    const fullText = lines.join("\n");
    const isDistribution = fullText.includes("受取額") || fullText.includes("受渡日") && fullText.includes("商品");
    const isSummary = fullText.includes("トータルリターン") || fullText.includes("累計売却金額");

    if (isDistribution && source === "sbi") {
      const dividends = parseSBIDistribution(lines);
      return NextResponse.json({
        type: "distribution",
        dividends,
        count: dividends.length,
        source,
      });
    }

    if (isSummary && source === "sbi") {
      const summary = parseSBISummary(lines);
      return NextResponse.json({
        type: "summary",
        summary,
        count: summary.length,
        source,
      });
    }

    // Auto-detect MoneyForward asset timeline
    if (source === "moneyforward" && (fullText.includes("合計（円）") || fullText.includes("預金・現金"))) {
      const timeline = parseMFTimeline(lines);
      return NextResponse.json({
        type: "timeline",
        timeline,
        count: timeline.length,
        source,
      });
    }

    let holdings: ParsedHolding[];
    if (source === "sbi") {
      holdings = parseSBIPortfolio(lines);
    } else if (source === "moneyforward") {
      holdings = parseMFCSV(lines);
    } else {
      holdings = parseGenericCSV(lines, source);
    }

    return NextResponse.json({
      type: "holdings",
      holdings,
      count: holdings.length,
      source,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `CSV解析失敗: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}

// ===== SBI証券ポートフォリオCSV専用パーサー =====
function parseSBIPortfolio(lines: string[]): ParsedHolding[] {
  const holdings: ParsedHolding[] = [];
  let currentSection = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect section headers
    if (line.includes("株式（現物/特定預り）") || line.includes("株式(現物/特定預り)")) {
      currentSection = "特定口座";
      continue;
    }
    if (line.includes("NISA預り（成長投資枠）") && line.includes("株式")) {
      currentSection = "NISA成長枠";
      continue;
    }
    if (line.includes("株式（信用）") || line.includes("株式(信用)")) {
      currentSection = "信用取引";
      continue;
    }
    if (line.includes("投資信託") && line.includes("成長投資枠")) {
      currentSection = "投信NISA成長";
      continue;
    }
    if (line.includes("投資信託") && line.includes("つみたて投資枠")) {
      currentSection = "投信NISAつみたて";
      continue;
    }
    if (line.includes("投資信託") && !line.includes("NISA") && !line.includes("合計")) {
      currentSection = "投信特定";
      continue;
    }

    // Skip header rows, summary rows, page info
    if (line.startsWith('"銘柄（コード）') || line.startsWith('"ファンド名"') ||
        line.includes("合計") || line.includes("評価額") || line.includes("建代金") ||
        line.includes("総合計") || line.includes("ポートフォリオ") ||
        line.includes("一括表示") || line.includes("PTS") ||
        line.includes("総件数") || line.includes("選択範囲") ||
        line.includes("ページ：")) {
      continue;
    }

    const values = parseCSVLine(line);
    if (values.length < 5) continue;

    // Parse based on section type
    if (currentSection === "信用取引") {
      // 信用: "銘柄コード","売/買建","市場","期限","買付日","数量","建単価","現在値","前日比","前日比%","損益","損益%","建代金"
      const holding = parseMarginRow(values, currentSection);
      if (holding) holdings.push(holding);
    } else if (currentSection.startsWith("投信")) {
      // 投資信託: "ファンド名","買付日","数量(口)","取得単価","現在値","前日比","前日比%","損益","損益%","評価額"
      const holding = parseFundRow(values, currentSection);
      if (holding) holdings.push(holding);
    } else if (currentSection) {
      // 株式: "銘柄コード 銘柄名","買付日","数量","取得単価","現在値","前日比","前日比%","損益","損益%","評価額"
      const holding = parseStockRow(values, currentSection);
      if (holding) holdings.push(holding);
    }
  }

  return holdings;
}

function parseStockRow(values: string[], section: string): ParsedHolding | null {
  // values[0] = "1343 ＮＦＪ−ＲＥＩＴ" or similar
  const nameField = values[0];
  const match = nameField.match(/^(\d{4})\s+(.+)/);
  if (!match) return null;

  const code = match[1];
  const name = normalizeFullWidth(match[2]);

  return {
    source: "sbi",
    code: `${code}.T`,
    name,
    quantity: parseNum(values[2]),
    avgPrice: parseNum(values[3]),
    currentPrice: parseNum(values[4]),
    marketValue: parseNum(values[9]),
    pnl: parseNum(values[7]),
    pnlPercent: parseNum(values[8]),
    category: `日本株（${section}）`,
    currency: "JPY",
  };
}

function parseMarginRow(values: string[], section: string): ParsedHolding | null {
  // values[0] = "9434 ソフトバンク"
  const nameField = values[0];
  const match = nameField.match(/^(\d{4})\s+(.+)/);
  if (!match) return null;

  const code = match[1];
  const name = normalizeFullWidth(match[2]);
  const direction = values[1]; // "売建" or "買建"

  return {
    source: "sbi",
    code: `${code}.T`,
    name: `${name}【${direction}】`,
    quantity: parseNum(values[5]),
    avgPrice: parseNum(values[6]),
    currentPrice: parseNum(values[7]),
    marketValue: parseNum(values[12]),
    pnl: parseNum(values[10]),
    pnlPercent: parseNum(values[11]),
    category: `信用取引`,
    currency: "JPY",
  };
}

function parseFundRow(values: string[], section: string): ParsedHolding | null {
  // values[0] = "ファンド名"
  const name = normalizeFullWidth(values[0]);
  if (!name || name.includes("ファンド名")) return null;
  // Skip summary/total rows (numeric-only names like "2248680.94")
  if (/^[\d.,\s]+$/.test(name)) return null;

  return {
    source: "sbi",
    code: "",
    name,
    quantity: parseNum(values[2]),  // 口数
    avgPrice: parseNum(values[3]),
    currentPrice: parseNum(values[4]),
    marketValue: parseNum(values[9]),
    pnl: parseNum(values[7]),
    pnlPercent: parseNum(values[8]),
    category: `投資信託（${section.replace("投信", "")}）`,
    currency: "JPY",
  };
}

// ===== マネーフォワードCSVパーサー =====
function parseMFCSV(lines: string[]): ParsedHolding[] {
  const holdings: ParsedHolding[] = [];
  const headers = parseCSVLine(lines[0]).map((h) => h.trim());

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 3) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = values[j]?.trim() || ""; });

    const name = row["保有金融機関"] || row["金融機関"] || row["項目"] || row["内容"] || row["計算対象"] || "";
    const category = row["分類"] || row["資産クラス"] || row["大項目"] || row["カテゴリ"] || "その他";
    const amount = parseNum(row["残高"] || row["評価額"] || row["金額"] || row["現在の価値"] || row["保有額"] || "");

    if (!name || amount === 0) continue;

    holdings.push({
      source: "moneyforward",
      code: "",
      name,
      quantity: 1,
      avgPrice: 0,
      currentPrice: amount,
      marketValue: amount,
      pnl: 0,
      pnlPercent: 0,
      category,
      currency: "JPY",
    });
  }

  return holdings;
}

// ===== 汎用CSVパーサー =====
function parseGenericCSV(lines: string[], source: string): ParsedHolding[] {
  const holdings: ParsedHolding[] = [];
  const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 2) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = values[j]?.trim() || ""; });

    const findVal = (...keys: string[]) => {
      for (const k of keys) {
        for (const [rk, rv] of Object.entries(row)) {
          if (rk.includes(k) && rv) return rv;
        }
      }
      return "";
    };

    const code = findVal("code", "ticker", "symbol", "コード");
    const name = findVal("name", "銘柄", "名称", "項目");
    if (!name && !code) continue;

    const quantity = parseNum(findVal("quantity", "qty", "shares", "株数", "数量")) || 1;
    const price = parseNum(findVal("price", "現在値", "時価", "単価"));
    const amount = parseNum(findVal("amount", "value", "金額", "評価額", "残高"));

    holdings.push({
      source,
      code: code || "",
      name: name || code,
      quantity,
      avgPrice: 0,
      currentPrice: price || amount,
      marketValue: amount || price * quantity,
      pnl: 0,
      pnlPercent: 0,
      category: "その他",
      currency: "JPY",
    });
  }

  return holdings;
}

// ===== SBI配当金・分配金CSVパーサー =====
interface DividendRecord {
  date: string;
  account: string;
  product: string;
  name: string;
  ticker: string;
  quantity: number;
  amount: number;
  currency: string;
}

function parseSBIDistribution(lines: string[]): DividendRecord[] {
  const dividends: DividendRecord[] = [];

  for (const line of lines) {
    const values = parseCSVLine(line);
    if (values.length < 6) continue;

    // Skip headers and summary rows
    const dateStr = values[0];
    if (!dateStr.match(/^\d{4}\/\d{1,2}\/\d{1,2}$/)) continue;

    const account = values[1]; // 特定/一般, NISA（成長投資枠）
    const product = normalizeFullWidth(values[2]); // 米国株式, 国内株式(現物), 投資信託
    const nameRaw = normalizeFullWidth(values[3]);

    // Extract ticker from name (e.g., "ウィズダムツリー米国株高配当ファンド DHS" → "DHS")
    const tickerMatch = nameRaw.match(/\s([A-Z]{1,5})$/);
    const ticker = tickerMatch ? tickerMatch[1] : "";
    // Extract code from name (e.g., "NEXT FUNDS 日経平均高配当株50指数連動型上場投信 1489" → "1489")
    const codeMatch = nameRaw.match(/\s(\d{4})$/);
    const code = codeMatch ? codeMatch[1] : "";

    const quantity = parseNum(values[4]);
    const amount = parseNum(values[5]);

    if (amount === 0) continue;

    // Determine currency
    const isUSD = product.includes("米国") || product.includes("シンガポール");

    dividends.push({
      date: dateStr,
      account: normalizeFullWidth(account),
      product,
      name: nameRaw,
      ticker: ticker || (code ? `${code}.T` : ""),
      quantity,
      amount,
      currency: isUSD ? "USD" : "JPY",
    });
  }

  return dividends;
}

// ===== SBIトータルリターンサマリーCSVパーサー =====
interface SummaryRecord {
  account: string;
  marketValue: number;
  totalSold: number;
  totalDividends: number;
  totalBought: number;
  totalReturn: number;
  totalReturnPct: number;
}

function parseSBISummary(lines: string[]): SummaryRecord[] {
  const summaries: SummaryRecord[] = [];

  for (const line of lines) {
    const values = parseCSVLine(line);
    if (values.length < 7) continue;

    const account = values[0];
    // Skip header row
    if (account.includes("口座種別") || account.includes("トータルリターン")) continue;

    summaries.push({
      account,
      marketValue: parseNum(values[1]),
      totalSold: parseNum(values[2]),
      totalDividends: parseNum(values[3]),
      totalBought: parseNum(values[4]),
      totalReturn: parseNum(values[5]),
      totalReturnPct: parseNum(values[6]),
    });
  }

  return summaries;
}

// ===== マネーフォワード資産推移CSVパーサー =====
interface TimelineRecord {
  date: string;
  total: number;
  cash: number;
  stocks: number;
  margin: number;
  funds: number;
  points: number;
  other: number;
}

function parseMFTimeline(lines: string[]): TimelineRecord[] {
  const timeline: TimelineRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 7) continue;

    const dateStr = values[0];
    if (!dateStr.match(/^\d{4}\/\d{2}\/\d{2}$/)) continue;

    timeline.push({
      date: dateStr,
      total: parseNum(values[1]),
      cash: parseNum(values[2]),
      stocks: parseNum(values[3]),
      margin: parseNum(values[4]),
      funds: parseNum(values[5]),
      points: parseNum(values[6]),
      other: values[7] ? parseNum(values[7]) : 0,
    });
  }

  // Sort by date ascending
  timeline.sort((a, b) => a.date.localeCompare(b.date));
  return timeline;
}

// ===== Utilities =====
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseNum(s: string | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[,、円株口＋▲△▼\s%$¥"]/g, "").replace(/−/g, "-")) || 0;
}

function normalizeFullWidth(s: string): string {
  return s
    .replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ")
    .replace(/−/g, "-")
    .replace(/　/g, " ")
    .trim();
}
