import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { HEAVY, MAX_TOKENS } from "@/lib/model-config";

export const maxDuration = 120;

type Horizon = "short" | "mid" | "long" | "all";

const HORIZON_FRAME: Record<Horizon, string> = {
  short: `## 今回の時間軸: 短期（〜1年）
この期間で狙うのは「増やす」ことではなく「取り崩さずに済む状態を作る」こと。
現金の厚み、負債、含み損の損益通算、集中している銘柄の圧縮を優先して見る。
1年以内に必要になる金が値動きするものに入っていたら、まずそれを指摘する。`,
  mid: `## 今回の時間軸: 中期（1〜5年）
配分の歪みを直す期間。集中度、通貨の偏り、同じ方向に動く資産の重複を見て、
「今の配分のまま5年持ったとき、どこで一番痛むか」を具体的に示す。
売買を勧めるときは、税と手数料を差し引いても直す価値があるかを必ず検討する。`,
  long: `## 今回の時間軸: 長期（5年〜）
積み上げの設計。NISA・iDeCo の枠が空いているか、積立の軸が何本あるか、
インフレで現金が目減りする分をどこで受けているかを見る。
個別銘柄の当て物ではなく、放っておいても崩れない形を優先する。`,
  all: `## 今回の時間軸: 短期・中期・長期をまとめて
短期（〜1年）＝守りの穴を塞ぐ、中期（1〜5年）＝配分の歪みを直す、長期（5年〜）＝積み上げの設計。
この3つを分けて書く。混ぜない。`,
};

const BASE_SYSTEM = `あなたは、個人の資産を「減らさない」ことを最優先に見る資産運用のアドバイザーです。
相手は会社員で、投資が収入を増やすための現実的な選択肢のひとつになっている人です。
だからこそ、当てにいって失敗する余地を先に潰すのが仕事になります。

## 順番のルール（これを崩さない）
1. まず守りの状態を確認する。生活防衛資金、負債、集中度、下落耐性。
2. 守りに赤があるなら、増やす提案はしない。赤を潰す手順を先に出す。
3. 守りが立っている分だけ、増やす話に進む。

## 数字の扱い
- アプリが算出した数字（総資産、内訳、集中度、ストレスシナリオ）は唯一の正。書き換えない。
- 渡されていない数字を推測で作らない。必要なら「この判断には○○のデータが要る」と書く。
- 株価や利回りを挙げるときは、それがいつ時点の何かを添える。分からなければ参考値と明示する。
- 「データの欠け」に挙がっている項目は、無いものとして扱う。埋めない。

## 出す形
- 結論を先に。次に根拠の数字。最後に具体的な手順。
- 提案には必ず「やる場合のコスト（税・手数料・機会損失）」と「やらない場合に何が起きるか」を添える。
- 見送るべきものは、はっきり見送ると書く。全部やる前提の一覧は出さない。
- 金額と比率は必ず実額で書く。「一定割合」「適度に」で逃げない。

## 書き方
- Markdown で返す。JSON やコードブロックで包まない。
- 「〜性」で終わる抽象名詞、em ダッシュ、決め台詞じみた一文は使わない。
- 煽らない。不安を作って動かそうとしない。淡々と数字で書く。

## 立場
これは投資助言ではなく、判断材料の提供です。最終判断は本人が行います。
断定形で「買え」「売れ」と命じず、「この条件ならこう、この条件ならこう」と分岐で示してください。
ただし、明らかに危ない状態（生活防衛資金がゼロで信用取引をしている等）は、はっきり危ないと書いてください。`;

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes("ここに")) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 500 });
  }

  let body: {
    messages?: { role: string; content: string }[];
    briefing?: string;
    horizon?: Horizon;
    marketContext?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストの解析に失敗しました" }, { status: 400 });
  }

  const { messages, briefing, horizon = "all", marketContext } = body;
  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const frame = HORIZON_FRAME[horizon] ?? HORIZON_FRAME.all;
  const systemPrompt = [
    BASE_SYSTEM,
    frame,
    briefing ? `\n${briefing}` : "\n## 資産データ\nまだ取り込まれていません。一般論で答えず、まず何を取り込めば判断できるかを示してください。",
    marketContext ? `\n## 市場コンテキスト\n${JSON.stringify(marketContext)}` : "",
  ].join("\n");

  try {
    const client = new Anthropic({ apiKey });
    const anthropicMessages = messages.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

    const message = await client.messages.create({
      model: HEAVY.claude,
      max_tokens: MAX_TOKENS.STANDARD,
      system: systemPrompt,
      messages: anthropicMessages,
    });

    const text = message.content.find((b) => b.type === "text")?.text ?? "";
    return NextResponse.json({ reply: text });
  } catch (e) {
    return NextResponse.json(
      { error: `相談に失敗しました: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }
}
