interface NewsCardProps {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary?: string;
}

export default function NewsCard({ title, source, url, publishedAt, summary }: NewsCardProps) {
  const timeAgo = getTimeAgo(publishedAt);

  return (
    <div className="border border-zinc-800 rounded-lg p-4 hover:border-zinc-600 transition-colors">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium text-blue-400 hover:text-blue-300 line-clamp-2"
      >
        {title}
      </a>
      <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
        <span className={`px-2 py-0.5 rounded ${getSourceStyle(source)}`}>{source}</span>
        <span>{timeAgo}</span>
      </div>
      {summary && (
        <p className="mt-2 text-xs text-zinc-400 line-clamp-3">{summary}</p>
      )}
    </div>
  );
}

function getSourceStyle(source: string): string {
  // Japanese sources
  if (source === "NHK") return "bg-blue-900/40 text-blue-400";
  if (source === "Yahoo!ニュース") return "bg-red-900/40 text-red-400";
  if (source.includes("読売")) return "bg-orange-900/40 text-orange-400";
  if (source.includes("産経")) return "bg-sky-900/40 text-sky-400";
  if (source === "ITmedia") return "bg-teal-900/40 text-teal-400";
  if (source.includes("東洋経済")) return "bg-amber-900/40 text-amber-400";
  if (source.includes("日経") || source.includes("四季報")) return "bg-rose-900/40 text-rose-400";
  if (source.includes("トウシル")) return "bg-cyan-900/40 text-cyan-400";
  if (source.includes("みんかぶ") || source.includes("minkabu")) return "bg-indigo-900/40 text-indigo-400";
  if (source.includes("Forbes")) return "bg-slate-800 text-slate-300";
  if (source.includes("ダイヤモンド")) return "bg-sky-900/40 text-sky-300";
  if (source.includes("Bloomberg")) return "bg-violet-900/40 text-violet-400";
  // Global sources
  if (source === "BBC") return "bg-red-900/40 text-red-300";
  if (source === "CNBC") return "bg-blue-900/40 text-blue-300";
  if (source === "MarketWatch") return "bg-green-900/40 text-green-400";
  if (source === "Investing.com") return "bg-orange-900/40 text-orange-300";
  if (source === "Yahoo Finance") return "bg-purple-900/40 text-purple-400";
  if (source === "SCMP") return "bg-yellow-900/40 text-yellow-400";
  if (source === "Economic Times") return "bg-emerald-900/40 text-emerald-400";
  if (source === "Reuters") return "bg-orange-900/40 text-orange-400";
  return "bg-zinc-800 text-zinc-400";
}

function getTimeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin}分前`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}時間前`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}日前`;
  } catch {
    return dateStr;
  }
}
