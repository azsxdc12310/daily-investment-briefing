/* Paste the Supabase project URL and publishable (anon) key below. Never put a service role key in this file. */
const SUPABASE_URL = "https://crvtcywkkarjncfeiwac.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_cfmEdaFiMWoe-VNuLEBYjQ_-jo-MyDi";
const STORAGE_BUCKET = "research-files";
const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase);
const db = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const demoHoldings = [
  { symbol:"NVDA", company:"NVIDIA", shares:20, average_cost:118.2, current:142.87, day_change:2.41, color:"#e9f0e7" },
  { symbol:"AAPL", company:"Apple", shares:35, average_cost:202.6, current:223.04, day_change:1.18, color:"#edf0f2" },
  { symbol:"MSFT", company:"Microsoft", shares:12, average_cost:417.4, current:438.51, day_change:-0.72, color:"#eef0e8" }
];
const demoIdeas = [
  { symbol:"AVGO", company:"Broadcom", theme:"AI 基礎建設", price:"$ 214.30", change:"+1.42%", tone:"green" },
  { symbol:"GOOGL", company:"Alphabet", theme:"雲端與 AI", price:"$ 176.82", change:"+0.86%", tone:"green" },
  { symbol:"COST", company:"Costco", theme:"消費與防禦", price:"$ 983.10", change:"−0.23%", tone:"neutral", market:"US" },
  { symbol:"2330", company:"台積電", theme:"半導體與 AI", price:"NT$ 1,090.00", change:"+0.54%", tone:"green", market:"TW" },
  { symbol:"2454", company:"聯發科", theme:"晶片設計", price:"NT$ 1,340.00", change:"+0.31%", tone:"green", market:"TW" }
];
const $ = (id) => document.getElementById(id);
const money = (value,currency="USD") => (currency==="TWD"?"NT$ ":"$ ") + Number(value || 0).toLocaleString("en-US", {minimumFractionDigits:2, maximumFractionDigits:2});
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let currentUser = null, holdings = [...demoHoldings], ideas = [...demoIdeas], itemMode = "holding", authMode = "login";

function drawHoldings(){
  const body=$("holdings-body"); body.innerHTML="";
  $("holding-count").textContent=`${holdings.length} 檔`;
  $("holdings-empty").classList.toggle("hidden", holdings.length>0);
  for(const item of holdings){
    const cost=Number(item.average_cost)||0, shares=Number(item.shares)||0, price=Number(item.current)||cost, currency=item.market==="TW"?"TWD":"USD";
    const pnl=(price-cost)*shares, pnlPct=cost?((price-cost)/cost*100):0;
    const tr=document.createElement("tr");
    tr.innerHTML=`<td><div class="stock-cell"><span class="stock-logo" style="background:${safe(item.color||"#edf0e8")}">${safe(item.symbol.slice(0,2))}</span><span><strong>${safe(item.symbol)}</strong><small>${safe(item.company)} · ${currency}</small></span></div></td><td class="table-number">${shares.toLocaleString("en-US")}</td><td>${money(cost,currency)}</td><td class="table-number">${money(price,currency)}</td><td class="${Number(item.day_change)>=0?"table-change":"down"}">${Number(item.day_change)>=0?"+":""}${Number(item.day_change||0).toFixed(2)}%</td><td class="${pnl>=0?"table-change":"down"}">${pnl>=0?"+":""}${money(pnl,currency)} <small>(${pnlPct>=0?"+":""}${pnlPct.toFixed(2)}%)</small></td><td><button class="row-remove" aria-label="刪除 ${safe(item.symbol)}" data-remove-holding="${safe(item.id||item.symbol)}">×</button></td>`;
    body.appendChild(tr);
  }
  body.querySelectorAll("[data-remove-holding]").forEach(b=>b.addEventListener("click",()=>removeItem("holdings",b.dataset.removeHolding)));
  if(!currentUser){$("portfolio-value").textContent="$ 38,420.00";$("portfolio-gain").innerHTML="+$ 2,184.50 <small>(+6.03%)</small>";return;}
  const totals={USD:{value:0,gain:0,cost:0},TWD:{value:0,gain:0,cost:0}};
  for(const h of holdings){const currency=h.market==="TW"?"TWD":"USD",shares=Number(h.shares)||0,cost=Number(h.average_cost)||0,price=Number(h.current)||cost;totals[currency].value+=price*shares;totals[currency].gain+=(price-cost)*shares;totals[currency].cost+=cost*shares;}
  $("portfolio-value").textContent=Object.entries(totals).filter(([,v])=>v.value).map(([c,v])=>money(v.value,c)).join(" · ")||"—";
  $("portfolio-gain").innerHTML=Object.entries(totals).filter(([,v])=>v.cost).map(([c,v])=>`${v.gain>=0?"+":"−"}${money(Math.abs(v.gain),c)} <small>(${((v.gain/v.cost)*100).toFixed(2)}%)</small>`).join(" · ")||"—";
}
function drawIdeas(){
  const body=$("watchlist-body");body.innerHTML="";
  for(const idea of ideas){const row=document.createElement("div");row.className="idea-row";row.innerHTML=`<div class="idea-company"><span class="stock-logo">${safe(idea.symbol.slice(0,2))}</span><span><strong>${safe(idea.symbol)} · ${safe(idea.company)}</strong><small>${safe(idea.theme||"個人觀察")} · ${idea.market==="TW"?"台股":"美股"}</small></span></div><div class="idea-meta"><span>參考價格</span><strong>${safe(idea.price||"自訂")}</strong></div><div class="idea-meta"><span>當日變化</span><strong class="${idea.tone==="green"?"table-change":""}">${safe(idea.change||"—")}</strong></div><span class="idea-rating">關注中</span></div>`;body.appendChild(row);}
}
function setUser(user){
  currentUser=user;
  $("account-name").textContent=user?(user.email.split("@")[0]):"訪客模式";
  $("account-caption").textContent=user?user.email:"登入以同步資料";
  $("avatar").textContent=user?user.email.slice(0,1).toUpperCase():"訪";
  $("login-button").textContent=user?"登出":"登入 / 註冊";
}
async function loadData(){
  if(!db||!currentUser){drawHoldings();drawIdeas();return;}
  const [h,w]=await Promise.all([db.from("holdings").select("*").order("created_at"),db.from("watchlist").select("*").order("created_at")]);
  if(h.error||w.error){console.error(h.error||w.error);return;}
  holdings=h.data||[];ideas=w.data||[];drawHoldings();drawIdeas();loadAttachments();
}
function showAuth(){if(!configured){alert("網站尚未設定 Supabase。請在 app.js 填入專案 URL 與 publishable key，並先套用 supabase-schema.sql。");return;}authMode="login";$("auth-title").textContent="登入你的工作區";$("auth-submit").textContent="登入";$("auth-switch").textContent="還沒有帳號？建立帳號";$("auth-message").textContent="";$("auth-dialog").showModal();}
$("login-button").addEventListener("click",async()=>{if(currentUser){await db.auth.signOut();return;}showAuth();});
$("account-button").addEventListener("click",()=>currentUser?db.auth.signOut():showAuth());
$("auth-switch").addEventListener("click",()=>{authMode=authMode==="login"?"signup":"login";$("auth-title").textContent=authMode==="login"?"登入你的工作區":"建立個人帳號";$("auth-submit").textContent=authMode==="login"?"登入":"建立帳號";$("auth-switch").textContent=authMode==="login"?"還沒有帳號？建立帳號":"已經有帳號？返回登入";$("auth-message").textContent="";});
$("auth-form").addEventListener("submit",async(e)=>{e.preventDefault();const email=$("auth-email").value.trim(),password=$("auth-password").value;const button=$("auth-submit");button.disabled=true;$("auth-message").textContent="正在處理…";const result=authMode==="login"?await db.auth.signInWithPassword({email,password}):await db.auth.signUp({email,password});button.disabled=false;$("auth-message").textContent=result.error?result.error.message:(authMode==="signup"?"帳號已建立。若 Supabase 要求驗證 Email，請先完成驗證再登入。":"登入成功。");if(!result.error&&authMode==="login")$("auth-dialog").close();});
if(db){db.auth.onAuthStateChange((_event,session)=>{setUser(session?.user||null);loadData();});db.auth.getSession().then(({data})=>{setUser(data.session?.user||null);loadData();});}
function openItem(mode){if(!configured){alert("請先完成 Supabase 設定，再儲存個人資料。");return;}if(!currentUser){showAuth();return;}itemMode=mode;$("item-title").textContent=mode==="holding"?"新增持股":"加入觀察清單";$("shares-field").classList.toggle("hidden",mode!=="holding");$("cost-field").classList.toggle("hidden",mode!=="holding");$("item-message").textContent="";$("item-form").reset();$("item-shares").value="1";$("item-cost").value="0";$("item-dialog").showModal();}
$("add-holding").addEventListener("click",()=>openItem("holding"));$("add-watch").addEventListener("click",()=>openItem("watch"));
$("item-form").addEventListener("submit",async(e)=>{e.preventDefault();const symbol=$("item-symbol").value.trim().toUpperCase(),company=$("item-company").value.trim(),market=$("item-market").value;let result;if(itemMode==="holding"){result=await db.from("holdings").insert({user_id:currentUser.id,market,symbol,company,shares:Number($("item-shares").value),average_cost:Number($("item-cost").value)});}else{result=await db.from("watchlist").insert({user_id:currentUser.id,market,symbol,company,theme:"個人觀察"});}$("item-message").textContent=result.error?result.error.message:"已儲存";if(!result.error){$("item-dialog").close();await loadData();}});
async function removeItem(table,id){if(!currentUser||!confirm("要刪除這筆資料嗎？"))return;const field=table==="holdings"?"id":"id";const{error}=await db.from(table).delete().eq(field,id);if(error)alert(error.message);else await loadData();}
async function loadAttachments(){if(!db||!currentUser)return;const{data,error}=await db.from("attachments").select("*").order("created_at",{ascending:false});if(error){console.error(error);return;}const list=$("attachment-list");list.innerHTML="";for(const file of data||[]){const row=document.createElement("div");row.className="attachment-item";row.innerHTML=`<a href="#" data-download="${safe(file.id)}">${safe(file.file_name)}</a><button data-file="${safe(file.id)}" aria-label="刪除附件">×</button>`;list.appendChild(row);}list.querySelectorAll("[data-download]").forEach(a=>a.addEventListener("click",async(e)=>{e.preventDefault();const file=data.find(item=>item.id===a.dataset.download);if(!file)return;const{data:link,error}=await db.storage.from(STORAGE_BUCKET).createSignedUrl(file.storage_path,60);if(error)alert(error.message);else window.open(link.signedUrl,"_blank","noopener,noreferrer");}));list.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>deleteAttachment(b.dataset.file)));}
$("attachment-input").addEventListener("change",async(e)=>{const file=e.target.files[0];if(!file)return;if(!configured){alert("請先完成 Supabase 設定。");return;}if(!currentUser){e.target.value="";showAuth();return;}if(file.size>15*1024*1024){alert("單一附件上限為 15 MB。");e.target.value="";return;}const path=`${currentUser.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-\u4e00-\u9fff]/g,"_")}`;const upload=await db.storage.from(STORAGE_BUCKET).upload(path,file,{upsert:false});if(upload.error){alert(upload.error.message);return;}const record=await db.from("attachments").insert({user_id:currentUser.id,file_name:file.name,storage_path:path,content_type:file.type||"application/octet-stream",size_bytes:file.size});if(record.error){await db.storage.from(STORAGE_BUCKET).remove([path]);alert(record.error.message);}else await loadAttachments();e.target.value="";});
async function deleteAttachment(id){if(!confirm("要刪除這個附件嗎？"))return;const{data,error}=await db.from("attachments").select("storage_path").eq("id",id).single();if(error){alert(error.message);return;}const removed=await db.storage.from(STORAGE_BUCKET).remove([data.storage_path]);if(removed.error){alert(removed.error.message);return;}const result=await db.from("attachments").delete().eq("id",id);if(result.error)alert(result.error.message);else loadAttachments();}
$("attachments-nav").addEventListener("click",()=>$("attachment-card").scrollIntoView({behavior:"smooth",block:"center"}));
$("refresh-button").addEventListener("click",()=>{if(currentUser)loadData();else{holdings=[...demoHoldings];ideas=[...demoIdeas];drawHoldings();drawIdeas();}});
const now=new Date();$("today-date").textContent=new Intl.DateTimeFormat("zh-TW",{year:"numeric",month:"long",day:"numeric",weekday:"long",timeZone:"Asia/Taipei"}).format(now)+" · 你的每日投資簡報";
drawHoldings();drawIdeas();setUser(null);
