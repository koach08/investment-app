"use client";

/**
 * ポジション台帳。
 *
 * 目的: 「ANAを空売りしろ」とAIが言い → 信用で建てた、という"方向と意図"を保持する。
 * これが無いと AI は後から「なぜ信用なんだ」と自分の提案と矛盾する（過去の重大バグ）。
 *
 * 保存はアプリ他機能と同じ localStorage（ブラウザ）。後で Supabase 等に載せ替え可能なよう
 * 純粋なデータ構造 + ヘルパーだけに留める。
 */

export type PositionDirection = "現物" | "信用買い" | "信用売り";

export interface Position {
  id: string;
  ticker: string;
  name?: string;
  /** 現物=ロング, 信用買い=ロング(レバ), 信用売り=ショート */
  direction: PositionDirection;
  openedAt: string; // ISO
  entryPrice: number;
  /** 株数（金額管理したい場合は size を株数とみなす） */
  size: number;
  /** 建玉した「理由＝AI/自分のテーゼ」。後から矛盾しないための唯一の正。 */
  thesis: string;
  /** テーゼ崩壊条件（これが起きたら手仕舞い） */
  thesisBreaker?: string;
  stop?: number;
  target?: number;
  status: "open" | "closed";
  /** どこ発の建玉か */
  source: "ai" | "manual";
  /** 紐づく委員会決定ID（あれば） */
  decisionId?: string;
  // --- close 時 ---
  closedAt?: string;
  exitPrice?: number;
  /** 実現損益(%)。ロング/ショートで符号を反転して算出済みの値。 */
  pnlPercent?: number;
  note?: string;
}

const KEY = "investment-app-positions";

export function loadPositions(): Position[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as Position[]) : [];
  } catch {
    return [];
  }
}

export function savePositions(positions: Position[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(positions));
  } catch {
    /* quota等は黙殺 */
  }
}

/** 簡易ID（Math.random/Date.now はこの環境でも client では利用可） */
function newId(): string {
  return `pos_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function addPosition(p: Omit<Position, "id" | "status">): Position {
  const pos: Position = { ...p, id: newId(), status: "open" };
  const all = loadPositions();
  all.unshift(pos);
  savePositions(all);
  return pos;
}

export function isLong(direction: PositionDirection): boolean {
  return direction === "現物" || direction === "信用買い";
}

/** 損益(%)をロング/ショートを考慮して算出 */
export function computePnlPercent(
  direction: PositionDirection,
  entry: number,
  exit: number
): number {
  if (!entry) return 0;
  const raw = ((exit - entry) / entry) * 100;
  return isLong(direction) ? raw : -raw;
}

export function closePosition(
  id: string,
  exitPrice: number,
  note?: string
): Position | null {
  const all = loadPositions();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  const p = all[idx];
  const pnlPercent = computePnlPercent(p.direction, p.entryPrice, exitPrice);
  const closed: Position = {
    ...p,
    status: "closed",
    closedAt: new Date().toISOString(),
    exitPrice,
    pnlPercent,
    note,
  };
  all[idx] = closed;
  savePositions(all);
  return closed;
}

export function deletePosition(id: string): void {
  savePositions(loadPositions().filter((p) => p.id !== id));
}

export function openPositions(): Position[] {
  return loadPositions().filter((p) => p.status === "open");
}

/**
 * AIプロンプトに注入するための「保有ポジションの方向と意図」要約。
 * 委員会・チャット双方でこれを system に入れて矛盾を封じる。
 */
export function positionsBriefing(positions: Position[]): string {
  const open = positions.filter((p) => p.status === "open");
  if (open.length === 0) return "現在オープン中の建玉はなし。";
  const lines = open.map((p) => {
    const dir = isLong(p.direction) ? "ロング" : "ショート";
    const sl = p.stop ? ` / 損切り ${p.stop}` : "";
    const tp = p.target ? ` / 利確 ${p.target}` : "";
    return `- ${p.ticker}${p.name ? `(${p.name})` : ""}：${p.direction}[${dir}] ${p.size}株 建値${p.entryPrice}${sl}${tp}\n  建玉理由: ${p.thesis}${p.thesisBreaker ? `\n  撤退条件: ${p.thesisBreaker}` : ""}`;
  });
  return open.length + "件のオープン建玉（この方向と理由は唯一の正・絶対に矛盾するな）:\n" + lines.join("\n");
}
