/*
 * xlsx-lite: tiny dependency-free .xlsx writer (one sheet, uncompressed zip).
 * Supports text, numbers ($ format), dates, clickable links, a styled header row,
 * frozen header, filter buttons and column widths. Write-only: it never reads files.
 *
 * XlsxLite.build({ sheetName, columns:[{header,width,format?}], rows:[[cell,...]] }) -> Uint8Array
 *   cell: string | number | Date | { text, href } | null
 *   column.format: "currency" renders numbers as $#,##0
 * XlsxLite.download(bytes, filename)  (browser only)
 */
(function (root) {
  "use strict";
  const enc = new TextEncoder();

  /* ---------- CRC32 + ZIP (stored, no compression) ---------- */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zip(files, now) {
    const d = now || new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const chunks = [];
    const central = [];
    let offset = 0;
    const push = (u8) => { chunks.push(u8); offset += u8.length; };
    for (const f of files) {
      const name = enc.encode(f.name);
      const crc = crc32(f.data);
      const start = offset;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true);          // UTF-8 names
      lh.setUint16(8, 0, true);               // method: stored
      lh.setUint16(10, dosTime, true);
      lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, f.data.length, true);
      lh.setUint32(22, f.data.length, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      push(new Uint8Array(lh.buffer)); push(name); push(f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, f.data.length, true);
      ch.setUint32(24, f.data.length, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, start, true);
      central.push(new Uint8Array(ch.buffer), name);
    }
    const cdStart = offset;
    central.forEach(push);
    const cdSize = offset - cdStart;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, cdStart, true);
    push(new Uint8Array(end.buffer));
    const out = new Uint8Array(offset);
    let p = 0;
    for (const c of chunks) { out.set(c, p); p += c.length; }
    return out;
  }

  /* ---------- helpers ---------- */
  const xmlEsc = (s) => String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const colName = (i) => {
    let s = "";
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  };
  // Excel stores dates as days since 1899-12-30; we keep the viewer's local wall-clock time.
  const excelDate = (d) =>
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) / 86400000 + 25569;
  const isHttp = (u) => /^https?:\/\/[^\s"<>]+$/i.test(u);

  const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
  const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  // style ids: 0 default, 1 header, 2 currency, 3 date-time, 4 link
  const STYLES = XML_HEAD +
    `<styleSheet xmlns="${NS_MAIN}">` +
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0"/><numFmt numFmtId="165" formatCode="dd/mm/yy hh:mm"/></numFmts>' +
    '<fonts count="3">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '<font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF3C78D8"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="5">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function sheetXml(columns, rows) {
    const links = [];
    const lastCol = colName(columns.length - 1);
    const lastRow = rows.length + 1;
    let xml = XML_HEAD + `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
      `<dimension ref="A1:${lastCol}${lastRow}"/>` +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      "<cols>" + columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 16}" customWidth="1"/>`).join("") + "</cols>" +
      "<sheetData>";
    xml += '<row r="1" ht="22" customHeight="1">' +
      columns.map((c, i) => `<c r="${colName(i)}1" s="1" t="inlineStr"><is><t>${xmlEsc(c.header)}</t></is></c>`).join("") + "</row>";
    rows.forEach((row, ri) => {
      const r = ri + 2;
      let cells = "";
      columns.forEach((col, ci) => {
        const v = row[ci];
        if (v === null || v === undefined || v === "") return;
        const ref = colName(ci) + r;
        if (v instanceof Date) {
          if (!isNaN(v)) cells += `<c r="${ref}" s="3"><v>${excelDate(v)}</v></c>`;
        } else if (typeof v === "number") {
          if (isFinite(v)) cells += `<c r="${ref}" s="${col.format === "currency" ? 2 : 0}"><v>${String(v)}</v></c>`;
        } else if (typeof v === "object" && v.href) {
          const href = String(v.href);
          const text = xmlEsc(v.text || href);
          if (isHttp(href)) {
            links.push({ ref, href });
            cells += `<c r="${ref}" s="4" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
          } else {
            cells += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
          }
        } else {
          // always written as inline TEXT, so values like "=1+1" or "+1 555..." are never treated as formulas
          cells += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
        }
      });
      xml += `<row r="${r}">${cells}</row>`;
    });
    xml += "</sheetData>";
    xml += `<autoFilter ref="A1:${lastCol}${lastRow}"/>`;
    if (links.length) {
      xml += "<hyperlinks>" + links.map((l, i) => `<hyperlink ref="${l.ref}" r:id="rId${i + 1}"/>`).join("") + "</hyperlinks>";
    }
    xml += "</worksheet>";
    return { xml, links };
  }

  function build(opts) {
    const columns = opts.columns;
    const rows = opts.rows || [];
    const sheetName = String(opts.sheetName || "Sheet1").replace(/[\[\]:*?\/\\]/g, " ").slice(0, 31) || "Sheet1";
    const { xml, links } = sheetXml(columns, rows);
    const files = [
      { name: "[Content_Types].xml", text: XML_HEAD +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        "</Types>" },
      { name: "_rels/.rels", text: XML_HEAD +
        `<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: "xl/workbook.xml", text: XML_HEAD +
        `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets><sheet name="${xmlEsc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
      { name: "xl/_rels/workbook.xml.rels", text: XML_HEAD +
        `<Relationships xmlns="${NS_PKG_REL}">` +
        `<Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>` },
      { name: "xl/styles.xml", text: STYLES },
      { name: "xl/worksheets/sheet1.xml", text: xml }
    ];
    if (links.length) {
      files.push({ name: "xl/worksheets/_rels/sheet1.xml.rels", text: XML_HEAD +
        `<Relationships xmlns="${NS_PKG_REL}">` +
        links.map((l, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/hyperlink" Target="${xmlEsc(l.href)}" TargetMode="External"/>`).join("") +
        "</Relationships>" });
    }
    return zip(files.map((f) => ({ name: f.name, data: enc.encode(f.text) })));
  }

  function download(bytes, filename) {
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  root.XlsxLite = { build, download };
})(typeof window !== "undefined" ? window : globalThis);
