import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://azsxdc12310.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply({ message: "只接受 POST 請求" }, 405);

  const authorization = request.headers.get("Authorization");
  const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
  const publishableKey = publishableKeys.default ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!authorization || !publishableKey) return reply({ message: "請先登入" }, 401);

  const authResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: authorization },
  });
  if (!authResponse.ok) return reply({ message: "登入已逾期，請重新登入" }, 401);
  const user = await authResponse.json();

  const apiKey = Deno.env.get("TWELVE_DATA_API_KEY");
  if (!apiKey) return reply({ message: "尚未設定行情服務金鑰。請在 Supabase Edge Function Secrets 設定 TWELVE_DATA_API_KEY。" }, 503);

  let body: { symbols?: unknown };
  try { body = await request.json(); } catch { return reply({ message: "請求內容格式錯誤" }, 400); }
  if (!Array.isArray(body.symbols)) return reply({ message: "缺少股票清單" }, 400);

  const requested = body.symbols.filter((entry): entry is { symbol: string; market: string } =>
    entry && typeof entry.symbol === "string" && typeof entry.market === "string" &&
    /^[A-Z0-9.^-]{1,12}$/i.test(entry.symbol) && ["US", "TW"].includes(entry.market)
  );
  const ownershipHeaders = { apikey: publishableKey, Authorization: authorization };
  const userFilter = encodeURIComponent(`eq.${user.id}`);
  const [holdingsResponse, watchlistResponse] = await Promise.all([
    fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/holdings?select=symbol,market&user_id=${userFilter}`, { headers: ownershipHeaders }),
    fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/watchlist?select=symbol,market&user_id=${userFilter}`, { headers: ownershipHeaders }),
  ]);
  if (!holdingsResponse.ok || !watchlistResponse.ok) return reply({ message: "無法讀取你的股票清單" }, 403);
  const owned = [...await holdingsResponse.json(), ...await watchlistResponse.json()];
  const ownedKeys = new Set(owned.map((item: { symbol: string; market: string }) => `${item.market}:${item.symbol.toUpperCase()}`));
  const symbols = requested.filter(item => ownedKeys.has(`${item.market}:${item.symbol.toUpperCase()}`)).slice(0, 8);
  if (!symbols.length) return reply({ quotes: [], unavailable: [], source: "Twelve Data", updated_at: new Date().toISOString() });

  const results = await Promise.all(symbols.map(async ({ symbol, market }) => {
    const providerSymbol = market === "TW" ? `${symbol}:TWSE` : symbol.toUpperCase();
    const url = new URL("https://api.twelvedata.com/quote");
    url.searchParams.set("symbol", providerSymbol);
    url.searchParams.set("apikey", apiKey);
    try {
      const response = await fetch(url);
      const quote = await response.json();
      if (!response.ok || quote.status === "error" || !Number.isFinite(Number(quote.close))) {
        return { error: { symbol, market, message: quote.message ?? "此股票目前沒有可用報價" } };
      }
      return { quote: {
        symbol, market, price: Number(quote.close), percent_change: Number(quote.percent_change ?? 0),
        open: quote.open != null && Number.isFinite(Number(quote.open)) ? Number(quote.open) : null,
        high: quote.high != null && Number.isFinite(Number(quote.high)) ? Number(quote.high) : null,
        low: quote.low != null && Number.isFinite(Number(quote.low)) ? Number(quote.low) : null,
        previous_close: quote.previous_close != null && Number.isFinite(Number(quote.previous_close)) ? Number(quote.previous_close) : null,
        volume: quote.volume != null && Number.isFinite(Number(quote.volume)) ? Number(quote.volume) : null,
        quote_date: quote.datetime ?? null,
        timestamp: quote.last_quote_at ? new Date(Number(quote.last_quote_at) * 1000).toISOString() : new Date().toISOString(),
        market_open: Boolean(quote.is_market_open), source: "Twelve Data",
      } };
    } catch {
      return { error: { symbol, market, message: "行情服務暫時無法連線" } };
    }
  }));

  return reply({
    quotes: results.flatMap(result => result.quote ? [result.quote] : []),
    unavailable: results.flatMap(result => result.error ? [result.error] : []),
    truncated: requested.length > symbols.length,
    source: "Twelve Data（美股即時；台股依資料方案）",
    updated_at: new Date().toISOString(),
  });
});

