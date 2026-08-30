/** 月次トレンドシグナルの対象。API と cron の両方がここを見る */
export interface TrendTarget {
  ticker: string;
  label: string;
  note: string;
}

export const TREND_TARGETS: TrendTarget[] = [
  { ticker: "VTI", label: "VTI", note: "米国株式全体" },
  { ticker: "VOO", label: "VOO", note: "S&P500" },
  { ticker: "VT", label: "VT", note: "全世界株式" },
];
