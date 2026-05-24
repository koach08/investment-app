export type ExecutionReadinessStatus = "PAPER_ONLY" | "READY_FOR_TEST" | "LIVE_LOCKED" | "LIVE_ENABLED";

export interface ExecutionReadiness {
  status: ExecutionReadinessStatus;
  statusLabel: string;
  liveTradingEnabled: boolean;
  kabuConfigured: boolean;
  productionMode: boolean;
  broker: "kabu.com" | "not_configured";
  baseUrl: string | null;
  checks: {
    id: string;
    label: string;
    passed: boolean;
    detail: string;
  }[];
  nextActions: string[];
}

export function getExecutionReadiness(): ExecutionReadiness {
  const useKabu = process.env.USE_KABU === "true";
  const hasPassword = Boolean(process.env.KABU_API_PASSWORD);
  const baseUrl = process.env.KABU_API_BASE_URL || null;
  const productionMode = process.env.KABU_API_PRODUCTION === "true";
  const liveTradingEnabled = process.env.LIVE_TRADING_ENABLED === "true";
  const kabuConfigured = useKabu && hasPassword && Boolean(baseUrl);

  const status: ExecutionReadinessStatus = !kabuConfigured
    ? "PAPER_ONLY"
    : !productionMode
    ? "READY_FOR_TEST"
    : liveTradingEnabled
    ? "LIVE_ENABLED"
    : "LIVE_LOCKED";

  const statusLabel: Record<ExecutionReadinessStatus, string> = {
    PAPER_ONLY: "分析・ペーパー準備中",
    READY_FOR_TEST: "kabu.comテスト接続準備",
    LIVE_LOCKED: "実売買ロック中",
    LIVE_ENABLED: "実売買許可",
  };

  return {
    status,
    statusLabel: statusLabel[status],
    liveTradingEnabled,
    kabuConfigured,
    productionMode,
    broker: useKabu ? "kabu.com" : "not_configured",
    baseUrl,
    checks: [
      {
        id: "risk_engine",
        label: "Institutional Risk Engine",
        passed: true,
        detail: "VaR/CVaR、最大DD、推奨サイズ、Kill Switchを分析APIで算出",
      },
      {
        id: "kabu_switch",
        label: "USE_KABU",
        passed: useKabu,
        detail: useKabu ? "kabu.com連携を選択中" : "未選択。現状は分析/ペーパー用途",
      },
      {
        id: "kabu_password",
        label: "KABU_API_PASSWORD",
        passed: hasPassword,
        detail: hasPassword ? "APIパスワード設定済み" : "kabuステーション登録後に設定",
      },
      {
        id: "kabu_base_url",
        label: "KABU_API_BASE_URL",
        passed: Boolean(baseUrl),
        detail: baseUrl ?? "例: http://localhost:18080",
      },
      {
        id: "live_lock",
        label: "LIVE_TRADING_ENABLED",
        passed: liveTradingEnabled,
        detail: liveTradingEnabled ? "実注文ロック解除済み" : "未解除。誤発注を防止",
      },
    ],
    nextActions: [
      "kabu.com口座とkabuステーションAPIを準備",
      "最初はKABU_API_PRODUCTION=falseで疎通確認",
      "最低30件以上のペーパー/少額検証で勝率・期待値・最大損失を確認",
      "実売買はLIVE_TRADING_ENABLED=trueを最後に設定",
    ],
  };
}
