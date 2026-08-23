/**
 * 通貨の正規化。
 *
 * SBI の外貨建て明細は評価額を現地通貨のまま持っている
 * （paste-import が currentPrice × quantity で作るため）。
 * 円建てと素朴に足すと桁がずれるので、合算する前に必ずここを通す。
 */

export interface FxRates {
  /** 1 USD = 何円か */
  USD?: number;
}

export interface Convertible {
  marketValue: number;
  currency?: string;
  pnl?: number;
}

/** 為替レートが分かっていれば円に換算する。分からなければ null を返す（0 円扱いにしない） */
export function toJpy(value: number, currency: string | undefined, rates: FxRates): number | null {
  const c = (currency || "JPY").toUpperCase();
  if (c === "JPY") return value;
  if (c === "USD") return rates.USD ? value * rates.USD : null;
  return null;
}

export interface NormalizeResult<T> {
  /** 円換算済みの行。換算できなかったものは除外される */
  rows: (T & { marketValue: number; pnl: number; originalCurrency: string })[];
  /** 換算できずに落とした行 */
  unconverted: { name: string; currency: string; marketValue: number }[];
}

/** 保有行を円建てに揃える。換算できない通貨の行は落として呼び出し側に返す */
export function normalizeHoldings<T extends Convertible & { name?: string }>(
  holdings: T[],
  rates: FxRates
): NormalizeResult<T> {
  const rows: NormalizeResult<T>["rows"] = [];
  const unconverted: NormalizeResult<T>["unconverted"] = [];

  for (const h of holdings) {
    const currency = (h.currency || "JPY").toUpperCase();
    const mv = toJpy(h.marketValue, currency, rates);
    if (mv === null) {
      unconverted.push({ name: h.name ?? "(名称不明)", currency, marketValue: h.marketValue });
      continue;
    }
    const pnl = h.pnl === undefined ? 0 : (toJpy(h.pnl, currency, rates) ?? 0);
    rows.push({ ...h, marketValue: mv, pnl, originalCurrency: currency });
  }

  return { rows, unconverted };
}
