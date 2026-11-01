/* Remembers which employee's link a visitor came from (?ref=code), for 14 days. */
(function (root) {
  "use strict";
  const KEY = "usa_re_ref", DAYS = 14, RE = /^[a-z0-9_-]{3,32}$/;
  let mem = null;
  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || "null");
      if (v && RE.test(v.c) && Date.now() - v.t < DAYS * 864e5) return v.c;
    } catch (e) {}
    return mem && Date.now() - mem.t < DAYS * 864e5 ? mem.c : null;
  }
  function get() {
    const r = (new URLSearchParams(location.search).get("ref") || "").trim().toLowerCase();
    if (RE.test(r)) {
      mem = { c: r, t: Date.now() };
      try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) {}
      return r;
    }
    return read();
  }
  root.RefTracker = { get };
})(window);
