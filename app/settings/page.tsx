"use client";

import { useEffect, useState } from "react";
import { Terminal, Bot, Settings, ShieldCheck, LockKeyhole, CheckCircle2, Circle } from "lucide-react";
import type { ExecutionReadiness } from "@/lib/execution/readiness";

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
  const [readiness, setReadiness] = useState<ExecutionReadiness | null>(null);

  useEffect(() => {
    fetch("/api/execution/readiness")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setReadiness(data))
      .catch(() => setReadiness(null));
  }, []);

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

      {readiness && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-zinc-800">
                {readiness.liveTradingEnabled ? (
                  <ShieldCheck className="w-5 h-5 text-green-400" />
                ) : (
                  <LockKeyhole className="w-5 h-5 text-amber-400" />
                )}
              </div>
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider">Auto Trading Readiness</div>
                <h2 className="text-lg font-semibold text-zinc-100 mt-1">{readiness.statusLabel}</h2>
                <p className="text-sm text-zinc-500 mt-1">
                  kabu.com自動売買は未接続でも、分析・リスクゲート・実売買ロックの準備状態をここで確認します。
                </p>
              </div>
            </div>
            <div className="text-right text-xs text-zinc-500">
              <div>Broker: <span className="text-zinc-300">{readiness.broker}</span></div>
              <div>Mode: <span className="text-zinc-300">{readiness.productionMode ? "production" : "test/paper"}</span></div>
              <div>Base URL: <span className="text-zinc-300">{readiness.baseUrl ?? "not set"}</span></div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mt-5">
            {readiness.checks.map((check) => (
              <div key={check.id} className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="flex items-center gap-2">
                  {check.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  ) : (
                    <Circle className="w-4 h-4 text-zinc-600" />
                  )}
                  <span className="text-sm font-medium text-zinc-200">{check.label}</span>
                </div>
                <p className="text-xs text-zinc-500 mt-2 leading-relaxed">{check.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-zinc-800 pt-4">
            <div className="text-xs font-semibold text-zinc-400 mb-2">次の作業</div>
            <div className="flex gap-2 flex-wrap">
              {readiness.nextActions.map((action) => (
                <span key={action} className="px-2 py-1 rounded border border-zinc-800 bg-zinc-950 text-xs text-zinc-400">
                  {action}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

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
