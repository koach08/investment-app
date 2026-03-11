import Link from "next/link";

interface TickerLinkProps {
  ticker: string | undefined | null;
  className?: string;
}

export default function TickerLink({ ticker, className }: TickerLinkProps) {
  if (!ticker) {
    return <span className={className}>{ticker ?? ""}</span>;
  }

  return (
    <Link
      href={`/detail?ticker=${encodeURIComponent(ticker)}`}
      className={className || "font-mono text-blue-400 hover:underline"}
    >
      {ticker}
    </Link>
  );
}
