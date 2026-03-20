import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { LIGHT } from "@/lib/model-config";

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "sk-ant-api03-ここに入力") {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が設定されていません。.env.local を確認してください。" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { indices, news, fredData, tickerData, type } = body;

  let systemPrompt = "あなたは機関投資家レベルの投資分析エキスパートだ。日本語で簡潔かつ具体的に分析結果を返す。曖昧な表現は禁止。数値と根拠を必ず示す。回答はMarkdown形式で返すこと。コードブロック（```）で囲まないこと。見出し・箇条書き・太字等を直接使え。";
  let userPrompt = "";

  switch (type) {
    case "morning": {
      systemPrompt += " チーフストラテジストとして、ポートフォリオマネージャー向けのモーニングサマリーを作成する。";
      userPrompt = `以下は現在の世界市場データです。機関投資家向けの市場環境サマリーを日本語で作成してください。

## 世界指数データ
${JSON.stringify(indices, null, 2)}

## 主要ニュース
${JSON.stringify(news?.slice(0, 8), null, 2)}

以下を含めること:
1. **マーケットレジーム**: リスクオン/オフ、ボラティリティ環境
2. **注目の動き**: 前日比で大きく動いた指数とその理由
3. **セクターローテーション**: どのセクターに資金が流入/流出しているか
4. **今日の注目イベント**: 経済指標発表、決算、FOMC等
5. **ワンラインコール**: 今日のマーケットを一言で（例: 「テック主導のリスクオン」）`;
      break;
    }

    case "ticker": {
      systemPrompt += " エクイティリサーチ・アナリストとして銘柄分析を行う。MOAT評価とバリュエーション比較を含める。";
      userPrompt = `以下の銘柄データを機関投資家レベルで分析してください。

## 銘柄データ
${JSON.stringify(tickerData, null, 2)}

## 関連ニュース
${JSON.stringify(news?.slice(0, 5), null, 2)}

## マクロ経済指標
${JSON.stringify(fredData, null, 2)}

以下のフレームワークで分析:
1. **テクニカルシグナル**: RSI/MACD/BB のコンフルエンス（複数指標の一致度）
2. **ファンダメンタルズ**: バリュエーション水準（業界平均比）、成長性、収益性
3. **MOAT評価**: 経済的堀の種類と強度（1-5）
4. **ニュースインパクト**: 関連ニュースの株価影響度
5. **マクロ感応度**: 金利・為替変動への感応度
6. **投資判断**: 具体的なエントリー/ターゲット/ストップ価格`;
      break;
    }

    case "macro": {
      systemPrompt += " マクロストラテジストとして景気サイクルと金融政策を分析する。セクターローテーション戦略を含める。";
      userPrompt = `以下のマクロ経済データと世界市場データから、現在の経済環境を分析してください。

## FRED経済指標
${JSON.stringify(fredData, null, 2)}

## 世界市場指数
${JSON.stringify(indices, null, 2)}

以下のフレームワークで分析:
1. **景気サイクル位置**: 拡大期/ピーク/後退期/底のどこにいるか、根拠を示す
2. **イールドカーブ分析**: 長短金利差のトレンドと景気後退シグナル
3. **金融政策サイクル**: FRB/日銀の引き締め/緩和スタンスとその影響
4. **セクターローテーション**: 現在の景気局面で選好すべきセクター
5. **通貨・コモディティ**: ドル円、金、原油の方向性
6. **リスクマップ**: 主要リスク要因を深刻度順にランク付け
7. **ポートフォリオ示唆**: マクロ環境に基づくアセットアロケーション提案`;
      break;
    }

    case "news": {
      systemPrompt += " ニュースアナリストとして、ファースト/セカンドオーダーの影響を分析する。";
      userPrompt = `以下のニュース一覧を、機関投資家視点で分析してください。

## ニュース
${JSON.stringify(news?.slice(0, 15), null, 2)}

以下を含めること:
1. **最重要ニュース**: マーケットインパクトが最も大きいニュース3つとその理由
2. **セクター影響**: どのセクターにプラス/マイナスか
3. **サプライチェーン波及**: 間接的に影響を受ける業界・企業
4. **勝者と敗者**: このニュース群から恩恵を受ける銘柄と打撃を受ける銘柄
5. **アクションアイテム**: 具体的な投資アクション提案`;
      break;
    }

    case "calendar": {
      systemPrompt += " エコノミストとして経済指標を分析し、投資戦略への影響を明確にする。";
      userPrompt = `以下の経済指標データから、現在の経済状況を分析してください。

## FRED経済指標
${JSON.stringify(fredData, null, 2)}

以下のフレームワークで分析:
1. **長短金利差トレンド**: イールドカーブの形状変化と景気後退確率
2. **インフレ動向**: CPI/PCEトレンドとFRBの反応予測
3. **雇用市場**: 失業率・雇用コストと景気の底堅さ
4. **GDP成長**: 成長率トレンドと景気の勢い
5. **投資戦略への示唆**: 債券/株式/コモディティの配分調整提案
6. **次の注目指標**: 今後1-2週間で注目すべき経済指標発表`;
      break;
    }

    default:
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: LIGHT.claude,
      max_tokens: 1000,
      messages: [
        { role: "user", content: userPrompt },
      ],
      system: systemPrompt,
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const summary = textBlock ? textBlock.text : "分析結果を生成できませんでした。";

    return NextResponse.json({ summary });
  } catch (e) {
    return NextResponse.json(
      { error: `AI分析エラー: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
