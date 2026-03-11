/**
 * AI Model Configuration — 一元管理
 *
 * タスクの重要度に応じて3段階のティアでモデルを選択:
 *   LIGHT    — 軽量タスク（要約、フォーマット変換等）: 安価・高速
 *   STANDARD — 通常分析（銘柄分析、ニュース分析等）: バランス型
 *   HEAVY    — 重要判断（信用取引、ポートフォリオ戦略等）: 最高性能
 *
 * 資産運用アプリの方針:
 *   - 実際のお金がかかる判断には最高性能モデルを惜しまず使用
 *   - AI費用は投資リターンでカバーする前提
 *   - 1日1回フル分析で月~$10（約1,500円）程度
 *   - 複数モデルのコンセンサスで信頼性を向上
 *
 * コスト概算（1回あたり、入力10K+出力4Kトークン想定）:
 *   Opus 4.6:  ~$0.15/回  — 最高精度、複雑な推論
 *   Sonnet 4.6: ~$0.09/回  — 高精度、高速
 *   GPT-5:      ~$0.05/回  — 最新フラグシップ
 *   GPT-4.1:    ~$0.02/回  — コスパ良好
 *   Gemini Pro:  ~$0.05/回  — 推論特化
 */

export type ModelTier = "LIGHT" | "STANDARD" | "HEAVY";

export interface ModelConfig {
  claude: string;
  openai: string;
  gemini: string;
  grok: string;
  perplexity: string;
}

// ── Latest Model IDs (2026-03) ──────────────────────────────────

const MODELS = {
  // Anthropic Claude
  claude: {
    LIGHT: "claude-sonnet-4-6",              // Sonnet 4.6 — $3/$15 per 1M tokens
    STANDARD: "claude-sonnet-4-6",           // Sonnet 4.6 — バランス型
    HEAVY: "claude-opus-4-6",               // Opus 4.6 — $5/$25 per 1M tokens、最高推論性能、128K出力
  },

  // OpenAI
  openai: {
    LIGHT: "gpt-4.1-mini",                  // 4.1 Mini — 安価・高速
    STANDARD: "gpt-4.1",                    // GPT-4.1 — 1M context
    HEAVY: "gpt-5",                         // GPT-5 — $1.25/$10 per 1M、最新フラグシップ
  },

  // Google Gemini
  gemini: {
    LIGHT: "gemini-2.5-flash",              // Flash — 最安・最速
    STANDARD: "gemini-2.5-pro",             // Pro — 高精度推論
    HEAVY: "gemini-2.5-pro",               // Pro — ベンチマーク1位クラス
  },

  // xAI Grok
  grok: {
    LIGHT: "grok-3-mini-fast-beta",         // Mini Fast — 高速
    STANDARD: "grok-3",                     // Grok 3
    HEAVY: "grok-3",                        // Grok 3 — xAIフラグシップ
  },

  // Perplexity (Web検索統合 — リアルタイム市場情報)
  perplexity: {
    LIGHT: "sonar",                         // Sonar — 基本Web検索
    STANDARD: "sonar-pro",                  // Sonar Pro — 深いWeb検索、200K context
    HEAVY: "sonar-pro",                     // Sonar Pro — ファクト精度最高
  },
} as const;

// ── Helper Functions ────────────────────────────────────────────

/** 指定ティアのモデルID一式を取得 */
export function getModels(tier: ModelTier): ModelConfig {
  return {
    claude: MODELS.claude[tier],
    openai: MODELS.openai[tier],
    gemini: MODELS.gemini[tier],
    grok: MODELS.grok[tier],
    perplexity: MODELS.perplexity[tier],
  };
}

/** 特定プロバイダの特定ティアのモデルIDを取得 */
export function getModel(provider: keyof typeof MODELS, tier: ModelTier): string {
  return MODELS[provider][tier];
}

// ── API Route用のプリセット ─────────────────────────────────────

/** 軽量タスク: 要約、テキスト変換 */
export const LIGHT = getModels("LIGHT");

/** 通常分析: 銘柄分析、ニュース分析、チャット */
export const STANDARD = getModels("STANDARD");

/** 重要判断: 信用取引、デイリー戦略、ポートフォリオ分析 */
export const HEAVY = getModels("HEAVY");

// ── Max Tokens プリセット ───────────────────────────────────────

export const MAX_TOKENS = {
  LIGHT: 1000,
  STANDARD: 4000,
  HEAVY: 8000,
} as const;
