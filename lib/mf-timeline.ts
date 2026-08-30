/**
 * マネーフォワードの「資産推移」CSV を読む。
 *
 * 位置で読んではいけない。実際の書き出しは
 *   日付, 合計（円）, 預金・現金・暗号資産（円）, 株式(現物)（円）, 投資信託（円）,
 *   債券（円）, FX（円）, 保険（円）, 不動産（円）, 年金（円）, ポイント（円）, その他の資産（円）
 * という並びで、**信用の列が無い**。位置で読むと投資信託が信用に、債券が投資信託に、
 * FX がポイントに入る。金額が全部それらしい数字なので、ずれても画面上は気づけない。
 *
 * なので列名で引く。名前が変わっても落ちないよう、部分一致で複数の候補を見る。
 */

export interface TimelineRecord {
  /** "YYYY/MM/DD" */
  date: string;
  total: number;
  cash: number;
  stocks: number;
  margin: number;
  funds: number;
  points: number;
  other: number;
}

export interface ParseResult {
  timeline: TimelineRecord[];
  /** 見つかった列名 → 割り当て先。取り込み前に画面で見せて確認できるように */
  mapping: Record<string, string>;
  /** どの列にも割り当てられず other に寄せた列 */
  pooledIntoOther: string[];
  /** 日付として読めず飛ばした行数 */
  skipped: number;
}

/** 列名の候補。前から順に部分一致で探す */
const COLUMN_RULES: { field: keyof Omit<TimelineRecord, "date">; patterns: string[] }[] = [
  { field: "total", patterns: ["合計"] },
  { field: "cash", patterns: ["預金", "現金"] },
  { field: "stocks", patterns: ["株式"] },
  { field: "margin", patterns: ["信用"] },
  { field: "funds", patterns: ["投資信託", "投信"] },
  { field: "points", patterns: ["ポイント"] },
];

/** 全角数字・カンマ・円記号を落として数値にする */
export function parseAmount(s: string | undefined): number {
  if (!s) return 0;
  const normalized = s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,¥￥\s"]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** ダブルクォート対応の1行パース */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

/** "2026/03/09" と "2026-03-09" を "YYYY/MM/DD" に揃える。読めなければ null */
export function normalizeDate(s: string): string | null {
  const m = s.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!m) return null;
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31)) return null;
  return `${m[1]}/${String(mo).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
}

export function parseMFTimelineCsv(lines: string[]): ParseResult {
  const empty: ParseResult = { timeline: [], mapping: {}, pooledIntoOther: [], skipped: 0 };
  if (lines.length < 2) return empty;

  const headers = splitCsvLine(lines[0]);
  const assigned = new Map<number, keyof Omit<TimelineRecord, "date">>();
  const mapping: Record<string, string> = {};
  const used = new Set<string>();

  // 日付の列。名前が無ければ先頭を日付とみなす
  let dateIndex = headers.findIndex((h) => h.includes("日付") || h.includes("date"));
  if (dateIndex < 0) dateIndex = 0;
  mapping[headers[dateIndex] || "(1列目)"] = "date";

  for (const rule of COLUMN_RULES) {
    const idx = headers.findIndex(
      (h, i) => i !== dateIndex && !assigned.has(i) && rule.patterns.some((p) => h.includes(p))
    );
    if (idx >= 0) {
      assigned.set(idx, rule.field);
      mapping[headers[idx]] = rule.field;
      used.add(rule.field);
    }
  }

  // 割り当てられなかった数値列は other にまとめる（債券・FX・保険・不動産・年金・その他）
  const pooledIntoOther: string[] = [];
  headers.forEach((h, i) => {
    if (i === dateIndex || assigned.has(i) || !h) return;
    pooledIntoOther.push(h);
    mapping[h] = "other";
  });

  const timeline: TimelineRecord[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const date = normalizeDate(values[dateIndex] ?? "");
    if (!date) {
      skipped++;
      continue;
    }

    const rec: TimelineRecord = {
      date,
      total: 0,
      cash: 0,
      stocks: 0,
      margin: 0,
      funds: 0,
      points: 0,
      other: 0,
    };
    for (const [idx, field] of assigned) rec[field] = parseAmount(values[idx]);
    for (const h of pooledIntoOther) {
      const idx = headers.indexOf(h);
      if (idx >= 0) rec.other += parseAmount(values[idx]);
    }
    timeline.push(rec);
  }

  timeline.sort((a, b) => a.date.localeCompare(b.date));
  return { timeline, mapping, pooledIntoOther, skipped };
}

/** 資産推移CSVらしいか。取り込み口の振り分けに使う */
export function looksLikeMFTimeline(headerLine: string): boolean {
  const h = headerLine;
  return h.includes("合計") && (h.includes("預金") || h.includes("現金")) && h.includes("日付");
}
