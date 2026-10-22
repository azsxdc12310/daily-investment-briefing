/* Paste the Supabase project URL and publishable (anon) key below. Never put a service role key in this file. */
const SUPABASE_URL = "https://crvtcywkkarjncfeiwac.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_cfmEdaFiMWoe-VNuLEBYjQ_-jo-MyDi";
const STORAGE_BUCKET = "research-files";
const QUOTE_FUNCTION = "market-quotes";
const QUOTE_REFRESH_MS = 5 * 60 * 1000;
const FIXED_TW_TRACKERS = ["0050","00635U","00935","2308","2330","2345","2374","2727","2885","2890","2891","3293","6669","3105"];
window.officialTwQuotes = window.officialTwQuotes || {};
let lastQuoteRefresh = 0;
let authReturnMessage = "";
const authReturnParams = new URLSearchParams(window.location.hash.slice(1));
if (authReturnParams.has("error_code")) {
  authReturnMessage = authReturnParams.get("error_code") === "otp_expired"
    ? "這封驗證信的連結已過期或已使用。請輸入原 Email，重新寄送驗證信。"
    : "驗證連結無法使用。請輸入原 Email，重新寄送驗證信。";
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}
const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase);
const db = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const demoHoldings = [];
const demoIdeas = [];
const $ = (id) => document.getElementById(id);
const money = (value,currency="USD") => (currency==="TWD"?"NT$ ":"$ ") + Number(value || 0).toLocaleString("en-US", {minimumFractionDigits:2, maximumFractionDigits:2});
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let currentUser = null, holdings = [...demoHoldings], ideas = [...demoIdeas], itemMode = "holding", authMode = "login", dailyBrief = null, passwordRecovery = false;

function drawHoldings(){
  const body=$("holdings-body"); body.innerHTML="";
  $("holding-count").textContent=`${holdings.length} 檔`;
  $("holdings-empty").classList.toggle("hidden", holdings.length>0);
  for(const item of holdings){
    const cost=Number(item.average_cost)||0, shares=Number(item.shares)||0, price=item.current===undefined||item.current===null?null:Number(item.current), currency=item.market==="TW"?"TWD":"USD";
    const pnl=price===null?null:(price-cost)*shares, pnlPct=cost&&pnl!==null?(pnl/(cost*shares)*100):0;
    const tr=document.createElement("tr");
    tr.innerHTML=`<td><div class="stock-cell"><span class="stock-logo" style="background:${safe(item.color||"#edf0e8")}">${safe(item.symbol.slice(0,2))}</span><span><strong>${safe(item.symbol)}</strong><small>${safe(item.company)} · ${currency}</small></span></div></td><td class="table-number">${shares.toLocaleString("en-US")}</td><td>${money(cost,currency)}</td><td class="table-number">${price===null?"—":money(price,currency)}</td><td class="${Number(item.day_change)>=0?"table-change":"down"}">${item.day_change===undefined?"—":`${Number(item.day_change)>=0?"+":""}${Number(item.day_change).toFixed(2)}%`}</td><td class="${pnl===null?"":pnl>=0?"table-change":"down"}">${pnl===null?"—":`${pnl>=0?"+":""}${money(pnl,currency)} <small>(${pnlPct>=0?"+":""}${pnlPct.toFixed(2)}%)</small>`}</td><td><button class="row-remove" aria-label="刪除 ${safe(item.symbol)}" data-remove-holding="${safe(item.id||item.symbol)}">×</button></td>`;
    body.appendChild(tr);
  }
  body.querySelectorAll("[data-remove-holding]").forEach(b=>b.addEventListener("click",()=>removeItem("holdings",b.dataset.removeHolding)));
  drawHoldingAnalysis();
  if(!currentUser){$("portfolio-value").textContent="登入後同步持股";$("portfolio-gain").textContent="登入後同步";return;}
  const totals={USD:{value:0,gain:0,cost:0},TWD:{value:0,gain:0,cost:0}};
  for(const h of holdings){const currency=h.market==="TW"?"TWD":"USD",shares=Number(h.shares)||0,cost=Number(h.average_cost)||0,price=h.current===undefined||h.current===null?null:Number(h.current);if(price===null)continue;totals[currency].value+=price*shares;totals[currency].gain+=(price-cost)*shares;totals[currency].cost+=cost*shares;}
  $("portfolio-value").textContent=Object.entries(totals).filter(([,v])=>v.value).map(([c,v])=>money(v.value,c)).join(" · ")||"—";
  $("portfolio-gain").innerHTML=Object.entries(totals).filter(([,v])=>v.cost).map(([c,v])=>`${v.gain>=0?"+":"−"}${money(Math.abs(v.gain),c)} <small>(${((v.gain/v.cost)*100).toFixed(2)}%)</small>`).join(" · ")||"—";
}
function drawIdeas(){
  const body=$("watchlist-body");body.innerHTML="";
  if(!ideas.length){body.innerHTML=`<p class="brief-empty">${currentUser?"尚無觀察標的，請按「加入觀察」新增。":"登入後顯示你的觀察清單。"}</p>`;return;}
  for(const idea of ideas){const row=document.createElement("div");row.className="idea-row";row.innerHTML=`<div class="idea-company"><span class="stock-logo">${safe(idea.symbol.slice(0,2))}</span><span><strong>${safe(idea.symbol)} · ${safe(idea.company)}</strong><small>${safe(idea.theme||"個人觀察")} · ${idea.market==="TW"?"台股":"美股"}</small></span></div><div class="idea-meta"><span>參考價格</span><strong>${safe(idea.price||"自訂")}</strong></div><div class="idea-meta"><span>當日變化</span><strong class="${idea.tone==="green"?"table-change":""}">${safe(idea.change||"—")}</strong></div><span class="idea-rating">關注中</span></div>`;body.appendChild(row);}
}
function marketIsOpenNow(market){
  const zone=market==="TW"?"Asia/Taipei":"America/New_York",now=new Date();
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:zone,weekday:"short",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(now);
  const value=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  if(["Sat","Sun"].includes(value.weekday))return false;
  const minutes=Number(value.hour)*60+Number(value.minute);
  return market==="TW"?minutes>=540&&minutes<810:minutes>=570&&minutes<960;
}
function setUser(user){
  currentUser=user;
  $("account-name").textContent=user?(user.email.split("@")[0]):"訪客模式";
  $("account-caption").textContent=user?user.email:"登入以同步資料";
  $("avatar").textContent=user?user.email.slice(0,1).toUpperCase():"訪";
  $("login-button").textContent=user?"登出":"登入 / 註冊";
  $("password-change-open")?.classList.toggle("hidden",!user);
}
async function loadData(forceBrief=false){
  if(!db||!currentUser){dailyBrief=null;drawHoldings();drawIdeas();drawDailyBrief();return;}
  const [h,w]=await Promise.all([db.from("holdings").select("*").order("created_at"),db.from("watchlist").select("*").order("created_at")]);
  if(h.error||w.error){console.error(h.error||w.error);return;}
  holdings=h.data||[];ideas=w.data||[];drawHoldings();drawIdeas();loadAttachments();
  await Promise.all([refreshQuotes(lastQuoteRefresh===0),loadDailyBrief(forceBrief)]);
}
function drawDailyBrief(){
  const data=dailyBrief?.market_data||{};
  $("brief-summary").textContent=dailyBrief?.summary||(currentUser?"整理近 24 小時的新聞中…":"登入後會整理近 24 小時的台股、美股與你持股相關新聞。");
  const updated=data.updated_at?new Date(data.updated_at):null;
  $("brief-updated").textContent=updated?`${data.source||"新聞彙整"} · ${new Intl.DateTimeFormat("zh-TW",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Taipei"}).format(updated)} 更新`:currentUser?"每日更新中":"登入後載入每日摘要";
  const stocks=data.stocks||[];
  const priorities=stocks.filter(s=>s.held||s.news_count>0).slice(0,4);
  $("brief-watch").innerHTML=priorities.map(s=>`<div class="brief-watch-card"><strong>${safe(s.symbol)} · ${safe(s.company)}</strong><small>${s.held?"我的持股":"觀察標的"} · ${s.news_count?`${s.news_count} 則相關新聞`:"近 24 小時未找到明確相關報導"}</small></div>`).join("");
  const articles=(data.articles||[]).slice(0,6);
  $("brief-news-list").innerHTML=articles.map(a=>`<article class="brief-news-item"><a href="${safe(a.url)}" target="_blank" rel="noopener noreferrer">${safe(a.title)}</a><div class="brief-news-meta"><span>${safe(a.source||"新聞來源")}</span><span>${a.market==="TW"?"台股相關":"美股／市場相關"}</span><span>${new Intl.DateTimeFormat("zh-TW",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Taipei"}).format(new Date(a.published_at))}</span></div></article>`).join("")||`<p class="brief-empty">${currentUser?"目前沒有可顯示的新聞；可稍後重新整理。":"登入後查看每日新聞。"}</p>`;
  drawHoldingAnalysis();
}
function drawHoldingAnalysis(){
  const target=$("brief-holdings");if(!target)return;
  if(!currentUser){target.innerHTML='<p class="brief-empty">登入並新增持股後，這裡會整理市價、成本與相關新聞。</p>';return;}
  if(!holdings.length){target.innerHTML='<p class="brief-empty">新增持股後即可查看每日持股分析。</p>';return;}
  const articles=dailyBrief?.market_data?.articles||[];
  target.innerHTML=holdings.map(h=>{
    const market=h.market||"US",cost=Number(h.average_cost)||0,shares=Number(h.shares)||0,price=h.current===undefined||h.current===null?null:Number(h.current);
    const pnl=price===null?null:(price-cost)*shares,day=Number(h.day_change),related=articles.find(a=>a.related_symbol===h.symbol&&a.market===market);
    const notes=[];
    if(price===null)notes.push("尚無可用即時報價；損益分析待行情來源設定。");
    else if(Math.abs(day)>=3)notes.push(`今日漲跌 ${day>=0?"+":""}${day.toFixed(2)}%，波動較大，建議核對相關公告與市場消息。`);
    else if(pnl<0)notes.push(`目前低於平均成本約 ${money(Math.abs(pnl),market==="TW"?"TWD":"USD")}，可回顧原始投資假設與部位風險。`);
    else notes.push("目前未見明顯價格異常；持續追蹤財報、公司公告與部位風險。");
    if(related)notes.push("有相關新聞，請閱讀原文確認事件是否影響公司營運或財務。");
    return `<article class="brief-holding-card"><div class="brief-holding-top"><strong>${safe(h.symbol)} · ${safe(h.company)}</strong><span>${price===null?"市價 —":money(price,market==="TW"?"TWD":"USD")}</span></div><p>持有 ${shares.toLocaleString("en-US")} 股 · 成本 ${money(cost,market==="TW"?"TWD":"USD")} · ${pnl===null?"損益待行情":`未實現 ${pnl>=0?"+":"−"}${money(Math.abs(pnl),market==="TW"?"TWD":"USD")}`}</p><p>${notes.map(safe).join(" ")}</p>${related?`<a href="${safe(related.url)}" target="_blank" rel="noopener noreferrer">相關新聞：${safe(related.title)}</a>`:""}</article>`;
  }).join("");
}
async function loadDailyBrief(force=false){
  if(!db||!currentUser){dailyBrief=null;drawDailyBrief();return;}
  $("brief-summary").textContent="正在整理今日新聞與持股重點…";
  const{data,error}=await db.functions.invoke("daily-news-brief",{body:{force}});
  if(error||!data?.brief){$("brief-summary").textContent=error?.message||data?.message||"每日新聞暫時無法載入，請稍後重新整理。";$("brief-updated").textContent="新聞載入失敗";return;}
  dailyBrief=data.brief;drawDailyBrief();
}
async function loadOfficialTwQuotes(){
  try{
    const response=await fetch("./data/tw-quotes.json?v="+Date.now(),{cache:"no-store"});
    if(!response.ok) return;
    const data=await response.json();
    const quotes=Array.isArray(data.quotes)?data.quotes:[];
    window.officialTwQuotes=Object.fromEntries(quotes.filter(q=>q.market==="TW"&&q.symbol).map(q=>[q.symbol,q]));
    const byKey=new Map(quotes.map(q=>[q.market+":"+q.symbol,q]));
    for(const item of [...holdings,...ideas]){
      const q=byKey.get((item.market||"US")+":"+item.symbol);
      if(!q) continue;
      item.current=q.price;item.day_change=q.percent_change;item.high=q.high;item.low=q.low;item.open=q.open;
      item.previous_close=q.previous_close;item.volume=q.volume;item.quote_date=q.quote_date;
      item.quote_time=q.timestamp;item.quote_source=q.source;item.market_open=false;
      if(ideas.includes(item)){
        item.price=(item.market==="TW"?"NT$ ":"$ ")+Number(q.price).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
        item.change=(Number(q.percent_change)>=0?"+":"")+Number(q.percent_change).toFixed(2)+"%";
        item.tone=Number(q.percent_change)>=0?"green":"neutral";
      }
    }
  }catch(error){console.warn("官方收盤行情暫時無法載入",error);}
}
async function refreshQuotes(force=false){
  await loadOfficialTwQuotes();
  drawHoldings();drawIdeas();
  const source=$("market-source");
  if(!currentUser||!db){source.textContent="訪客示意資料";return;}
  if(!force&&Date.now()-lastQuoteRefresh<QUOTE_REFRESH_MS)return;
  const symbols=[...new Map([...holdings,...ideas].map(item=>[`${item.market||"US"}:${item.symbol}`,{symbol:item.symbol,market:item.market||"US"}])).values()].filter(item=>force||marketIsOpenNow(item.market)).slice(0,8);
  if(!symbols.length){source.textContent="新增股票後更新報價";return;}
  lastQuoteRefresh=Date.now();source.textContent="正在更新行情…";
  const{data,error}=await db.functions.invoke(QUOTE_FUNCTION,{body:{symbols}});
  if(error||!data?.quotes){const status=error?.context?.status||error?.status;source.textContent=status===503?"行情金鑰尚未設定：請到 Supabase Functions → Secrets 加入 TWELVE_DATA_API_KEY":status===401?"登入已逾期，請重新登入":error?.message||data?.message||"行情服務暫時無法使用";return;}
  const byKey=new Map(data.quotes.map(q=>[`${q.market}:${q.symbol}`,q]));
  for(const h of holdings){const q=(h.market||"US")==="TW"?(window.officialTwQuotes?.[h.symbol]||byKey.get(`TW:${h.symbol}`)):byKey.get(`${h.market||"US"}:${h.symbol}`);if(q){h.current=q.price;h.day_change=q.percent_change;h.high=q.high;h.low=q.low;h.open=q.open;h.previous_close=q.previous_close;h.volume=q.volume;h.quote_date=q.quote_date;h.quote_time=q.timestamp;h.quote_source=q.source;h.market_open=q.market_open;}}
  for(const i of ideas){const q=(i.market||"US")==="TW"?(window.officialTwQuotes?.[i.symbol]||byKey.get(`TW:${i.symbol}`)):byKey.get(`${i.market||"US"}:${i.symbol}`);if(q){i.price=(i.market==="TW"?"NT$ ":"$ ")+Number(q.price).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});i.change=`${Number(q.percent_change)>=0?"+":""}${Number(q.percent_change).toFixed(2)}%`;i.tone=Number(q.percent_change)>=0?"green":"neutral";i.current=q.price;i.day_change=q.percent_change;i.high=q.high;i.low=q.low;i.open=q.open;i.previous_close=q.previous_close;i.volume=q.volume;i.quote_date=q.quote_date;i.quote_time=q.timestamp;i.market_open=q.market_open;}}
  drawHoldings();drawIdeas();
  const updated=data.updated_at?new Date(data.updated_at):new Date();
  source.textContent=`${Object.keys(window.officialTwQuotes||{}).length?"證交所／櫃買中心台股收盤 + ":""}${data.source||"行情來源"} · 查詢 ${new Intl.DateTimeFormat("zh-TW",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Taipei"}).format(updated)}${data.unavailable?.length?` · ${data.unavailable.length} 檔未提供`:""}${data.truncated?" · 每次最多 8 檔":""}`;
}
function authRedirectUrl(){return `${window.location.origin}${window.location.pathname}`;}
function resetAuthForm(){
  passwordRecovery=false;authMode="login";
  $("auth-title").textContent="登入你的工作區";$("auth-submit").textContent="登入";
  $("auth-password-caption").textContent="密碼";$("auth-password").autocomplete="current-password";$("auth-email-label").classList.remove("hidden");$("auth-email").required=true;
  $("auth-confirm-label").classList.add("hidden");$("auth-confirm-password").required=false;
  $("auth-switch").classList.remove("hidden");$("auth-forgot").classList.remove("hidden");
  $("auth-forgot").textContent="忘記密碼？寄送重設信";
  $("auth-resend").classList.add("hidden");
}
function showAuth(){if(!configured){alert("網站尚未設定 Supabase。請在 app.js 填入專案 URL 與 publishable key，並先套用 supabase-schema.sql。");return;}resetAuthForm();$("auth-message").textContent=authReturnMessage;$("auth-dialog").showModal();}
$("password-change-open").addEventListener("click",()=>{if(!currentUser)return;$("password-change-form").reset();$("password-change-message").textContent="";$("password-change-dialog").showModal();});
$("password-change-form").addEventListener("submit",async event=>{event.preventDefault();if(!currentUser)return;const newPassword=$("password-new").value,confirmPassword=$("password-confirm").value,message=$("password-change-message"),button=$("password-change-submit");if(newPassword!==confirmPassword){message.textContent="兩次輸入的新密碼不一致。";return;}if(newPassword.length<12){message.textContent="請設定至少 12 個字元的新密碼。";return;}button.disabled=true;message.textContent="正在更新密碼…";try{const result=await db.auth.updateUser({password:newPassword});if(result.error)throw result.error;message.textContent="密碼已更新。";$("password-change-form").reset();setTimeout(()=>$("password-change-dialog").close(),900);}catch(error){message.textContent=error.message||"密碼更新失敗。若系統要求重新驗證，請使用登入視窗中的「忘記密碼」寄送重設信。";}finally{button.disabled=false;}});
$("login-button").addEventListener("click",async()=>{if(currentUser){await db.auth.signOut();return;}showAuth();});
$("account-button").addEventListener("click",()=>currentUser?db.auth.signOut():showAuth());
$("auth-switch").addEventListener("click",()=>{authMode=authMode==="login"?"signup":"login";$("auth-title").textContent=authMode==="login"?"登入你的工作區":"建立個人帳號";$("auth-submit").textContent=authMode==="login"?"登入":"建立帳號";$("auth-switch").textContent=authMode==="login"?"還沒有帳號？建立帳號":"已經有帳號？返回登入";$("auth-resend").classList.toggle("hidden",authMode!=="signup");$("auth-forgot").classList.toggle("hidden",authMode!=="login");$("auth-message").textContent=authMode==="signup"?authReturnMessage:"";});
$("auth-forgot").addEventListener("click",async()=>{const email=$("auth-email").value.trim();if(!email){$("auth-message").textContent="請先輸入註冊時使用的 Email。";return;}const button=$("auth-forgot");button.disabled=true;$("auth-message").textContent="正在寄送重設信…";const{error}=await db.auth.resetPasswordForEmail(email,{redirectTo:authRedirectUrl()});button.disabled=false;$("auth-message").textContent=error?error.message:"若此 Email 有帳號，密碼重設信將寄到信箱。請開啟信件中的連結回到本網站設定新密碼。";});
$("auth-form").addEventListener("submit",async(e)=>{e.preventDefault();const email=$("auth-email").value.trim(),password=$("auth-password").value;const button=$("auth-submit");button.disabled=true;$("auth-message").textContent="正在處理…";let result;if(passwordRecovery){if(password!==$("auth-confirm-password").value){button.disabled=false;$("auth-message").textContent="兩次輸入的新密碼不一致。";return;}if(password.length<12){button.disabled=false;$("auth-message").textContent="請設定至少 12 個字元的新密碼。";return;}result=await db.auth.updateUser({password});}else{result=authMode==="login"?await db.auth.signInWithPassword({email,password}):await db.auth.signUp({email,password,options:{emailRedirectTo:authRedirectUrl()}});}button.disabled=false;$("auth-message").textContent=result.error?result.error.message:(passwordRecovery?"密碼已更新。":"帳號已建立。如果尚未收到或驗證連結已過期，請重新寄送驗證信。");if(!result.error&&authMode==="signup")$("auth-resend").classList.remove("hidden");if(!result.error&&(authMode==="login"||passwordRecovery)){$("auth-dialog").close();if(passwordRecovery)resetAuthForm();}});
$("auth-resend").addEventListener("click",async()=>{const email=$("auth-email").value.trim();if(!email){$("auth-message").textContent="請先輸入註冊時使用的 Email。";return;}const button=$("auth-resend");button.disabled=true;$("auth-message").textContent="正在寄送…";const{error}=await db.auth.resend({type:"signup",email,options:{emailRedirectTo:authRedirectUrl()}});button.disabled=false;$("auth-message").textContent=error?error.message:"若此 Email 有待驗證的帳號，新的驗證信將寄到信箱。";});
if(db){db.auth.onAuthStateChange((event,session)=>{setUser(session?.user||null);if(event==="PASSWORD_RECOVERY"){passwordRecovery=true;authMode="recovery";$("auth-title").textContent="設定新密碼";$("auth-submit").textContent="更新密碼";$("auth-password-caption").textContent="新密碼（至少 12 個字元）";$("auth-password").autocomplete="new-password";$("auth-email-label").classList.add("hidden");$("auth-email").required=false;$("auth-password").value="";$("auth-confirm-label").classList.remove("hidden");$("auth-confirm-password").required=true;$("auth-confirm-password").value="";$("auth-switch").classList.add("hidden");$("auth-forgot").classList.add("hidden");$("auth-resend").classList.add("hidden");$("auth-message").textContent="請設定一組未曾分享、且未在其他網站使用的新密碼。";$("auth-dialog").showModal();}loadData();});db.auth.getSession().then(({data})=>{setUser(data.session?.user||null);loadData();});}
setInterval(()=>{if(currentUser){const open=[...holdings,...ideas].some(item=>marketIsOpenNow(item.market||"US"));if(open)refreshQuotes();}},QUOTE_REFRESH_MS);
function openItem(mode){if(!configured){alert("請先完成 Supabase 設定，再儲存個人資料。");return;}if(!currentUser){showAuth();return;}itemMode=mode;$("item-title").textContent=mode==="holding"?"新增持股":"加入觀察清單";$("shares-field").classList.toggle("hidden",mode!=="holding");$("cost-field").classList.toggle("hidden",mode!=="holding");$("item-message").textContent="";$("item-form").reset();$("item-shares").value="1";$("item-cost").value="0";$("item-dialog").showModal();}
$("add-holding").addEventListener("click",()=>openItem("holding"));$("add-watch").addEventListener("click",()=>openItem("watch"));
$("item-form").addEventListener("submit",async(e)=>{e.preventDefault();const symbol=$("item-symbol").value.trim().toUpperCase(),company=$("item-company").value.trim(),market=$("item-market").value;let result;if(itemMode==="holding"){result=await db.from("holdings").insert({user_id:currentUser.id,market,symbol,company,shares:Number($("item-shares").value),average_cost:Number($("item-cost").value)});}else{result=await db.from("watchlist").insert({user_id:currentUser.id,market,symbol,company,theme:"個人觀察"});}$("item-message").textContent=result.error?result.error.message:"已儲存";if(!result.error){$("item-dialog").close();await loadData(true);}});
async function removeItem(table,id){if(!currentUser||!confirm("要刪除這筆資料嗎？"))return;const field=table==="holdings"?"id":"id";const{error}=await db.from(table).delete().eq(field,id);if(error)alert(error.message);else await loadData(true);}
async function loadAttachments(){if(!db||!currentUser)return;const{data,error}=await db.from("attachments").select("*").order("created_at",{ascending:false});if(error){console.error(error);return;}const list=$("attachment-list");list.innerHTML="";for(const file of data||[]){const row=document.createElement("div");row.className="attachment-item";row.innerHTML=`<a href="#" data-download="${safe(file.id)}">${safe(file.file_name)}</a><button data-file="${safe(file.id)}" aria-label="刪除附件">×</button>`;list.appendChild(row);}list.querySelectorAll("[data-download]").forEach(a=>a.addEventListener("click",async(e)=>{e.preventDefault();const file=data.find(item=>item.id===a.dataset.download);if(!file)return;const{data:link,error}=await db.storage.from(STORAGE_BUCKET).createSignedUrl(file.storage_path,60);if(error)alert(error.message);else window.open(link.signedUrl,"_blank","noopener,noreferrer");}));list.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>deleteAttachment(b.dataset.file)));}
$("attachment-input").addEventListener("change",async(e)=>{const file=e.target.files[0];if(!file)return;if(!configured){alert("請先完成 Supabase 設定。");return;}if(!currentUser){e.target.value="";showAuth();return;}if(file.size>15*1024*1024){alert("單一附件上限為 15 MB。");e.target.value="";return;}const path=`${currentUser.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-\u4e00-\u9fff]/g,"_")}`;const upload=await db.storage.from(STORAGE_BUCKET).upload(path,file,{upsert:false});if(upload.error){alert(upload.error.message);return;}const record=await db.from("attachments").insert({user_id:currentUser.id,file_name:file.name,storage_path:path,content_type:file.type||"application/octet-stream",size_bytes:file.size});if(record.error){await db.storage.from(STORAGE_BUCKET).remove([path]);alert(record.error.message);}else await loadAttachments();e.target.value="";});
async function deleteAttachment(id){if(!confirm("要刪除這個附件嗎？"))return;const{data,error}=await db.from("attachments").select("storage_path").eq("id",id).single();if(error){alert(error.message);return;}const removed=await db.storage.from(STORAGE_BUCKET).remove([data.storage_path]);if(removed.error){alert(removed.error.message);return;}const result=await db.from("attachments").delete().eq("id",id);if(result.error)alert(result.error.message);else loadAttachments();}
$("attachments-nav").addEventListener("click",()=>$("attachment-card").scrollIntoView({behavior:"smooth",block:"center"}));
$("refresh-button").addEventListener("click",()=>{if(currentUser){lastQuoteRefresh=0;loadData(true);}else{drawHoldings();drawIdeas();}});
const now=new Date();$("today-date").textContent=new Intl.DateTimeFormat("zh-TW",{year:"numeric",month:"long",day:"numeric",weekday:"long",timeZone:"Asia/Taipei"}).format(now)+" · 你的每日投資簡報";
drawHoldings();drawIdeas();setUser(null);
if(authReturnMessage){authMode="signup";$("auth-title").textContent="驗證連結已失效";$("auth-submit").textContent="建立帳號";$("auth-switch").textContent="已經有帳號？返回登入";$("auth-resend").classList.remove("hidden");$("auth-message").textContent=authReturnMessage;$("auth-dialog").showModal();}

