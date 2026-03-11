"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const NAV_ITEMS = [
  { href: "/", label: "🔍 スキャナー" },
  { href: "/detail", label: "📈 詳細分析" },
  { href: "/global", label: "🌍 世界市場" },
  { href: "/news", label: "📰 ニュース" },
  { href: "/calendar", label: "📅 経済指標" },
  { href: "/macro", label: "🌐 マクロ" },
  { href: "/advisor", label: "🧠 アドバイザー" },
  { href: "/assets", label: "📊 資産管理" },
  { href: "/portfolio", label: "💼 PF管理" },
  { href: "/study", label: "📚 学習分析" },
  { href: "/settings", label: "⚙️ 設定" },
];

export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center h-14 gap-1 overflow-x-auto">
          <span className="text-lg font-bold text-white mr-4 shrink-0">
            AI投資分析
          </span>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors",
                pathname === item.href
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
