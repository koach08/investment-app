/**
 * On-chain ウォレット残高取得 (read-only, JSON-RPC).
 *
 * 必要なのはウォレットアドレス (0x...) のみ。public 情報なので安全。
 * 秘密鍵/シードフレーズは絶対に受け取らない/扱わない。
 *
 * 対応:
 *  - Ethereum mainnet ETH 残高
 *  - 主要 ERC20 (USDT, USDC, WBTC, etc) 残高
 *  - JPY 換算 (CoinGecko 価格)
 */

const ETH_RPC = process.env.ETH_RPC_URL ?? "https://eth.llamarpc.com";

interface TokenInfo {
  symbol: string;
  contract: string;
  decimals: number;
  /** CoinGecko ID (価格取得用) */
  coingeckoId: string;
}

// 主要 ERC20 トークン
const TOKENS: TokenInfo[] = [
  { symbol: "USDT", contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, coingeckoId: "tether" },
  { symbol: "USDC", contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, coingeckoId: "usd-coin" },
  { symbol: "WBTC", contract: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8, coingeckoId: "wrapped-bitcoin" },
  { symbol: "LINK", contract: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18, coingeckoId: "chainlink" },
];

/** JSON-RPC call */
async function rpc<T = unknown>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(ETH_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`RPC ${method} HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC ${method} error: ${JSON.stringify(json.error)}`);
  return json.result as T;
}

/** hex → number (wei → ether 換算) */
function fromWei(hex: string, decimals = 18): number {
  if (!hex || hex === "0x0") return 0;
  const big = BigInt(hex);
  const divisor = BigInt(10) ** BigInt(decimals);
  const integer = big / divisor;
  const remainder = big % divisor;
  const fractional = Number(remainder) / Number(divisor);
  return Number(integer) + fractional;
}

/** ETH 残高 */
async function fetchEthBalance(address: string): Promise<number> {
  const hex = await rpc<string>("eth_getBalance", [address, "latest"]);
  return fromWei(hex, 18);
}

/** ERC20 残高 (balanceOf(address)) */
async function fetchTokenBalance(address: string, token: TokenInfo): Promise<number> {
  // ABI: balanceOf(address) → uint256
  // function selector: 0x70a08231
  // arg: address padded to 32 bytes
  const data = "0x70a08231" + address.replace(/^0x/, "").padStart(64, "0").toLowerCase();
  const hex = await rpc<string>("eth_call", [{ to: token.contract, data }, "latest"]);
  return fromWei(hex, token.decimals);
}

/** CoinGecko 価格取得 (JPY 換算) */
async function fetchPricesJPY(coingeckoIds: string[]): Promise<Record<string, number>> {
  const ids = coingeckoIds.join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=jpy`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return {};
  const data = await res.json();
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = (v as { jpy?: number }).jpy ?? 0;
  }
  return out;
}

export interface WalletBalance {
  address: string;
  eth: { amount: number; jpyValue: number };
  tokens: { symbol: string; amount: number; jpyValue: number }[];
  totalJPY: number;
  fetchedAt: string;
}

export async function fetchWalletBalance(address: string): Promise<WalletBalance> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("不正なウォレットアドレス形式 (0x...40文字)");
  }
  const normalized = address.toLowerCase();

  // 並列取得
  const ethBalP = fetchEthBalance(normalized);
  const tokenBalsP = Promise.all(TOKENS.map(t => fetchTokenBalance(normalized, t).catch(() => 0)));
  const pricesP = fetchPricesJPY(["ethereum", ...TOKENS.map(t => t.coingeckoId)]);

  const [ethBal, tokenBals, prices] = await Promise.all([ethBalP, tokenBalsP, pricesP]);

  const ethJpy = (prices.ethereum ?? 0) * ethBal;
  const tokens = TOKENS.map((t, i) => {
    const amount = tokenBals[i];
    const price = prices[t.coingeckoId] ?? 0;
    return { symbol: t.symbol, amount, jpyValue: amount * price };
  }).filter(t => t.amount > 0); // 残高ある token のみ

  const totalJPY = ethJpy + tokens.reduce((s, t) => s + t.jpyValue, 0);

  return {
    address: normalized,
    eth: { amount: ethBal, jpyValue: ethJpy },
    tokens,
    totalJPY,
    fetchedAt: new Date().toISOString(),
  };
}
