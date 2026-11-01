(() => {
  const $ = s => document.querySelector(s);
  const ready = window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY && !window.SUPABASE_ANON_KEY.includes("PASTE_");
  const client = ready ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const TYPE_LABELS = { house:"House", apartment:"Apartment", condo:"Condo", townhouse:"Townhouse", room:"Room", other:"Property" };
  const money = (amount, type) => {
    const n = Number(amount);
    if (!Number.isFinite(n)) return "Contact for price";
    return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n) + (type === "rent" ? " / month" : "");
  };

  $("#year").textContent = new Date().getFullYear();
  const loading = $("#pdLoading"), missing = $("#pdMissing"), view = $("#pdView");
  const showMissing = msg => {
    loading.hidden = true; view.hidden = true; missing.hidden = false;
    if (msg) $("#pdMissingText").textContent = msg;
  };

  const id = new URLSearchParams(location.search).get("id");
  if (!client || !id || !UUID_RE.test(id)) { showMissing(); return; }

  const PO = window.PropertyOptions || { label: () => "" };
  let current = null;

  async function load() {
    const { data, error } = await client.from("properties")
      .select("id,title,description,price,listing_type,property_type,address,city,state,zip_code,beds,baths,sqft,image_url,image_urls,created_at,owner_ref,laundry_type,parking_type,ac_type,heating_type,cat_friendly,dog_friendly,voucher_accepted")
      .eq("id", id).eq("is_active", true).maybeSingle();
    if (error) { console.error(error); showMissing("This property could not be loaded right now. Please try again later."); return; }
    if (!data) { showMissing(); return; }
    current = data;
    render(data);
  }

  function setupGallery(photos) {
    const stage = $("#pdStage"), main = $("#pdMain"), count = $("#pdCount"), prev = $("#pdPrev"), next = $("#pdNext"), thumbs = $("#pdThumbs");
    if (!photos.length) { stage.classList.add("no-photo"); prev.hidden = next.hidden = count.hidden = thumbs.hidden = true; return; }
    let i = 0;
    const show = n => {
      i = (n + photos.length) % photos.length;
      stage.classList.remove("no-photo");
      main.src = photos[i];
      count.textContent = (i + 1) + " / " + photos.length;
      thumbs.querySelectorAll("button").forEach((b, k) => b.classList.toggle("active", k === i));
    };
    main.addEventListener("error", () => stage.classList.add("no-photo"));
    photos.forEach((u, k) => {
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("aria-label", "Show photo " + (k + 1));
      const im = document.createElement("img");
      im.src = u; im.alt = ""; im.loading = "lazy"; im.referrerPolicy = "no-referrer";
      im.addEventListener("error", () => { b.hidden = true; });
      b.append(im); b.addEventListener("click", () => show(k)); thumbs.append(b);
    });
    const multi = photos.length > 1;
    prev.hidden = next.hidden = count.hidden = thumbs.hidden = !multi;
    prev.addEventListener("click", () => show(i - 1));
    next.addEventListener("click", () => show(i + 1));
    document.addEventListener("keydown", e => {
      if (!multi || e.target.closest("input,textarea,select")) return;
      if (e.key === "ArrowLeft") show(i - 1);
      if (e.key === "ArrowRight") show(i + 1);
    });
    show(0);
  }

  function render(p) {
    document.title = p.title + " | USA Real Estate";
    const photos = (p.image_urls && p.image_urls.length) ? p.image_urls : (p.image_url ? [p.image_url] : []);
    $("#pdMain").alt = p.title;
    setupGallery(photos);
    $("#pdTag").textContent = p.listing_type === "rent" ? "For rent" : "For sale";
    $("#pdPrice").textContent = money(p.price, p.listing_type);
    $("#pdTitle").textContent = p.title;
    $("#pdAddress").textContent = [p.address, p.city, p.state, p.zip_code].filter(Boolean).join(", ");

    const beds = Number(p.beds) || 0, baths = Number(p.baths) || 0;
    const facts = [
      [beds ? String(beds) : "Studio", beds ? (beds === 1 ? "Bedroom" : "Bedrooms") : "Layout"],
      [String(baths), baths === 1 ? "Bathroom" : "Bathrooms"],
      [TYPE_LABELS[p.property_type] || "Property", "Type"]
    ];
    if (p.sqft) facts.push([Number(p.sqft).toLocaleString("en-US"), "Sq Ft"]);
    const ul = $("#pdFacts");
    facts.forEach(([v, l]) => {
      const li = document.createElement("li");
      const b = document.createElement("b"); b.textContent = v;
      const s = document.createElement("span"); s.textContent = l;
      li.append(b, s); ul.append(li);
    });

    $("#pdDesc").textContent = (p.description && p.description.trim()) || "Contact our team for more details about this property.";

    const rows = [
      ["Listing", p.listing_type === "rent" ? "For rent" : "For sale"],
      ["Property type", TYPE_LABELS[p.property_type] || "Property"],
      ["Bedrooms", beds ? String(beds) : "Studio"],
      ["Bathrooms", String(baths)],
      ["Size", p.sqft ? Number(p.sqft).toLocaleString("en-US") + " sq ft" : ""],
      ["Address", p.address || ""],
      ["City", p.city || ""],
      ["State", p.state || ""],
      ["ZIP code", p.zip_code || ""],
      ["Laundry", PO.label("laundry_type", p.laundry_type)],
      ["Parking", PO.label("parking_type", p.parking_type)],
      ["Air conditioning", PO.label("ac_type", p.ac_type)],
      ["Heating", PO.label("heating_type", p.heating_type)],
      ...(p.listing_type === "rent" ? [
        ["Cats", p.cat_friendly ? "Allowed" : "Not allowed"],
        ["Dogs", p.dog_friendly ? "Allowed" : "Not allowed"],
        ["Housing vouchers", p.voucher_accepted ? "Accepted" : "Not accepted"]
      ] : []),
      ["Listed on", p.created_at ? new Date(p.created_at).toLocaleDateString("en-US", {year:"numeric", month:"long", day:"numeric"}) : ""]
    ];
    const dl = $("#pdDetails");
    rows.filter(r => r[1]).forEach(([k, v]) => {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v;
      dl.append(dt, dd);
    });
    const place = [p.address, p.city, p.state, p.zip_code].filter(Boolean).join(", ");
    if (place) { const a = $("#pdMap"); a.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(place); a.hidden = false; }

    const form = $("#leadForm");
    form.elements.interest.value = p.listing_type === "rent" ? "rent" : "buy";
    loading.hidden = true; missing.hidden = true; view.hidden = false;
  }

  /* ---- inquiry form (saved with this property) ---- */
  const form = $("#leadForm");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("#leadMessage");
    msg.className = "form-message";
    if (!current) return;
    const v = Object.fromEntries(new FormData(form).entries());
    const email = (v.email || "").trim().toLowerCase();
    const payload = {
      full_name: v.full_name.trim(), phone: v.phone.trim(), email: email || null,
      interest: v.interest,
      preferred_location: [current.city, current.state].filter(Boolean).join(", ") || null,
      message: (v.message || "").trim() || null,
      property_id: current.id,
      // the employee who posted the property gets the credit; otherwise the link the visitor came from
      ref_code: current.owner_ref || (window.RefTracker && window.RefTracker.get()) || null,
      contact_consent: v.contact_consent === "on",
      marketing_consent: v.marketing_consent === "on",
      source: "website"
    };
    const button = form.querySelector("button[type=submit]");
    button.disabled = true; button.textContent = "Sending…";
    let { error } = await client.from("leads").insert(payload);
    if (error && error.code === "23503") {   // listing removed meanwhile: still keep the inquiry
      payload.property_id = null;
      ({ error } = await client.from("leads").insert(payload));
    }
    button.disabled = false; button.innerHTML = 'Send my details <span>→</span>';
    if (error) {
      msg.textContent = "We couldn't submit your details right now. Please try again or contact our team.";
      msg.classList.add("error"); console.error(error); return;
    }
    form.reset();
    form.elements.interest.value = current.listing_type === "rent" ? "rent" : "buy";
    msg.textContent = "Thank you! Your details have been received. Our team will contact you about this property.";
  });

  load();
})();
