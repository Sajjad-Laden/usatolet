/*
 * Shared "add / edit property" form (photos, advanced details, save).
 * Used by the admin panel and by the employee "Manage rental" page.
 *   const pf = PropertyForm.init({ db, mount, labels?, extraInsert?, onSaved? })
 *   pf.startEdit(property) / pf.exitEdit() / pf.isEditing(id)
 */
(function (root) {
  "use strict";
  const BUCKET = "property-images";
  const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const photosOf = (p) => (p.image_urls && p.image_urls.length) ? p.image_urls : (p.image_url ? [p.image_url] : []);
  const pathFromUrl = (url) => {
    const parts = String(url).split("/object/public/" + BUCKET + "/");
    return parts.length > 1 ? decodeURIComponent(parts[1].split("?")[0]) : null;
  };
  const uid = () => (root.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const say = (el, msg, bad) => { el.textContent = msg; el.className = "form-message" + (bad ? " error" : ""); };
  const opts = (field) => '<option value="">Select…</option>' +
    root.PropertyOptions.FIELDS[field].map(([v, l]) => `<option value="${v}">${l}</option>`).join("");

  const template = (title) => `
<form id="propertyForm" class="property-admin-form"><h3 id="formTitle">${title}</h3>
<div class="form-row"><label>Title *<input name="title" required maxlength="160"></label><label>Listing type *<select name="listing_type" required><option value="rent">For rent</option><option value="sale">For sale</option></select></label></div>
<div class="form-row"><label>Price (USD) *<input name="price" type="number" min="0" required></label><label>Property type *<select name="property_type" required><option value="house">House</option><option value="apartment">Apartment</option><option value="condo">Condo</option><option value="townhouse">Townhouse</option><option value="room">Room</option><option value="other">Other</option></select></label></div>
<label>Property photos <span class="file-hint">JPG, PNG or WebP. Select as many as you want (you can add more in several rounds). The first photo is the cover.</span><input id="propertyImage" name="image" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
<div id="imagePreview" class="image-preview" hidden><div class="preview-bar"><span id="photoCount"></span><button type="button" id="removeImage" class="status-select">Remove all</button></div><div id="imagePreviewList" class="thumb-grid"></div></div>
<label>Street address<input name="address" maxlength="200"></label>
<div class="form-row"><label>City<input name="city"></label><label>State<input name="state" maxlength="2" placeholder="NY"></label><label>ZIP<input name="zip_code" maxlength="12"></label></div>
<div class="form-row"><label>Bedrooms<input name="beds" type="number" min="0" value="1"></label><label>Bathrooms<input name="baths" type="number" min="0" step=".5" value="1"></label><label>Property square feet<input name="sqft" type="number" min="0"></label></div>
<div class="form-subhead">Advanced details <span>optional</span></div>
<div class="form-row"><label>Laundry type<select name="laundry_type">${opts("laundry_type")}</select></label><label>Parking type<select name="parking_type">${opts("parking_type")}</select></label></div>
<div class="form-row"><label>Air conditioning type<select name="ac_type">${opts("ac_type")}</select></label><label>Heating type<select name="heating_type">${opts("heating_type")}</select></label></div>
<div class="form-row"><label class="check-row"><input type="checkbox" name="cat_friendly"> Cat friendly</label><label class="check-row"><input type="checkbox" name="dog_friendly"> Dog friendly</label><label>Housing voucher<select name="voucher_accepted"><option value="no">Not accepted</option><option value="yes">Accepted</option></select></label></div>
<label>Description<textarea name="description" rows="3" placeholder="Utilities, amenities, deposits needed, when it is available…"></textarea></label>
<label class="check-row"><input type="checkbox" name="is_active" checked> Visible on the website (untick to hide it)</label>
<div class="form-buttons"><button type="submit" id="propertySubmit" class="button button-dark">Add property <span>→</span></button><button type="button" id="cancelEdit" class="button button-outline" hidden>Cancel editing</button></div><p id="propertyMessage" class="form-message" role="status"></p></form>`;

  function init(cfg) {
    const db = cfg.db, mount = cfg.mount;
    const labels = Object.assign({ add: "Add a property", edit: "Edit property" }, cfg.labels || {});
    mount.innerHTML = template(labels.add);
    const $ = (s) => mount.querySelector(s);
    const form = $("#propertyForm"), msg = $("#propertyMessage"), submitBtn = $("#propertySubmit"), cancelBtn = $("#cancelEdit"), formTitle = $("#formTitle");
    const imgInput = $("#propertyImage"), preview = $("#imagePreview"), previewList = $("#imagePreviewList"), photoCount = $("#photoCount");
    let editingId = null;
    let items = [];        // photos in display order (first = cover): {url} = saved, {url,file} = new
    let removedUrls = [];  // saved photos removed while editing

    function renderPreview() {
      previewList.innerHTML = "";
      items.forEach((it, i) => {
        const fig = document.createElement("figure"); fig.className = "thumb-item";
        const img = document.createElement("img"); img.src = it.url; img.alt = "Photo " + (i + 1); img.referrerPolicy = "no-referrer";
        img.addEventListener("error", () => fig.classList.add("broken"));
        const rm = document.createElement("button"); rm.type = "button"; rm.className = "thumb-remove"; rm.textContent = "×"; rm.setAttribute("aria-label", "Remove photo " + (i + 1));
        rm.addEventListener("click", () => {
          if (it.file) URL.revokeObjectURL(it.url); else removedUrls.push(it.url);
          items.splice(items.indexOf(it), 1); renderPreview();
        });
        fig.append(img, rm);
        if (i === 0) { const tag = document.createElement("span"); tag.className = "thumb-cover"; tag.textContent = "Cover"; fig.append(tag); }
        else {
          const mk = document.createElement("button"); mk.type = "button"; mk.className = "thumb-make"; mk.textContent = "Make cover";
          mk.addEventListener("click", () => { items.splice(items.indexOf(it), 1); items.unshift(it); renderPreview(); });
          fig.append(mk);
        }
        previewList.append(fig);
      });
      preview.hidden = !items.length;
      photoCount.textContent = items.length + (items.length === 1 ? " photo" : " photos");
    }
    function resetPhotos() { items.forEach((it) => { if (it.file) URL.revokeObjectURL(it.url); }); items = []; removedUrls = []; renderPreview(); }

    imgInput.addEventListener("change", () => {
      let bad = "";
      for (const f of imgInput.files) {
        if (!OK_TYPES.includes(f.type)) { bad = "Some files were skipped: only JPG, PNG or WebP photos are allowed."; continue; }
        if (f.size > 20 * 1024 * 1024) { bad = "Some photos were skipped because they are over 20 MB."; continue; }
        items.push({ file: f, url: URL.createObjectURL(f) });
      }
      imgInput.value = "";
      say(msg, bad, !!bad);
      renderPreview();
    });
    $("#removeImage").addEventListener("click", () => {
      items.forEach((it) => { if (it.file) URL.revokeObjectURL(it.url); else removedUrls.push(it.url); });
      items = []; renderPreview();
    });

    function startEdit(p) {
      editingId = p.id;
      resetPhotos();
      const set = (n, v) => { form.elements[n].value = (v === null || v === undefined) ? "" : v; };
      set("title", p.title); set("listing_type", p.listing_type); set("property_type", p.property_type || "house"); set("price", p.price);
      set("address", p.address); set("city", p.city); set("state", p.state); set("zip_code", p.zip_code);
      set("beds", p.beds); set("baths", p.baths); set("sqft", p.sqft); set("description", p.description);
      set("laundry_type", p.laundry_type); set("parking_type", p.parking_type); set("ac_type", p.ac_type); set("heating_type", p.heating_type);
      form.elements.cat_friendly.checked = !!p.cat_friendly;
      form.elements.dog_friendly.checked = !!p.dog_friendly;
      form.elements.voucher_accepted.value = p.voucher_accepted ? "yes" : "no";
      form.elements.is_active.checked = !!p.is_active;
      items = photosOf(p).map((u) => ({ url: u })); renderPreview();
      formTitle.textContent = labels.edit;
      submitBtn.innerHTML = 'Save changes <span>→</span>';
      cancelBtn.hidden = false;
      say(msg, "");
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    function exitEdit() {
      editingId = null;
      form.reset(); resetPhotos();
      formTitle.textContent = labels.add;
      submitBtn.innerHTML = 'Add property <span>→</span>';
      cancelBtn.hidden = true;
    }
    cancelBtn.addEventListener("click", () => { exitEdit(); say(msg, ""); });

    function loadImage(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file), img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This photo could not be read. Try a different image.")); };
        img.src = url;
      });
    }
    // max 1600px on the long side, JPEG ~85%: keeps pages fast and free storage small
    async function preparePhoto(file) {
      const img = await loadImage(file);
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
      if (!blob) throw new Error("This photo could not be processed. Try a different image.");
      return blob;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      submitBtn.disabled = true; say(msg, "");
      const uploadedPaths = [];
      const wasEditing = !!editingId;
      try {
        const image_urls = [], newCount = items.filter((i) => i.file).length;
        let done = 0;
        for (const it of items) {
          if (!it.file) { image_urls.push(it.url); continue; }
          done++; say(msg, `Uploading photo ${done} of ${newCount}…`);
          const blob = await preparePhoto(it.file);
          const path = `${uid()}.jpg`;
          const { error: upErr } = await db.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
          if (upErr) { console.error(upErr); throw new Error(`Photo ${done} upload failed. Make sure you are signed in (and the latest SQL was run in Supabase), then try again.`); }
          uploadedPaths.push(path);
          image_urls.push(db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
        }
        const payload = {
          title: f.get("title").trim(), listing_type: f.get("listing_type"), property_type: f.get("property_type") || "house",
          price: Number(f.get("price")), image_url: image_urls[0] || null, image_urls,
          address: f.get("address") || null, city: f.get("city") || null,
          state: (f.get("state") || "").toUpperCase() || null, zip_code: f.get("zip_code") || null,
          beds: Number(f.get("beds") || 0), baths: Number(f.get("baths") || 0), sqft: Number(f.get("sqft") || 0) || null,
          laundry_type: f.get("laundry_type") || null, parking_type: f.get("parking_type") || null,
          ac_type: f.get("ac_type") || null, heating_type: f.get("heating_type") || null,
          cat_friendly: form.elements.cat_friendly.checked, dog_friendly: form.elements.dog_friendly.checked,
          voucher_accepted: f.get("voucher_accepted") === "yes",
          description: f.get("description") || null, is_active: form.elements.is_active.checked
        };
        if (wasEditing) {
          const { data, error } = await db.from("properties").update(payload).eq("id", editingId).select("id");
          if (error || !data || !data.length) { console.error(error); throw new Error("Could not save changes. Check required fields and permissions."); }
        } else {
          const row = Object.assign({}, payload, cfg.extraInsert ? cfg.extraInsert() : {});
          const { error } = await db.from("properties").insert(row);
          if (error) { console.error(error); throw new Error("Could not add the property. Check required fields, and make sure the latest SQL (supabase-posts.sql) was run."); }
        }
        // saved: now it is safe to delete photos that were removed
        const gone = removedUrls.filter((u) => !image_urls.includes(u)).map(pathFromUrl).filter(Boolean);
        if (gone.length) { try { await db.storage.from(BUCKET).remove(gone); } catch (err) { console.warn(err); } }
        exitEdit();
        say(msg, wasEditing ? "Changes saved." : "Property added successfully.");
        if (cfg.onSaved) cfg.onSaved();
      } catch (err) {
        if (uploadedPaths.length) { try { await db.storage.from(BUCKET).remove(uploadedPaths); } catch (_) {} }
        say(msg, err.message || "Something went wrong. Please try again.", true);
      } finally {
        submitBtn.disabled = false;
      }
    });

    return { startEdit, exitEdit, isEditing: (id) => editingId === id };
  }

  root.PropertyForm = { init, photosOf, pathFromUrl };
})(window);
