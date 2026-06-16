import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { STANDARD, HEAVY } from "./model-config";
import type { EngineId } from "./types";

/**
 * 投資委員会。
 *
 * 同じ問いを、別々のエンジン × 別々の人格(強気/弱気/リスク管理/クオンツ/ファクト)に並列で投げ、
 * それぞれの主張を集めてから、Claude(Opus)が「議長」として最終決定を1つに合成する。
 * 機関投資家の運用会議を模した構造。感情ではなく複数視点の突き合わせで結論を出す。
 */

export type CouncilDirection = "long" | "short" | "neutral";

export interface CouncilPersona {
  key: string;
  label: string; // 表示名（例: 🐂 強気派）
  engine: EngineId;
  /** その人格としての立ち回り指示 */
  brief: string;
}

export interface CouncilStance {
  persona: string; // label
  engine: EngineId;
  status: "success" | "error";
  error?: string;
  stance?: "強気" | "弱気" | "中立";
  keyArgument?: string;
  risks?: string[];
  suggestedAction?: string;
  confidence?: number; // 0-100
  raw?: string;
}

export interface CouncilVerdict {
  decisionLabel: string; // 現物買い / 信用買い / 信用売り(空売り) / 保有継続 / 部分利確 / 全利確 / 損切り / 様子見
  direction: CouncilDirection;
  ticker?: string;
  name?: string;
  size?: string; // 推奨サイズ（例: 資金の10% / 100株）
  entry?: number | null;
  stop?: number | null;
  target?: number | null;
  riskReward?: string;
  timeframe?: string;
  exitDate?: string;
  thesis?: string;
  thesisBreaker?: string;
  consistencyNote?: string; // 既存建玉との整合性についての明示
  rationale?: string; // 熟議の統合
  dissent?: { engine: string; point: string }[];
  confidence?: number; // 0-100
  disclaimer?: string;
}

// ===== 人格定義 =====
export const PERSONAS: CouncilPersona[] = [
  {
    key: "bull",
    label: "🐂 強気派",
    engine: "gpt4o",
    brief:
      "あなたは強気派のポートフォリオマネージャー。上昇シナリオ・買い/ロングの根拠を最大限に探す。ただし願望ではなくデータ(業績・需給・テクニカル・マクロ)で語れ。弱点も正直に挙げよ。",
  },
  {
    key: "bear",
    label: "🐻 弱気派",
    engine: "grok",
    brief:
      "あなたは弱気派・ショート専門のヘッジファンドマネージャー。下落シナリオ・空売りの根拠、強気派の見落とすリスクを徹底的に突く。逆張りの悪魔の代弁者として機能せよ。",
  },
  {
    key: "risk",
    label: "🛡️ リスク管理",
    engine: "claude",
    brief:
      "あなたはCRO(チーフリスクオフィサー)。方向の当て物はしない。ポジションサイズ、損切り水準、最大ドローダウン、信用なら追証・逆日歩リスク、相関・集中リスクを定量で評価し、許容できる建て方の条件を示せ。",
  },
  {
    key: "quant",
    label: "🧮 クオンツ",
    engine: "gemini",
    brief:
      "あなたはクオンツアナリスト。バリュエーション(PER/PBR/配当)、テクニカル(RSI/移動平均/ボラ)、期待値とリスクリワードを数値で評価し、確率的に勝てる建て方かを判定せよ。曖昧な定性論は避け数字で語れ。",
  },
  {
    key: "fact",
    label: "🌐 ファクト",
    engine: "perplexity",
    brief:
      "あなたはリサーチ担当。最新のWeb情報で、対象銘柄/市場の直近の価格・決算・材料・ニュース・地政学イベントの事実関係を確認し、他の委員が古い前提で議論していないか事実で補正せよ。憶測は禁止、出典のある事実のみ。",
  },
];

// ===== 各エンジン呼び出し =====
function keyOk(k?: string): boolean {
  return !!k && !k.includes("ここに");
}

async function callClaude(system: string, user: string, model = STANDARD.claude): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!keyOk(apiKey)) throw new Error("ANTHROPIC_API_KEY未設定");
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model,
    max_tokens: 1100,
    system,
    messages: [{ role: "user", content: user }],
  });
  return msg.content.find((b) => b.type === "text")?.text || "";
}

async function callOpenAILike(
  engine: "gpt4o" | "grok" | "perplexity",
  system: string,
  user: string
): Promise<string> {
  let apiKey: string | undefined;
  let baseURL: string | undefined;
  let model: string;
  if (engine === "gpt4o") {
    apiKey = process.env.OPENAI_API_KEY;
    model = STANDARD.openai;
  } else if (engine === "grok") {
    apiKey = process.env.GROK_API_KEY;
    baseURL = "https://api.x.ai/v1";
    model = STANDARD.grok;
  } else {
    apiKey = process.env.PERPLEXITY_API_KEY;
    baseURL = "https://api.perplexity.ai";
    model = STANDARD.perplexity;
  }
  if (!keyOk(apiKey)) throw new Error(`${engine} APIキー未設定`);
  const client = new OpenAI({ apiKey, baseURL });
  const res = await client.chat.completions.create({
    model,
    max_tokens: 1100,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return res.choices[0]?.message?.content || "";
}

async function callGemini(system: string, user: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!keyOk(apiKey)) throw new Error("GEMINI_API_KEY未設定");
  const genAI = new GoogleGenerativeAI(apiKey as string);
  const m = genAI.getGenerativeModel({ model: STANDARD.gemini });
  const r = await m.generateContent(`${system}\n\n${user}`);
  return r.response.text();
}

async function callEngine(engine: EngineId, system: string, user: string): Promise<string> {
  if (engine === "claude") return callClaude(system, user);
  if (engine === "gemini") return callGemini(system, user);
  return callOpenAILike(engine as "gpt4o" | "grok" | "perplexity", system, user);
}

function extractJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

// ===== 1人格の意見 =====
async function runPersona(
  persona: CouncilPersona,
  briefing: string,
  question: string
): Promise<CouncilStance> {
  const system = `${persona.brief}
必ず次のJSONだけで答えよ（前後の説明文は不要）:
{
  "stance": "強気" | "弱気" | "中立",
  "keyArgument": "あなたの立場の核心(2-3文)",
  "risks": ["最大リスク1", "リスク2"],
  "suggestedAction": "具体的な建て方/手仕舞い案(1文)",
  "confidence": 0-100
}`;
  const user = `## 議題\n${question}\n\n## 共有ブリーフィング\n${briefing}`;
  try {
    const text = await callEngine(persona.engine, system, user);
    const j = extractJson(text);
    if (!j) {
      return {
        persona: persona.label,
        engine: persona.engine,
        status: "success",
        keyArgument: text.slice(0, 300),
        confidence: 30,
        raw: text,
      };
    }
    return {
      persona: persona.label,
      engine: persona.engine,
      status: "success",
      stance: j.stance as CouncilStance["stance"],
      keyArgument: j.keyArgument as string,
      risks: (j.risks as string[]) || [],
      suggestedAction: j.suggestedAction as string,
      confidence: typeof j.confidence === "number" ? j.confidence : undefined,
    };
  } catch (e) {
    return {
      persona: persona.label,
      engine: persona.engine,
      status: "error",
      error: e instanceof Error ? e.message : "unknown",
    };
  }
}

// ===== 議長による最終合成 =====
async function synthesize(
  question: string,
  briefing: string,
  stances: CouncilStance[],
  todayJst: string
): Promise<CouncilVerdict> {
  const ok = stances.filter((s) => s.status === "success");
  const stanceText = ok
    .map(
      (s) =>
        `### ${s.persona} (${s.engine})\n立場: ${s.stance ?? "?"} / 確信度: ${s.confidence ?? "?"}\n主張: ${s.keyArgument ?? ""}\nリスク: ${(s.risks || []).join(" / ")}\n提案: ${s.suggestedAction ?? ""}`
    )
    .join("\n\n");

  const system = `あなたは投資委員会の議長(CIO)であり、機関投資家としてクライアントの資金を預かり最終意思決定を下す立場だ。
本日は${todayJst}。
各委員(強気/弱気/リスク管理/クオンツ/ファクト)の意見を統合し、感情を排して、期待値とリスク管理に基づく1つの結論を出す。

絶対規則:
1. 「共有ブリーフィング」内のオープン建玉の方向(ロング/ショート・現物/信用)と建玉理由は唯一の正である。これと矛盾する判断(自分が空売りを指示した建玉に対し「なぜ売っているのか」と問い返す等)は重大な誤りであり厳禁。
2. 既存建玉がある銘柄は「保有継続/部分利確/全利確/損切り/積み増し」のいずれかで、当初テーゼが今も有効か必ず判定し consistencyNote に明記せよ。
3. 過去の教訓(あれば)を必ず反映せよ。
4. 予測の不確実性を言い訳にせず、現時点の最善手を具体的な数値(entry/stop/target/size)で示せ。ただし確信が低いなら decisionLabel を「様子見」とし confidence を低くする誠実さを持て。
5. 委員の中で結論に反対した重要な少数意見は dissent に必ず残せ（後で検証するため）。

必ず次のJSONだけで答えよ:
{
  "decisionLabel": "現物買い|信用買い|信用売り(空売り)|保有継続|部分利確|全利確|損切り|積み増し|様子見",
  "direction": "long|short|neutral",
  "ticker": "対象があれば",
  "name": "銘柄名",
  "size": "推奨サイズ(例: 投資余力の10% / 100株)",
  "entry": 数値またはnull,
  "stop": 数値またはnull,
  "target": 数値またはnull,
  "riskReward": "1:2.5 等",
  "timeframe": "保有想定期間",
  "exitDate": "YYYY-MM-DD または空",
  "thesis": "この決定の根拠テーゼ(1-2文)",
  "thesisBreaker": "この条件が起きたら撤退",
  "consistencyNote": "既存建玉との整合性の確認(なければ'新規'と書く)",
  "rationale": "各委員の意見をどう統合したか(3-5文)",
  "dissent": [{ "engine": "弱気派など", "point": "反対意見の核心" }],
  "confidence": 0-100,
  "disclaimer": "投資助言ではない旨"
}`;

  const user = `## 議題\n${question}\n\n## 共有ブリーフィング\n${briefing}\n\n## 各委員の意見\n${stanceText}`;
  const text = await callClaude(system, user, HEAVY.claude);
  const j = extractJson(text);
  if (!j) {
    return {
      decisionLabel: "様子見",
      direction: "neutral",
      rationale: text.slice(0, 500),
      confidence: 20,
      disclaimer: "本内容は投資助言ではありません。",
    };
  }
  return {
    decisionLabel: (j.decisionLabel as string) || "様子見",
    direction: (j.direction as CouncilDirection) || "neutral",
    ticker: j.ticker as string,
    name: j.name as string,
    size: j.size as string,
    entry: (j.entry as number) ?? null,
    stop: (j.stop as number) ?? null,
    target: (j.target as number) ?? null,
    riskReward: j.riskReward as string,
    timeframe: j.timeframe as string,
    exitDate: j.exitDate as string,
    thesis: j.thesis as string,
    thesisBreaker: j.thesisBreaker as string,
    consistencyNote: j.consistencyNote as string,
    rationale: j.rationale as string,
    dissent: (j.dissent as { engine: string; point: string }[]) || [],
    confidence: typeof j.confidence === "number" ? j.confidence : undefined,
    disclaimer: (j.disclaimer as string) || "本内容は投資助言ではありません。",
  };
}

export interface CouncilResult {
  stances: CouncilStance[];
  verdict: CouncilVerdict;
  durationMs: number;
}

export async function convene(params: {
  question: string;
  briefing: string;
  todayJst: string;
}): Promise<CouncilResult> {
  const start = Date.now();
  // 全人格を並列に招集（落ちた人格はスキップ）
  const stances = await Promise.all(
    PERSONAS.map((p) => runPersona(p, params.briefing, params.question))
  );
  const verdict = await synthesize(params.question, params.briefing, stances, params.todayJst);
  return { stances, verdict, durationMs: Date.now() - start };
}
