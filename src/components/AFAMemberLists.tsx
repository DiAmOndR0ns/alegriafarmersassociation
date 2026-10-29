/**
 * AFAMemberLists.tsx
 *
 * Printable Alegria Farmers Association (AFA) documents:
 *   1. List of Officers with Contact Information
 *   2. Updated List of Members: Male
 *   3. List of Updated Members in 2024 (continuation pages)
 *
 * Self-contained: React + TypeScript only, no Tailwind or other dependencies.
 * Put the association logo at /public/afa-logo.png (or pass `logoSrc`).
 * Print with the toolbar button or Ctrl/Cmd+P. In the print dialog set
 * Margins to "None" (the page margins are already built in) and leave
 * "Headers and footers" off.
 *
 * Usage:
 *   <AFAMemberLists />
 *   <AFAMemberLists paper="long" logoSrc="/assets/afa-logo.png" />
 *
 * SEGREGATION OF DUTIES: this document belongs to the SECRETARY's dashboard.
 * The officers list and member rosters are built from the LIVE system accounts
 * and member records — no hardcoded officers or members.
 */
import { useState, useEffect } from "react";
import { Member, User, OfficerRole } from "../types";
import { resolveOfficerName, OFFICER_ROLES, OFFICER_ROLE_LABELS } from "../utils/officers";
import { getSurname } from "../utils/names";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type PaperKey = "a4" | "letter" | "long" | "legal";

export interface OfficerRow {
  /** Only set on the first row of a group (e.g. "Board Member"). */
  position?: string;
  first: string;
  mi?: string;
  last: string;
  contact?: string;
}

export interface MemberRow {
  /** Number as printed on the source list (the male list skips 15). */
  no: number;
  last: string;
  first: string;
  mi?: string;
  /** Printed text, e.g. "June 03, 1968". */
  dob?: string;
  contact?: string;
}

export type PageDef =
  | { kind: "officers"; title: string; rows: OfficerRow[] }
  | { kind: "members"; title: string; columnHeaders?: boolean; rows: MemberRow[] };

export interface Signatory {
  name: string;
  role: string;
}

interface Props {
  logoSrc?: string;
  pages?: PageDef[];
  paper?: PaperKey;
  certifiedBy?: Signatory;
  attestedBy?: Signatory;
  onClose?: () => void;
}

/* ------------------------------------------------------------------ */
/* Static document content                                             */
/* ------------------------------------------------------------------ */

const ORG = {
  address: [
    "Republic of the Philippines",
    "Province of Cebu",
    "Municipality of Tuburan",
    "Barangay Alegria",
  ],
  name: "Alegria Farmers Association (AFA)",
  registration: "DOLE Registration NO. 2315",
};

const PAPER: Record<PaperKey, { label: string; w: string; h: string }> = {
  a4: { label: "A4 (210 × 297 mm)", w: "210mm", h: "297mm" },
  letter: { label: "Letter (8.5 × 11 in)", w: "8.5in", h: "11in" },
  long: { label: "Long bond (8.5 × 13 in)", w: "8.5in", h: "13in" },
  legal: { label: "Legal (8.5 × 14 in)", w: "8.5in", h: "14in" },
};

/* ------------------------------------------------------------------ */
/* Live system data → document rows (no hardcoded officers/members)    */
/* ------------------------------------------------------------------ */

/** Split a stored full name ("Zenaida A. Elbiña" or "Elbiña, Zenaida A") into parts. */
function splitName(full: string): { first: string; mi?: string; last: string } {
  if (full.includes(",")) {
    const [last, rest = ""] = full.split(",").map((p) => p.trim());
    const parts = rest.split(/\s+/).filter(Boolean);
    const mi = parts.length > 1 && parts[parts.length - 1].length === 1 ? parts.pop() : undefined;
    return { first: parts.join(" ") || last, mi, last };
  }
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0], last: "" };
  const mi = parts.length > 2 && parts[parts.length - 2].length === 1 ? parts[parts.length - 2] : undefined;
  const last = parts[parts.length - 1];
  const first = parts.slice(0, mi ? -2 : -1).join(" ");
  return { first, mi, last };
}

/** Officers table built from the accounts ACTUALLY delegated in the system. */
export function buildOfficerRows(users: User[]): OfficerRow[] {
  const rows: OfficerRow[] = [];
  OFFICER_ROLES.forEach((role: OfficerRole) => {
    const account = users.find(u => u.role === role);
    if (!account) return; // vacant positions are not printed
    const { first, mi, last } = splitName(account.name);
    rows.push({
      position: OFFICER_ROLE_LABELS[role],
      first,
      mi,
      last,
      contact: account.contactNumber,
    });
  });
  // Board members: group under one position heading (first carries the label).
  users.filter(u => u.role === 'Board_Member').forEach((u, i) => {
    const { first, mi, last } = splitName(u.name);
    rows.push({ position: i === 0 ? 'Board Member' : undefined, first, mi, last, contact: u.contactNumber });
  });
  return rows;
}

/** Member roster rows from the live member records, ordered by surname. */
export function buildMemberRows(members: Member[]): MemberRow[] {
  const sorted = [...members].sort((a, b) =>
    getSurname(a.name).localeCompare(getSurname(b.name)) || a.name.localeCompare(b.name)
  );
  return sorted.map((m, i) => {
    const { first, mi, last } = splitName(m.name);
    return {
      no: i + 1,
      last,
      first,
      mi,
      dob: m.birthDate
        ? new Date(m.birthDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
        : undefined,
      contact: m.contactNumber,
    };
  });
}

export function buildDefaultPages(users: User[], members: Member[]): PageDef[] {
  const rows = buildMemberRows(members);
  const chunkSize = 26;
  const chunks: MemberRow[][] = [];
  for (let i = 0; i < rows.length; i += chunkSize) chunks.push(rows.slice(i, i + chunkSize));
  return [
    { kind: "officers", title: "List of Officers with Contact Information", rows: buildOfficerRows(users) },
    ...(chunks.length === 0
      ? [{ kind: "members" as const, title: "List of Updated Members", rows: [] }]
      : chunks.map((c, i) => ({
        kind: "members" as const,
        title: `List of Updated Members in ${new Date().getFullYear()}${chunks.length > 1 ? ` (cont. ${i + 1})` : ""}`,
        columnHeaders: i === 0,
        rows: c,
      }))),
  ];
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const buildCss = ({ w, h }: { w: string; h: string }) => `
@page { size: ${w} ${h}; margin: 0; }

.afa-root {
  --pw: ${w};
  --ph: ${h};
  --row: 6.2mm;
  font-family: Calibri, Carlito, "Segoe UI", Arial, sans-serif;
  color: #000;
}

.afa-toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: center;
  padding: 10px 12px;
  background: #fff;
  border-bottom: 1px solid #d4d4d8;
  font: 14px system-ui, sans-serif;
}
.afa-toolbar select,
.afa-toolbar button {
  font: inherit;
  padding: 6px 10px;
  border: 1px solid #a1a1aa;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}
.afa-toolbar button { background: #166534; border-color: #166534; color: #fff; }
.afa-toolbar button:focus-visible,
.afa-toolbar select:focus-visible { outline: 2px solid #166534; outline-offset: 2px; }
.afa-toolbar button.afa-btn-close {
  background: #dc2626;
  border-color: #b91c1c;
  color: #fff;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.afa-toolbar button.afa-btn-close:hover {
  background: #b91c1c;
  border-color: #991b1b;
}

.afa-stage { background: #d4d4d8; padding: 24px 12px; overflow-x: auto; }

.afa-sheet {
  box-sizing: border-box;
  width: var(--pw);
  height: var(--ph);
  margin: 0 auto 24px;
  padding: 12mm 16mm;
  display: flex;
  flex-direction: column;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  font-size: 11pt;
  line-height: 1.25;
  break-after: page;
}

/* Letterhead */
.afa-head { position: relative; min-height: 28mm; text-align: center; font-weight: 600; }
.afa-head p { margin: 0; }
.afa-head .afa-gap { margin-top: 7mm; }
.afa-logo { position: absolute; left: 2mm; top: 0; width: 34mm; height: auto; }

.afa-title { margin: 8mm 0 6mm; text-align: center; font-size: 11pt; font-weight: 600; }

/* Tables */
.afa-table { width: 100%; flex: none; border-collapse: collapse; table-layout: fixed; }
.afa-table th { padding: 0 0 4mm; text-align: left; font-weight: 600; }
.afa-table td { height: var(--row); padding: 0; vertical-align: middle; white-space: nowrap; }
.afa-colon { display: inline-block; width: 3.5mm; }

/* Signatures */
.afa-foot { display: flex; justify-content: space-between; margin-top: auto; padding: 0 6mm; }
.afa-who { display: inline-flex; flex-direction: column; align-items: center; margin-top: 15mm; }

@media print {
  html, body { margin: 0; background: #fff !important; }
  .no-print { display: none !important; }
  .afa-stage { padding: 0; background: none; overflow: visible; }
  .afa-sheet {
    margin: 0;
    box-shadow: none;
    height: calc(var(--ph) - 0.5mm); /* avoids a blank trailing page from rounding */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .afa-sheet:last-child { break-after: auto; }
}
`;

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function OfficersTable({ rows }: { rows: OfficerRow[] }) {
  return (
    <table className="afa-table">
      <colgroup>
        <col style={{ width: "24%" }} />
        <col style={{ width: "26%" }} />
        <col style={{ width: "6%" }} />
        <col style={{ width: "24%" }} />
        <col style={{ width: "20%" }} />
      </colgroup>
      <thead>
        <tr>
          <th>Position</th>
          <th colSpan={3}>Names</th>
          <th>Contact Number</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.position}</td>
            <td>
              <span className="afa-colon">{r.position ? ":" : ""}</span>
              {r.first}
            </td>
            <td>{r.mi}</td>
            <td>{r.last}</td>
            <td>{r.contact}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MembersTable({ rows, columnHeaders }: { rows: MemberRow[]; columnHeaders?: boolean }) {
  return (
    <table className="afa-table">
      <colgroup>
        <col style={{ width: "34%" }} />
        <col style={{ width: "26%" }} />
        <col style={{ width: "7%" }} />
        <col style={{ width: "18%" }} />
        <col style={{ width: "15%" }} />
      </colgroup>
      {columnHeaders && (
        <thead>
          <tr>
            <th>Names</th>
            <th />
            <th />
            <th>Date of Birth</th>
            <th>Contact Number</th>
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((r) => (
          <tr key={r.no}>
            <td>{`${r.no}. ${r.last}`}</td>
            <td>{r.first}</td>
            <td>{r.mi}</td>
            <td>{r.dob}</td>
            <td>{r.contact}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SignatureBlock({ label, person }: { label: string; person: Signatory }) {
  return (
    <div>
      <div>{label}</div>
      <div className="afa-who">
        <span>{person.name}</span>
        <span>{person.role}</span>
      </div>
    </div>
  );
}

interface SheetProps {
  page: PageDef;
  logo?: string;
  onLogoError: () => void;
  certifiedBy: Signatory;
  attestedBy: Signatory;
}

function Sheet({ page, logo, onLogoError, certifiedBy, attestedBy }: SheetProps) {
  return (
    <section className="afa-sheet">
      <header className="afa-head">
        {logo && (
          <img className="afa-logo" src={logo} alt="Alegria Farmers Association logo" onError={onLogoError} />
        )}
        {ORG.address.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p className="afa-gap">{ORG.name}</p>
        <p>{ORG.registration}</p>
      </header>

      <h2 className="afa-title">{page.title}</h2>

      {page.kind === "officers" ? (
        <OfficersTable rows={page.rows} />
      ) : (
        <MembersTable rows={page.rows} columnHeaders={page.columnHeaders} />
      )}

      <footer className="afa-foot">
        <SignatureBlock label="Certified True and Correct:" person={certifiedBy} />
        <SignatureBlock label="Attested by:" person={attestedBy} />
      </footer>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function AFAMemberLists({
  logoSrc = "/afa-logo.png",
  pages,
  users = [],
  members = [],
  paper: initialPaper = "a4",
  certifiedBy,
  attestedBy,
  onClose,
}: Props & { users?: User[]; members?: Member[] }) {
  const [paper, setPaper] = useState<PaperKey>(initialPaper);
  const [logoOk, setLogoOk] = useState(true);

  useEffect(() => {
    if (!onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Signatories resolve LIVE from the accounts delegated in the system.
  const resolvedCertifiedBy: Signatory =
    certifiedBy ?? { name: resolveOfficerName(users, "Secretary"), role: "Secretary" };
  const resolvedAttestedBy: Signatory =
    attestedBy ?? { name: resolveOfficerName(users, "President"), role: "President" };

  const resolvedPages = pages ?? buildDefaultPages(users, members);

  return (
    <div className="afa-root">
      <style>{buildCss(PAPER[paper])}</style>

      <div className="afa-toolbar no-print">
        <label>
          Paper{" "}
          <select value={paper} onChange={(e) => setPaper(e.target.value as PaperKey)}>
            {(Object.keys(PAPER) as PaperKey[]).map((k) => (
              <option key={k} value={k}>
                {PAPER[k].label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => window.print()}>
          Print
        </button>
        {onClose && (
          <button
            type="button"
            className="afa-btn-close"
            onClick={onClose}
            title="Exit print preview (Esc)"
          >
            ✕ Exit
          </button>
        )}
      </div>

      <div className="afa-stage">
        {resolvedPages.map((page, i) => (
          <Sheet
            key={i}
            page={page}
            logo={logoOk ? logoSrc : undefined}
            onLogoError={() => setLogoOk(false)}
            certifiedBy={resolvedCertifiedBy}
            attestedBy={resolvedAttestedBy}
          />
        ))}
      </div>
    </div>
  );
}
