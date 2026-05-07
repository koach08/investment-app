import { promises as fs } from "fs";
import path from "path";
import type { QuantAnalysis, RegimeAnalysis, StrategyProposal } from "./types";
import type { ScoringResult } from "./scoring-engine";

export interface QuantAudit {
  id: string;
  timestamp: string;
  ticker: string;
  name?: string;
  price: number;
  decision: ScoringResult;
  regime: RegimeAnalysis;
  quantSignals: QuantAnalysis["signals"];
  strategies: StrategyProposal[];
  outcome?: {
    exitPrice?: number;
    pnlPercent?: number;
    holdDays?: number;
    wasCorrect?: boolean;
    note?: string;
  };
}

const AUDIT_FILE = path.join(process.cwd(), "data", "quant-audits.json");
const MAX_ENTRIES = 1000;

async function readAudits(): Promise<QuantAudit[]> {
  try {
    const raw = await fs.readFile(AUDIT_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeAudits(audits: QuantAudit[]): Promise<void> {
  await fs.mkdir(path.dirname(AUDIT_FILE), { recursive: true });
  await fs.writeFile(AUDIT_FILE, JSON.stringify(audits.slice(-MAX_ENTRIES), null, 2), "utf-8");
}

export async function saveAudit(audit: Omit<QuantAudit, "id" | "timestamp">): Promise<QuantAudit> {
  const audits = await readAudits();
  const entry: QuantAudit = {
    ...audit,
    id: `${audit.ticker}-${Date.now()}`,
    timestamp: new Date().toISOString(),
  };
  audits.push(entry);
  await writeAudits(audits);
  return entry;
}

export async function getAudits(opts: { ticker?: string; limit?: number } = {}): Promise<QuantAudit[]> {
  const audits = await readAudits();
  let filtered = audits;
  if (opts.ticker) filtered = filtered.filter((a) => a.ticker === opts.ticker);
  return filtered.slice(-(opts.limit ?? 100)).reverse();
}

export async function recordOutcome(
  id: string,
  outcome: NonNullable<QuantAudit["outcome"]>
): Promise<boolean> {
  const audits = await readAudits();
  const target = audits.find((a) => a.id === id);
  if (!target) return false;
  target.outcome = outcome;
  await writeAudits(audits);
  return true;
}

export interface PerformanceSummary {
  totalDecisions: number;
  byAction: Record<string, number>;
  completedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPnlPercent: number;
}

export async function getPerformanceSummary(): Promise<PerformanceSummary> {
  const audits = await readAudits();
  const byAction: Record<string, number> = {};
  for (const a of audits) {
    const k = a.decision.action;
    byAction[k] = (byAction[k] ?? 0) + 1;
  }
  const completed = audits.filter((a) => a.outcome?.pnlPercent !== undefined);
  const wins = completed.filter((a) => (a.outcome?.pnlPercent ?? 0) > 0);
  const losses = completed.filter((a) => (a.outcome?.pnlPercent ?? 0) < 0);

  return {
    totalDecisions: audits.length,
    byAction,
    completedTrades: completed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: completed.length > 0 ? (wins.length / completed.length) * 100 : 0,
    avgPnlPercent:
      completed.length > 0
        ? completed.reduce((s, a) => s + (a.outcome?.pnlPercent ?? 0), 0) / completed.length
        : 0,
  };
}
