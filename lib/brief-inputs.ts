/**
 * モーニングブリーフの材料を**サーバー側で**集める。
 *
 * これまでは /advisor の画面が7つの API を順に叩いて組み立てていたので、
 * 開いてボタンを押すまで何も起きなかった。同じ集め方をサーバーに移して、
 * cron から呼べるようにする。
 *
 * 方針: 1つ落ちても止めない。落ちた材料は null にして、何が欠けたかを返す。
 * 材料が欠けたまま黙って生成すると、薄いブリーフが「今日はこうだった」の顔で出てくる。
 */
import { kvGet } from "./kv";
import type { BriefInput, HoldingInput } from "./morning-brief";

/** 必須の材料。これが欠けたら生成しない */
export const REQUIRED_INPUTS = ["indices", "news"] as const;

/**
 * 必須の材料が揃っているか。
 * 揃っていないまま生成すると、薄い内容が「今日の分析」の顔で保存され、
 * しかも前日の正しいブリーフを上書きしてしまう。
 */
export function hasFatalGap(input: BriefInput): boolean {
  return REQUIRED_INPUTS.some((k) => {
    const v = input[k];
    return !Array.isArray(v) || v.length === 0;
  });
}

export interface GatherResult {
  input: BriefInput;
  /** 取得できなかった材料の名前 */
  missing: string[];
  /** 必須が欠けているか */
  fatal: boolean;
}

async function getJson<T>(url: string, label: string, missing: string[]): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      missing.push(`${label}(HTTP ${res.status})`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    missing.push(`${label}(${e instanceof Error ? e.message : "失敗"})`);
    return null;
  }
}

export async function gatherBriefInputs(origin: string): Promise<GatherResult> {
  const missing: string[] = [];
  const u = (p: string) => `${origin}${p}`;

  const [indicesRes, fredRes, newsRes, fedTone, geopoliticalRisk, fearGreed, jpxStats, holdingsRaw] =
    await Promise.all([
      getJson<{ data?: Record<string, unknown> }>(u("/api/global-indices"), "indices", missing),
      getJson<{ data?: unknown[] }>(u("/api/economic-calendar"), "fred", missing),
      getJson<{ news?: unknown[] }>(u("/api/news?category=global"), "news", missing),
      getJson<unknown>(u("/api/fed-tone"), "fedTone", missing),
      getJson<BriefInput["geopoliticalRisk"]>(u("/api/geopolitical-risk"), "geopoliticalRisk", missing),
      getJson<BriefInput["fearGreed"]>(u("/api/fear-greed"), "fearGreed", missing),
      getJson<BriefInput["jpxStats"]>(u("/api/jpx-stats"), "jpxStats", missing),
      kvGet<HoldingInput[]>("holdings").catch(() => {
        missing.push("holdings(KV)");
        return null;
      }),
    ]);

  // /api/global-indices は { data: { "^N225": {...}, ... } } を返す。
  // 外側に Object.values をかけると指数のリストではなく2要素の配列になり、
  // プロンプト側の slice(0, 20) が効かなくなる（画面側も同じバグだった）。
  const indices = indicesRes?.data ? Object.values(indicesRes.data) : undefined;
  const news = newsRes?.news;

  const input: BriefInput = {
    indices,
    fredData: fredRes?.data,
    news,
    holdings: Array.isArray(holdingsRaw) ? holdingsRaw : undefined,
    fedTone,
    geopoliticalRisk,
    fearGreed,
    jpxStats,
  };

  return { input, missing, fatal: hasFatalGap(input) };
}
