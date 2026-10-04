import type { UserRow } from "../components/UsersManager";

/** Minimal XLSX (OOXML Spreadsheet) writer — no external dependencies. */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i])! & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function enc(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n & 0xffff, true);
  return b;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** ZIP archive with STORE (no compression) — Excel accepts this. */
function zipStore(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;

    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      f.data,
    ]);
    locals.push(local);

    centrals.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(size),
        u32(size),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ])
    );
    offset += local.length;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralSize),
    u32(offset),
    u16(0),
  ]);

  return concat([...locals, ...centrals, eocd]);
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function colName(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetXml(headers: string[], rows: string[][]): string {
  const all = [headers, ...rows];
  const body = all
    .map((row, r) => {
      const cells = row
        .map((val, c) => {
          const ref = `${colName(c)}${r + 1}`;
          const isHeader = r === 0;
          const style = isHeader ? ' s="1"' : "";
          const t = val === "" ? "" : ' t="inlineStr"';
          return `<c r="${ref}"${t}${style}><is><t xml:space="preserve">${xmlEscape(val)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");

  const widths = headers
    .map((_, c) => `<col min="${c + 1}" max="${c + 1}" width="${c === 0 ? 28 : 18}" customWidth="1"/>`)
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<cols>${widths}</cols>` +
    `<sheetData>${body}</sheetData>` +
    `</worksheet>`
  );
}

const STYLE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

const EXPORT_HEADERS = [
  "id",
  "username",
  "name",
  "email",
  "platformRole",
  "primaryRole",
  "employmentType",
  "designation",
  "phone",
  "rollNo",
  "empNo",
  "gender",
  "phCategory",
  "department",
  "programme",
  "course",
  "guide",
  "natureOfAdmission",
  "discipline",
  "admissionYear",
  "admissionSemester",
  "admissionCategory",
  "nonInstituteEmail",
  "emergencyPhone",
  "isActive",
  "isTest",
  "profileLocked",
  "appCount",
  "createdAt",
];

function cell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}

export function buildUsersXlsx(rows: UserRow[]): Uint8Array {
  const data = rows.map((u) => [
    cell(u.id),
    cell(u.username),
    cell(u.name),
    cell(u.email),
    cell(u.role),
    cell(u.primaryRole),
    cell(u.employmentType),
    cell(u.designation),
    cell(u.phone),
    cell(u.rollNo),
    cell(u.empNo),
    cell(u.gender),
    cell(u.phCategory),
    cell(u.departmentName),
    cell(u.programmeName),
    cell(u.courseName),
    cell(u.guideName),
    cell(u.natureOfAdmission),
    cell(u.discipline),
    cell(u.admissionYear),
    cell(u.admissionSemester),
    cell(u.admissionCategory),
    cell(u.nonInstituteEmail),
    cell(u.emergencyPhone),
    cell(u.isActive),
    cell(u.isTest),
    cell(u.profileLocked),
    cell(u.appCount),
    cell(u.createdAt),
  ]);

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="Users" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

  const wbRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  return zipStore([
    { name: "[Content_Types].xml", data: enc(contentTypes) },
    { name: "_rels/.rels", data: enc(rels) },
    { name: "xl/workbook.xml", data: enc(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: enc(wbRels) },
    { name: "xl/styles.xml", data: enc(STYLE_XML) },
    { name: "xl/worksheets/sheet1.xml", data: enc(sheetXml(EXPORT_HEADERS, data)) },
  ]);
}

export function exportUsersXlsx(rows: UserRow[], filtered = false): void {
  const bytes = buildUsersXlsx(rows);
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = filtered ? "-filtered" : "";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `iipe-users${suffix}-${stamp}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
