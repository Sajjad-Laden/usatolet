(() => {
  const $ = s => document.querySelector(s);
  const ready = window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY && !window.SUPABASE_ANON_KEY.includes("PASTE_");
  const db = ready ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null;
  const loginPanel=$("#loginPanel"), dashboard=$("#dashboard");
  const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const say=(el,msg,bad=false)=>{el.textContent=msg;el.className="form-message"+(bad?" error":"")};
  if(!db){say($("#loginMessage"),"Add your Supabase publishable key in js/config.js before signing in.",true);$("#loginForm button").disabled=true;return;}

  const BUCKET = "property-images";
  const { houseLabel, addressLine } = window.LeadExport;
  const money = n => Number(n).toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0});
  // public details page of a listing (property.html sits next to admin.html)
  const propertyLink = id => new URL("property.html?id=" + encodeURIComponent(id), location.href).href;
  const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  const photosOf = p => (p.image_urls && p.image_urls.length) ? p.image_urls : (p.image_url ? [p.image_url] : []);
  const coverOf = p => photosOf(p)[0] || "";
  // file name inside the photo bucket, taken from a public photo URL (null if it is not one of ours)
  const pathFromUrl = url => {
    const parts = String(url).split("/object/public/" + BUCKET + "/");
    return parts.length > 1 ? decodeURIComponent(parts[1].split("?")[0]) : null;
  };

  async function isAdmin(userId){
    const {data,error}=await db.from("admin_users").select("user_id").eq("user_id",userId).maybeSingle();
    return !error && !!data;
  }
  async function showSession(){
    const {data:{session}}=await db.auth.getSession();
    if(!session){loginPanel.hidden=false;dashboard.hidden=true;return;}
    const allowed=await isAdmin(session.user.id);
    if(!allowed){await db.auth.signOut();loginPanel.hidden=false;dashboard.hidden=true;say($("#loginMessage"),"This account is not an administrator. Employees: please sign in at staff.html.",true);return;}
    loginPanel.hidden=true;dashboard.hidden=false;await loadStaff();loadLeads();loadProperties();
  }
  $("#loginForm").addEventListener("submit",async e=>{
    e.preventDefault();const f=new FormData(e.currentTarget);const btn=e.currentTarget.querySelector("button");btn.disabled=true;
    const {error}=await db.auth.signInWithPassword({email:f.get("email"),password:f.get("password")});
    btn.disabled=false;
    if(error){say($("#loginMessage"),"Sign-in failed. Check your email and password.",true);return;}
    await showSession();
  });
  $("#logoutBtn").addEventListener("click",async()=>{await db.auth.signOut();await showSession();});
  db.auth.onAuthStateChange(()=>{setTimeout(showSession,0);});

  /* ---------------- leads ---------------- */
  const LEAD_SELECT = "id,created_at,full_name,phone,email,interest,preferred_location,message,status,property_id,ref_code," +
    "properties(id,title,price,listing_type,property_type,beds,baths,address,city,state,zip_code)";

  function leadRow(l){
    const p = l.properties;
    const when = new Date(l.created_at);
    const customer = [`<b>${esc(l.full_name)}</b>`, esc(l.phone), l.email ? esc(l.email) : ""].filter(Boolean).join("<br>");
    const wants = [l.interest, l.preferred_location].filter(Boolean).map(esc).join(" · ");
    const property = p
      ? `<div class="lead-property"><b>${esc(p.title)}</b><small>${esc(money(p.price))}${p.listing_type==="rent"?" / month":""} · ${esc(houseLabel(p))}</small><small>${esc(addressLine(p))}</small><a href="${esc(propertyLink(p.id))}" target="_blank" rel="noopener">Open listing ↗</a></div>`
      : '<span class="muted">General inquiry</span>';
    const msg = l.message
      ? `<div class="msg-cell" title="${esc(l.message)}">${esc(l.message.length>140 ? l.message.slice(0,140)+"…" : l.message)}</div>`
      : "—";
    const status = `<select class="status-select" data-lead="${esc(l.id)}">${["new","contacted","qualified","closed"].map(s=>`<option value="${s}" ${l.status===s?"selected":""}>${s}</option>`).join("")}</select>`;
    return `<tr><td>${when.toLocaleDateString("en-US")}<br><small class="muted">${when.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}</small></td><td>${customer}</td><td>${wants||"—"}</td><td>${property}</td><td>${esc(sourceName(l.ref_code))}</td><td>${msg}</td><td>${status}</td></tr>`;
  }

  const applySource = q => {
    const v=$("#leadSource").value;
    return v==="__direct" ? q.is("ref_code",null) : (v ? q.eq("ref_code",v) : q);
  };
  async function loadLeads(){
    const body=$("#leadsBody");body.innerHTML='<tr><td colspan="7">Loading…</td></tr>';
    const {data,error}=await applySource(db.from("leads").select(LEAD_SELECT)).order("created_at",{ascending:false}).limit(500);
    if(error){console.error(error);body.innerHTML='<tr><td colspan="7">Could not load leads. Run supabase-team.sql once, and check admin permissions.</td></tr>';return;}
    if(!data.length){body.innerHTML='<tr><td colspan="7">No customer inquiries here yet.</td></tr>';return;}
    body.innerHTML=data.map(leadRow).join("");
    body.querySelectorAll("[data-lead]").forEach(sel=>sel.addEventListener("change",async()=>{const {error}=await db.from("leads").update({status:sel.value}).eq("id",sel.dataset.lead);if(error)alert("Could not update lead status.");}));
  }
  $("#leadSource").addEventListener("change",loadLeads);
  $("#refreshLeads").addEventListener("click",loadLeads);

  // every lead (not just the 500 on screen), fetched in pages of 1000
  async function fetchAllLeads(){
    const out=[], size=1000;
    for(let from=0; from<20000; from+=size){
      const {data,error}=await applySource(db.from("leads").select(LEAD_SELECT)).order("created_at",{ascending:false}).order("id").range(from,from+size-1);
      if(error) throw error;
      out.push(...data);
      if(data.length<size) break;
    }
    return out;
  }
  $("#exportLeads").addEventListener("click",async()=>{
    const btn=$("#exportLeads"), label=btn.textContent;
    btn.disabled=true; btn.textContent="Preparing…";
    try{
      const leads=await fetchAllLeads();
      if(!leads.length){alert("No leads to export yet.");return;}
      window.LeadExport.download(leads, propertyLink, code => code ? sourceName(code) : "");
    }catch(err){console.error(err);alert("Could not prepare the Excel file. Please try again.");}
    finally{btn.disabled=false; btn.textContent=label;}
  });

  document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b===btn));
    $("#leadsPanel").hidden=btn.dataset.tab!=="leads";$("#propertiesPanel").hidden=btn.dataset.tab!=="properties";$("#teamPanel").hidden=btn.dataset.tab!=="team";
  }));

  /* ---------------- team: employee accounts + daily leads ---------------- */
  let staffList = [];
  let statLeads = [];        // every lead, light: [{day, code}]
  let statsReady = false;
  const sourceName = code => {
    if(!code) return "Direct";
    const s = staffList.find(x => x.ref_code === code);
    return s ? s.full_name : code + " (removed)";
  };
  const pad2 = n => String(n).padStart(2,"0");
  const dayKey = d => { const x=new Date(d); return x.getFullYear()+"-"+pad2(x.getMonth()+1)+"-"+pad2(x.getDate()); };
  const daysAgo = n => { const d=new Date(); d.setDate(d.getDate()-n); return dayKey(d); };
  const fmtDay = k => new Date(k+"T00:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"});
  const siteLink = code => new URL("index.html?ref=" + encodeURIComponent(code), location.href).href;
  const countFor = (match, from, to) => { let n=0; for(const r of statLeads){ if(r.day>=from && r.day<=to && match(r.code)) n++; } return n; };
  const slug = t => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"").slice(0,20);
  function makeCode(name){
    let base = slug(name); if(base.length<3) base = (base+"agent").slice(0,8);
    let c = base, i = 1;
    while(staffList.some(s=>s.ref_code===c)) c = base + (++i);
    return c;
  }

  $("#reportTo").value = daysAgo(0);
  $("#reportFrom").value = daysAgo(13);
  $("#reportFrom").addEventListener("change",renderDaily);
  $("#reportTo").addEventListener("change",renderDaily);
  $("#refreshTeam").addEventListener("click",loadStaff);

  async function fetchLeadStats(){
    const out=[], size=1000;
    for(let from=0; from<50000; from+=size){
      const {data,error}=await db.from("leads").select("created_at,ref_code").order("created_at",{ascending:false}).order("id").range(from,from+size-1);
      if(error) throw error;
      data.forEach(r=>out.push({day:dayKey(r.created_at),code:r.ref_code||null}));
      if(data.length<size) break;
    }
    return out;
  }

  async function loadStaff(){
    const {data,error}=await db.from("staff").select("user_id,full_name,email,ref_code,segment,is_active,created_at").order("created_at",{ascending:true});
    if(error){console.error(error);staffList=[];say($("#staffMessage"),"Could not load the team. Run supabase-team.sql once in Supabase, then refresh.",true);}
    else staffList=data||[];
    fillSourceFilter();
    renderTeam();
    loadTeamStats();
  }
  function fillSourceFilter(){
    const sel=$("#leadSource"), keep=sel.value;
    sel.innerHTML='<option value="">All sources</option><option value="__direct">Direct (no employee)</option>'+staffList.map(s=>`<option value="${esc(s.ref_code)}">${esc(s.full_name)}</option>`).join("");
    sel.value=[...sel.options].some(o=>o.value===keep)?keep:"";
  }
  async function loadTeamStats(){
    statsReady=false; renderTeam(); renderDaily();
    try{ statLeads=await fetchLeadStats(); }
    catch(err){ console.error(err); statLeads=[]; say($("#staffMessage"),"Could not load lead counts. Run supabase-team.sql once, then refresh.",true); }
    statsReady=true; renderTeam(); renderDaily();
  }

  function renderTeam(){
    const body=$("#teamBody");
    const today=daysAgo(0), week=daysAgo(6), lo="0000-00-00", hi="9999-99-99";
    const known=new Set(staffList.map(s=>s.ref_code));
    const n=(m,a,b)=>statsReady?countFor(m,a,b):"…";
    const stats=m=>`<td>${n(m,today,today)}</td><td>${n(m,week,today)}</td><td>${n(m,lo,hi)}</td>`;
    let html=staffList.map(s=>{
      const m=c=>c===s.ref_code;
      return `<tr class="${s.is_active?"":"row-hidden"}"><td><b>${esc(s.full_name)}</b>${s.is_active?"":' <span class="badge-hidden">Off</span>'}<br><small class="muted">${esc(s.email||"")}</small></td><td><code>${esc(s.ref_code)}</code></td><td>${esc(s.segment||"—")}</td>${stats(m)}<td class="row-actions"><button type="button" class="status-select" data-scopy="${esc(siteLink(s.ref_code))}">Copy site link</button><button type="button" class="status-select" data-sactive="${esc(s.user_id)}">${s.is_active?"Deactivate":"Activate"}</button><button type="button" class="status-select danger" data-sdelete="${esc(s.user_id)}">Delete</button></td></tr>`;
    }).join("");
    html+=`<tr><td><b>Direct</b><br><small class="muted">no employee code</small></td><td>—</td><td>—</td>${stats(c=>!c)}<td></td></tr>`;
    if(statsReady && statLeads.some(r=>r.code && !known.has(r.code)))
      html+=`<tr><td><b>Other / removed codes</b></td><td>—</td><td>—</td>${stats(c=>c && !known.has(c))}<td></td></tr>`;
    html+=`<tr class="total-row"><td><b>All leads</b></td><td></td><td></td>${stats(()=>true)}<td></td></tr>`;
    body.innerHTML=html;

    body.querySelectorAll("[data-scopy]").forEach(b=>b.addEventListener("click",async()=>{
      try{await navigator.clipboard.writeText(b.dataset.scopy);const t=b.textContent;b.textContent="Copied ✓";setTimeout(()=>{b.textContent=t;},1500);}
      catch{window.prompt("Copy this link:",b.dataset.scopy);}
    }));
    body.querySelectorAll("[data-sactive]").forEach(b=>b.addEventListener("click",async()=>{
      const s=staffList.find(x=>x.user_id===b.dataset.sactive); if(!s) return;
      b.disabled=true;
      const {data,error}=await db.from("staff").update({is_active:!s.is_active}).eq("user_id",s.user_id).select("user_id");
      if(error||!data||!data.length){console.error(error);alert("Could not update the employee.");b.disabled=false;return;}
      loadStaff();
    }));
    body.querySelectorAll("[data-sdelete]").forEach(b=>b.addEventListener("click",async()=>{
      const s=staffList.find(x=>x.user_id===b.dataset.sdelete); if(!s) return;
      if(!confirm(`Remove employee "${s.full_name}"?\n\nTheir past leads stay (shown under the code "${s.ref_code}").\nTheir login can no longer open the staff page.\nTip: use Deactivate if you may need them again.`)) return;
      b.disabled=true;
      const {data,error}=await db.from("staff").delete().eq("user_id",s.user_id).select("user_id");
      if(error||!data||!data.length){console.error(error);alert("Could not remove the employee.");b.disabled=false;return;}
      loadStaff();
    }));
  }

  function renderDaily(){
    const from=$("#reportFrom").value, to=$("#reportTo").value;
    const head=$("#dailyHead"), body=$("#dailyBody");
    if(!statsReady){head.innerHTML="";body.innerHTML='<tr><td>Loading…</td></tr>';return;}
    if(!from||!to||from>to){head.innerHTML="";body.innerHTML='<tr><td>Choose a valid date range.</td></tr>';return;}
    const known=new Set(staffList.map(s=>s.ref_code));
    const cols=staffList.map(s=>({label:s.full_name,match:c=>c===s.ref_code}));
    cols.push({label:"Direct",match:c=>!c});
    if(statLeads.some(r=>r.code && !known.has(r.code))) cols.push({label:"Other",match:c=>!!c && !known.has(c)});
    const days=[];
    for(let d=new Date(to+"T00:00:00"); dayKey(d)>=from && days.length<366; d.setDate(d.getDate()-1)) days.push(dayKey(d));
    const idx=new Map(days.map((d,i)=>[d,i]));
    const grid=days.map(()=>cols.map(()=>0));
    for(const r of statLeads){
      const i=idx.get(r.day); if(i===undefined) continue;
      cols.forEach((c,k)=>{ if(c.match(r.code)) grid[i][k]++; });
    }
    head.innerHTML="<tr><th>Date</th>"+cols.map(c=>`<th>${esc(c.label)}</th>`).join("")+"<th>Total</th></tr>";
    const totals=cols.map(()=>0);
    body.innerHTML=days.map((d,i)=>{
      const sum=grid[i].reduce((a,b)=>a+b,0);
      grid[i].forEach((v,k)=>{totals[k]+=v;});
      return `<tr><td>${esc(fmtDay(d))}</td>${grid[i].map(v=>`<td>${v||'<span class="muted">0</span>'}</td>`).join("")}<td><b>${sum}</b></td></tr>`;
    }).join("")+`<tr class="total-row"><td><b>Total</b></td>${totals.map(v=>`<td><b>${v}</b></td>`).join("")}<td><b>${totals.reduce((a,b)=>a+b,0)}</b></td></tr>`;
  }

  $("#staffForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const form=e.currentTarget, f=new FormData(form), msg=$("#staffMessage"), btn=$("#staffSubmit");
    const full_name=f.get("full_name").trim(), email=f.get("email").trim().toLowerCase(), password=f.get("password");
    const segment=(f.get("segment")||"").trim()||null;
    let code=(f.get("ref_code")||"").trim().toLowerCase();
    if(code){
      if(!/^[a-z0-9_-]{3,32}$/.test(code)){say(msg,"Tracking code: 3 to 32 letters, numbers, - or _ only.",true);return;}
      if(staffList.some(s=>s.ref_code===code)){say(msg,"That tracking code is already used. Choose another.",true);return;}
    } else code=makeCode(full_name);
    if(password.length<8){say(msg,"Password must be at least 8 characters.",true);return;}
    btn.disabled=true; say(msg,"Creating account…");
    try{
      // separate client that does NOT keep a session, so the admin stays signed in
      const tmp=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      const {data,error}=await tmp.auth.signUp({email,password,options:{data:{full_name}}});
      if(error) throw new Error(error.message||"Could not create the login.");
      const u=data&&data.user;
      if(!u||(u.identities&&u.identities.length===0)) throw new Error("This email already has an account. Use a different email.");
      const {error:insErr}=await db.from("staff").insert({user_id:u.id,full_name,email,ref_code:code,segment,is_active:true});
      if(insErr){console.error(insErr);throw new Error("The login was created but the employee could not be saved. Run supabase-team.sql once, then delete that user in Supabase → Authentication → Users and try again.");}
      form.reset();
      say(msg,`Employee created. Give them: login page ${new URL("staff.html",location.href).href} · email ${email} · password ${password} · tracking code ${code}.`+(data.session?"":" Supabase email confirmation is ON, so they must confirm their email first (or turn off “Confirm email” in Supabase → Authentication)."));
      loadStaff();
    }catch(err){
      say(msg,err.message||"Something went wrong. Please try again.",true);
    }finally{
      btn.disabled=false;
    }
  });

  /* ---------------- properties ---------------- */
  let propertyList = [];
  const PROP_SELECT = "id,title,description,address,city,state,zip_code,sqft,price,listing_type,property_type,beds,baths,image_url,image_urls,is_active,laundry_type,parking_type,ac_type,heating_type,cat_friendly,dog_friendly,voucher_accepted,posted_by,owner_ref";
  const brokenThumb = () => {
    const s = document.createElement("span");
    s.className = "prop-thumb broken"; s.textContent = "No photo";
    s.title = "This photo is not loading. Click Edit to upload it again.";
    return s;
  };

  async function loadProperties(){
    const body=$("#propertiesBody");body.innerHTML='<tr><td colspan="7">Loading…</td></tr>';
    const {data,error}=await db.from("properties").select(PROP_SELECT).order("created_at",{ascending:false});
    if(error){console.error(error);body.innerHTML='<tr><td colspan="7">Could not load properties.</td></tr>';return;}
    propertyList=data||[];
    if(!propertyList.length){body.innerHTML='<tr><td colspan="7">No properties added.</td></tr>';return;}
    body.innerHTML=propertyList.map(p=>{
      const cover=coverOf(p), n=photosOf(p).length;
      return `<tr class="${p.is_active?"":"row-hidden"}"><td><div class="prop-cell">${cover?`<img class="prop-thumb" src="${esc(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<span class="prop-thumb"></span>'}<div><b>${esc(p.title)}</b>${p.is_active?"":' <span class="badge-hidden">Hidden</span>'}<br><small class="muted">${esc(houseLabel(p))}${n>1?" · "+n+" photos":""}</small></div></div></td><td>${esc([p.city,p.state].filter(Boolean).join(", "))}</td><td>${money(p.price)}</td><td>${esc(p.listing_type)}</td><td>${p.owner_ref?esc(sourceName(p.owner_ref)):"Admin"}</td><td><button type="button" class="status-select" data-copy="${esc(propertyLink(p.id))}">Copy link</button></td><td class="row-actions"><button type="button" class="status-select" data-edit="${esc(p.id)}">Edit</button><button type="button" class="status-select" data-toggle="${esc(p.id)}">${p.is_active?"Deactivate":"Activate"}</button><button type="button" class="status-select danger" data-delete="${esc(p.id)}">Delete</button></td></tr>`;
    }).join("");

    body.querySelectorAll("img.prop-thumb").forEach(img=>img.addEventListener("error",()=>img.replaceWith(brokenThumb())));

    body.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>{
      const p=propertyList.find(x=>x.id===b.dataset.edit); if(p) PF.startEdit(p);
    }));
    body.querySelectorAll("[data-toggle]").forEach(b=>b.addEventListener("click",async()=>{
      const p=propertyList.find(x=>x.id===b.dataset.toggle); if(!p) return;
      b.disabled=true;
      const {data,error}=await db.from("properties").update({is_active:!p.is_active}).eq("id",p.id).select("id");
      if(error||!data||!data.length){console.error(error);alert("Could not update property.");b.disabled=false;return;}
      loadProperties();
    }));
    body.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",async()=>{
      const p=propertyList.find(x=>x.id===b.dataset.delete); if(!p) return;
      if(!confirm(`Delete "${p.title}" permanently?\n\nCustomer inquiries about it are kept, but will show as "General inquiry".\nTip: use Deactivate if you only want to hide it.\n\nThis cannot be undone.`)) return;
      b.disabled=true;
      const {data,error}=await db.from("properties").delete().eq("id",p.id).select("id");
      if(error||!data||!data.length){console.error(error);alert("Could not delete the property. Please run supabase-fix-images.sql once, then try again.");b.disabled=false;return;}
      const paths=photosOf(p).map(pathFromUrl).filter(Boolean);
      if(paths.length){try{await db.storage.from(BUCKET).remove(paths);}catch(e){console.warn(e);}}
      if(PF.isEditing(p.id)) PF.exitEdit();
      loadProperties();
    }));
    body.querySelectorAll("[data-copy]").forEach(b=>b.addEventListener("click",async()=>{
      try{await navigator.clipboard.writeText(b.dataset.copy);const t=b.textContent;b.textContent="Copied ✓";setTimeout(()=>{b.textContent=t;},1500);}
      catch{window.prompt("Copy this link:",b.dataset.copy);}
    }));
  }

  /* ---- add / edit form (shared with the employee page) ---- */
  const PF = window.PropertyForm.init({ db, mount: $("#propertyFormMount"), onSaved: loadProperties });
  showSession();
})();
