(() => {
  const $ = s => document.querySelector(s);
  const ready = window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY && !window.SUPABASE_ANON_KEY.includes("PASTE_");
  const db = ready ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null;
  const loginPanel=$("#loginPanel"), dashboard=$("#dashboard");
  const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const say=(el,msg,bad=false)=>{el.textContent=msg;el.className="form-message"+(bad?" error":"")};
  if(!db){say($("#loginMessage"),"The site is not configured yet (js/config.js).",true);$("#loginForm button").disabled=true;return;}

  const { houseLabel, addressLine } = window.LeadExport;
  const money = n => Number(n).toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0});
  const pad2 = n => String(n).padStart(2,"0");
  const dayKey = d => { const x=new Date(d); return x.getFullYear()+"-"+pad2(x.getMonth()+1)+"-"+pad2(x.getDate()); };
  const daysAgo = n => { const d=new Date(); d.setDate(d.getDate()-n); return dayKey(d); };
  const fmtDay = k => new Date(k+"T00:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"});
  const photosOf = window.PropertyForm.photosOf, pathFromUrl = window.PropertyForm.pathFromUrl;
  const coverOf = p => photosOf(p)[0] || "";
  let me = null;
  let myLeads = [], myPosts = [];
  const PF = window.PropertyForm.init({
    db, mount: $("#propertyFormMount"), labels: { add: "Add a post", edit: "Edit post" },
    extraInsert: () => ({ posted_by: me.user_id, owner_ref: me.ref_code }),   // credit this employee
    onSaved: () => { loadPosts(); loadProperties(); }
  });

  const siteLink = () => new URL("index.html?ref=" + encodeURIComponent(me.ref_code), location.href).href;
  const propertyLink = id => new URL("property.html?id=" + encodeURIComponent(id) + "&ref=" + encodeURIComponent(me.ref_code), location.href).href;
  async function copyText(text, btn){
    try{await navigator.clipboard.writeText(text);const t=btn.textContent;btn.textContent="Copied ✓";setTimeout(()=>{btn.textContent=t;},1500);}
    catch{window.prompt("Copy this link:",text);}
  }

  async function showSession(){
    const {data:{session}}=await db.auth.getSession();
    if(!session){me=null;loginPanel.hidden=false;dashboard.hidden=true;return;}
    if(me && me.user_id===session.user.id && !dashboard.hidden) return;   // already showing
    const {data,error}=await db.from("staff").select("user_id,full_name,email,ref_code,segment,is_active").eq("user_id",session.user.id).maybeSingle();
    if(error||!data){await db.auth.signOut();loginPanel.hidden=false;dashboard.hidden=true;say($("#loginMessage"),"This account is not an employee account. (Administrators sign in at admin.html.)",true);return;}
    if(!data.is_active){await db.auth.signOut();loginPanel.hidden=false;dashboard.hidden=true;say($("#loginMessage"),"This account is switched off. Please contact your manager.",true);return;}
    me=data; loginPanel.hidden=true; dashboard.hidden=false; initDashboard();
  }
  $("#loginForm").addEventListener("submit",async e=>{
    e.preventDefault();const f=new FormData(e.currentTarget);const btn=e.currentTarget.querySelector("button");btn.disabled=true;
    const {error}=await db.auth.signInWithPassword({email:f.get("email"),password:f.get("password")});
    btn.disabled=false;
    if(error){say($("#loginMessage"),"Sign-in failed. Check your email and password. If your account is new, your manager may need to turn off email confirmation.",true);return;}
    await showSession();
  });
  $("#logoutBtn").addEventListener("click",async()=>{PF.exitEdit();me=null;await db.auth.signOut();await showSession();});
  db.auth.onAuthStateChange(()=>{setTimeout(showSession,0);});

  document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b===btn));
    document.querySelectorAll("[data-panel]").forEach(p=>{p.hidden=p.dataset.panel!==btn.dataset.tab;});
  }));

  function initDashboard(){
    $("#staffName").textContent=me.full_name;
    $("#staffSub").textContent="Your tracking code: "+me.ref_code;
    $("#staffSegment").textContent=(me.segment||"EMPLOYEE").toUpperCase();
    $("#siteLink").value=siteLink();
    loadLeads(); loadPosts(); loadProperties();
  }
  $("#copySite").addEventListener("click",e=>copyText($("#siteLink").value,e.currentTarget));
  $("#refreshLeads").addEventListener("click",()=>loadLeads());

  /* ---------------- leads + counts ---------------- */
  const LEAD_SELECT = "id,created_at,full_name,phone,email,interest,preferred_location,message,status,property_id,ref_code," +
    "properties(id,title,price,listing_type,property_type,beds,baths,address,city,state,zip_code)";

  function leadRow(l){
    const p = l.properties;
    const when = new Date(l.created_at);
    const customer = [`<b>${esc(l.full_name)}</b>`, esc(l.phone), l.email ? esc(l.email) : ""].filter(Boolean).join("<br>");
    const wants = [l.interest, l.preferred_location].filter(Boolean).map(esc).join(" · ");
    const property = p
      ? `<div class="lead-property"><b>${esc(p.title)}</b><small>${esc(money(p.price))}${p.listing_type==="rent"?" / month":""} · ${esc(houseLabel(p))}</small><small>${esc(addressLine(p))}</small></div>`
      : '<span class="muted">General inquiry</span>';
    const msg = l.message ? `<div class="msg-cell" title="${esc(l.message)}">${esc(l.message.length>140 ? l.message.slice(0,140)+"…" : l.message)}</div>` : "—";
    return `<tr><td>${when.toLocaleDateString("en-US")}<br><small class="muted">${when.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}</small></td><td>${customer}</td><td>${wants||"—"}</td><td>${property}</td><td>${msg}</td><td>${esc(l.status||"new")}</td></tr>`;
  }

  function renderStats(leads){
    const counts = new Map();
    leads.forEach(l => { const k=dayKey(l.created_at); counts.set(k,(counts.get(k)||0)+1); });
    const today=daysAgo(0), yest=daysAgo(1), week=daysAgo(6);
    let weekN=0; counts.forEach((n,k)=>{ if(k>=week && k<=today) weekN+=n; });
    $("#statToday").textContent=counts.get(today)||0;
    $("#statYesterday").textContent=counts.get(yest)||0;
    $("#statWeek").textContent=weekN;
    $("#statTotal").textContent=leads.length;
    const rows=[];
    for(let i=0;i<30;i++){ const k=daysAgo(i); rows.push(`<tr><td>${esc(fmtDay(k))}</td><td>${counts.get(k)?`<b>${counts.get(k)}</b>`:'<span class="muted">0</span>'}</td></tr>`); }
    $("#dailyBody").innerHTML=rows.join("");
  }

  async function loadLeads(){
    const body=$("#leadsBody"); body.innerHTML='<tr><td colspan="6">Loading…</td></tr>';
    const all=[];
    try{
      const size=1000;
      for(let from=0; from<20000; from+=size){
        const {data,error}=await db.from("leads").select(LEAD_SELECT).eq("ref_code",me.ref_code).order("created_at",{ascending:false}).order("id").range(from,from+size-1);
        if(error) throw error;
        all.push(...data);
        if(data.length<size) break;
      }
    }catch(err){console.error(err);body.innerHTML='<tr><td colspan="6">Could not load your leads. Please try again.</td></tr>';return;}
    myLeads=all; renderStats(all); renderPosts();
    body.innerHTML = all.length ? all.slice(0,300).map(leadRow).join("") : '<tr><td colspan="6">No leads yet. Share your links to start getting inquiries.</td></tr>';
  }

  /* ---------------- my posts (Manage rental) ---------------- */
  const POST_SELECT = "id,title,description,address,city,state,zip_code,sqft,price,listing_type,property_type,beds,baths,image_url,image_urls,is_active,laundry_type,parking_type,ac_type,heating_type,cat_friendly,dog_friendly,voucher_accepted";
  async function loadPosts(){
    const {data,error}=await db.from("properties").select(POST_SELECT).eq("posted_by",me.user_id).order("created_at",{ascending:false});
    if(error){console.error(error);$("#postsBody").innerHTML='<tr><td colspan="6">Could not load your posts. Ask your manager to run supabase-posts.sql in Supabase.</td></tr>';return;}
    myPosts=data||[]; renderPosts();
  }
  function renderPosts(){
    const body=$("#postsBody");
    if(!myPosts.length){body.innerHTML='<tr><td colspan="6">You have not posted anything yet. Use the form above.</td></tr>';return;}
    const counts=new Map();
    myLeads.forEach(l=>{ if(l.property_id) counts.set(l.property_id,(counts.get(l.property_id)||0)+1); });
    body.innerHTML=myPosts.map(p=>{
      const cover=coverOf(p), n=photosOf(p).length;
      return `<tr class="${p.is_active?"":"row-hidden"}"><td><div class="prop-cell">${cover?`<img class="prop-thumb" src="${esc(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<span class="prop-thumb"></span>'}<div><b>${esc(p.title)}</b>${p.is_active?"":' <span class="badge-hidden">Hidden</span>'}<br><small class="muted">${esc(houseLabel(p))}${n>1?" · "+n+" photos":""}</small></div></div></td><td>${esc([p.city,p.state].filter(Boolean).join(", "))}</td><td>${money(p.price)}${p.listing_type==="rent"?" / mo":""}</td><td><b>${counts.get(p.id)||0}</b></td><td><button type="button" class="status-select" data-copy="${esc(propertyLink(p.id))}">Copy link</button></td><td class="row-actions"><button type="button" class="status-select" data-edit="${esc(p.id)}">Edit</button><button type="button" class="status-select" data-toggle="${esc(p.id)}">${p.is_active?"Deactivate":"Activate"}</button><button type="button" class="status-select danger" data-delete="${esc(p.id)}">Delete</button></td></tr>`;
    }).join("");
    body.querySelectorAll("img.prop-thumb").forEach(img=>img.addEventListener("error",()=>{img.style.visibility="hidden";}));
    body.querySelectorAll("[data-copy]").forEach(b=>b.addEventListener("click",()=>copyText(b.dataset.copy,b)));
    body.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>{
      const p=myPosts.find(x=>x.id===b.dataset.edit); if(p) PF.startEdit(p);
    }));
    body.querySelectorAll("[data-toggle]").forEach(b=>b.addEventListener("click",async()=>{
      const p=myPosts.find(x=>x.id===b.dataset.toggle); if(!p) return;
      b.disabled=true;
      const {data,error}=await db.from("properties").update({is_active:!p.is_active}).eq("id",p.id).select("id");
      if(error||!data||!data.length){console.error(error);alert("Could not update the post.");b.disabled=false;return;}
      loadPosts(); loadProperties();
    }));
    body.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",async()=>{
      const p=myPosts.find(x=>x.id===b.dataset.delete); if(!p) return;
      if(!confirm(`Delete "${p.title}" permanently?\n\nInquiries about it stay in your lead list but will show as "General inquiry".\nTip: use Deactivate to just hide it.\n\nThis cannot be undone.`)) return;
      b.disabled=true;
      const {data,error}=await db.from("properties").delete().eq("id",p.id).select("id");
      if(error||!data||!data.length){console.error(error);alert("Could not delete the post.");b.disabled=false;return;}
      const paths=photosOf(p).map(pathFromUrl).filter(Boolean);
      if(paths.length){try{await db.storage.from("property-images").remove(paths);}catch(e){console.warn(e);}}
      if(PF.isEditing(p.id)) PF.exitEdit();
      loadPosts(); loadProperties();
    }));
  }

  /* ---------------- property links ---------------- */
  async function loadProperties(){
    const body=$("#propertiesBody");
    const {data,error}=await db.from("properties").select("id,title,price,listing_type,property_type,beds,baths,city,state,image_url,image_urls").eq("is_active",true).order("created_at",{ascending:false});
    if(error){console.error(error);body.innerHTML='<tr><td colspan="4">Could not load properties.</td></tr>';return;}
    if(!data.length){body.innerHTML='<tr><td colspan="4">No active properties yet.</td></tr>';return;}
    body.innerHTML=data.map(p=>{
      const cover=(p.image_urls&&p.image_urls[0])||p.image_url||"";
      return `<tr><td><div class="prop-cell">${cover?`<img class="prop-thumb" src="${esc(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<span class="prop-thumb"></span>'}<div><b>${esc(p.title)}</b><br><small class="muted">${esc(houseLabel(p))}${p.city?" · "+esc([p.city,p.state].filter(Boolean).join(", ")):""}</small></div></div></td><td>${money(p.price)}${p.listing_type==="rent"?" / mo":""}</td><td>${p.listing_type==="rent"?"For rent":"For sale"}</td><td><button type="button" class="status-select" data-copy="${esc(propertyLink(p.id))}">Copy my link</button></td></tr>`;
    }).join("");
    body.querySelectorAll("img.prop-thumb").forEach(img=>img.addEventListener("error",()=>{img.style.visibility="hidden";}));
    body.querySelectorAll("[data-copy]").forEach(b=>b.addEventListener("click",()=>copyText(b.dataset.copy,b)));
  }

  /* ---------------- change password ---------------- */
  $("#passwordForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const f=new FormData(e.currentTarget), msg=$("#passwordMessage");
    if(f.get("password")!==f.get("password2")){say(msg,"The two passwords do not match.",true);return;}
    const {error}=await db.auth.updateUser({password:f.get("password")});
    if(error){say(msg,error.message||"Could not change the password.",true);return;}
    e.currentTarget.reset(); say(msg,"Password changed.");
  });

  showSession();
})();
