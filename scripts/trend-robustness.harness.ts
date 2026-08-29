/**
 * 月次トレンドシグナルの頑健性検証。
 *
 * 目的: /assets に出した「10ヶ月SMA」が、たまたまその設定で良く見えているだけでないかを確かめる。
 * crypto-trader の backtest-matrix.harness.ts と同じ思想で、
 *   1. 複数銘柄
 *   2. 複数期間 (10年ごと)
 *   3. パラメータを振る (SMA 6〜14ヶ月)
 *   4. 対照群 = ずっと保有
 * に並べてから採否を決める。1銘柄1期間で勝っただけの結果は採用しない。
 *
 * 実行: npx tsx --tsconfig tsconfig.json scripts/trend-robustness.harness.ts
 * 結果: REPORT_PATH に markdown で書き出す。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fetchYahooBars } from "../lib/quant/yahoo-fetch";
import {
  toMonthlyBars,
  evaluateTrend,
  backtestTrend,
  findMonthGaps,
  type MonthlyBar,
} from "../lib/trend-signal";
import type { OHLCVBar } from "../lib/quant/types";

const CACHE_DIR = path.resolve(__dirname, "../data/trend-cache");
const REPORT_PATH = path.resolve(__dirname, "../data/trend-robustness.md");

const SMA_PERIODS = [6, 7, 8, 9, 10, 11, 12, 13, 14];
const SWITCH_COST = 0.05;
const CASH_YIELDS = [0, 2];

interface Target {
  ticker: string;
  label: string;
  /** 配当込みの系列か。価格指数は配当が入らないので buy&hold が不当に低く出る */
  totalReturn: boolean;
}

const TARGETS: Target[] = [
  { ticker: "^SP500TR", label: "S&P500 配当込み指数", totalReturn: true },
  { ticker: "VTI", label: "米国株式全体 ETF", totalReturn: true },
  { ticker: "VT", label: "全世界株式 ETF", totalReturn: true },
  { ticker: "EFA", label: "先進国株 ex-US ETF", totalReturn: true },
  { ticker: "EEM", label: "新興国株 ETF", totalReturn: true },
  { ticker: "^GSPC", label: "S&P500 価格指数 (配当なし)", totalReturn: false },
  { ticker: "^N225", label: "日経225 価格指数 (配当なし)", totalReturn: false },
  { ticker: "GLD", label: "金 ETF", totalReturn: true },
];

async function fetchCached(ticker: string): Promise<OHLCVBar[]> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `${ticker.replace(/[^\w-]/g, "_")}.json`);
  if (existsSync(file)) {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { fetchedAt: number; bars: OHLCVBar[] };
    if (Date.now() - raw.fetchedAt < 12 * 60 * 60 * 1000) return raw.bars;
  }
  // range=max は interval=1d を無視して四半期足を返す。明示的に長い range を指定する
  const r = await fetchYahooBars(ticker, "50y", "1d", true);
  writeFileSync(file, JSON.stringify({ fetchedAt: Date.now(), bars: r.bars }));
  return r.bars;
}

const f = (v: number, d = 1) => `${v > 0 ? "+" : ""}${v.toFixed(d)}`;

/** 月足を 10 年区切りに割る。助走ぶんは手前から確保する */
function decades(monthly: MonthlyBar[], period: number): { label: string; bars: MonthlyBar[] }[] {
  const first = Number(monthly[0].month.slice(0, 4));
  const last = Number(monthly[monthly.length - 1].month.slice(0, 4));
  const out: { label: string; bars: MonthlyBar[] }[] = [];
  for (let y = Math.ceil(first / 10) * 10; y <= last; y += 10) {
    const from = `${y}-01`;
    const to = `${y + 10}-01`;
    const startIndex = monthly.findIndex((b) => b.month >= from);
    if (startIndex < 0) continue;
    const warmup = Math.max(0, startIndex - period);
    const bars = monthly.filter((b, i) => i >= warmup && b.month < to);
    if (bars.length >= period + 12) out.push({ label: `${y}s`, bars });
  }
  return out;
}

async function main() {
  const lines: string[] = [];
  const now = Date.now();

  lines.push("# 月次トレンドシグナル 頑健性検証");
  lines.push("");
  lines.push(`実行 ${new Date(now).toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push(
    `設定: 乗り換えコスト往復 ${SWITCH_COST}% / 現金金利 ${CASH_YIELDS.join("% と ")}% / ` +
      `判定は確定した月末終値のみ / ETF は配当込み (adjclose)`
  );
  lines.push("");

  // 集計用
  let winCagr = 0;
  let winDd = 0;
  let total = 0;
  const perPeriodWins = new Map<number, number>();

  for (const t of TARGETS) {
    let bars: OHLCVBar[];
    try {
      bars = await fetchCached(t.ticker);
    } catch (e) {
      lines.push(`## ${t.ticker}`, "", `取得に失敗: ${e instanceof Error ? e.message : e}`, "");
      continue;
    }
    const monthly = toMonthlyBars(bars, now);
    const settled = monthly.filter((b) => !b.provisional);
    const gaps = findMonthGaps(settled);
    if (gaps.length > 0) {
      lines.push(
        `## ${t.ticker}`,
        "",
        `⚠️ 月が ${gaps.length} 個飛んでいる (最初の欠け ${gaps[0]})。粒度が日足でない可能性が高いので数字を出さない。`,
        ""
      );
      console.error(`SKIP ${t.ticker}: ${gaps.length} month gaps from ${gaps[0]}`);
      continue;
    }
    if (settled.length < 40) {
      lines.push(`## ${t.ticker}`, "", `月足 ${settled.length} 本しかないので飛ばす`, "");
      continue;
    }

    const sig = evaluateTrend(monthly, 10);
    lines.push(`## ${t.ticker} — ${t.label}`);
    lines.push("");
    lines.push(
      `月足 ${settled.length}本 (${settled[0].month}〜${settled[settled.length - 1].month})` +
        (t.totalReturn ? "" : " ⚠️ 配当が入っていないので「ずっと保有」が実際より低く出る") +
        (sig ? ` / 現在のシグナル: **${sig.state === "invested" ? "保有" : "現金"}**` : "")
    );
    lines.push("");

    // --- パラメータを振る ---
    lines.push("### SMA の月数を振る (全期間)");
    lines.push("");
    lines.push("| SMA | 年率(現金0%) | 年率(現金2%) | 最大下落 | ずっと保有の年率 | ずっと保有の下落 | 乗換 |");
    lines.push("|---|---|---|---|---|---|---|");
    let bh: { cagr: number; dd: number } | null = null;
    for (const p of SMA_PERIODS) {
      const r0 = backtestTrend(monthly, p, SWITCH_COST, 0);
      const r2 = backtestTrend(monthly, p, SWITCH_COST, 2);
      if (!r0 || !r2) continue;
      bh = { cagr: r0.buyHold.cagr, dd: r0.buyHold.maxDrawdown };
      const mark = p === 10 ? "**10**" : String(p);
      lines.push(
        `| ${mark} | ${f(r0.strategy.cagr, 2)}% | ${f(r2.strategy.cagr, 2)}% | ` +
          `${f(r0.strategy.maxDrawdown)}% | ${f(bh.cagr, 2)}% | ${f(bh.dd)}% | ${r0.switches} |`
      );
      total++;
      if (r2.strategy.cagr > bh.cagr) {
        winCagr++;
        perPeriodWins.set(p, (perPeriodWins.get(p) ?? 0) + 1);
      }
      if (r0.strategy.maxDrawdown > bh.dd) winDd++;
    }
    lines.push("");

    // --- 10年ごと ---
    lines.push("### 10年ごと (SMA10, 現金2%)");
    lines.push("");
    lines.push("| 期間 | 従う | ずっと保有 | 下落(従う) | 下落(保有) | 判定 |");
    lines.push("|---|---|---|---|---|---|");
    for (const d of decades(settled, 10)) {
      const r = backtestTrend(d.bars, 10, SWITCH_COST, 2);
      if (!r) continue;
      const winC = r.strategy.cagr > r.buyHold.cagr;
      const winD = r.strategy.maxDrawdown > r.buyHold.maxDrawdown + 1;
      lines.push(
        `| ${d.label} | ${f(r.strategy.cagr, 1)}% | ${f(r.buyHold.cagr, 1)}% | ` +
          `${f(r.strategy.maxDrawdown)}% | ${f(r.buyHold.maxDrawdown)}% | ` +
          `${winC ? "リターンも勝ち" : winD ? "下落だけ浅い" : "負け"} |`
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## 集計");
  lines.push("");
  lines.push(
    `全期間 × SMA 6〜14 の ${total} 通りのうち、**リターンでずっと保有に勝ったのは ${winCagr} 通り (${(
      (winCagr / total) *
      100
    ).toFixed(0)}%)**、` + `**最大下落が浅かったのは ${winDd} 通り (${((winDd / total) * 100).toFixed(0)}%)**。`
  );
  lines.push("");
  lines.push("SMA の月数ごとに、リターンで勝った銘柄数:");
  lines.push("");
  lines.push(
    "| SMA | " + SMA_PERIODS.map((p) => p).join(" | ") + " |\n|---|" + SMA_PERIODS.map(() => "---").join("|") + "|"
  );
  lines.push("| 勝ち銘柄数 | " + SMA_PERIODS.map((p) => perPeriodWins.get(p) ?? 0).join(" | ") + " |");
  lines.push("");

  writeFileSync(REPORT_PATH, lines.join("\n"));
  console.log(lines.join("\n"));
  console.error(`\n--- 書き出し: ${REPORT_PATH}`);
}

main();
