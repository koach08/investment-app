/**
 * 配当・分配金からインカム（実際に入ってきたお金）を集計する。
 *
 * 前提の確認結果:
 *   SBI の配当金明細に入っている金額は「円建て・税引後の受取額」。
 *   レコード側の currency は商品名（米国株式か否か）から推定しているだけで、
 *   実額とは対応していない。コカ・コーラ 2025/12/16 の記録 ¥2,781.05 / 49株 は
 *   1株あたり ¥56.8 にあたり、$0.485 × 158.94円 から米10%・日20.315% を引いた
 *   ¥55.3 とほぼ一致する。ドル建てなら1株 $49.7 となり成立しない。
 *   よってここでは currency を見ず、すべて円建てとして扱う。
 *
 * 将来にわたる利回りを予想する場所ではない。実際に入った額と、
 * その利回りが続いた場合の逆算だけを出す。
 */

export interface DividendLike {
  date: string;
  account: string;
  product: string;
  name: string;
  ticker: string;
  quantity: number;
  amount: number;
  currency?: string;
}

/**
 * 本人が付けた印。保有データからは売却か未取り込みかを区別できないため。
 * partial は一部だけ売った場合（例: 200株を100株にした → remainingPct 50）。
 */
export type IncomeStatus = "sold" | "held" | "partial";

export interface IncomeMark {
  status: IncomeStatus;
  /** partial のときの残り割合（%） */
  remainingPct?: number;
}

/** 印が付いていない銘柄をどう扱うか */
export type UnmatchedDefault = "exclude" | "include";

function normalizeMark(v: IncomeMark | IncomeStatus | undefined): IncomeMark | undefined {
  if (!v) return undefined;
  return typeof v === "string" ? { status: v } : v;
}

/** 配当の出どころが、来年も残っているか */
export interface SustainedIncome {
  /** いまの保有データで裏付けが取れる直近12ヶ月の配当 */
  matched: number;
  /** 裏付けが取れない分の合計 */
  unmatched: number;
  /** そのうち本人が「売却済み」と印を付けた分 */
  soldConfirmed: number;
  /** そのうち本人が「まだ持っている」と印を付けた分 */
  heldConfirmed: number;
  /** まだ確認していない分 */
  unknown: number;
  /** 来年も入ると見込める額（裏付けあり＋まだ持っている） */
  expectedForward: number;
  /** 裏付けが取れない銘柄（金額の大きい順） */
  unmatchedNames: { name: string; ticker: string; amount: number; mark?: IncomeMark }[];
  /** 印が付いていない分をどう扱ったか */
  unmatchedDefault: UnmatchedDefault;
  /** 保有データが1件も無いなど、そもそも判定できない場合 */
  checkable: boolean;
}

export interface IncomeAnalysis {
  /** 集計の基準日（最も新しい入金日）。今日ではない */
  anchorDate: string | null;
  /** 基準日から遡って12ヶ月の受取額 */
  last12m: number;
  /** その前の12ヶ月 */
  prev12m: number;
  monthlyAvg: number;
  byYear: { year: string; amount: number; count: number }[];
  byMonth: { month: string; amount: number }[];
  topContributors: { name: string; ticker: string; amount: number; pct: number }[];
  byAccount: { account: string; amount: number; taxFree: boolean }[];
  /** 総資産に対する実効利回り（税引後・実測） */
  yieldOnTotal: number | null;
  /** 値動きする資産に対する実効利回り */
  yieldOnRisk: number | null;
  /** 月いくらのインカムに、いまと同じ利回りならいくらの元本が要るか */
  targets: { monthlyTarget: number; requiredPrincipal: number | null; additionalNeeded: number | null }[];
  allTime: number;
  recordCount: number;
  sustained: SustainedIncome;
  notes: string[];
}

export interface HoldingRef {
  name?: string;
  code?: string;
}

/** 銘柄名から記号や余白を落として突き合わせやすくする */
function normalizeName(s: string): string {
  return s
    .replace(/\s+/g, "")
    .replace(/[（）()・\-‐−ー]/g, "")
    .replace(/[A-Z]{1,5}$/, "")
    .toLowerCase();
}

/** 配当のレコードが、いまの保有のどれかに対応するか */
export function matchesHolding(div: { name: string; ticker: string }, holdings: HoldingRef[]): boolean {
  const dTicker = (div.ticker || "").replace(/\.T$/, "").toUpperCase();
  const dName = normalizeName(div.name || "");
  for (const h of holdings) {
    const hCode = (h.code || "").replace(/\.T$/, "").toUpperCase();
    if (dTicker && hCode && dTicker === hCode) return true;
    const hName = normalizeName(h.name || "");
    if (!hName || !dName) continue;
    if (hName === dName) return true;
    // 「コカ-コーラ KO」と「コカ-コーラ」のように、片方がもう片方を含む
    if (hName.length >= 3 && (dName.includes(hName) || hName.includes(dName))) return true;
  }
  return false;
}

/** "2026/2/27" や "2026-02-27" を Date に */
function parseDate(s: string): Date | null {
  const d = new Date(s.replace(/\//g, "-"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const TAX_FREE_ACCOUNT = /NISA|つみたて|少額投資/i;

export function analyzeIncome(
  dividends: DividendLike[],
  opts: {
    totalAssets: number;
    riskAssets: number;
    today?: Date;
    holdings?: HoldingRef[];
    /** 銘柄名 → 本人が付けた印 */
    statusByName?: Record<string, IncomeMark | IncomeStatus>;
    /** 印が付いていない銘柄の既定の扱い。既定は見込みに入れない */
    unmatchedDefault?: UnmatchedDefault;
  }
): IncomeAnalysis {
  const notes: string[] = [];
  const rows = dividends
    .map((d) => ({ ...d, parsed: parseDate(d.date) }))
    .filter((d): d is typeof d & { parsed: Date } => d.parsed !== null && d.amount !== 0);

  if (rows.length === 0) {
    return {
      anchorDate: null, last12m: 0, prev12m: 0, monthlyAvg: 0,
      byYear: [], byMonth: [], topContributors: [], byAccount: [],
      yieldOnTotal: null, yieldOnRisk: null, targets: [], allTime: 0, recordCount: 0,
      sustained: {
        matched: 0, unmatched: 0, soldConfirmed: 0, heldConfirmed: 0,
        unknown: 0, expectedForward: 0, unmatchedNames: [], unmatchedDefault: "exclude", checkable: false,
      },
      notes: ["配当・分配金の記録がありません。SBI の配当金明細を CSV 取り込みすると集計できます。"],
    };
  }

  notes.push("金額は円建て・税引後の受取額として集計しています。米国株の記録も円換算後の金額です。");

  rows.sort((a, b) => a.parsed.getTime() - b.parsed.getTime());
  const anchor = rows[rows.length - 1].parsed;
  const today = opts.today ?? new Date();
  const staleDays = Math.floor((today.getTime() - anchor.getTime()) / 86400000);
  if (staleDays > 75) {
    notes.push(
      `最後の入金記録が ${anchor.toLocaleDateString("ja-JP")} で、${staleDays}日前です。直近12ヶ月はこの日を基準に数えています。取り込みが止まっている可能性があります。`
    );
  }

  const cut = (monthsBack: number) => {
    const d = new Date(anchor);
    d.setMonth(d.getMonth() - monthsBack);
    return d;
  };
  const w12 = cut(12);
  const w24 = cut(24);

  const inWindow = (d: Date, from: Date, to: Date) => d > from && d <= to;
  const last12Rows = rows.filter((r) => inWindow(r.parsed, w12, anchor));
  const prev12Rows = rows.filter((r) => inWindow(r.parsed, w24, w12));

  const sum = (rs: typeof rows) => rs.reduce((s, r) => s + r.amount, 0);
  const last12m = sum(last12Rows);
  const prev12m = sum(prev12Rows);
  const allTime = sum(rows);

  // 年別
  const yearMap = new Map<string, { amount: number; count: number }>();
  for (const r of rows) {
    const y = String(r.parsed.getFullYear());
    const cur = yearMap.get(y) ?? { amount: 0, count: 0 };
    yearMap.set(y, { amount: cur.amount + r.amount, count: cur.count + 1 });
  }
  const byYear = [...yearMap.entries()]
    .map(([year, v]) => ({ year, ...v }))
    .sort((a, b) => b.year.localeCompare(a.year));

  // 月別（直近24ヶ月、受取ゼロの月も埋める）
  const monthMap = new Map<string, number>();
  for (const r of rows) {
    if (r.parsed <= w24) continue;
    const k = monthKey(r.parsed);
    monthMap.set(k, (monthMap.get(k) ?? 0) + r.amount);
  }
  const byMonth: { month: string; amount: number }[] = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(anchor);
    d.setMonth(d.getMonth() - i);
    const k = monthKey(d);
    byMonth.push({ month: k, amount: monthMap.get(k) ?? 0 });
  }

  // 銘柄別（直近12ヶ月）
  const nameMap = new Map<string, { ticker: string; amount: number }>();
  for (const r of last12Rows) {
    const key = r.name || r.ticker || "(名称不明)";
    const cur = nameMap.get(key) ?? { ticker: r.ticker, amount: 0 };
    nameMap.set(key, { ticker: cur.ticker || r.ticker, amount: cur.amount + r.amount });
  }
  const topContributors = [...nameMap.entries()]
    .map(([name, v]) => ({ name, ticker: v.ticker, amount: v.amount, pct: last12m > 0 ? (v.amount / last12m) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  // 口座別（直近12ヶ月）
  const acctMap = new Map<string, number>();
  for (const r of last12Rows) {
    const a = r.account || "(口座不明)";
    acctMap.set(a, (acctMap.get(a) ?? 0) + r.amount);
  }
  const byAccount = [...acctMap.entries()]
    .map(([account, amount]) => ({ account, amount, taxFree: TAX_FREE_ACCOUNT.test(account) }))
    .sort((a, b) => b.amount - a.amount);

  // 直近12ヶ月の配当のうち、いまの保有で裏付けが取れる分
  const holdingRefs = opts.holdings ?? [];
  const statusByName = opts.statusByName ?? {};
  const unmatchedDefault: UnmatchedDefault = opts.unmatchedDefault ?? "exclude";
  const sustained: SustainedIncome = {
    matched: 0, unmatched: 0, soldConfirmed: 0, heldConfirmed: 0,
    unknown: 0, expectedForward: 0, unmatchedNames: [], unmatchedDefault,
    checkable: holdingRefs.length > 0,
  };
  if (sustained.checkable) {
    const unmatchedMap = new Map<string, { ticker: string; amount: number }>();
    for (const r of last12Rows) {
      if (matchesHolding({ name: r.name, ticker: r.ticker }, holdingRefs)) {
        sustained.matched += r.amount;
        continue;
      }
      sustained.unmatched += r.amount;
      const key = r.name || r.ticker || "(名称不明)";
      const cur = unmatchedMap.get(key) ?? { ticker: r.ticker, amount: 0 };
      unmatchedMap.set(key, { ticker: cur.ticker || r.ticker, amount: cur.amount + r.amount });
    }

    sustained.unmatchedNames = [...unmatchedMap.entries()]
      .map(([name, v]) => ({ name, ticker: v.ticker, amount: v.amount, mark: normalizeMark(statusByName[name]) }))
      .sort((a, b) => b.amount - a.amount);

    for (const u of sustained.unmatchedNames) {
      const m = u.mark;
      if (!m) {
        sustained.unknown += u.amount;
      } else if (m.status === "sold") {
        sustained.soldConfirmed += u.amount;
      } else if (m.status === "held") {
        sustained.heldConfirmed += u.amount;
      } else {
        // 一部売却。残った割合だけが来年も入る
        const pct = Math.min(100, Math.max(0, m.remainingPct ?? 0));
        sustained.heldConfirmed += (u.amount * pct) / 100;
        sustained.soldConfirmed += (u.amount * (100 - pct)) / 100;
      }
    }
    sustained.expectedForward =
      sustained.matched + sustained.heldConfirmed + (unmatchedDefault === "include" ? sustained.unknown : 0);

    if (sustained.unknown > 0) {
      notes.push(
        unmatchedDefault === "include"
          ? `印を付けていない ${Math.round(sustained.unknown).toLocaleString("ja-JP")}円 は、保有し続けているものとして見込みに入れています。`
          : `印を付けていない ${Math.round(sustained.unknown).toLocaleString("ja-JP")}円 は見込みに入れていません。実際にはこれより増える可能性があります。`
      );
    }
    if (sustained.soldConfirmed > 0) {
      notes.push(
        `売却したと確認した ${Math.round(sustained.soldConfirmed).toLocaleString("ja-JP")}円 は、来年は入りません。`
      );
    }
  }

  const yieldOnTotal = opts.totalAssets > 0 ? (last12m / opts.totalAssets) * 100 : null;
  const yieldOnRisk = opts.riskAssets > 0 ? (last12m / opts.riskAssets) * 100 : null;

  if (yieldOnTotal !== null) {
    notes.push(
      "実効利回りは、分配を出さない投信やラップを含む総資産で割った数字です。配当を出す資産だけで見た利回りはこれより高くなります。"
    );
  }

  // 目標インカムに必要な元本（予想ではなく、いまと同じ構成のままの逆算）
  const targets = [10000, 30000, 50000, 100000].map((monthlyTarget) => {
    if (!yieldOnTotal || yieldOnTotal <= 0) {
      return { monthlyTarget, requiredPrincipal: null, additionalNeeded: null };
    }
    const requiredPrincipal = (monthlyTarget * 12) / (yieldOnTotal / 100);
    return {
      monthlyTarget,
      requiredPrincipal,
      additionalNeeded: Math.max(0, requiredPrincipal - opts.totalAssets),
    };
  });

  return {
    anchorDate: anchor.toISOString().slice(0, 10),
    last12m,
    prev12m,
    monthlyAvg: last12m / 12,
    byYear,
    byMonth,
    topContributors,
    byAccount,
    yieldOnTotal,
    yieldOnRisk,
    targets,
    allTime,
    recordCount: rows.length,
    sustained,
    notes,
  };
}

/** AI に渡すテキスト */
export function incomeToBriefing(inc: IncomeAnalysis): string {
  if (inc.recordCount === 0) return "";
  const YEN = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
  const lines: string[] = [];
  lines.push(`\n## インカム（配当・分配金の実測。円建て・税引後）`);
  lines.push(`- 直近12ヶ月（${inc.anchorDate} 基準）: ${YEN(inc.last12m)}（月あたり ${YEN(inc.monthlyAvg)}）`);
  lines.push(`- その前の12ヶ月: ${YEN(inc.prev12m)}（増減 ${inc.last12m >= inc.prev12m ? "+" : ""}${YEN(inc.last12m - inc.prev12m)}）`);
  if (inc.yieldOnTotal !== null) lines.push(`- 総資産に対する実効利回り: ${inc.yieldOnTotal.toFixed(2)}%`);
  if (inc.yieldOnRisk !== null) lines.push(`- 値動きする資産に対する実効利回り: ${inc.yieldOnRisk.toFixed(2)}%`);
  if (inc.topContributors.length > 0) {
    lines.push(`- 直近12ヶ月の主な出どころ: ${inc.topContributors.slice(0, 5).map((t) => `${t.name} ${YEN(t.amount)}`).join(" / ")}`);
  }
  if (inc.byAccount.length > 0) {
    lines.push(`- 口座別: ${inc.byAccount.map((a) => `${a.account} ${YEN(a.amount)}${a.taxFree ? "(非課税)" : ""}`).join(" / ")}`);
  }
  if (inc.sustained.checkable) {
    const s = inc.sustained;
    lines.push(`- 直近12ヶ月のうち、いまの保有で裏付けが取れるのは ${YEN(s.matched)}`);
    if (s.heldConfirmed > 0) lines.push(`- 本人が「まだ持っている」と確認したのは ${YEN(s.heldConfirmed)}`);
    if (s.soldConfirmed > 0) lines.push(`- 本人が「売却済み」と確認したのは ${YEN(s.soldConfirmed)}。この分は来年入らない`);
    if (s.unknown > 0) {
      lines.push(
        s.unmatchedDefault === "include"
          ? `- 印を付けていない ${YEN(s.unknown)} は保有し続けているものとして見込みに入れている`
          : `- まだ確認していない ${YEN(s.unknown)} は見込みに入れていない`
      );
    }
    lines.push(`- **来年も入ると見込めるのは ${YEN(s.expectedForward)}（月あたり ${YEN(s.expectedForward / 12)}）**`);
    const unconfirmed = s.unmatchedNames.filter((u) => !u.mark).slice(0, 5);
    if (unconfirmed.length > 0) {
      lines.push(`  - 未確認の銘柄: ${unconfirmed.map((u) => `${u.name} ${YEN(u.amount)}`).join(" / ")}`);
    }
  }
  lines.push(`- 記録全期間の累計: ${YEN(inc.allTime)}（${inc.recordCount}件）`);
  for (const n of inc.notes) lines.push(`- 注記: ${n}`);
  return lines.join("\n");
}
