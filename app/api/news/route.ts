import { NextRequest, NextResponse } from "next/server";

// Google News RSS topics (aggregates from many sources: 日経, みんかぶ, Forbes, 東洋経済, Reuters, etc.)
const GOOGLE_NEWS_TOPICS: Record<string, string[]> = {
  japan: [
    "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtcGhHZ0pLVUNnQVAB?hl=ja&gl=JP&ceid=JP:ja",        // ビジネス（日本語）
    "https://news.google.com/rss/search?q=%E6%A0%AA%E5%BC%8F+%E6%97%A5%E7%B5%8C%E5%B9%B3%E5%9D%87+%E6%8A%95%E8%B3%87&hl=ja&gl=JP&ceid=JP:ja", // 株式 日経平均 投資
  ],
  global: [
    "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0JXVnVMV2RpR2dKSFFTZ0FQAQ?hl=en&gl=US&ceid=US:en",  // Business (EN)
    "https://news.google.com/rss/search?q=stock+market+economy+geopolitics&hl=en&gl=US&ceid=US:en",                                    // Markets + geopolitics
  ],
  us: [
    "https://news.google.com/rss/search?q=Wall+Street+S%26P500+Fed+economy&hl=en&gl=US&ceid=US:en",
  ],
  asia: [
    "https://news.google.com/rss/search?q=Asia+markets+China+India+economy&hl=en&gl=US&ceid=US:en",
  ],
};

const RSS_FEEDS: Record<string, string[]> = {
  global: [
    "https://feeds.bbci.co.uk/news/business/rss.xml",               // BBC Business
    "https://www.cnbc.com/id/100003114/device/rss/rss.html",        // CNBC World
    "https://www.investing.com/rss/news.rss",                       // Investing.com
    "https://www.ft.com/rss/home",                                   // Financial Times
    "https://feeds.reuters.com/reuters/businessNews",                // Reuters Business
    "https://www.economist.com/finance-and-economics/rss.xml",      // The Economist 金融・経済
    "https://www.economist.com/international/rss.xml",               // The Economist 国際
  ],
  japan: [
    "https://www3.nhk.or.jp/rss/news/cat6.xml",                     // NHK 経済
    "https://news.yahoo.co.jp/rss/topics/business.xml",             // Yahoo!ニュース 経済
    "https://rss.itmedia.co.jp/rss/2.0/business_articles.xml",      // ITmedia ビジネス
    "https://toyokeizai.net/list/feed/rss",                          // 東洋経済
    "https://www.nikkei.com/rss/nikkei/article.rdf",                // 日本経済新聞
    "https://jp.reuters.com/rssFeed/businessNews",                   // ロイター日本語
    "https://www.bloomberg.co.jp/feeds/sitemap_news.xml",            // Bloomberg Japan
  ],
  us: [
    "https://feeds.finance.yahoo.com/rss/2.0/headline",             // Yahoo Finance
    "https://feeds.marketwatch.com/marketwatch/topstories/",         // MarketWatch
    "https://www.cnbc.com/id/10001147/device/rss/rss.html",         // CNBC US Markets
    "https://feeds.bloomberg.com/markets/news.rss",                  // Bloomberg Markets
    "https://seekingalpha.com/market_currents.xml",                  // Seeking Alpha（アナリスト視点）
    "https://www.wsj.com/xml/rss/3_7085.xml",                       // Wall Street Journal Markets
  ],
  asia: [
    "https://www.scmp.com/rss/91/feed",                             // South China Morning Post
    "https://economictimes.indiatimes.com/rssfeedstopstories.cms",  // Economic Times India
    "https://asia.nikkei.com/rss/feed/nar",                          // Nikkei Asia（英語版日経）
  ],
  // 地政学・マクロ専用フィード（金融業界必須）
  geopolitical: [
    "https://www.aljazeera.com/xml/rss/all.xml",                    // Al Jazeera（中東情勢）
    "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",       // NYT World
    "https://feeds.bbci.co.uk/news/world/rss.xml",                  // BBC World
    "https://www.economist.com/the-world-this-week/rss.xml",        // Economist 今週の世界
  ],
};

interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  category: string;
}

function parseRSS(xml: string, source: string, category: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1];
    const title = content.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() || "";
    const link = content.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1]?.trim() || "";
    const pubDate = content.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() || "";

    if (title && link) {
      items.push({
        title: decodeHTMLEntities(title),
        url: link,
        source,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        category,
      });
    }
  }

  return items.slice(0, 10);
}

function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchRSS(url: string, source: string, category: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSS(xml, source, category);
  } catch {
    return [];
  }
}

async function fetchNewsAPI(query?: string, category?: string): Promise<NewsItem[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey || apiKey === "ここに入力") return [];

  try {
    let url: string;
    if (query) {
      url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=10&apiKey=${apiKey}`;
    } else {
      url = `https://newsapi.org/v2/top-headlines?category=business&language=en&pageSize=10&apiKey=${apiKey}`;
    }

    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) return [];
    const data = await res.json();

    return (data.articles || []).map((a: { title: string; url: string; source: { name: string }; publishedAt: string }) => ({
      title: a.title,
      url: a.url,
      source: a.source?.name || "NewsAPI",
      publishedAt: a.publishedAt,
      category: category || "global",
    }));
  } catch {
    return [];
  }
}

async function fetchGoogleNews(url: string, category: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: NewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const content = match[1];
      let title = content.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() || "";
      const link = content.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1]?.trim() || "";
      const pubDate = content.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() || "";

      // Google News format: "Title - Source Name"
      let source = "Google News";
      const dashIdx = title.lastIndexOf(" - ");
      if (dashIdx > 0) {
        source = title.substring(dashIdx + 3).trim();
        title = title.substring(0, dashIdx).trim();
      }

      if (title && link) {
        items.push({
          title: decodeHTMLEntities(title),
          url: link,
          source,
          publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          category,
        });
      }
    }
    return items.slice(0, 15);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  const category = request.nextUrl.searchParams.get("category") || "global";

  let allNews: NewsItem[] = [];

  if (ticker) {
    // Ticker-specific: Google News search + NewsAPI + RSS
    const gnUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(ticker)}&hl=ja&gl=JP&ceid=JP:ja`;
    const [gnItems, newsApiItems] = await Promise.all([
      fetchGoogleNews(gnUrl, "ticker"),
      fetchNewsAPI(ticker),
    ]);
    const rssPromises = Object.entries(RSS_FEEDS).flatMap(([cat, urls]) =>
      urls.map((url) => fetchRSS(url, extractSource(url), cat))
    );
    const rssResults = await Promise.allSettled(rssPromises);
    const rssNews = rssResults
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => (r as PromiseFulfilledResult<NewsItem[]>).value);

    const tickerLower = ticker.toLowerCase().replace(/\.[a-z]+$/i, "");
    const filteredRss = rssNews.filter(
      (n) => n.title.toLowerCase().includes(tickerLower)
    );

    allNews = [...gnItems, ...newsApiItems, ...filteredRss];
  } else {
    // Category-based: Google News topics + RSS feeds
    // For global/japan/us, also include geopolitical feeds (重要: 地政学リスクは投資判断に直結)
    const baseFeedUrls = RSS_FEEDS[category] || RSS_FEEDS.global;
    const geoFeeds = (category === "global" || category === "japan" || category === "us")
      ? (RSS_FEEDS.geopolitical || [])
      : [];
    const feedUrls = [...baseFeedUrls, ...geoFeeds];

    // Determine which Google News topics to fetch
    const gnTopics: string[] = GOOGLE_NEWS_TOPICS[category] || GOOGLE_NEWS_TOPICS.global || [];

    const [newsApiItems, ...gnResults] = await Promise.all([
      fetchNewsAPI(undefined, category),
      ...gnTopics.map((url) => fetchGoogleNews(url, category)),
    ]);

    const rssPromises = feedUrls.map((url) =>
      fetchRSS(url, extractSource(url), category)
    );
    const rssResults = await Promise.allSettled(rssPromises);
    const rssNews = rssResults
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => (r as PromiseFulfilledResult<NewsItem[]>).value);

    const gnNews = gnResults.flat();
    allNews = [...gnNews, ...newsApiItems, ...rssNews];
  }

  // Sort by date descending
  allNews.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  // Deduplicate by title
  const seen = new Set<string>();
  allNews = allNews.filter((n) => {
    const key = n.title.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({ news: allNews.slice(0, 30) });
}

function extractSource(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host.includes("bbc")) return "BBC";
    if (host.includes("reuters")) return "Reuters";
    if (host.includes("marketwatch")) return "MarketWatch";
    if (host.includes("cnbc")) return "CNBC";
    if (host.includes("investing.com")) return "Investing.com";
    if (host.includes("nhk")) return "NHK";
    if (host.includes("news.yahoo.co.jp")) return "Yahoo!ニュース";
    if (host.includes("yahoo")) return "Yahoo Finance";
    if (host.includes("itmedia")) return "ITmedia";
    if (host.includes("wor.jp") || host.includes("yomiuri")) return "読売新聞";
    if (host.includes("nikkei")) return "日経新聞";
    if (host.includes("toyokeizai")) return "東洋経済";
    if (host.includes("scmp")) return "SCMP";
    if (host.includes("economictimes")) return "Economic Times";
    if (host.includes("wsj")) return "WSJ";
    if (host.includes("ft.com")) return "Financial Times";
    if (host.includes("economist")) return "The Economist";
    if (host.includes("bloomberg")) return "Bloomberg";
    if (host.includes("seekingalpha")) return "Seeking Alpha";
    if (host.includes("aljazeera")) return "Al Jazeera";
    if (host.includes("nytimes")) return "NYT";
    if (host.includes("asia.nikkei")) return "Nikkei Asia";
    return host;
  } catch {
    return "RSS";
  }
}
