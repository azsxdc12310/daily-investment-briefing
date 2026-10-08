import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
const PUBLISHABLE_KEY = publishableKeys.default ?? Deno.env.get("SUPABASE_ANON_KEY");
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://azsxdc12310.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
function taipeiDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function publishedAt(value: string) {
  const match = value?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z` : new Date().toISOString();
}
async function getArticles(query: string, market: string, related?: { symbol: string; company: string }) {
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("timespan", "24h");
  url.searchParams.set("maxrecords", related ? "4" : "6");
  url.searchParams.set("sort", "hybridrel");
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data.articles)) return [];
    return data.articles.map((article: Record<string, unknown>) => ({
      title: String(article.title ?? "").slice(0, 240),
      url: String(article.url ?? ""),
      source: String(article.domain ?? article.sourcecountry ?? "新聞來源").slice(0, 100),
      language: String(article.language ?? ""),
      market,
      published_at: publishedAt(String(article.seendate ?? "")),
      related_symbol: related?.symbol ?? null,
      related_company: related?.company ?? null,
    })).filter((article: { title: string; url: string }) => article.title && /^https?:\/\//.test(article.url));
  } catch {
    return [];
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply({ message: "只接受 POST 請求" }, 405);
  const authorization = request.headers.get("Authorization");
  if (!authorization || !PUBLISHABLE_KEY) return reply({ message: "請先登入" }, 401);
  const authResponse = await fetch(`${PROJECT_URL}/auth/v1/user`, {
    headers: { apikey: PUBLISHABLE_KEY, Authorization: authorization },
  });
  if (!authResponse.ok) return reply({ message: "登入已逾期，請重新登入" }, 401);
  const user = await authResponse.json();

  const headers = { apikey: PUBLISHABLE_KEY, Authorization: authorization };
  const date = taipeiDate();
  const url = new URL(`${PROJECT_URL}/rest/v1/daily_briefs`);
  url.searchParams.set("select", "id,title,summary,brief_date,market_data,created_at");
  url.searchParams.set("user_id", `eq.${user.id}`);
  url.searchParams.set("brief_date", `eq.${date}`);
  url.searchParams.set("limit", "1");
  const cachedResponse = await fetch(url, { headers });
  if (!cachedResponse.ok) return reply({ message: "無法讀取每日簡報資料" }, 403);
  const cached = await cachedResponse.json();
  let force = false;
  try { force = Boolean((await request.json()).force); } catch { /* an empty body means use today's cache */ }
  if (!force && cached.length && Array.isArray(cached[0].market_data?.articles)) {
    return reply({ brief: cached[0], cached: true });
  }

  const holdingsUrl = new URL(`${PROJECT_URL}/rest/v1/holdings`);
  holdingsUrl.searchParams.set("select", "market,symbol,company");
  const watchlistUrl = new URL(`${PROJECT_URL}/rest/v1/watchlist`);
  watchlistUrl.searchParams.set("select", "market,symbol,company");
  const [holdingsResponse, watchlistResponse] = await Promise.all([
    fetch(holdingsUrl, { headers }), fetch(watchlistUrl, { headers }),
  ]);
  if (!holdingsResponse.ok || !watchlistResponse.ok) return reply({ message: "無法讀取持股與觀察清單" }, 403);
  const holdings = await holdingsResponse.json();
  const watchlist = await watchlistResponse.json();
  const uniqueStocks = new Map<string, { market: string; symbol: string; company: string; held: boolean }>();
  for (const item of [...holdings, ...watchlist] as { market: string; symbol: string; company: string }[]) {
    const symbol = item.symbol.toUpperCase();
    const key = `${item.market}:${symbol}`;
    const held = holdings.some((holding: { market: string; symbol: string }) => holding.market === item.market && holding.symbol.toUpperCase() === symbol);
    uniqueStocks.set(key, { market: item.market, symbol, company: item.company, held });
  }
  const allStocks = [...uniqueStocks.values()].slice(0, 6);

  const searches: Promise<Record<string, unknown>[]>[] = [
    getArticles('(Taiwan stocks OR TAIEX OR TSMC OR MediaTek) sourcecountry:taiwan', "TW"),
    getArticles('("US stocks" OR "Wall Street" OR "Federal Reserve" OR "stock earnings") sourcecountry:unitedstates', "US"),
  ];
  const knownTerms: Record<string, string> = {
    "2330": "TSMC OR Taiwan Semiconductor", "2317": "Foxconn OR Hon Hai",
    "2454": "MediaTek", "2308": "Delta Electronics", "0050": "Taiwan 50 ETF",
  };
  for (const stock of allStocks) {
    const company = String(stock.company ?? "").trim();
    const term = stock.market === "TW"
      ? (knownTerms[stock.symbol] ?? (/^[\x00-\x7F]+$/.test(company) ? company : ""))
      : company;
    if (!term || term.length < 2) continue;
    const safeTerm = term.replace(/["()]/g, " ").slice(0, 100).trim();
    searches.push(getArticles(`"${safeTerm}"`, stock.market, { symbol: stock.symbol, company }));
  }
  const resultSets = await Promise.all(searches);
  const allArticles = resultSets.flat();
  const seen = new Set<string>();
  const articles = allArticles.filter((item) => {
    const key = String(item.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => String(b.published_at).localeCompare(String(a.published_at))).slice(0, 12);

  const stocks = allStocks.map((stock) => {
    const related = allArticles.filter((article) => article.related_symbol === stock.symbol && article.market === stock.market);
    return {
      ...stock, news_count: related.length,
      latest_headline: related[0]?.title ?? null,
      latest_url: related[0]?.url ?? null,
    };
  });
  const summary = articles.length
    ? `近 24 小時彙整 ${articles.length} 則台股、美股與自選持股相關新聞；${stocks.filter((stock) => stock.held && stock.news_count).length} 檔持股找到相關報導。請先核對原文、公告與數據，再評估對投資假設的影響。`
    : "近 24 小時暫時沒有取得可用新聞。可稍後重新整理，並查看持股公司的官方公告。";
  const marketData = { articles, stocks, source: "GDELT", updated_at: new Date().toISOString() };
  const row = { user_id: user.id, brief_date: date, title: "今日市場新聞與持股分析", summary, market_data: marketData };
  const saveUrl = new URL(`${PROJECT_URL}/rest/v1/daily_briefs`);
  saveUrl.searchParams.set("on_conflict", "user_id,brief_date");
  const saveResponse = await fetch(saveUrl, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  });
  if (!saveResponse.ok) return reply({ message: "簡報已整理，但無法儲存到每日資料表" }, 502);
  const saved = await saveResponse.json();
  return reply({ brief: saved[0] ?? row, cached: false });
});
