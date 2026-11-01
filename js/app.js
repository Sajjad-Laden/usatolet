(() => {
  const $ = (s) => document.querySelector(s);
  const supabaseReady = () => window.supabase && window.SUPABASE_URL &&
    window.SUPABASE_ANON_KEY && !window.SUPABASE_ANON_KEY.includes("PASTE_");
  const client = supabaseReady()
    ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
    : null;

  $("#year").textContent = new Date().getFullYear();
  $("#menuToggle").addEventListener("click", () => $("#mainNav").classList.toggle("open"));
  $("#mainNav").querySelectorAll("a").forEach(a => a.addEventListener("click", () => $("#mainNav").classList.remove("open")));

  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
  const money = (amount, type) => {
    const n = Number(amount);
    if (!Number.isFinite(n)) return "Contact for price";
    return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n) + (type === "rent" ? " / month" : "");
  };
  const TYPE_LABELS = { house:"House", apartment:"Apartment", condo:"Condo", townhouse:"Townhouse", room:"Room", other:"Property" };
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const FALLBACK_IMG = "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=900&q=80";

  const form = $("#leadForm");
  const chip = $("#selectedProperty");
  let allProperties = [];

  // every photo of a listing, cover first (older listings only have image_url)
  const photosOf = p => {
    const list = Array.isArray(p.image_urls) ? p.image_urls.filter(Boolean) : [];
    if (!list.length && p.image_url) list.push(p.image_url);
    return list.length ? list : [FALLBACK_IMG];
  };

  /* ---- property the visitor is asking about ---- */
  function selectProperty(p) {
    form.elements.property_id.value = p.id;
    $("#selectedPropertyTitle").textContent = p.title;
    $("#selectedPropertyMeta").textContent = [
      money(p.price, p.listing_type),
      [p.address, p.city, p.state].filter(Boolean).join(", ")
    ].filter(Boolean).join(" · ");
    chip.hidden = false;
    if (!form.elements.interest.value) form.elements.interest.value = p.listing_type === "rent" ? "rent" : "buy";
  }
  function clearProperty() {
    form.elements.property_id.value = "";
    chip.hidden = true;
  }
  $("#clearProperty").addEventListener("click", clearProperty);

  /* ---- load + render listings ---- */
  async function loadProperties() {
    const grid = $("#propertyGrid");
    if (!client) {
      grid.innerHTML = '<div class="empty-state">Website preview is ready. Add your Supabase publishable key and run supabase-schema.sql to load live property listings.</div>';
      return;
    }
    const { data, error } = await client.from("properties")
      .select("id,title,description,price,listing_type,property_type,address,city,state,zip_code,beds,baths,sqft,image_url,image_urls")
      .eq("is_active", true).order("created_at", {ascending:false});
    if (error) {
      grid.innerHTML = '<div class="empty-state">Property listings are temporarily unavailable. Please try again later.</div>';
      console.error(error);
      return;
    }
    allProperties = data || [];
    renderProperties(allProperties);
    openFromLink();
  }

  // A shared link like index.html?property=<id> highlights that listing and pre-selects it in the form.
  function openFromLink() {
    const id = new URLSearchParams(location.search).get("property");
    if (!id || !UUID_RE.test(id)) return;
    const p = allProperties.find(x => x.id === id);
    if (!p) return;
    selectProperty(p);
    const card = document.getElementById("property-" + id);
    if (card) {
      card.classList.add("highlight");
      card.scrollIntoView({behavior:"smooth", block:"center"});
    }
  }

  function renderProperties(items) {
    const grid = $("#propertyGrid");
    if (!items.length) {
      grid.innerHTML = '<div class="empty-state">No matching properties yet. Please check back soon or send us an inquiry.</div>';
      return;
    }
    grid.innerHTML = items.map(p => {
      const beds = Number(p.beds) || 0;
      const photos = photosOf(p);
      const many = photos.length > 1;
      return `
      <article class="property-card" id="property-${escapeHTML(p.id)}">
        <div class="property-image">
          <div class="gallery">
            <div class="gallery-track">${photos.map((u, i) => `<img ${i ? 'loading="lazy"' : ""} src="${escapeHTML(u)}" alt="${escapeHTML(p.title)}${many ? " - photo " + (i + 1) : ""}" data-photo="${i}" tabindex="0" role="button" aria-label="View larger photo ${i + 1} of ${photos.length}">`).join("")}</div>
            ${many ? `<button type="button" class="g-btn g-prev" aria-label="Previous photo">‹</button><button type="button" class="g-btn g-next" aria-label="Next photo">›</button><span class="g-count" aria-hidden="true">1 / ${photos.length}</span>` : ""}
          </div>
          <span class="property-tag">${p.listing_type === "rent" ? "For rent" : "For sale"}</span>
        </div>
        <div class="property-info">
          <p class="property-price">${money(p.price,p.listing_type)}</p>
          <h3>${escapeHTML(p.title)}</h3>
          <p class="property-address">${escapeHTML([p.address,p.city,p.state,p.zip_code].filter(Boolean).join(", "))}</p>
          <div class="property-meta"><span>${beds ? beds + " Beds" : "Studio"}</span><span>${Number(p.baths)||0} Baths</span><span>${escapeHTML(TYPE_LABELS[p.property_type] || "Property")}</span>${p.sqft ? `<span>${Number(p.sqft).toLocaleString("en-US")} Sq Ft</span>` : ""}</div>
          <a class="property-link" href="#contact" data-id="${escapeHTML(p.id)}">REQUEST DETAILS ↗</a>
        </div>
      </article>`;
    }).join("");
    grid.querySelectorAll("[data-id]").forEach(a => a.addEventListener("click", () => {
      const p = allProperties.find(x => x.id === a.dataset.id);
      if (p) selectProperty(p);
    }));
  }

  /* ---- card gallery: arrows, counter, open full-size ---- */
  const grid = $("#propertyGrid");
  const cardOf = el => el.closest(".property-card");
  const propertyOf = card => allProperties.find(x => "property-" + x.id === card.id);

  grid.addEventListener("click", e => {
    const btn = e.target.closest(".g-btn");
    if (btn) {
      const track = btn.closest(".gallery").querySelector(".gallery-track");
      track.scrollBy({ left: (btn.classList.contains("g-next") ? 1 : -1) * track.clientWidth, behavior: "smooth" });
      return;
    }
    const img = e.target.closest(".gallery-track img");
    if (img) openLightbox(cardOf(img), Number(img.dataset.photo) || 0);
  });
  grid.addEventListener("keydown", e => {
    const img = e.target.closest && e.target.closest(".gallery-track img");
    if (img && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openLightbox(cardOf(img), Number(img.dataset.photo) || 0); }
  });
  // scroll events do not bubble, so listen in the capture phase to keep the "2 / 5" counter in sync (also when swiping)
  grid.addEventListener("scroll", e => {
    const track = e.target;
    if (!track.classList || !track.classList.contains("gallery-track")) return;
    const count = track.parentElement.querySelector(".g-count");
    if (!count) return;
    const total = track.children.length;
    const i = Math.min(total - 1, Math.max(0, Math.round(track.scrollLeft / track.clientWidth)));
    count.textContent = `${i + 1} / ${total}`;
  }, true);

  /* ---- full-size viewer ---- */
  const lb = { el: $("#lightbox"), img: $("#lbImg"), count: $("#lbCount"), prev: $("#lbPrev"), next: $("#lbNext"), list: [], i: 0, title: "", opener: null };
  function lbRender() {
    lb.img.src = lb.list[lb.i];
    lb.img.alt = `${lb.title} - photo ${lb.i + 1} of ${lb.list.length}`;
    lb.count.textContent = lb.list.length > 1 ? `${lb.i + 1} / ${lb.list.length}` : "";
    lb.prev.hidden = lb.next.hidden = lb.list.length < 2;
  }
  function openLightbox(card, index) {
    const p = card && propertyOf(card);
    if (!p) return;
    lb.list = photosOf(p); lb.title = p.title; lb.i = Math.min(index, lb.list.length - 1);
    lb.opener = document.activeElement;
    lb.el.hidden = false;
    document.body.classList.add("no-scroll");
    lbRender();
    $("#lbClose").focus();
  }
  function closeLightbox() {
    if (lb.el.hidden) return;
    lb.el.hidden = true;
    document.body.classList.remove("no-scroll");
    lb.img.removeAttribute("src");
    if (lb.opener && lb.opener.focus) lb.opener.focus();
  }
  const step = d => { lb.i = (lb.i + d + lb.list.length) % lb.list.length; lbRender(); };
  $("#lbClose").addEventListener("click", closeLightbox);
  lb.prev.addEventListener("click", () => step(-1));
  lb.next.addEventListener("click", () => step(1));
  lb.el.addEventListener("click", e => { if (e.target === lb.el) closeLightbox(); });
  document.addEventListener("keydown", e => {
    if (lb.el.hidden) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft" && lb.list.length > 1) step(-1);
    else if (e.key === "ArrowRight" && lb.list.length > 1) step(1);
  });
  let touchX = null;
  lb.el.addEventListener("touchstart", e => { touchX = e.changedTouches[0].clientX; }, { passive: true });
  lb.el.addEventListener("touchend", e => {
    if (touchX === null || lb.list.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchX; touchX = null;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  /* ---- search ---- */
  $("#searchForm").addEventListener("submit", e => {
    e.preventDefault();
    const type = $("#filterType").value;
    const location = $("#filterLocation").value.trim().toLowerCase();
    const beds = Number($("#filterBeds").value || 0);
    const filtered = allProperties.filter(p => {
      const place = [p.address,p.city,p.state,p.zip_code].join(" ").toLowerCase();
      return (!type || p.listing_type === type) && (!location || place.includes(location)) && (!beds || Number(p.beds) >= beds);
    });
    renderProperties(filtered);
    $("#properties").scrollIntoView({behavior:"smooth"});
  });

  /* ---- inquiry form ---- */
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("#leadMessage");
    msg.className = "form-message";
    if (!client) {
      msg.textContent = "The form is in preview mode. Add your Supabase publishable key and database schema to enable submissions.";
      msg.classList.add("error"); return;
    }
    const v = Object.fromEntries(new FormData(form).entries());
    const email = (v.email || "").trim().toLowerCase();
    const payload = {
      full_name: v.full_name.trim(), phone: v.phone.trim(), email: email || null,
      interest: v.interest, preferred_location: (v.preferred_location || "").trim() || null,
      message: (v.message || "").trim() || null,
      property_id: UUID_RE.test(v.property_id || "") ? v.property_id : null,
      contact_consent: v.contact_consent === "on",
      marketing_consent: v.marketing_consent === "on",
      source: "website"
    };
    const button = form.querySelector("button[type=submit]");
    button.disabled = true; button.textContent = "Sending…";
    let { error } = await client.from("leads").insert(payload);
    if (error && error.code === "23503" && payload.property_id) {
      // the listing was removed while the visitor was typing: still keep the inquiry
      payload.property_id = null;
      ({ error } = await client.from("leads").insert(payload));
    }
    button.disabled = false; button.innerHTML = 'Send my request <span>→</span>';
    if (error) {
      msg.textContent = "We couldn't submit your request right now. Please try again or contact our team.";
      msg.classList.add("error"); console.error(error); return;
    }
    form.reset();
    clearProperty();
    msg.textContent = "Thank you! Your request has been received. Our team will contact you.";
  });

  loadProperties();
})();
