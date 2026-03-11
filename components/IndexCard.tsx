import { clsx } from "clsx";

interface IndexCardProps {
  label: string;
  value: number;
  chgPct: number;
}

export default function IndexCard({ label, value, chgPct }: IndexCardProps) {
  const isUp = chgPct >= 0;

  return (
    <div
      className={clsx(
        "border rounded-lg p-3 transition-colors",
        isUp
          ? "border-green-800/50 bg-green-950/30"
          : "border-red-800/50 bg-red-950/30"
      )}
    >
      <div className="text-xs text-zinc-400 truncate">{label}</div>
      <div className="text-lg font-bold text-white mt-1">
        {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </div>
      <div
        className={clsx(
          "text-sm font-semibold mt-1",
          isUp ? "text-green-400" : "text-red-400"
        )}
      >
        {isUp ? "▲" : "▼"} {chgPct >= 0 ? "+" : ""}
        {chgPct.toFixed(2)}%
      </div>
    </div>
  );
}
