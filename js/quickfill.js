/*
 * QuickFill: reads the text of a Facebook / Marketplace listing and guesses the form fields.
 * Runs fully in the browser (nothing is sent anywhere). It is a helper: the admin always
 * reviews the fields before saving.
 *
 * QuickFill.parse(text) -> {
 *   title, listing_type, property_type, price, beds, baths, sqft,
 *   address, city, state, zip_code, description, facebookUrl, filled: [field names found]
 * }
 */
(function (root) {
  "use strict";

  const STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));
  const TYPE_LABELS = { house: "House", apartment: "Apartment", condo: "Condo", townhouse: "Townhouse", room: "Room", other: "Property" };

  const DIR = "(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West)";
  const TOKEN = "[A-Za-z0-9][A-Za-z0-9'.-]*";
  const SUF_ALL = "(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pl|Place|Ter|Terrace|Cir|Circle|Pkwy|Parkway|Hwy|Highway|Trl|Trail|Sq|Square)";
  // without a house number only the unambiguous suffixes count ("Nice Place" is not a street)
  const SUF_CLEAN = "(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Pl|Ter|Terrace|Cir|Circle|Pkwy|Parkway|Hwy|Highway|Trl|Trail)";
  const streetRe = (num, suf) =>
    new RegExp(`^${num}(?:${DIR}\\.?\\s+)?(?:${TOKEN}\\s+){0,3}${TOKEN}\\s+${suf}\\.?(?:\\s+${DIR}\\.?)?$`, "i");
  const STREET_NUM = streetRe("\\d{1,6}\\s+", SUF_ALL);
  const STREET_NONUM = streetRe("", SUF_CLEAN);
  const STREET_TAIL = new RegExp(`(\\d{1,6}\\s+(?:${DIR}\\.?\\s+)?(?:${TOKEN}\\s+){0,3}${TOKEN}\\s+${SUF_ALL}\\.?(?:\\s+${DIR}\\.?)?)$`, "i");
  const SUF_WORD = new RegExp(`^${SUF_ALL}\\.?$`, "i");

  const isStreet = (s) => STREET_NUM.test(s) || STREET_NONUM.test(s);

  /* ---------- contact info must not end up on the public page ---------- */
  const PHONE_RE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
  const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
  const FB_URL_RE = /https?:\/\/(?:[a-z0-9-]+\.)?(?:facebook\.com|fb\.com|fb\.me)\/[^\s<>"']+/i;
  const EMOJI_RE = /[\p{Extended_Pictographic}️‍]/gu;

  function cleanDescription(text) {
    const lines = text
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => {
        const stripped = line.replace(URL_RE, " ").replace(EMAIL_RE, " ").replace(PHONE_RE, " ").replace(/[ \t]{2,}/g, " ").trim();
        // a line that was only "Call / text 555…" is now an empty stub: drop it
        if (stripped !== line.trim() && stripped.length <= 28 && /call|text|contact|whats\s?app|message|dm|reach|email|phone/i.test(stripped)) return "";
        return stripped;
      });
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 2000);
  }

  /* ---------- price ---------- */
  function findPrice(text) {
    const cands = [];
    const re = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?\s?(k\b)?/gi;
    let m;
    while ((m = re.exec(text))) {
      let v = Number(m[1].replace(/,/g, "") + (m[2] || ""));
      if (m[3]) v *= 1000;
      if (!(v >= 100)) continue;
      const before = text.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 22).toLowerCase();
      let score = 0;
      if (/^\s*(?:\/|per\s+|a\s+|each\s+)?\s*(?:mo|month|monthly|mth)\b/.test(after)) score += 3;
      if (/(rent|price|asking|list(?:ed)?(?:\s+price)?|only|for)\s*[:\-–]?\s*$/.test(before)) score += 2;
      if (/(deposit|fee|application|security|utilit|pet|move.?in|cleaning|down)[^$]{0,24}$/.test(before)) score -= 4;
      if (/^\s*(?:\w+\s+){0,2}(?:deposit|fee|application)/.test(after)) score -= 4;
      cands.push({ v, score, i: m.index });
    }
    const re2 = /(\d{3,6})\s*(?:\/|per)\s*(?:mo|month)\b/gi;
    while ((m = re2.exec(text))) {
      if (text[m.index - 1] === "$") continue;
      cands.push({ v: Number(m[1]), score: 3, i: m.index });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => b.score - a.score || a.i - b.i);
    return cands[0].v;
  }

  /* ---------- location ---------- */
  const titleCase = (s) => s.replace(/\b([a-z])([a-z']*)/g, (_, a, b) => a.toUpperCase() + b);
  const cleanCity = (s) => {
    s = s.replace(/[.]+$/, "").trim();
    // "Room for rent in Peoria" -> "Peoria"
    const prep = s.match(/\b(?:in|at|near)\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,2})$/i);
    if (prep) s = prep[1];
    if (!/^[A-Za-z][A-Za-z .'-]{1,30}$/.test(s)) return null;
    if (s.split(" ").length > 4 || isStreet(s)) return null;
    if (/\b(?:bed|bath|rent|sale|available|apartment|house|home|studio|room)\b/i.test(s)) return null;
    return s === s.toLowerCase() ? titleCase(s) : s;
  };
  const cleanStreet = (s) => {
    s = s.trim().replace(/[.]+$/, "");
    if (isStreet(s)) return s;
    const t = s.match(STREET_TAIL);
    return t ? t[1] : null;
  };

  function findLocation(text) {
    const clean = text
      .replace(EMOJI_RE, " ")
      .replace(/\$\s?[\d,]+(?:\.\d+)?\s?k?\b/gi, " | ")   // prices must not be read as house numbers
      .replace(/([a-z]{4})\.\s+/g, "$1\n");              // sentence end ("1 bathroom. 55 Park Ave") starts a new segment
    const segs = clean.split(/[\r\n]+|,(?!\d)|;|\s[-–—•|·]\s/).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
    const out = { address: null, city: null, state: null, zip_code: null };

    // A) "..., Street, City, ST 12345" (state as its own segment)
    for (let i = 1; i < segs.length; i++) {
      const m = segs[i].match(/^([A-Z]{2})\b(?:\s+(\d{5})(?:-\d{4})?)?/);
      if (!m || !STATES.has(m[1])) continue;
      const city = cleanCity(segs[i - 1]);
      if (!city) continue;
      out.city = city; out.state = m[1]; out.zip_code = m[2] || null;
      if (i >= 2) out.address = cleanStreet(segs[i - 2]);
      return out;
    }
    // B) "... Street City ST 12345" inside one segment
    for (const seg of segs) {
      const m = seg.match(/((?:\d{1,6}\s+)?(?:[A-Z][A-Za-z.'-]*\s+){0,4}[A-Z][A-Za-z.'-]*)\s+([A-Z]{2})(?:\s+(\d{5})(?:-\d{4})?)?[.!]?$/);
      if (!m || !STATES.has(m[2])) continue;
      const words = m[1].split(/\s+/);
      let k = -1;
      for (let j = words.length - 2; j >= 0; j--) if (SUF_WORD.test(words[j])) { k = j; break; }
      let street = null, cityWords = words;
      if (k >= 0) {
        street = words.slice(0, k + 1).join(" ");
        cityWords = words.slice(k + 1);
        if (cityWords.length && /^(?:N|S|E|W|NE|NW|SE|SW)$/.test(cityWords[0]) && cityWords.length > 1) { street += " " + cityWords[0]; cityWords = cityWords.slice(1); }
      }
      const city = cleanCity(cityWords.join(" "));
      if (!city) continue;
      out.city = city; out.state = m[2]; out.zip_code = m[3] || null;
      out.address = street && cleanStreet(street);
      return out;
    }
    return out;
  }

  /* ---------- everything else ---------- */
  function detectType(t) {
    if (/\b(?:town\s?house|town\s?home)s?\b/i.test(t)) return "townhouse";
    if (/\b(?:condo|condominium)s?\b/i.test(t)) return "condo";
    if (/\b(?:apartment|apt|flat)s?\b/i.test(t)) return "apartment";
    if (/\b(?:private\s+room|room\s+for\s+rent|room\s+available|single\s+room|roommate)\b/i.test(t)) return "room";
    if (/\b(?:house|home|single[\s-]?family|sfh|bungalow|duplex|villa)s?\b/i.test(t)) return "house";
    return null;
  }
  function detectListing(t, price) {
    const sale = t.search(/\bfor\s+sale\b|\bselling\b|\bsale\s+price\b|\bmls\b|\bbuy\b/i);
    const rent = t.search(/\bfor\s+rent\b|\brent(?:al|ing)?\b|\blease\b|\/\s*mo\b|\bper\s+month\b|\ba\s+month\b|\bmonthly\b|\bdeposit\b/i);
    if (sale >= 0 && rent < 0) return "sale";
    if (rent >= 0 && sale < 0) return "rent";
    if (sale >= 0 && rent >= 0) return sale < rent ? "sale" : "rent";
    return price && price >= 20000 ? "sale" : "rent";
  }
  function findBeds(t) {
    let m = t.match(/(\d+(?:\.\d+)?)\s*[-–]?\s*(?:bed(?:room)?s?|bdrms?|bds?|brs?)\b/i);
    if (m) return Math.floor(Number(m[1]));
    m = t.match(/\bbed(?:room)?s?\s*[:\-]\s*(\d+)/i);
    if (m) return Number(m[1]);
    if (/\bstudio\b/i.test(t)) return 0;
    return null;
  }
  function findBaths(t) {
    let m = t.match(/(\d+(?:\.\d+)?)\s*[-–]?\s*(?:bath(?:room)?s?|baths?|bth|ba)\b/i);
    if (m) return Number(m[1]);
    m = t.match(/\bbath(?:room)?s?\s*[:\-]\s*(\d+(?:\.\d+)?)/i);
    return m ? Number(m[1]) : null;
  }
  function findSlash(t) {
    const m = t.match(/\b(\d)\s*(?:bd|br|bed|b)\s*\/\s*(\d(?:\.5)?)\s*(?:ba|bath|b)\b/i);
    return m ? { beds: Number(m[1]), baths: Number(m[2]) } : null;
  }
  function findSqft(t) {
    const m = t.match(/(\d{1,3}(?:,\d{3})+|\d{3,5})\s*(?:sq\.?\s*ft\.?|sqft|square\s+(?:feet|foot)|sf)\b/i);
    if (!m) return null;
    const v = Number(m[1].replace(/,/g, ""));
    return v >= 100 && v <= 99999 ? v : null;
  }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function parse(raw) {
    const text = String(raw || "").replace(/\r/g, "").trim();
    const r = { title: null, listing_type: null, property_type: null, price: null, beds: null, baths: null, sqft: null,
      address: null, city: null, state: null, zip_code: null, description: "", facebookUrl: null, filled: [] };
    if (!text) return r;

    const fb = text.match(FB_URL_RE);
    r.facebookUrl = fb ? fb[0].replace(/[).,!?]+$/, "") : null;

    // phone numbers etc. are removed first so they cannot be mistaken for prices or sizes
    const body = text.replace(URL_RE, " ").replace(EMAIL_RE, " ").replace(PHONE_RE, " ");

    r.price = findPrice(body);
    r.listing_type = detectListing(body, r.price);
    r.property_type = detectType(body);
    r.beds = findBeds(body);
    r.baths = findBaths(body);
    if (r.beds === null && r.baths === null) {
      const s = findSlash(body);
      if (s) { r.beds = s.beds; r.baths = s.baths; }
    }
    r.sqft = findSqft(body);
    Object.assign(r, findLocation(body));
    r.description = cleanDescription(text);

    const type = TYPE_LABELS[r.property_type || "house"];
    const parts = [];
    if (r.beds !== null) parts.push(r.beds === 0 ? "Studio" : plural(r.beds, "Bed", "Beds"));
    if (r.baths !== null) parts.push(plural(r.baths, "Bath", "Baths"));
    parts.push(type);
    r.title = parts.join(" ") + (r.city ? ` in ${r.city}` : "");

    for (const k of ["price", "beds", "baths", "sqft", "address", "city", "state", "zip_code"]) if (r[k] !== null && r[k] !== undefined) r.filled.push(k);
    if (r.property_type) r.filled.push("property_type");
    return r;
  }

  const api = { parse, findPrice, findLocation };
  root.QuickFill = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
