/** 自動生成したモーニングブリーフの保存形式とキー。読み書き両方でここを使う */
import type { SignalSnapshot } from "./signal-check";

export const LATEST_KEY = "daily-brief-latest";

/** 日付キー。JST の日付で切る（相場の日付と揃えるため） */
export function dayKey(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `daily-brief-${y}-${m}-${day}`;
}

export interface StoredBrief {
  brief: unknown | null;
  rawText: string | null;
  generatedAt: string;
  source: "cron" | "manual";
  /** 取得できなかった材料 */
  missing: string[];
  durationMs: number;
  holdingsCount: number;
  newsCount: number;
  /** 月次トレンドシグナルの状態。年に0〜3回しか変わらないので見落としやすい */
  signals?: SignalSnapshot[];
}

/** 生成からどれくらい経ったか（時間）。古いブリーフを新しい顔で出さないための判定に使う */
export function ageHours(generatedAt: string, now = Date.now()): number | null {
  const t = Date.parse(generatedAt);
  if (Number.isNaN(t)) return null;
  return (now - t) / (1000 * 60 * 60);
}

/** 24時間を超えたら「古い」。cron が止まっていることに気づけるようにする */
export function isStale(generatedAt: string, now = Date.now()): boolean {
  const h = ageHours(generatedAt, now);
  return h === null || h > 24;
}
