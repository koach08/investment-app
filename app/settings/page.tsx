"use client";

import { useState } from "react";
import { Terminal, Bot, Settings } from "lucide-react";

interface ToolButton {
  id: "claude" | "codex";
  label: string;
  description: string;
  icon: typeof Terminal;
}

const TOOLS: ToolButton[] = [
  {
    id: "claude",
    label: "Claude Code",
    description: "Anthropic の AI コーディングアシスタント",
    icon: Bot,
  },
  {
    id: "codex",
    label: "Codex",
    description: "OpenAI の CLI コーディングエージェント",
    icon: Terminal,
  },
];

export default function SettingsPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function openTool(tool: string) {
    setLoading(tool);
    setMessage(null);
    try {
      const res = await fetch("/api/open-terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage(data.error || "エラーが発生しました");
      } else {
        setMessage(`${tool} をTerminalで起動しました`);
      }
    } catch {
      setMessage("接続エラー");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-zinc-400" />
        <h1 className="text-2xl font-bold">設定</h1>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-300">開発ツール</h2>
        <p className="text-sm text-zinc-500">
          AIコーディングツールをTerminal.appで起動します
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={() => openTool(tool.id)}
                disabled={loading !== null}
                className="flex items-start gap-4 p-4 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="p-2 rounded-md bg-zinc-800">
                  <Icon className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <div className="font-medium">{tool.label}</div>
                  <div className="text-sm text-zinc-500 mt-1">
                    {tool.description}
                  </div>
                  {loading === tool.id && (
                    <div className="text-xs text-yellow-400 mt-2">
                      起動中...
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {message && (
          <p className="text-sm text-zinc-400 mt-2">{message}</p>
        )}
      </section>
    </div>
  );
}
