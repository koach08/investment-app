import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { HEAVY } from "@/lib/model-config";

interface StockEntry {
  code: string;
  name: string;
  sector: string;
  buyPrice: number;
  currentPrice: number;
  targetPrice: number;
  analystRating: string;
  dividendYield: string;
  per: string;
  pbr: string;
  note: string;
}

export async function POST(request: NextRequest) {
  try {
    const { stocks, analysisType } = await request.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 500 });
    }

    const client = new Anthropic({ apiKey });

    let prompt = "";
    if (analysisType === "overview") {
      prompt = `あなたは機関投資家レベルのウェルスマネジメント・アドバイザーとして、以下のポートフォリオを包括的に分析せよ。

ポートフォリオ:
${JSON.stringify(stocks, null, 2)}

以下の観点で分析してください（日本語で）：

### 1. ポートフォリオ・ヘルスチェック
- **セクター配分**: 各セクターの比率と理想的な配分からのドリフト率
- **地域分散**: 日本株/米国株/その他の比率と通貨エクスポージャー
- **投資スタイルバランス**: 成長/バリュー/配当の構成比
- **集中リスク**: 単一銘柄が15%超の場合は赤旗、10%超は黄旗
- **相関リスク**: 同じ方向に動きやすい銘柄群の特定

### 2. リバランス提案
- 目標配分からのドリフトが大きい項目を特定
- 具体的な売買アクション（何を何株売り/買い）を提案
- 税効率を考慮（含み損銘柄の損益通算活用）
- NISA枠の活用提案

### 3. 損益通算・税金最適化
- 含み損銘柄のリスト化と損益通算の候補
- 特定口座での年末損益通算タイミング
- NISA口座への移管候補銘柄

### 4. 配当・インカム分析
- ポートフォリオ全体の加重平均配当利回り
- 配当成長率の高い銘柄の特定
- 配当カレンダー（次回配当権利日）
- 株主優待の一覧（対象銘柄がある場合）

### 5. リスク評価
- 最大ドローダウンの推定
- セクター・通貨リスクの定量化
- 金利感応度（金利上昇時の影響）

### 6. アクションアイテム（優先度順）
- 即座に実行すべきアクション
- 1ヶ月以内に検討すべきアクション
- 中長期的な改善提案

具体的な数値と根拠を示し、曖昧な表現は避けよ。`;
    } else if (analysisType === "sector") {
      prompt = `あなたは機関投資家レベルのセクターアナリストとして、以下のポートフォリオのセクター分析を行え：

${JSON.stringify(stocks, null, 2)}

各セクターについて以下を分析（日本語）：

### セクター別分析
各セクターごとに：
- **セクター環境**: 景気サイクル上の位置、規制環境、技術トレンド
- **競争構造**: 業界の5Forces分析（参入障壁、代替品脅威、交渉力等）
- **保有銘柄のポジション**: 業界内シェア、競争優位性（MOAT）の種類と強度
  - ネットワーク効果 / スイッチングコスト / 規模の経済 / 無形資産（ブランド・特許）
- **バリュエーション比較**: 保有銘柄 vs 業界平均（PER/PBR/EV/EBITDA）
- **セクターローテーション**: 現在のマクロ環境でのこのセクターの位置づけ
- **カタリスト**: 今後のセクター固有イベント
- **投資判断**: オーバーウェイト/ニュートラル/アンダーウェイト推奨

### セクター配分最適化
- 現在のセクター配分 vs 推奨配分
- 過剰セクターの縮小と不足セクターの補完提案`;
    } else {
      prompt = `あなたは機関投資家レベルのエクイティリサーチ・アナリストとして、以下のポートフォリオの各銘柄を個別に評価せよ：

${JSON.stringify(stocks, null, 2)}

各銘柄について以下のフレームワークで分析（日本語）：

### 銘柄評価フレームワーク
1. **ビジネスモデル & MOAT評価**
   - 収益構造（売上構成比、セグメント別利益率）
   - 経済的堀の種類と強度（1-5段階）
     - ネットワーク効果 / スイッチングコスト / 規模の経済 / 無形資産 / コスト優位性
   - 堀の持続期間の推定

2. **バリュエーション分析**
   - PER / PBR / PSR / EV/EBITDA / 配当利回り
   - 同業他社との相対バリュエーション（割安/適正/割高）
   - ヒストリカル・バリュエーションとの比較（過去5年平均との乖離）
   - 簡易DCF的なフェアバリューレンジ推定

3. **投資テーゼ**
   - Bull Case: 最良シナリオと目標株価
   - Base Case: 基本シナリオと目標株価
   - Bear Case: 最悪シナリオと下限目標
   - テーゼが崩れる条件（ストップ条件）

4. **カタリスト**
   - 短期（1-3ヶ月）: 決算、製品発表、規制等
   - 中長期: 構造的成長ドライバー

5. **リスク要因**
   - 事業リスク / 財務リスク / 規制リスク / マクロリスク
   - リスクの深刻度と発生確率

6. **総合評価**
   - レーティング: Strong Buy / Buy / Hold / Sell / Strong Sell
   - 星評価（5段階）
   - 12ヶ月ターゲットプライス
   - アクション: 買い増し / 継続保有 / 部分利確 / 損切り`;
    }

    const message = await client.messages.create({
      model: HEAVY.claude,
      max_tokens: 8000,
      system: `あなたは機関投資家レベルの投資アナリストだ。以下の専門性を統合して分析する:
- エクイティリサーチ: バリュエーション、投資テーゼ構築、決算分析
- ウェルスマネジメント: ポートフォリオ最適化、リバランス、税金最適化
- コンペティティブ分析: MOAT評価、業界構造分析、競争ポジション
データと確率に基づき、忖度なしで分析する。曖昧な表現は禁止。具体的な数値と根拠を必ず示す。`,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";

    return NextResponse.json({ analysis: text });
  } catch (e) {
    return NextResponse.json(
      { error: `分析失敗: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
