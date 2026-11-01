/*
 * Lead export: turns leads (with their joined property) into an Excel file that follows the
 * agency's own tracking sheet: Traffic Name | Number | Rent | House | Address | Post List | Text Link | Id name,
 * plus Email, Interest, Status, Message and Date at the end.
 */
(function (root) {
  "use strict";

  const TYPE_LABELS = { house: "House", apartment: "Apartment", condo: "Condo", townhouse: "Townhouse", room: "Room", other: "Property" };
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // "3 Beds 2 Baths House", "1 Bed 1 Bath Apartment", "Studio 1 Bath Apartment"
  function houseLabel(p) {
    if (!p) return "";
    const beds = num(p.beds);
    const baths = num(p.baths);
    const bedText = beds === 0 ? "Studio" : plural(beds, "Bed", "Beds");
    return `${bedText} ${plural(baths, "Bath", "Baths")} ${TYPE_LABELS[p.property_type] || "Property"}`;
  }

  // "Lanarc Dr, Plano, TX"
  function addressLine(p) {
    return p ? [p.address, p.city, p.state].filter(Boolean).join(", ") : "";
  }

  const COLUMNS = [
    { header: "Traffic Name", width: 24 },
    { header: "Number", width: 18 },
    { header: "Rent / Price", width: 14, format: "currency" },
    { header: "House", width: 30 },
    { header: "Address", width: 38 },
    { header: "Post List", width: 52 },
    { header: "Text Link", width: 22 },
    { header: "Id name", width: 20 },
    { header: "Email", width: 28 },
    { header: "Interest", width: 10 },
    { header: "Status", width: 12 },
    { header: "Message", width: 44 },
    { header: "Date", width: 17 }
  ];

  function build(leads, linkFor, idNameFor) {
    const rows = leads.map((l) => {
      const p = l.properties || null;
      const link = p && linkFor ? linkFor(p.id) : "";
      return [
        l.full_name || "",
        l.phone || "",
        p ? num(p.price) : null,
        p ? houseLabel(p) + (p.listing_type === "sale" ? " (For sale)" : "") : "General inquiry",
        p ? addressLine(p) : l.preferred_location || "",
        link ? { text: link, href: link } : null,
        null,
        idNameFor ? (idNameFor(l.ref_code) || null) : null,
        l.email || "",
        l.interest || "",
        l.status || "",
        l.message || "",
        l.created_at ? new Date(l.created_at) : null
      ];
    });
    return root.XlsxLite.build({ sheetName: "Leads", columns: COLUMNS, rows });
  }

  function download(leads, linkFor, idNameFor) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    root.XlsxLite.download(build(leads, linkFor, idNameFor), `usa-real-estate-leads-${stamp}.xlsx`);
  }

  root.LeadExport = { houseLabel, addressLine, build, download, COLUMNS };
})(typeof window !== "undefined" ? window : globalThis);
