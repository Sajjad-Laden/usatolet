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
  const isHttp = u => /^https?:\/\//i.test(String(u||""));
  // public page of a listing (index.html sits next to admin.html)
  const propertyLink = id => new URL("index.html?property=" + encodeURIComponent(id), location.href).href;
  const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  async function isAdmin(userId){
    const {data,error}=await db.from("admin_users").select("user_id").eq("user_id",userId).maybeSingle();
    return !error && !!data;
  }
  async function showSession(){
    const {data:{session}}=await db.auth.getSession();
    if(!session){loginPanel.hidden=false;dashboard.hidden=true;return;}
    const allowed=await isAdmin(session.user.id);
    if(!allowed){await db.auth.signOut();loginPanel.hidden=false;dashboard.hidden=true;say($("#loginMessage"),"This account is not authorized as an administrator.",true);return;}
    loginPanel.hidden=true;dashboard.hidden=false;loadLeads();loadProperties();
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
  const LEAD_SELECT = "id,created_at,full_name,phone,email,interest,preferred_location,message,status,property_id," +
    "properties(id,title,price,listing_type,property_type,beds,baths,address,city,state,zip_code,source_url)";

  function leadRow(l){
    const p = l.properties;
    const when = new Date(l.created_at);
    const customer = [`<b>${esc(l.full_name)}</b>`, esc(l.phone), l.email ? esc(l.email) : ""].filter(Boolean).join("<br>");
    const wants = [l.interest, l.preferred_location].filter(Boolean).map(esc).join(" · ");
    const property = p
      ? `<div class="lead-property"><b>${esc(p.title)}</b><small>${esc(money(p.price))}${p.listing_type==="rent"?" / month":""} · ${esc(houseLabel(p))}</small><small>${esc(addressLine(p))}</small><a href="${esc(propertyLink(p.id))}" target="_blank" rel="noopener">Open listing ↗</a>${isHttp(p.source_url)?`<a class="fb-link" href="${esc(p.source_url)}" target="_blank" rel="noopener noreferrer">Facebook post ↗</a>`:""}</div>`
      : '<span class="muted">General inquiry</span>';
    const msg = l.message
      ? `<div class="msg-cell" title="${esc(l.message)}">${esc(l.message.length>140 ? l.message.slice(0,140)+"…" : l.message)}</div>`
      : "—";
    const status = `<select class="status-select" data-lead="${esc(l.id)}">${["new","contacted","qualified","closed"].map(s=>`<option value="${s}" ${l.status===s?"selected":""}>${s}</option>`).join("")}</select>`;
    return `<tr><td>${when.toLocaleDateString("en-US")}<br><small class="muted">${when.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}</small></td><td>${customer}</td><td>${wants||"—"}</td><td>${property}</td><td>${msg}</td><td>${status}</td></tr>`;
  }

  async function loadLeads(){
    const body=$("#leadsBody");body.innerHTML='<tr><td colspan="6">Loading…</td></tr>';
    const {data,error}=await db.from("leads").select(LEAD_SELECT).order("created_at",{ascending:false}).limit(500);
    if(error){console.error(error);body.innerHTML='<tr><td colspan="6">Could not load leads. Check admin permissions and RLS policies.</td></tr>';return;}
    if(!data.length){body.innerHTML='<tr><td colspan="6">No customer inquiries yet.</td></tr>';return;}
    body.innerHTML=data.map(leadRow).join("");
    body.querySelectorAll("[data-lead]").forEach(sel=>sel.addEventListener("change",async()=>{const {error}=await db.from("leads").update({status:sel.value}).eq("id",sel.dataset.lead);if(error)alert("Could not update lead status.");}));
  }
  $("#refreshLeads").addEventListener("click",loadLeads);

  // every lead (not just the 500 on screen), fetched in pages of 1000
  async function fetchAllLeads(){
    const out=[], size=1000;
    for(let from=0; from<20000; from+=size){
      const {data,error}=await db.from("leads").select(LEAD_SELECT).order("created_at",{ascending:false}).order("id").range(from,from+size-1);
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
      window.LeadExport.download(leads, propertyLink);
    }catch(err){console.error(err);alert("Could not prepare the Excel file. Please try again.");}
    finally{btn.disabled=false; btn.textContent=label;}
  });

  document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b===btn));
    $("#leadsPanel").hidden=btn.dataset.tab!=="leads";$("#propertiesPanel").hidden=btn.dataset.tab!=="properties";
  }));

  /* ---------------- properties ---------------- */
  async function loadProperties(){
    const body=$("#propertiesBody");body.innerHTML='<tr><td colspan="6">Loading…</td></tr>';
    const {data,error}=await db.from("properties").select("id,title,city,state,price,listing_type,property_type,beds,baths,image_url,image_urls,is_active").order("created_at",{ascending:false});
    if(error){console.error(error);body.innerHTML='<tr><td colspan="6">Could not load properties.</td></tr>';return;}
    body.innerHTML=data.length?data.map(p=>{
      const cover=(p.image_urls&&p.image_urls[0])||p.image_url;
      const n=(p.image_urls&&p.image_urls.length)||(p.image_url?1:0);
      return `<tr><td><div class="prop-cell">${cover?`<img class="prop-thumb" src="${esc(cover)}" alt="" loading="lazy">`:'<span class="prop-thumb"></span>'}<div><b>${esc(p.title)}</b>${p.is_active?"":' <small class="muted">· hidden</small>'}<br><small class="muted">${esc(houseLabel(p))} · <span class="photo-count">${n} photo${n===1?"":"s"}</span></small></div></div></td><td>${esc([p.city,p.state].filter(Boolean).join(", "))}</td><td>${money(p.price)}</td><td>${esc(p.listing_type)}</td><td><button class="status-select" data-copy="${esc(propertyLink(p.id))}">Copy link</button></td><td><button class="status-select" data-property="${esc(p.id)}" data-active="${p.is_active}">${p.is_active?"Deactivate":"Activate"}</button></td></tr>`;
    }).join(""):'<tr><td colspan="6">No properties added.</td></tr>';
    body.querySelectorAll("[data-property]").forEach(b=>b.addEventListener("click",async()=>{const next=b.dataset.active!=="true";const {error}=await db.from("properties").update({is_active:next}).eq("id",b.dataset.property);if(error)alert("Could not update property.");else loadProperties();}));
    body.querySelectorAll("[data-copy]").forEach(b=>b.addEventListener("click",async()=>{
      try{await navigator.clipboard.writeText(b.dataset.copy);const t=b.textContent;b.textContent="Copied ✓";setTimeout(()=>{b.textContent=t;},1500);}
      catch{window.prompt("Copy this link:",b.dataset.copy);}
    }));
  }

  /* ---- quick fill from a pasted Facebook post ---- */
  const FIELD_NAMES = { price:"price", beds:"bedrooms", baths:"bathrooms", sqft:"size", address:"address", city:"city", state:"state", zip_code:"ZIP", property_type:"property type" };
  $("#qfRun").addEventListener("click",()=>{
    const out=$("#qfMsg"), text=$("#qfText").value;
    if(!text.trim()){say(out,"Paste the text of your Facebook post first.",true);return;}
    const r=window.QuickFill.parse(text), el=$("#propertyForm").elements;
    const set=(name,val)=>{ if(val!==null && val!==undefined && val!=="") el[name].value=val; };
    set("title",r.title); set("listing_type",r.listing_type); set("property_type",r.property_type); set("price",r.price);
    set("beds",r.beds); set("baths",r.baths); set("sqft",r.sqft); set("address",r.address);
    set("city",r.city); set("state",r.state); set("zip_code",r.zip_code); set("description",r.description);
    if(r.facebookUrl && !el.source_url.value) el.source_url.value=r.facebookUrl;
    const found=r.filled.map(k=>FIELD_NAMES[k]).filter(Boolean);
    say(out, found.length ? `Filled in: ${found.join(", ")}. Please check the fields, then add your photos.` : "Could not find details in that text. Please fill the fields yourself.", !found.length);
  });

  /* ---- photos: pick many, preview, reorder cover, resize, upload ---- */
  const OK_TYPES=["image/jpeg","image/png","image/webp"], MAX_MB=25;
  const fileInput=$("#propertyImages"), drop=$("#photoDrop"), pickGrid=$("#pickGrid"), pickInfo=$("#pickInfo");
  let picked=[];                                   // [{ key, file, url }]  (no limit on how many)
  const keyOf=f=>[f.name,f.size,f.lastModified].join("|");

  function renderPicked(){
    pickGrid.hidden=!picked.length;
    pickGrid.innerHTML=picked.map((p,i)=>`<figure class="pick"><img src="${p.url}" alt="Photo ${i+1}"><button type="button" class="rm" data-rm="${i}" aria-label="Remove photo ${i+1}">×</button>${i===0?'<span class="cover-tag">Cover photo</span>':`<button type="button" class="make-cover" data-cover="${i}">Make cover</button>`}</figure>`).join("");
    pickInfo.textContent=picked.length?`${picked.length} photo${picked.length===1?"":"s"} selected. Choose or drop more to add to them.`:"";
  }
  function addFiles(list){
    const problems=[];
    for(const f of Array.from(list||[])){
      if(!OK_TYPES.includes(f.type)){problems.push(`${f.name} (not a JPG, PNG or WebP photo)`);continue;}
      if(f.size>MAX_MB*1024*1024){problems.push(`${f.name} (over ${MAX_MB} MB)`);continue;}
      const key=keyOf(f);
      if(picked.some(p=>p.key===key)) continue;  // same photo chosen twice
      picked.push({key,file:f,url:URL.createObjectURL(f)});
    }
    renderPicked();
    say($("#propertyMessage"), problems.length?`Skipped: ${problems.join(", ")}`:"", problems.length>0);
  }
  function clearPicked(){ picked.forEach(p=>URL.revokeObjectURL(p.url)); picked=[]; renderPicked(); }

  fileInput.addEventListener("change",()=>{ addFiles(fileInput.files); fileInput.value=""; });
  pickGrid.addEventListener("click",e=>{
    const rm=e.target.closest("[data-rm]"), cover=e.target.closest("[data-cover]");
    if(rm){ const [gone]=picked.splice(Number(rm.dataset.rm),1); if(gone) URL.revokeObjectURL(gone.url); renderPicked(); }
    else if(cover){ const [it]=picked.splice(Number(cover.dataset.cover),1); if(it) picked.unshift(it); renderPicked(); }
  });
  ["dragenter","dragover"].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add("drag");}));
  ["dragleave","dragend"].forEach(t=>drop.addEventListener(t,()=>drop.classList.remove("drag")));
  drop.addEventListener("drop",e=>{e.preventDefault();drop.classList.remove("drag");addFiles(e.dataTransfer&&e.dataTransfer.files);});

  function loadImage(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file), img=new Image();
      img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error(`"${file.name}" could not be read. Remove it or try a different photo.`));};
      img.src=url;
    });
  }
  // max 1600px on the long side, JPEG ~85%: keeps pages fast and storage small
  async function preparePhoto(file){
    const img=await loadImage(file);
    const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
    const w=Math.max(1,Math.round(img.naturalWidth*scale)), h=Math.max(1,Math.round(img.naturalHeight*scale));
    const c=document.createElement("canvas"); c.width=w; c.height=h;
    const ctx=c.getContext("2d"); ctx.fillStyle="#fff"; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
    const blob=await new Promise(r=>c.toBlob(r,"image/jpeg",0.85));
    if(!blob) throw new Error(`"${file.name}" could not be processed. Remove it or try a different photo.`);
    return blob;
  }
  // uploads 3 at a time, keeps the order of the photos, and stops at the first failure
  async function uploadAll(files,onProgress){
    const urls=new Array(files.length), paths=[];
    let next=0, done=0, aborted=false;
    async function worker(){
      while(!aborted){
        const i=next++; if(i>=files.length) return;
        try{
          const blob=await preparePhoto(files[i]);
          const path=`${uid()}.jpg`;
          const {error}=await db.storage.from(BUCKET).upload(path,blob,{contentType:"image/jpeg",cacheControl:"31536000",upsert:false});
          if(error){console.error(error);throw new Error(`Photo ${i+1} could not be uploaded. Make sure you are signed in as admin and try again.`);}
          paths.push(path);
          urls[i]=db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
          onProgress(++done);
        }catch(err){ aborted=true; throw err; }
      }
    }
    const results=await Promise.allSettled(Array.from({length:Math.min(3,files.length)},worker));
    const failed=results.find(r=>r.status==="rejected");
    if(failed){ const e=failed.reason instanceof Error?failed.reason:new Error("Photo upload failed."); e.paths=paths; throw e; }
    return {urls,paths};
  }

  $("#propertyForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const form=e.currentTarget, f=new FormData(form), msg=$("#propertyMessage"), btn=form.querySelector("button[type=submit]");
    btn.disabled=true; say(msg,"");
    let stored=[];
    try{
      let urls=[];
      if(picked.length){
        say(msg,`Uploading photos… 0 of ${picked.length}`);
        const r=await uploadAll(picked.map(p=>p.file),n=>say(msg,`Uploading photos… ${n} of ${picked.length}`));
        urls=r.urls; stored=r.paths;
      }
      const payload={title:f.get("title").trim(),listing_type:f.get("listing_type"),property_type:f.get("property_type")||"house",price:Number(f.get("price")),image_url:urls[0]||null,image_urls:urls,source_url:(f.get("source_url")||"").trim()||null,address:f.get("address")||null,city:f.get("city")||null,state:(f.get("state")||"").toUpperCase()||null,zip_code:f.get("zip_code")||null,beds:Number(f.get("beds")||0),baths:Number(f.get("baths")||0),sqft:Number(f.get("sqft")||0)||null,description:f.get("description")||null,is_active:true};
      const {error}=await db.from("properties").insert(payload);
      if(error){console.error(error);throw new Error("Could not add property. Check required fields and admin permissions.");}
      form.reset(); clearPicked(); $("#qfMsg").textContent="";
      say(msg,`Property added successfully${urls.length?` with ${urls.length} photo${urls.length===1?"":"s"}`:""}.`); loadProperties();
    }catch(err){
      const orphans=(err&&err.paths)||stored;     // photos already stored for a listing that was not saved
      if(orphans.length){ try{ await db.storage.from(BUCKET).remove(orphans); }catch(_){} }
      say(msg,(err&&err.message)||"Something went wrong. Please try again.",true);
    }finally{
      btn.disabled=false;
    }
  });
  showSession();
})();
