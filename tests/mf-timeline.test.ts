import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseMFTimelineCsv, parseAmount, splitCsvLine, normalizeDate, looksLikeMFTimeline,
} from "@/lib/mf-timeline";

/** マネーフォワードが実際に書き出す並び。信用の列が無く、ポイントは後ろの方 */
const MF_HEADER =
  "日付,合計（円）,預金・現金・暗号資産（円）,株式(現物)（円）,投資信託（円）,債券（円）,FX（円）,保険（円）,不動産（円）,年金（円）,ポイント（円）,その他の資産（円）";

test("実際の並びで、投資信託が投資信託に入る", () => {
  const r = parseMFTimelineCsv([
    MF_HEADER,
    "2026/03/09,24390984,7553126,6119223,10226327,0,0,0,0,0,478053,0",
  ]);
  assert.equal(r.timeline.length, 1);
  const t = r.timeline[0];
  assert.equal(t.date, "2026/03/09");
  assert.equal(t.total, 24390984);
  assert.equal(t.cash, 7553126);
  assert.equal(t.stocks, 6119223);
  assert.equal(t.funds, 10226327, "投資信託が funds に入る（位置で読むと margin に落ちる）");
  assert.equal(t.points, 478053, "ポイントが points に入る（位置で読むと FX が入る）");
  assert.equal(t.margin, 0, "信用の列が無いので0");
});

test("債券・FX・保険・不動産・年金・その他は other にまとめる", () => {
  const r = parseMFTimelineCsv([
    MF_HEADER,
    "2026/03/09,1000,0,0,0,10,20,30,40,50,0,100",
  ]);
  assert.equal(r.timeline[0].other, 250);
  assert.deepEqual(r.pooledIntoOther, [
    "債券（円）", "FX（円）", "保険（円）", "不動産（円）", "年金（円）", "その他の資産（円）",
  ]);
});

test("列名から割り当て先が分かる", () => {
  const r = parseMFTimelineCsv([MF_HEADER, "2026/03/09,1,2,3,4,5,6,7,8,9,10,11"]);
  assert.equal(r.mapping["合計（円）"], "total");
  assert.equal(r.mapping["投資信託（円）"], "funds");
  assert.equal(r.mapping["ポイント（円）"], "points");
  assert.equal(r.mapping["債券（円）"], "other");
});

test("信用の列がある並びでも正しく入る", () => {
  const r = parseMFTimelineCsv([
    "日付,合計,預金・現金,株式,信用,投資信託,ポイント,その他",
    "2020/02/29,10683731,10681148,0,0,0,2583,0",
  ]);
  const t = r.timeline[0];
  assert.equal(t.cash, 10681148);
  assert.equal(t.margin, 0);
  assert.equal(t.points, 2583);
});

test("日付で並べ替える", () => {
  const r = parseMFTimelineCsv([
    MF_HEADER,
    "2026/03/09,3,0,0,0,0,0,0,0,0,0,0",
    "2020/02/29,1,0,0,0,0,0,0,0,0,0,0",
    "2023/01/31,2,0,0,0,0,0,0,0,0,0,0",
  ]);
  assert.deepEqual(r.timeline.map((t) => t.total), [1, 2, 3]);
});

test("日付として読めない行は飛ばして数える", () => {
  const r = parseMFTimelineCsv([
    MF_HEADER,
    "合計,,,,,,,,,,,",
    "2026/03/09,1,0,0,0,0,0,0,0,0,0,0",
    "こわれた行",
  ]);
  assert.equal(r.timeline.length, 1);
  assert.equal(r.skipped, 2);
});

test("ハイフン区切りの日付も読み、スラッシュに揃える", () => {
  assert.equal(normalizeDate("2026-03-09"), "2026/03/09");
  assert.equal(normalizeDate("2026/3/9"), "2026/03/09");
  assert.equal(normalizeDate("2026/13/01"), null);
  assert.equal(normalizeDate("2026/03/32"), null);
  assert.equal(normalizeDate("こわれた"), null);
});

test("カンマ入り・全角・円記号の金額を読む", () => {
  assert.equal(parseAmount("24,390,984"), 24390984);
  assert.equal(parseAmount("￥1,000"), 1000);
  assert.equal(parseAmount("１２３"), 123);
  assert.equal(parseAmount("-5,000"), -5000);
  assert.equal(parseAmount(""), 0);
  assert.equal(parseAmount("なし"), 0);
  assert.equal(parseAmount(undefined), 0);
});

test("引用符でくくられた列を読む", () => {
  assert.deepEqual(splitCsvLine('"2026/03/09","1,000","a,b"'), ["2026/03/09", "1,000", "a,b"]);
  assert.deepEqual(splitCsvLine('a,b,c'), ["a", "b", "c"]);
});

test("資産推移CSVかどうかを見分ける", () => {
  assert.equal(looksLikeMFTimeline(MF_HEADER), true);
  assert.equal(looksLikeMFTimeline("銘柄コード,買付日,数量,取得単価"), false);
  assert.equal(looksLikeMFTimeline("日付,合計"), false, "預金/現金が無ければ違う");
});

test("空のCSVは空を返す", () => {
  assert.deepEqual(parseMFTimelineCsv([]).timeline, []);
  assert.deepEqual(parseMFTimelineCsv([MF_HEADER]).timeline, []);
});
