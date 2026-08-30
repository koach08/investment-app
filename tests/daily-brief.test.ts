import { test } from "node:test";
import assert from "node:assert/strict";
import { dayKey, ageHours, isStale, LATEST_KEY } from "@/lib/daily-brief";
import { safeKey } from "@/lib/kv";

test("日付キーは JST で切る", () => {
  // UTC 2026-08-28 22:00 は JST では 2026-08-29 07:00
  assert.equal(dayKey(new Date("2026-08-28T22:00:00Z")), "daily-brief-2026-08-29");
  // UTC 2026-08-28 14:00 は JST 23:00 で同じ日
  assert.equal(dayKey(new Date("2026-08-28T14:00:00Z")), "daily-brief-2026-08-28");
  // UTC 15:00 で日付が変わる
  assert.equal(dayKey(new Date("2026-08-28T15:00:00Z")), "daily-brief-2026-08-29");
});

test("月末・年末をまたぐ", () => {
  assert.equal(dayKey(new Date("2026-12-31T15:00:00Z")), "daily-brief-2027-01-01");
  assert.equal(dayKey(new Date("2026-01-31T15:00:00Z")), "daily-brief-2026-02-01");
});

test("キーは save-data の正規化を通しても変わらない", () => {
  // ハイフンと英数字だけなので落ちない。ここがずれると読み書きで別キーになる
  assert.equal(safeKey(LATEST_KEY), LATEST_KEY);
  const k = dayKey(new Date("2026-08-29T00:00:00Z"));
  assert.equal(safeKey(k), k);
});

test("正規化は使えない文字を落とす", () => {
  assert.equal(safeKey("a/b c:d"), "abcd");
  assert.equal(safeKey("daily-brief_2026"), "daily-brief_2026");
});

test("経過時間を出す", () => {
  const now = Date.parse("2026-08-29T12:00:00Z");
  assert.equal(ageHours("2026-08-29T12:00:00Z", now), 0);
  assert.equal(ageHours("2026-08-29T09:00:00Z", now), 3);
  assert.equal(ageHours("こわれた日付", now), null);
});

test("24時間を超えたら古い扱い", () => {
  const now = Date.parse("2026-08-29T12:00:00Z");
  assert.equal(isStale("2026-08-29T09:00:00Z", now), false);
  assert.equal(isStale("2026-08-28T12:00:00Z", now), false); // ちょうど24時間はまだ古くない
  assert.equal(isStale("2026-08-28T11:00:00Z", now), true);
  assert.equal(isStale("こわれた日付", now), true, "読めない日付は古い扱いにして黙って新しく見せない");
});

import { hasFatalGap, REQUIRED_INPUTS } from "@/lib/brief-inputs";

test("必須の材料が揃っていれば生成してよい", () => {
  assert.equal(hasFatalGap({ indices: [1], news: [1] }), false);
});

test("指数かニュースが空なら生成しない", () => {
  assert.equal(hasFatalGap({ indices: [], news: [1] }), true, "指数が空");
  assert.equal(hasFatalGap({ indices: [1], news: [] }), true, "ニュースが空");
  assert.equal(hasFatalGap({ indices: [1] }), true, "ニュースが無い");
  assert.equal(hasFatalGap({}), true, "どちらも無い");
});

test("任意の材料が欠けても生成は止めない", () => {
  assert.equal(
    hasFatalGap({ indices: [1], news: [1], fedTone: null, jpxStats: null, holdings: undefined }),
    false
  );
});

test("必須の材料は指数とニュースの2つ", () => {
  assert.deepEqual([...REQUIRED_INPUTS], ["indices", "news"]);
});

import { signalsNeedingAction, type SignalSnapshot } from "@/lib/signal-check";
import { TREND_TARGETS } from "@/lib/trend-targets";

const sig = (o: Partial<SignalSnapshot> = {}): SignalSnapshot => ({
  ticker: "VTI",
  label: "VTI",
  state: "invested",
  asOf: "2026-08",
  gapPct: 5,
  monthsInState: 1,
  changedThisMonth: false,
  gapCount: 0,
  ...o,
});

test("変化が無ければ発注は要らない", () => {
  assert.deepEqual(signalsNeedingAction([sig(), sig({ ticker: "VOO" })]), []);
});

test("今月変わったものだけ拾う", () => {
  const a = sig({ ticker: "VTI", changedThisMonth: true });
  const b = sig({ ticker: "VOO" });
  assert.deepEqual(signalsNeedingAction([a, b]).map((x) => x.ticker), ["VTI"]);
});

test("月が飛んでいる銘柄は、変化していても数字を信用せず外す", () => {
  const a = sig({ changedThisMonth: true, gapCount: 3 });
  assert.deepEqual(signalsNeedingAction([a]), []);
});

test("取得に失敗した銘柄も外す", () => {
  const a = sig({ changedThisMonth: true, error: "Yahoo 500" });
  assert.deepEqual(signalsNeedingAction([a]), []);
});

test("対象は3本。API と cron が同じ定義を見る", () => {
  assert.deepEqual(TREND_TARGETS.map((t) => t.ticker), ["VTI", "VOO", "VT"]);
});
