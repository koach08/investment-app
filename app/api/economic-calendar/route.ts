import { NextResponse } from "next/server";

// --- Japan ---
const JAPAN_SERIES: Record<string, string> = {
  "日本CPI（前年比）": "JPNCPIALLMINMEI",
  "日銀政策金利": "IRSTCI01JPM156N",
  "日本GDP成長率": "JPNRGDPEXP",
  "日本失業率": "LRHUTTTTJPM156S",
  "日本10年国債利回り": "IRLTLT01JPM156N",
  "日本鉱工業生産": "JPNPROINDMISMEI",
  "ドル円": "DEXJPUS",
  "日本M2マネーサプライ": "MYAGM2JPM189S",
};

// --- US ---
const US_SERIES: Record<string, string> = {
  "米CPI（前年比）": "CPIAUCSL",
  "米失業率": "UNRATE",
  "米GDP成長率": "A191RL1Q225SBEA",
  "FF金利": "FEDFUNDS",
  "米10年実質金利": "DFII10",
  "長短金利差(10Y-2Y)": "T10Y2Y",
  "M2マネーサプライ": "M2SL",
  "米PMI製造業": "MANEMP",
};

// --- Europe / Global ---
const GLOBAL_SERIES: Record<string, string> = {
  "ユーロ圏CPI": "CP0000EZ19M086NEST",
  "ECB政策金利": "ECBMRRFR",
  "ユーロ圏失業率": "LRHUTTTTEZM156S",
  "英国政策金利": "BOERUKM",
  "中国GDP成長率": "CHNRGDPEXP",
  "中国CPI": "CHNCPIALLMINMEI",
  "VIX恐怖指数": "VIXCLS",
  "WTI原油": "DCOILWTICO",
  "金価格": "GOLDAMGBD228NLBM",
};

const FRED_SERIES: Record<string, string> = {
  ...JAPAN_SERIES,
  ...US_SERIES,
  ...GLOBAL_SERIES,
};

interface FredObservation {
  name: string;
  seriesId: string;
  latestValue: string;
  previousValue: string;
  date: string;
  change: number;
  region?: string;
}

async function fetchFredSeries(
  seriesId: string,
  apiKey: string
): Promise<{ latestValue: string; previousValue: string; date: string; change: number } | null> {
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&sort_order=desc&limit=2&file_type=json`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json();
    const obs = data.observations;
    if (!obs || obs.length < 1) return null;

    const latest = obs[0].value === "." ? null : obs[0].value;
    const previous = obs.length > 1 && obs[1].value !== "." ? obs[1].value : null;

    if (!latest) return null;

    return {
      latestValue: latest,
      previousValue: previous || "N/A",
      date: obs[0].date,
      change: previous ? parseFloat(latest) - parseFloat(previous) : 0,
    };
  } catch {
    return null;
  }
}

const MOCK_DATA: FredObservation[] = [
  // Japan
  { name: "日本CPI（前年比）", seriesId: "JPNCPIALLMINMEI", latestValue: "2.8%", previousValue: "2.6%", date: "2024-12", change: 0.2, region: "japan" },
  { name: "日銀政策金利", seriesId: "IRSTCI01JPM156N", latestValue: "0.50%", previousValue: "0.25%", date: "2025-01", change: 0.25, region: "japan" },
  { name: "日本GDP成長率", seriesId: "JPNRGDPEXP", latestValue: "1.2%", previousValue: "0.9%", date: "2024-Q3", change: 0.3, region: "japan" },
  { name: "日本失業率", seriesId: "LRHUTTTTJPM156S", latestValue: "2.5%", previousValue: "2.4%", date: "2024-12", change: 0.1, region: "japan" },
  { name: "日本10年国債利回り", seriesId: "IRLTLT01JPM156N", latestValue: "1.05%", previousValue: "0.95%", date: "2025-01", change: 0.1, region: "japan" },
  { name: "日本鉱工業生産", seriesId: "JPNPROINDMISMEI", latestValue: "98.5", previousValue: "97.8", date: "2024-11", change: 0.7, region: "japan" },
  { name: "ドル円", seriesId: "DEXJPUS", latestValue: "149.50", previousValue: "148.20", date: "2025-02", change: 1.3, region: "japan" },
  { name: "日本M2マネーサプライ", seriesId: "MYAGM2JPM189S", latestValue: "1,230T", previousValue: "1,225T", date: "2024-12", change: 5, region: "japan" },
  // US
  { name: "米CPI（前年比）", seriesId: "CPIAUCSL", latestValue: "3.1%", previousValue: "3.4%", date: "2024-01", change: -0.3, region: "us" },
  { name: "米失業率", seriesId: "UNRATE", latestValue: "3.7%", previousValue: "3.7%", date: "2024-01", change: 0, region: "us" },
  { name: "米GDP成長率", seriesId: "A191RL1Q225SBEA", latestValue: "3.3%", previousValue: "4.9%", date: "2023-Q4", change: -1.6, region: "us" },
  { name: "FF金利", seriesId: "FEDFUNDS", latestValue: "5.33%", previousValue: "5.33%", date: "2024-01", change: 0, region: "us" },
  { name: "米10年実質金利", seriesId: "DFII10", latestValue: "1.82%", previousValue: "1.75%", date: "2024-02", change: 0.07, region: "us" },
  { name: "長短金利差(10Y-2Y)", seriesId: "T10Y2Y", latestValue: "-0.35%", previousValue: "-0.40%", date: "2024-02", change: 0.05, region: "us" },
  { name: "M2マネーサプライ", seriesId: "M2SL", latestValue: "20.9T", previousValue: "20.8T", date: "2024-01", change: 0.1, region: "us" },
  { name: "米PMI製造業", seriesId: "MANEMP", latestValue: "12,893", previousValue: "12,882", date: "2024-01", change: 11, region: "us" },
  // Global
  { name: "ユーロ圏CPI", seriesId: "CP0000EZ19M086NEST", latestValue: "2.8%", previousValue: "2.9%", date: "2024-01", change: -0.1, region: "global" },
  { name: "ECB政策金利", seriesId: "ECBMRRFR", latestValue: "4.50%", previousValue: "4.50%", date: "2024-01", change: 0, region: "global" },
  { name: "ユーロ圏失業率", seriesId: "LRHUTTTTEZM156S", latestValue: "6.4%", previousValue: "6.5%", date: "2024-01", change: -0.1, region: "global" },
  { name: "英国政策金利", seriesId: "BOERUKM", latestValue: "5.25%", previousValue: "5.25%", date: "2024-01", change: 0, region: "global" },
  { name: "中国GDP成長率", seriesId: "CHNRGDPEXP", latestValue: "5.2%", previousValue: "4.9%", date: "2023-Q4", change: 0.3, region: "global" },
  { name: "中国CPI", seriesId: "CHNCPIALLMINMEI", latestValue: "-0.8%", previousValue: "-0.5%", date: "2024-01", change: -0.3, region: "global" },
  { name: "VIX恐怖指数", seriesId: "VIXCLS", latestValue: "13.50", previousValue: "14.20", date: "2024-02", change: -0.7, region: "global" },
  { name: "WTI原油", seriesId: "DCOILWTICO", latestValue: "76.50", previousValue: "75.80", date: "2024-02", change: 0.7, region: "global" },
  { name: "金価格", seriesId: "GOLDAMGBD228NLBM", latestValue: "2,035", previousValue: "2,020", date: "2024-02", change: 15, region: "global" },
];

export async function GET() {
  const apiKey = process.env.FRED_API_KEY;
  const useMock = !apiKey || apiKey === "ここに入力";

  if (useMock) {
    return NextResponse.json({
      data: MOCK_DATA,
      isMock: true,
    });
  }

  const entries = Object.entries(FRED_SERIES);
  const results = await Promise.allSettled(
    entries.map(([, seriesId]) => fetchFredSeries(seriesId, apiKey))
  );

  // Determine region for each series
  const japanIds = new Set(Object.values(JAPAN_SERIES));
  const usIds = new Set(Object.values(US_SERIES));

  const data: FredObservation[] = entries.map(([name, seriesId], i) => {
    const region = japanIds.has(seriesId) ? "japan" : usIds.has(seriesId) ? "us" : "global";
    const result = results[i];
    if (result.status === "fulfilled" && result.value) {
      return { name, seriesId, ...result.value, region };
    }
    const mock = MOCK_DATA.find((m) => m.seriesId === seriesId);
    return mock || { name, seriesId, latestValue: "N/A", previousValue: "N/A", date: "", change: 0, region };
  });

  return NextResponse.json({ data, isMock: false });
}
