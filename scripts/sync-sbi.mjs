#!/usr/bin/env node
/**
 * local 専用 SBI 同期スクリプト.
 *
 * 動作:
 *  1. .env.local から SBI_USER_ID / SBI_PASSWORD 読込
 *  2. Playwright で SBI にログイン → 保有銘柄取得
 *  3. data/sbi-holdings.json に書き出し
 *  4. git add/commit/push (Vercel が再 deploy → 最新データ反映)
 *
 * 使い方:
 *  node scripts/sync-sbi.mjs
 *
 * cron 登録例 (毎朝 9:00 JST):
 *  0 9 * * * cd ~/investment-app && /usr/local/bin/node scripts/sync-sbi.mjs >> ~/.sbi-sync.log 2>&1
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// .env.local 読込
function loadEnv() {
  const envFile = join(ROOT, ".env.local");
  if (!existsSync(envFile)) {
    console.error("[sync-sbi] .env.local not found");
    process.exit(1);
  }
  const content = readFileSync(envFile, "utf-8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

loadEnv();

const userId = process.env.SBI_USER_ID;
const password = process.env.SBI_PASSWORD;
if (!userId || !password) {
  console.error("[sync-sbi] SBI_USER_ID / SBI_PASSWORD 未設定");
  process.exit(1);
}

// TS scraper を直接 import するため tsx 経由で呼ぶ (Node native ESM では .ts 不可)
// もしくは事前ビルドの JS を使う。シンプル化: child_process で tsx を呼ぶ
const tsxScript = `
import { scrapeSBI } from "${join(ROOT, "lib/scrapers/sbi.ts").replace(/\\/g, "/")}";
const result = await scrapeSBI(process.env.SBI_USER_ID, process.env.SBI_PASSWORD);
console.log(JSON.stringify(result));
`;

const tmpScript = join(ROOT, "scripts/.sync-sbi-runner.mjs");
writeFileSync(tmpScript, tsxScript);

let result;
try {
  const stdout = execSync(`npx tsx "${tmpScript}"`, {
    cwd: ROOT,
    env: process.env,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
  result = JSON.parse(stdout.trim().split("\n").pop());
} catch (e) {
  console.error("[sync-sbi] scrape 失敗:", e.message);
  process.exit(1);
}

// 出力
const dataDir = join(ROOT, "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
const outPath = join(dataDir, "sbi-holdings.json");
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`[sync-sbi] saved ${result.holdings.length} holdings to ${outPath}`);
console.log(`[sync-sbi] totalAssets: ¥${result.totalAssets?.toLocaleString() ?? "?"}`);

// git commit + push (失敗しても script 全体は成功とみなす)
try {
  execSync("git add data/sbi-holdings.json", { cwd: ROOT, stdio: "pipe" });
  const status = execSync("git status --porcelain data/sbi-holdings.json", { cwd: ROOT, encoding: "utf-8" }).trim();
  if (!status) {
    console.log("[sync-sbi] no changes to commit");
  } else {
    execSync(`git commit -m "chore: SBI holdings update ${new Date().toISOString()}" --no-verify`, { cwd: ROOT, stdio: "pipe" });
    execSync("git push origin main", { cwd: ROOT, stdio: "pipe" });
    console.log("[sync-sbi] pushed to GitHub");
  }
} catch (e) {
  console.error("[sync-sbi] git push 失敗 (continue anyway):", e.message);
}

// 一時 runner 削除
try { execSync(`rm "${tmpScript}"`); } catch { /* ignore */ }
