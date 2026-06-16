"use client";

/**
 * 自己改善ループの記憶。
 *
 * 委員会(/api/council)が出した「決定」と、その後の「結果」を localStorage に蓄積する。
 * ここから勝率と"教訓"を計算し、次回の委員会プロンプトへ注入することで、
 * 失敗・提案から自ら学習するループを成立させる。
 */

import type { PositionDirection } from "./positions";

export interface DecisionRecord {
  id: string;
  createdAt: string; // ISO
  question: string;
  ticker?: string;
  name?: string;
  direction?: "long" | "short" | "neutral";
  decisionLabel: string; // 例: 信用売り(空売り) / 部分利確 / 様子見
  entry?: number;
  stop?: number;
  target?: number;
  confidence?: number; // 0-100
  thesis?: string;
  /** 反対した人格の主張（後で「反対が正しかったか」を振り返る材料） */
  dissent?: { engine: string; point: string }[];
  outcome?: {
    recordedAt: string;
    result: "win" | "loss" | "flat";
    pnlPercent?: number;
    note?: string;
  };
}

const KEY = "investment-app-decisions";

export function loadDecisions(): DecisionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as DecisionRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveDecisions(list: DecisionRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 500)));
  } catch {
    /* noop */
  }
}

function newId(): string {
  return `dec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function addDecision(d: Omit<DecisionRecord, "id" | "createdAt">): DecisionRecord {
  const rec: DecisionRecord = {
    ...d,
    id: newId(),
    createdAt: new Date().toISOString(),
  };
  const all = loadDecisions();
  all.unshift(rec);
  saveDecisions(all);
  return rec;
}

export function recordDecisionOutcome(
  id: string,
  result: "win" | "loss" | "flat",
  pnlPercent?: number,
  note?: string
): DecisionRecord | null {
  const all = loadDecisions();
  const idx = all.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  all[idx] = {
    ...all[idx],
    outcome: { recordedAt: new Date().toISOString(), result, pnlPercent, note },
  };
  saveDecisions(all);
  return all[idx];
}

export interface PerformanceSummary {
  total: number;
  evaluated: number;
  wins: number;
  losses: number;
  winRate: number; // 0-1
  avgPnlPercent: number;
  longWinRate: number;
  shortWinRate: number;
}

export function getPerformanceSummary(list?: DecisionRecord[]): PerformanceSummary {
  const all = list ?? loadDecisions();
  const evaluated = all.filter((d) => d.outcome);
  const wins = evaluated.filter((d) => d.outcome!.result === "win").length;
  const losses = evaluated.filter((d) => d.outcome!.result === "loss").length;
  const pnls = evaluated
    .map((d) => d.outcome!.pnlPercent)
    .filter((v): v is number => typeof v === "number");
  const avgPnl = pnls.length ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 0;

  const longEval = evaluated.filter((d) => d.direction === "long");
  const shortEval = evaluated.filter((d) => d.direction === "short");
  const wr = (arr: DecisionRecord[]) =>
    arr.length ? arr.filter((d) => d.outcome!.result === "win").length / arr.length : 0;

  return {
    total: all.length,
    evaluated: evaluated.length,
    wins,
    losses,
    winRate: evaluated.length ? wins / evaluated.length : 0,
    avgPnlPercent: avgPnl,
    longWinRate: wr(longEval),
    shortWinRate: wr(shortEval),
  };
}

/**
 * 結果から"教訓"を抽出。委員会プロンプトに注入する短い箇条書きを返す。
 * ヒューリスティクス + 直近の負けトレードの実例を混ぜる。
 */
export function getLessons(list?: DecisionRecord[]): string[] {
  const all = list ?? loadDecisions();
  const evaluated = all.filter((d) => d.outcome);
  if (evaluated.length < 3) return []; // データ不足なら教訓は出さない（過学習防止）

  const lessons: string[] = [];
  const s = getPerformanceSummary(all);

  const shortEval = evaluated.filter((d) => d.direction === "short");
  if (shortEval.length >= 3 && s.shortWinRate < 0.4) {
    lessons.push(
      `直近の空売り判断の勝率は${Math.round(s.shortWinRate * 100)}%と低い。ショートは地合い・需給(信用残/逆日歩)の根拠をより厳しく、テーゼ崩壊条件を狭く設定すること。`
    );
  }
  const longEval = evaluated.filter((d) => d.direction === "long");
  if (longEval.length >= 3 && s.longWinRate < 0.4) {
    lessons.push(
      `直近のロング判断の勝率は${Math.round(s.longWinRate * 100)}%と低い。高値掴みの傾向を疑い、エントリーは押し目・サポート近辺に限定すること。`
    );
  }
  if (s.avgPnlPercent < -2) {
    lessons.push(
      `確定済みトレードの平均損益は${s.avgPnlPercent.toFixed(1)}%とマイナス。損切りが遅い可能性。stopを建値に近づけ、損小利大を徹底すること。`
    );
  }

  // 直近の大きな負けトレードを実例として最大2件
  const bigLosses = evaluated
    .filter((d) => d.outcome!.result === "loss")
    .sort((a, b) => (a.outcome!.pnlPercent ?? 0) - (b.outcome!.pnlPercent ?? 0))
    .slice(0, 2);
  for (const d of bigLosses) {
    lessons.push(
      `過去の失敗例: ${d.ticker ?? d.question}を${d.decisionLabel}→結果${d.outcome!.pnlPercent != null ? d.outcome!.pnlPercent.toFixed(1) + "%" : "損失"}。${d.thesis ? `当時のテーゼ「${d.thesis.slice(0, 60)}」が外れた要因を踏まえること。` : ""}`
    );
  }

  return lessons;
}

/** プロンプト注入用に教訓を一つの文字列にまとめる */
export function lessonsBriefing(list?: DecisionRecord[]): string {
  const lessons = getLessons(list);
  if (lessons.length === 0) return "";
  return "過去の自分の判断結果から得た教訓（必ず今回の判断に反映せよ）:\n" + lessons.map((l) => `- ${l}`).join("\n");
}
