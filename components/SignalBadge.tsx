import { clsx } from "clsx";

const BADGE_STYLES: Record<string, string> = {
  STRONG_BUY: "bg-green-600 text-white",
  BUY: "bg-green-500/20 text-green-400 border border-green-500/30",
  WATCH_BUY: "bg-green-500/10 text-green-300 border border-green-500/20",
  NEUTRAL: "bg-zinc-700 text-zinc-300",
  WATCH_SELL: "bg-red-500/10 text-red-300 border border-red-500/20",
  SELL: "bg-red-500/20 text-red-400 border border-red-500/30",
  STRONG_SELL: "bg-red-600 text-white",
};

const BADGE_LABELS: Record<string, string> = {
  STRONG_BUY: "強い買い",
  BUY: "買い",
  WATCH_BUY: "買い注目",
  NEUTRAL: "中立",
  WATCH_SELL: "売り注目",
  SELL: "売り",
  STRONG_SELL: "強い売り",
};

export default function SignalBadge({ signal }: { signal: string }) {
  return (
    <span
      className={clsx(
        "px-2 py-1 rounded text-xs font-bold",
        BADGE_STYLES[signal] ?? BADGE_STYLES.NEUTRAL
      )}
    >
      {BADGE_LABELS[signal] ?? signal}
    </span>
  );
}
