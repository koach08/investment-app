"use client";

import { useState, useEffect } from "react";
import { clsx } from "clsx";

interface CentralBankTone {
  hawkish_score: number;
  dovish_score: number;
  stance: "hawkish" | "dovish" | "neutral";
  rate_hike_probability: number;
  key_phrases: string[];
  summary_ja: string;
}

interface FedToneData {
  fed: CentralBankTone | null;
  boj: CentralBankTone | null;
  updated_at: string;
  error?: string;
}

function ToneGauge({
  hawkish,
  dovish,
  label,
}: {
  hawkish: number;
  dovish: number;
  label: string;
}) {
  // Gauge: left = dovish (blue), right = hawkish (red), center = neutral
  // Position: 0 = full dovish, 100 = full hawkish
  const position = Math.round(hawkish * 100);
  const barColor =
    position >= 60
      ? "#ef4444"
      : position <= 40
        ? "#3b82f6"
        : "#a1a1aa";

  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-zinc-500 mb-1">
        <span>ハト派</span>
        <span className="text-zinc-400">{label}</span>
        <span>タカ派</span>
      </div>
      {/* Gauge bar */}
      <div className="relative h-3 bg-zinc-800 rounded-full overflow-hidden">
        {/* Gradient background */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, #1e3a5f, #27272a 40%, #27272a 60%, #5f1e1e)",
          }}
        />
        {/* Indicator */}
        <div
          className="absolute top-0 h-full w-1 rounded-full transition-all duration-500"
          style={{
            left: `${position}%`,
            backgroundColor: barColor,
            boxShadow: `0 0 6px ${barColor}`,
          }}
        />
        {/* Center mark */}
        <div className="absolute top-0 left-1/2 h-full w-px bg-zinc-600" />
      </div>
      <div className="flex justify-between text-xs mt-1">
        <span className="text-blue-400">
          {Math.round(dovish * 100)}%
        </span>
        <span className="text-red-400">
          {Math.round(hawkish * 100)}%
        </span>
      </div>
    </div>
  );
}

function StanceBadge({ stance }: { stance: string }) {
  const config: Record<string, { label: string; className: string }> = {
    hawkish: {
      label: "タカ派",
      className: "bg-red-900/40 text-red-400",
    },
    dovish: {
      label: "ハト派",
      className: "bg-blue-900/40 text-blue-400",
    },
    neutral: {
      label: "中立",
      className: "bg-zinc-800 text-zinc-400",
    },
  };

  const c = config[stance] || config.neutral;

  return (
    <span
      className={clsx(
        "text-xs px-2 py-0.5 rounded font-bold",
        c.className
      )}
    >
      {c.label}
    </span>
  );
}

function BankPanel({
  data,
  name,
}: {
  data: CentralBankTone;
  name: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <StanceBadge stance={data.stance} />
        <span className="text-xs text-zinc-500">
          利上げ確率: {Math.round(data.rate_hike_probability * 100)}%
        </span>
      </div>

      <ToneGauge
        hawkish={data.hawkish_score}
        dovish={data.dovish_score}
        label={name}
      />

      <p className="text-sm text-zinc-300 leading-relaxed mb-3">
        {data.summary_ja}
      </p>

      {data.key_phrases.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-zinc-400 mb-1">
            キーフレーズ
          </h4>
          <div className="flex flex-wrap gap-1">
            {data.key_phrases.map((phrase, i) => (
              <span
                key={i}
                className={clsx(
                  "text-xs px-1.5 py-0.5 rounded border",
                  data.stance === "hawkish"
                    ? "bg-red-950/20 border-red-900/20 text-red-400"
                    : data.stance === "dovish"
                      ? "bg-blue-950/20 border-blue-900/20 text-blue-400"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400"
                )}
              >
                {phrase}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FedToneCard() {
  const [activeTab, setActiveTab] = useState<"fed" | "boj">("fed");
  const [data, setData] = useState<FedToneData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/fed-tone");
        const result = await res.json();
        if (result.error && !result.fed && !result.boj) {
          setError(result.error);
        } else {
          setData(result);
        }
      } catch {
        setError("データ取得に失敗しました");
      }
      setLoading(false);
    };

    fetchData();
  }, []);

  const activeData =
    data && activeTab === "fed" ? data.fed : data?.boj;

  return (
    <div className="border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold">中央銀行トーン分析</h3>
        {data?.updated_at && (
          <span className="text-xs text-zinc-600">
            {new Date(data.updated_at).toLocaleString("ja-JP")}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {(
          [
            { key: "fed", label: "Fed（米連邦準備制度）" },
            { key: "boj", label: "日銀（BOJ）" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={clsx(
              "px-3 py-1.5 rounded text-sm",
              activeTab === tab.key
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:bg-zinc-800"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center text-zinc-500 py-8">
          分析中...
        </div>
      ) : error ? (
        <div className="text-red-400 text-sm bg-red-950/20 border border-red-900/30 rounded-lg p-3">
          {error}
        </div>
      ) : activeData ? (
        <BankPanel
          data={activeData}
          name={activeTab === "fed" ? "Fed" : "日銀"}
        />
      ) : (
        <div className="text-center text-zinc-500 py-8">
          {activeTab === "fed" ? "Fed" : "日銀"}
          のデータを取得できませんでした
        </div>
      )}
    </div>
  );
}
