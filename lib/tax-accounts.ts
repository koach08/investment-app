/**
 * 非課税枠（新NISA・iDeCo）の残りを出す。
 *
 * 制度の数字は 2024年開始の新NISA:
 *   つみたて投資枠 年120万 / 成長投資枠 年240万 / 合計 年360万
 *   生涯の非課税保有限度額 1,800万（簿価ベース、うち成長投資枠は1,200万まで）
 *   売却した分の枠は翌年に簿価で復活する
 *
 * iDeCo の掛金上限は加入区分で変わるため、ここでは上限を入力値として受け取る。
 * 勝手に区分を決め打ちしない。
 */

export const NISA_TSUMITATE_ANNUAL = 1_200_000;
export const NISA_GROWTH_ANNUAL = 2_400_000;
export const NISA_ANNUAL_TOTAL = 3_600_000;
export const NISA_LIFETIME = 18_000_000;
export const NISA_LIFETIME_GROWTH = 12_000_000;

export interface TaxAccountInput {
  /** 今年すでに使ったつみたて投資枠 */
  tsumitateUsedThisYear: number;
  /** 今年すでに使った成長投資枠 */
  growthUsedThisYear: number;
  /** 生涯枠の使用額（簿価ベース） */
  lifetimeUsed: number;
  /** 生涯枠のうち成長投資枠で使った分 */
  lifetimeGrowthUsed: number;
  /** iDeCo の毎月の掛金。使っていなければ 0 */
  idecoMonthly: number;
  /** iDeCo の毎月の上限。加入区分で変わるので入力値 */
  idecoMonthlyLimit: number;
  /** 非課税枠に回せる現金（生活防衛資金を確保した残り） */
  investableCash: number;
  today?: Date;
}

export interface Frame {
  limit: number;
  used: number;
  remaining: number;
  /** 年末までに使い切るなら月いくらか */
  perMonth: number;
  usedPct: number;
}

export interface TaxAccountAnalysis {
  year: number;
  /** 当月を含む、年内に残っている月数 */
  monthsLeft: number;
  tsumitate: Frame;
  growth: Frame;
  annual: Frame;
  lifetime: { limit: number; used: number; remaining: number; growthLimit: number; growthUsed: number; growthRemaining: number };
  ideco: { monthly: number; limit: number; monthlyRemaining: number; annualRemaining: number } | null;
  /** 年内の残枠を現金で埋めきれるか */
  canFillAnnual: boolean;
  /** 埋めきれない場合の不足額 */
  shortfall: number;
  notes: string[];
}

function frame(limit: number, used: number, monthsLeft: number): Frame {
  const remaining = Math.max(0, limit - used);
  return {
    limit,
    used,
    remaining,
    perMonth: monthsLeft > 0 ? remaining / monthsLeft : remaining,
    usedPct: limit > 0 ? (used / limit) * 100 : 0,
  };
}

export function analyzeTaxAccounts(input: TaxAccountInput): TaxAccountAnalysis {
  const today = input.today ?? new Date();
  const year = today.getFullYear();
  const monthsLeft = 12 - today.getMonth();

  const tsumitate = frame(NISA_TSUMITATE_ANNUAL, input.tsumitateUsedThisYear, monthsLeft);
  const growth = frame(NISA_GROWTH_ANNUAL, input.growthUsedThisYear, monthsLeft);
  const annual = frame(NISA_ANNUAL_TOTAL, input.tsumitateUsedThisYear + input.growthUsedThisYear, monthsLeft);

  const lifetimeRemaining = Math.max(0, NISA_LIFETIME - input.lifetimeUsed);
  const growthRemaining = Math.max(0, NISA_LIFETIME_GROWTH - input.lifetimeGrowthUsed);

  // 年内に使える枠は、年間の残枠と生涯の残枠の小さい方
  const usableThisYear = Math.min(annual.remaining, lifetimeRemaining);
  const canFillAnnual = input.investableCash >= usableThisYear;
  const shortfall = Math.max(0, usableThisYear - input.investableCash);

  const notes: string[] = [];
  notes.push("生涯枠は簿価（買った値段）で数えます。値上がり分は枠を消費しません。");
  if (input.lifetimeUsed === 0 && input.tsumitateUsedThisYear === 0 && input.growthUsedThisYear === 0) {
    notes.push("使用額が未入力です。証券会社の NISA 枠の画面から今年の利用額と生涯枠の利用額を入れると、残りが出ます。");
  }
  if (lifetimeRemaining < annual.remaining) {
    notes.push(`生涯枠の残り ${Math.round(lifetimeRemaining).toLocaleString("ja-JP")}円 の方が年間の残枠より小さいため、年内に使えるのは生涯枠の残りまでです。`);
  }
  if (input.idecoMonthlyLimit <= 0) {
    notes.push("iDeCo の掛金上限は加入区分（会社員・公務員・私学共済など）で変わります。自分の上限を入れると残りが出ます。");
  }

  return {
    year,
    monthsLeft,
    tsumitate,
    growth,
    annual,
    lifetime: {
      limit: NISA_LIFETIME,
      used: input.lifetimeUsed,
      remaining: lifetimeRemaining,
      growthLimit: NISA_LIFETIME_GROWTH,
      growthUsed: input.lifetimeGrowthUsed,
      growthRemaining,
    },
    ideco:
      input.idecoMonthlyLimit > 0
        ? {
            monthly: input.idecoMonthly,
            limit: input.idecoMonthlyLimit,
            monthlyRemaining: Math.max(0, input.idecoMonthlyLimit - input.idecoMonthly),
            annualRemaining: Math.max(0, input.idecoMonthlyLimit - input.idecoMonthly) * monthsLeft,
          }
        : null,
    canFillAnnual,
    shortfall,
    notes,
  };
}

/**
 * 残枠を埋めた場合に、1年で税として払わずに済む額。
 * 実測のインカム利回りをそのまま当てた割り算で、将来の値上がりは含めない。
 */
export function taxSavedPerYear(remainingFrame: number, yieldPct: number | null): number | null {
  if (yieldPct === null || yieldPct <= 0) return null;
  return remainingFrame * (yieldPct / 100) * 0.20315;
}

export function taxAccountsToBriefing(t: TaxAccountAnalysis): string {
  const YEN = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
  const lines: string[] = [];
  lines.push(`\n## 非課税枠（${t.year}年、年内の残り ${t.monthsLeft}ヶ月）`);
  lines.push(`- つみたて投資枠: 使用 ${YEN(t.tsumitate.used)} / 残り ${YEN(t.tsumitate.remaining)}（年内に使い切るなら月 ${YEN(t.tsumitate.perMonth)}）`);
  lines.push(`- 成長投資枠: 使用 ${YEN(t.growth.used)} / 残り ${YEN(t.growth.remaining)}（年内に使い切るなら月 ${YEN(t.growth.perMonth)}）`);
  lines.push(`- 生涯枠: 使用 ${YEN(t.lifetime.used)} / 残り ${YEN(t.lifetime.remaining)}（うち成長投資枠は残り ${YEN(t.lifetime.growthRemaining)}）`);
  if (t.ideco) {
    lines.push(`- iDeCo: 掛金 月${YEN(t.ideco.monthly)} / 上限 月${YEN(t.ideco.limit)} / 増やせる余地 月${YEN(t.ideco.monthlyRemaining)}`);
  }
  lines.push(`- 年内の残枠を現金で埋められるか: ${t.canFillAnnual ? "埋められる" : `${YEN(t.shortfall)} 足りない`}`);
  for (const n of t.notes) lines.push(`- 注記: ${n}`);
  return lines.join("\n");
}
