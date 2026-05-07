import type { PortfolioSummary } from "./types";
import type { PortfolioRow } from "@/app/api/quant/portfolio/route";

const REGIME_LABEL: Record<string, string> = {
  TRENDING_UP: "上昇トレンド",
  TRENDING_DOWN: "下降トレンド",
  RANGING: "レンジ",
  VOLATILE: "高ボラ",
};

export function summarizePortfolio(rows: PortfolioRow[]): PortfolioSummary {
  const analyzed = rows.filter((r) => r.analysis && r.decision).length;

  const byAction: Record<string, number> = {};
  const byRegime: Record<string, number> = {};
  for (const r of rows) {
    if (r.decision) byAction[r.decision.action] = (byAction[r.decision.action] ?? 0) + 1;
    if (r.regime) byRegime[r.regime.regime] = (byRegime[r.regime.regime] ?? 0) + 1;
  }

  const shortTermPicks: PortfolioSummary["shortTermPicks"] = [];
  const midTermPicks: PortfolioSummary["midTermPicks"] = [];
  const longTermPicks: PortfolioSummary["longTermPicks"] = [];

  for (const r of rows) {
    if (!r.strategies) continue;
    for (const s of r.strategies) {
      if (s.action === "HOLD") continue;
      const entry = {
        code: r.code,
        name: r.name,
        action: s.action,
        rationale: s.rationale,
      };
      if (s.horizon === "SHORT") shortTermPicks.push(entry);
      else if (s.horizon === "MID") midTermPicks.push(entry);
      else if (s.horizon === "LONG") longTermPicks.push(entry);
    }
  }

  const trendingUp = byRegime.TRENDING_UP ?? 0;
  const trendingDown = byRegime.TRENDING_DOWN ?? 0;
  const ranging = byRegime.RANGING ?? 0;
  const volatile = byRegime.VOLATILE ?? 0;

  // ─── 短期サマリー ───
  const shortMarginLong = shortTermPicks.filter((p) => p.action === "MARGIN_LONG").length;
  const shortMarginShort = shortTermPicks.filter((p) => p.action === "MARGIN_SHORT").length;
  let shortTermSummary: string;
  if (shortMarginLong + shortMarginShort === 0) {
    shortTermSummary = `保有銘柄${analyzed}件中、短期で動くべき銘柄なし。レンジ${ranging}件・高ボラ${volatile}件で待機推奨。`;
  } else {
    shortTermSummary = `${shortTermPicks.length}件で短期エッジ検出（信用買${shortMarginLong}件 / 信用売${shortMarginShort}件）。動くなら口座の${Math.min(20, (shortTermPicks.length * 5))}%以内に抑え、ATR連動SLを必ず置く。`;
  }

  // ─── 中期サマリー ───
  const midBuy = midTermPicks.filter((p) => p.action === "BUY").length;
  const midTrim = midTermPicks.filter((p) => p.action === "TRIM").length;
  let midTermSummary: string;
  if (midBuy === 0 && midTrim === 0) {
    midTermSummary = `中期で新規エントリー候補なし。保有継続が基本。${trendingDown > 0 ? `下降${trendingDown}件のテーゼ再確認推奨。` : ""}`;
  } else {
    const parts: string[] = [];
    if (midBuy > 0) parts.push(`押し目買い候補${midBuy}件 (上昇トレンド継続)`);
    if (midTrim > 0) parts.push(`部分利確/損切候補${midTrim}件 (下降トレンド)`);
    midTermSummary = parts.join(" / ") + "。決算前後のテーゼ再評価を必ずやる。";
  }

  // ─── 長期サマリー ───
  const longDCA = longTermPicks.filter((p) => p.action === "DCA").length;
  const longExit = longTermPicks.filter((p) => p.action === "EXIT").length;
  let longTermSummary: string;
  if (longExit > 0) {
    longTermSummary = `撤退検討${longExit}件 (下降+含み損15%超)。それ以外${longDCA}件はDCA継続。テーゼ崩壊の可能性は実態を確認。`;
  } else if (longDCA > 0) {
    longTermSummary = `DCA継続${longDCA}件。長期視点では現状維持＋積立で問題なし。短期ノイズに反応しない。`;
  } else {
    longTermSummary = `長期は積立一時停止が複数。底打ち確認まで現金温存、急落時にまとまった買付を狙う。`;
  }

  // ─── 警告 ───
  const warnings: string[] = [];
  if (trendingDown >= analyzed * 0.4 && analyzed > 0) {
    warnings.push(`保有銘柄の${Math.round((trendingDown / analyzed) * 100)}%が下降トレンド。市場全体の地合いを再確認推奨。`);
  }
  if (volatile >= analyzed * 0.3 && analyzed > 0) {
    warnings.push(`高ボラ銘柄が${Math.round((volatile / analyzed) * 100)}%。短期取引はリスク高。`);
  }
  const strongActions = (byAction.SELL ?? 0) + (byAction.BUY ?? 0);
  if (strongActions === 0 && analyzed > 0) {
    warnings.push(`明確なシグナル（BUY/SELL）が0件。今日は無理に動かない方が良い。`);
  }
  if (analyzed >= 10 && shortTermPicks.length >= analyzed * 0.5) {
    warnings.push(`短期取引候補が${Math.round((shortTermPicks.length / analyzed) * 100)}%と多い。Alpha Arena研究では過剰取引が最大の損失要因。手数料負けに注意。`);
  }

  void REGIME_LABEL; // 日本語ラベルは UI 側で利用

  return {
    analyzed,
    byAction,
    byRegime,
    shortTermPicks: shortTermPicks.slice(0, 8),
    midTermPicks: midTermPicks.slice(0, 8),
    longTermPicks: longTermPicks.slice(0, 8),
    shortTermSummary,
    midTermSummary,
    longTermSummary,
    warnings,
  };
}
