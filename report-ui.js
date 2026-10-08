(() => {
  const fixedTrackers = [
    ["0050", "元大台灣50"], ["00635U", "元大黃金期貨ETF"], ["00935", "野村台灣創新科技50"],
    ["2308", "台達電"], ["2330", "台積電"], ["2345", "智邦"], ["2374", "佳能"],
    ["2727", "王品"], ["2885", "元大金"], ["2890", "永豐金"], ["2891", "中信金"],
    ["3293", "鈊象"], ["6669", "緯穎"], ["3105", "穩懋（空單狀態待核）"]
  ].map(([symbol, company]) => ({symbol, company}));
  const dateFmt = new Intl.DateTimeFormat("zh-TW", {year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Taipei"});
  const moneyFmt = (v, market) => money(v, market === "TW" || market === "TWD" ? "TWD" : "USD");
  const num = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
  const esc = (v) => safe(v ?? "");
  const byMarketSymbol = (list, market, symbol) => list.find(x => (x.market || "US") === market && x.symbol?.toUpperCase() === symbol.toUpperCase());

  function newsFor(market, symbol, articles) {
    return articles.find(a => a.market === market && a.related_symbol?.toUpperCase() === symbol.toUpperCase()) || null;
  }
  function statusText(item, held) {
    if (held) return item.current == null ? "持有 · 行情待核" : "持有 · 依帳戶紀錄";
    return "等待 · 觀察清單，不是持股";
  }
  function quoteRange(item) {
    const low = num(item.low), high = num(item.high);
    if (low == null || high == null) return "未取得可靠的當日高低價";
    const market = item.market === "TW" ? "TW" : "US";
    return `${moneyFmt(low, market)}–${moneyFmt(high, market)}（行情來源當日低／高）`;
  }
  function holdingRows(articles) {
    if (!holdings.length) return '<tr><td colspan="7" class="report-muted">帳戶目前沒有已登錄持股。請先新增持股；自選清單不會列為持股。</td></tr>';
    return holdings.map(h => {
      const market = h.market || "US", currency = market === "TW" ? "TWD" : "USD";
      const price = num(h.current), cost = num(h.average_cost), shares = num(h.shares) || 0;
      const pnl = price == null || cost == null ? null : (price - cost) * shares;
      const pnlPct = pnl == null || !cost || !shares ? null : pnl / (cost * shares) * 100;
      const change = num(h.day_change), related = newsFor(market, h.symbol, articles);
      const reason = [
        price == null ? "行情未取得，損益與價格條件待核。" :
          `帳戶記錄 ${shares.toLocaleString("en-US")} 股；相對成本 ${moneyFmt(cost, market)} ${pnl == null ? "未計算" : `${pnl >= 0 ? "上漲" : "下跌"} ${moneyFmt(Math.abs(pnl), currency)}（${pnlPct == null ? "—" : pnlPct.toFixed(2) + "%"}）`}。`,
        change != null && Math.abs(change) >= 3 ? `單日變動 ${change >= 0 ? "+" : ""}${change.toFixed(2)}%，先核對公告與波動原因。` : "",
        related ? "有關聯新聞，請開啟原文核實事件與發布日。" : "近 24 小時新聞彙整未找到明確關聯報導。"
      ].filter(Boolean).join(" ");
      const level = price == null ? "不提供價格區間" : quoteRange(h);
      const trigger = price == null ? "行情到齊後再設條件；不猜買賣點。" :
        "僅觀察收盤能否站上當日高點並於下一交易日守穩；當日高低不是估值或中長期支撐壓力。";
      const invalid = price == null ? "待取得行情與交易紀錄。" :
        "若收盤跌破當日低點，重新檢視假設；此處不是自動停損指令。";
      const quoteDate = h.quote_time ? dateFmt.format(new Date(h.quote_time)) : "未取得";
      const cap = "未提供總資產與風險預算，不虛構部位上限。";
      return `<tr>
        <td><strong>${esc(h.symbol)} · ${esc(h.company)}</strong><small>${market === "TW" ? "台股" : "美股"} · ${statusText(h, true)}</small></td>
        <td>${price == null ? "—" : moneyFmt(price, currency)}<small>${change == null ? "漲跌待核" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`} · ${esc(quoteDate)}</small></td>
        <td>${esc(reason)}</td><td>${esc(level)}</td><td>${esc(trigger)}</td><td>${esc(invalid)}</td><td>${esc(cap)}</td>
      </tr>`;
    }).join("");
  }
  function trackerRows(articles) {
    const userWatch = ideas.filter(i => (i.market || "US") === "TW");
    const rows = fixedTrackers.map(t => {
      const h = byMarketSymbol(holdings, "TW", t.symbol);
      const w = byMarketSymbol(userWatch, "TW", t.symbol);
      const item = h || w;
      const news = newsFor("TW", t.symbol, articles);
      const price = item ? num(item.current) : null;
      const change = item ? num(item.day_change) : null;
      const status = t.symbol === "3105"
        ? "只追蹤代號；放空是否在倉待最新成交紀錄確認"
        : h ? "帳戶持股" : w ? "自選觀察" : "固定追蹤 · 尚未加入自選";
      const quote = price == null ? "尚無可顯示報價" : `${moneyFmt(price, "TW")}${change == null ? "" : `（${change >= 0 ? "+" : ""}${change.toFixed(2)}%）`}`;
      const add = !item && t.symbol !== "3105" ? `<button class="report-add-tracker" type="button" data-add-tracker="${esc(t.symbol)}">加入自選</button>` : "";
      return `<tr><td><strong>${esc(t.symbol)} · ${esc(t.company)}</strong></td><td>${esc(status)}</td><td>${esc(quote)}${item?.quote_time ? `<small>${esc(dateFmt.format(new Date(item.quote_time)))}</small>` : ""}</td><td>${news ? `<a href="${esc(news.url)}" target="_blank" rel="noopener noreferrer">${esc(news.title)}</a>` : "近 24 小時未找到明確關聯新聞"}</td><td>${add}</td></tr>`;
    });
    return rows.join("");
  }
  function topFocus(articles) {
    const pool = [...holdings.map(x => ({...x, held:true})), ...ideas.map(x => ({...x, held:false}))];
    const unique = new Map();
    for (const item of pool) {
      const key = `${item.market || "US"}:${item.symbol}`;
      if (!unique.has(key)) unique.set(key, item);
    }
    const ranked = [...unique.values()].map(item => {
      const news = newsFor(item.market || "US", item.symbol, articles);
      return {...item, news, score:(news ? 2 : 0) + Math.min(Math.abs(num(item.day_change) || 0), 5) / 5};
    }).filter(x => x.news || x.current != null).sort((a,b) => b.score-a.score).slice(0,3);
    if (!ranked.length) return '<p class="report-muted">目前沒有足夠的已核實報價或關聯新聞，今天不硬選焦點股或新增觀察股。</p>';
    return `<div class="report-focus-grid">${ranked.map(x => `<article><span>${x.held ? "帳戶持股" : "自選觀察"} · 依新聞／當日波動排序</span><h4>${esc(x.symbol)} · ${esc(x.company)}</h4><p>${x.news ? esc(x.news.title) : "未取得關聯新聞；僅有行情變動資料。"} ${x.current == null ? "" : `目前報價 ${moneyFmt(x.current, x.market || "US")}`}</p>${x.news ? `<a href="${esc(x.news.url)}" target="_blank" rel="noopener noreferrer">開啟來源</a>` : ""}<small>不是基本面或估值篩選結果，不構成買入建議。</small></article>`).join("")}</div>`;
  }
  function exposureSummary() {
    if (!holdings.length) return '<p class="report-muted">沒有已登錄持股，無法計算組合集中度或曝險。</p>';
    const totals = {};
    for (const h of holdings) {
      const market = h.market || "US", ccy = market === "TW" ? "TWD" : "USD";
      totals[ccy] ||= {value:0, priced:0, total:0};
      totals[ccy].total++;
      if (num(h.current) != null) { totals[ccy].value += num(h.current) * (num(h.shares) || 0); totals[ccy].priced++; }
    }
    const parts = Object.entries(totals).map(([ccy, x]) => `可計價持股 ${x.priced}/${x.total} 檔，合計 ${x.priced ? moneyFmt(x.value, ccy) : "待行情"}`).join("；");
    const overlap = ["0050","00935","2330","2308"].some(s => holdings.some(h => h.symbol === s))
      ? "直接持有0050／00935或個股2330、2308可能有穿透重疊；尚未取得基金最新成分權重，無法量化。"
      : "若未來同時持有0050、00935與2330／2308，需檢查成分股重疊。";
    return `<p>${esc(parts)}。這只是帳戶已登錄股票，不含現金、其他資產或未記錄交易。</p><p>${esc(overlap)}</p><p>網站尚未儲存現金餘額、總資產、金融股配置目標或完整成交紀錄；不把規劃當成已執行交易，也不估總組合百分比。</p>`;
  }
  function render() {
    const root = document.getElementById("full-daily-report");
    if (!root) return;
    const now = new Date();
    const articles = dailyBrief?.market_data?.articles || [];
    const marketData = dailyBrief?.market_data || {};
    const sourceAt = marketData.updated_at ? dateFmt.format(new Date(marketData.updated_at)) : "尚無更新";
    const today = new Intl.DateTimeFormat("zh-TW",{year:"numeric",month:"2-digit",day:"2-digit",weekday:"long",timeZone:"Asia/Taipei"}).format(now);
    const reportNote = currentUser
      ? `庫存來源：此登入帳戶的持股表；未整合逐筆交易，資料仍待你用最新成交紀錄核對。新聞：GDELT近24小時彙整，更新 ${esc(sourceAt)}。`
      : "登入後以帳戶持股與自選清單產生個人報告；訪客示意資料不列為持股。";
    const loginNote = currentUser ? "" : '<div class="report-login-note">請先登入，避免把示意資料當成你的庫存。</div>';
    const eventText = articles.length
      ? "以下為最近24小時新聞連結；網站尚未接入官方總經／法說事件日曆，事件發生日需點開原文再核對。"
      : "尚無可用新聞。網站目前沒有官方總經／法說事件日曆，故不列未核實的未來事件。";
    root.innerHTML = `
      <div class="report-topline"><div><div class="section-kicker">PERSONAL TAIWAN PRE-MARKET REPORT</div><h2>每日台股盤前持股與觀察名單報告</h2><p>${esc(today)} · 產生於 ${esc(dateFmt.format(now))}（台北時間）</p></div><div class="report-actions"><button type="button" id="report-refresh">更新報告</button><button type="button" id="report-print">列印／存成 PDF</button></div></div>
      ${loginNote}<p class="report-data-note">${reportNote}</p>
      <section class="report-section"><h3>1｜市場與近期事件摘要</h3><p class="report-muted">${esc(dailyBrief?.summary || "登入後取得新聞摘要；目前沒有已核對的大盤、法人或市場指數資料。")}</p><p class="report-muted">${esc(eventText)}</p><div class="report-news-grid">${articles.slice(0,8).map(a => `<article><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)}</a><small>${esc(a.source || "來源未標示")} · ${esc(a.market === "TW" ? "台股相關" : "國際／美股相關")} · 發布 ${esc(a.published_at ? dateFmt.format(new Date(a.published_at)) : "時間未提供")} · 事件日待核</small></article>`).join("") || '<p class="report-muted">登入後載入新聞來源與時間。</p>'}</div></section>
      <section class="report-section"><h3>2｜已登錄持股逐檔分析</h3><p class="report-muted">「持有」只代表帳戶資料有此筆紀錄，不是操作建議。當日高低只作單日觀察區間；無歷史行情、估值或最新財報時不推算支撐、壓力、合理價、停損或部位上限。</p><div class="report-table-wrap"><table class="report-table"><thead><tr><th>持股／狀態</th><th>行情／資料日期</th><th>理由與損益</th><th>可核實價格區間</th><th>觀察觸發</th><th>失效條件</th><th>部位上限</th></tr></thead><tbody>${currentUser ? holdingRows(articles) : '<tr><td colspan="7">登入後載入帳戶持股；示意持股不會放入報告。</td></tr>'}</tbody></table></div></section>
      <section class="report-section"><h3>3｜固定追蹤代號（不等於持股）</h3><div class="report-table-wrap"><table class="report-table"><thead><tr><th>代號／名稱</th><th>帳戶狀態</th><th>最新可用行情</th><th>近期關聯新聞</th><th></th></tr></thead><tbody>${currentUser ? trackerRows(articles) : '<tr><td colspan="5">登入後可依自選清單載入行情；目前僅顯示追蹤範圍。</td></tr>'}</tbody></table></div></section>
      <section class="report-section"><h3>4｜今日最多三檔觀察焦點</h3><p class="report-muted">僅依帳戶持股／自選的新聞關聯及可用行情排序；不是基本面篩選。網站未接入逐檔財報、估值、法人、週轉率及融資融券，故不自動產生候選買入或減碼建議。</p>${currentUser ? topFocus(articles) : '<p class="report-muted">登入後依個人清單整理。</p>'}<p class="report-muted">新觀察股：0 檔。缺少可核實的估值、財報、成交量與風險資料時，不硬新增標的。</p></section>
      <section class="report-section"><h3>5｜現金、組合集中度與曝險</h3>${currentUser ? exposureSummary() : '<p class="report-muted">登入後核對持股；現金與總資產需另行提供。</p>'}</section>
      <section class="report-section report-limitations"><h3>資料來源與目前限制</h3><p>行情：${holdings.some(h => h.quote_source) ? esc(holdings.find(h => h.quote_source)?.quote_source) : "未取得持股行情"}；新聞：${esc(marketData.source || "GDELT（登入後載入）")}。行情可能延遲，台股是否即時依供應商方案而異；盤前尚無當日成交資料。</p><p>官方核對入口：<a href="https://www.twse.com.tw/" target="_blank" rel="noopener noreferrer">證交所</a> · <a href="https://www.tpex.org.tw/" target="_blank" rel="noopener noreferrer">櫃買中心</a> · <a href="https://mops.twse.com.tw/mops/web/t05st01" target="_blank" rel="noopener noreferrer">公開資訊觀測站</a>。</p><p>目前網站尚未串接證交所／櫃買的完整個股歷史價、公告財報、法人買賣超、融資融券、借券與官方事件日曆。資料不足的項目已留白，不代替投資判斷。</p><p>任何價格條件都須等開盤後重新核對；若無法取得可靠價位，採等待。內容為研究摘要，不保證收益，也不會代你下單。</p></section>
      <p class="report-final-reminder">請以最新庫存與成交／回補紀錄更新帳戶資料，尤其是任何放空部位。</p>`;
    document.getElementById("report-refresh")?.addEventListener("click", async () => {
      const btn = document.getElementById("report-refresh"); btn.disabled = true; btn.textContent = "更新中…";
      try { await Promise.all([refreshQuotes(true), loadDailyBrief(true)]); } finally { render(); }
    });
    document.getElementById("report-print")?.addEventListener("click", () => window.print());
    root.querySelectorAll("[data-add-tracker]").forEach(btn => btn.addEventListener("click", () => {
      const t = fixedTrackers.find(x => x.symbol === btn.dataset.addTracker);
      if (!t) return;
      openItem("watch");
      requestAnimationFrame(() => {
        document.getElementById("item-market").value = "TW";
        document.getElementById("item-symbol").value = t.symbol;
        document.getElementById("item-company").value = t.company;
      });
    }));
  }
  const priorDrawHoldings = drawHoldings;
  drawHoldings = function(...args) { const result = priorDrawHoldings.apply(this,args); render(); return result; };
  const priorDrawDailyBrief = drawDailyBrief;
  drawDailyBrief = function(...args) { const result = priorDrawDailyBrief.apply(this,args); render(); return result; };
  window.renderFullDailyReport = render;
  render();
})();