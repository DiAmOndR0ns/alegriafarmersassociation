import "./president-report.css";
import { useEffect, useMemo, useRef } from "react";

import type {
  User,
  OfficerRole,
  Member,
  Meeting,
  Resolution,
  FinancialTransaction,
  Announcement,
  AssociationActivity,
  AssociationAchievement,
  InventoryItem,
  Product,
  LivestockIgpState,
  DelegationRequest,
  DelegationScope,
  MembershipPayment,
} from "../types";
import { OFFICER_ROLE_LABELS } from "../utils/officers";

/* ---------- Data shape (fill from FAMS state/API, not hardcoded) ----------
   Segregation of duties: the President's unified Executive Report carries the
   EXECUTIVE SUMMARY only — KPI compliance snapshot, program highlights,
   approved resolutions & delegations, plans for next year, and complete
   officers directory. Itemized financial ledgers belong exclusively to the
   Treasurer's report; full member rosters belong to the Secretary's report;
   itemized inventory belongs to the Auditor; full bulletins/logs to the PIO. */

export interface Officer {
  position: string;
  name: string;
  contact?: string;
}

export interface ExecutiveSummaryMetrics {
  totalMembers: number;
  activeMembers: number;
  inactiveMembers: number;
  sitioCount: number;
  rsbsaRegistered: number;
  duesPaidCount: number;
  duesComplianceRate: string;
  meetingsHeld: number;
  avgMeetingAttendance: number;
  approvedMinutesCount: number;
  approvedResolutionsCount: number;
  totalResolutionsCount: number;
  announcementsPublished: number;
  highPriorityAnnouncements: number;
  auditComplianceRate: string;
  auditedTransactionsCount: number;
  presidentSignedTransactionsCount: number;
  activeIgpProjectsCount: number;
  signedEggHarvestBatches: number;
  verifiedEggsTotal: number;
  publishedMarketProducts: number;
  totalInventoryItems: number;
  goodConditionInventoryItems: number;
  assetReadinessRate: string;
}

export interface ResolutionSummaryRow {
  resolutionNumber: string;
  title: string;
  dateAgreed: string;
  voteSummary: string;
}

export interface DelegationSummaryRow {
  requestedBy: string;
  reason: string;
  scopesLabel: string;
  effectivePeriod: string;
  status: string;
}

export interface ReportData {
  year: number;
  generatedDate: string;
  org: {
    name: string;
    abbr: string;
    doleRegNo: string;
    province: string;
    municipality: string;
    barangay: string;
    logoSrc?: string;
  };
  summary: ExecutiveSummaryMetrics;
  highlights: string[];
  approvedResolutions: ResolutionSummaryRow[];
  delegations: DelegationSummaryRow[];
  plans: string[];
  closingLine?: string;
  customRemarks?: string;
  officers: Officer[];
  secretary: string; // signs "Certified True and Correct"
  auditor: string;   // signs "Noted (Compliance)"
  president: string; // signs "Attested by"
}

const ROLE_ORDER: OfficerRole[] = [
  "President",
  "Vice_President",
  "Secretary",
  "Assistant_Secretary",
  "Treasurer",
  "Assistant_Treasurer",
  "Auditor",
  "PIO",
  "Board_Member",
];

const DELEGATION_SCOPE_LABELS: Record<DelegationScope, string> = {
  password_change: "Password Reset",
  record_approval: "Record Approvals",
  announcements_activities: "Announcements & Activities",
};

const escapeHtml = (value: string) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch] as string));

function matchesYear(dateStr: string | undefined, year: number): boolean {
  if (!dateStr) return false;
  return String(dateStr).trim().startsWith(String(year));
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const cleaned = raw.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

/* ---------- Page shell: letterhead + title + 3-signatory block on every page ---------- */
function Page({ d, title, children }: { d: ReportData; title?: string; children: React.ReactNode }) {
  const { org } = d;
  return (
    <section className="pr-page">
      <header className="pr-head">
        {org.logoSrc && <img className="pr-logo" src={org.logoSrc} alt={`${org.name} logo`} />}
        <div className="pr-gov">
          Republic of the Philippines<br />
          Province of {org.province}<br />
          Municipality of {org.municipality}<br />
          Barangay {org.barangay}
        </div>
        <div className="pr-org">
          {org.name} ({org.abbr})<br />
          DOLE Registration NO. {org.doleRegNo}
        </div>
        <div className="pr-meta">
          Executive Reporting Year: {d.year} &bull; Generated: {d.generatedDate}
        </div>
      </header>
      {title && <h2 className="pr-title" style={{ fontWeight: 700 }}>{title}</h2>}
      <div className="pr-body">{children}</div>
      <footer className="pr-sign">
        <div>
          <div className="role">Certified True and Correct:</div>
          <div className="space" />
          <div className="name">{d.secretary}</div>
          <div className="pos">Secretary</div>
        </div>
        <div className="center">
          <div className="role">Noted (Compliance):</div>
          <div className="space" />
          <div className="name">{d.auditor}</div>
          <div className="pos">Auditor</div>
        </div>
        <div className="right">
          <div className="role">Attested by:</div>
          <div className="space" />
          <div className="name">{d.president}</div>
          <div className="pos">President</div>
        </div>
      </footer>
    </section>
  );
}

/* ---------- Unified Report Sections ---------- */
function ExecutiveOverview({ d }: { d: ReportData }) {
  const s = d.summary;
  return (
    <Page d={d} title={`President's Executive Summary & State of the Association (${d.year})`}>
      <h3 className="pr-subtitle">1. Membership &amp; RSBSA Coverage</h3>
      <table className="pr-table">
        <thead>
          <tr><th className="col-key">Executive Indicator</th><th>Outcome / Status</th></tr>
        </thead>
        <tbody>
          <tr>
            <td className="col-key">Registered Farmer Roster</td>
            <td>{s.totalMembers} Total ({s.activeMembers} Active, {s.inactiveMembers} Inactive) across {s.sitioCount} Sitio(s)</td>
          </tr>
          <tr>
            <td className="col-key">RSBSA Registered Members</td>
            <td>{s.rsbsaRegistered} Verified RSBSA Farmer(s)</td>
          </tr>
          <tr>
            <td className="col-key">Annual Dues Compliance ({d.year})</td>
            <td>{s.duesPaidCount} Paid Member(s) ({s.duesComplianceRate}% of active roster)</td>
          </tr>
        </tbody>
      </table>

      <h3 className="pr-subtitle">2. Governance, Legislative &amp; Audit Compliance</h3>
      <table className="pr-table">
        <thead>
          <tr><th className="col-key">Governance / Oversight Indicator</th><th>Outcome / Status</th></tr>
        </thead>
        <tbody>
          <tr>
            <td className="col-key">General Assemblies &amp; Meetings</td>
            <td>{s.meetingsHeld} Session(s) Held (Avg. {s.avgMeetingAttendance} attendees; {s.approvedMinutesCount} approved minutes)</td>
          </tr>
          <tr>
            <td className="col-key">Legislative Resolutions</td>
            <td>{s.approvedResolutionsCount} Approved out of {s.totalResolutionsCount} Recorded</td>
          </tr>
          <tr>
            <td className="col-key">Public Advisories Broadcasted</td>
            <td>{s.announcementsPublished} Announcement(s) ({s.highPriorityAnnouncements} High Priority)</td>
          </tr>
          <tr>
            <td className="col-key">Financial Audit &amp; Executive Sign-Off</td>
            <td>{s.auditComplianceRate}% Audited ({s.presidentSignedTransactionsCount} of {s.auditedTransactionsCount} audited records signed off by President)</td>
          </tr>
        </tbody>
      </table>

      <h3 className="pr-subtitle">3. Livelihood (IGP), Market &amp; Custodial Assets</h3>
      <table className="pr-table">
        <thead>
          <tr><th className="col-key">Operational Indicator</th><th>Outcome / Status</th></tr>
        </thead>
        <tbody>
          <tr>
            <td className="col-key">Active IGP Livelihood Lines</td>
            <td>{s.activeIgpProjectsCount} Active Project(s)</td>
          </tr>
          <tr>
            <td className="col-key">Verified &amp; Signed Egg Harvests</td>
            <td>{s.signedEggHarvestBatches} Signed Batch(es) ({s.verifiedEggsTotal.toLocaleString()} verified eggs)</td>
          </tr>
          <tr>
            <td className="col-key">Farmers&apos; Market Catalog</td>
            <td>{s.publishedMarketProducts} Published Product Listing(s)</td>
          </tr>
          <tr>
            <td className="col-key">Custodial Asset Readiness</td>
            <td>{s.goodConditionInventoryItems} of {s.totalInventoryItems} Item(s) in Good Condition ({s.assetReadinessRate}%)</td>
          </tr>
        </tbody>
      </table>

      {d.customRemarks && (
        <div className="pr-remarks">
          <strong>President&apos;s Remarks:</strong> {d.customRemarks}
        </div>
      )}

      <p className="pr-seg-note">
        <strong>Segregation of Duties Notice:</strong> This report is an Executive Summary only and intentionally excludes itemized cash ledgers and fund balances. Detailed financial statements are issued exclusively by the Treasurer; full alphabetical member rosters and meeting minutes by the Secretary; custodial inventory audits by the Auditor; and complete bulletin/activity logs by the PIO.
      </p>
    </Page>
  );
}

function Highlights({ d }: { d: ReportData }) {
  return (
    <Page d={d} title={`Highlights of Programs and Activities in ${d.year}`}>
      {d.highlights.length > 0
        ? <ul className="pr-list">{d.highlights.map((h, i) => <li key={`${i}-${h}`}>{h}</li>)}</ul>
        : <p className="pr-empty">No highlights recorded for this year.</p>}
    </Page>
  );
}

function GovernanceRecord({ d }: { d: ReportData }) {
  return (
    <Page d={d} title={`Approved Resolutions & Executive Delegations (${d.year})`}>
      <h3 className="pr-subtitle">Approved Legislative Resolutions</h3>
      <table className="pr-table">
        <thead>
          <tr>
            <th className="col-nowrap">Resolution No.</th>
            <th>Title / Directive</th>
            <th className="col-nowrap">Date Agreed</th>
            <th className="col-nowrap">Vote Tally</th>
          </tr>
        </thead>
        <tbody>
          {d.approvedResolutions.length === 0 ? (
            <tr><td colSpan={4} className="pr-empty">No approved resolutions recorded for this period.</td></tr>
          ) : d.approvedResolutions.map((r, i) => (
            <tr key={`${i}-${r.resolutionNumber}`}>
              <td className="col-nowrap"><strong>{r.resolutionNumber}</strong></td>
              <td>{r.title}</td>
              <td className="col-nowrap">{r.dateAgreed}</td>
              <td className="col-nowrap">{r.voteSummary}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="pr-subtitle">Vice President Executive Delegations</h3>
      <table className="pr-table">
        <thead>
          <tr>
            <th>Requested By</th>
            <th>Authorized Scopes</th>
            <th className="col-nowrap">Effective Period</th>
            <th>Reason</th>
            <th className="col-nowrap">Status</th>
          </tr>
        </thead>
        <tbody>
          {d.delegations.length === 0 ? (
            <tr><td colSpan={5} className="pr-empty">No executive delegations exercised during this period.</td></tr>
          ) : d.delegations.map((del, i) => (
            <tr key={`${i}-${del.effectivePeriod}`}>
              <td>{del.requestedBy}</td>
              <td>{del.scopesLabel}</td>
              <td className="col-nowrap">{del.effectivePeriod}</td>
              <td>{del.reason}</td>
              <td className="col-nowrap">{del.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Page>
  );
}

function Plans({ d }: { d: ReportData }) {
  return (
    <Page d={d} title={`Plans and Programs for ${d.year + 1}`}>
      {d.plans.length > 0
        ? <ol className="pr-list pr-roman">{d.plans.map((p, i) => <li key={`${i}-${p}`}>{p}</li>)}</ol>
        : <p className="pr-empty">No plans recorded for this year.</p>}
      {d.closingLine && <p className="pr-closing">{d.closingLine}</p>}
    </Page>
  );
}

function Officers({ d }: { d: ReportData }) {
  return (
    <Page d={d} title="List of Officers with Contact Information">
      <table className="pr-table">
        <thead><tr><th>Position</th><th>Names</th><th>Contact Number</th></tr></thead>
        <tbody>
          {d.officers.length === 0 ? (
            <tr><td colSpan={3} className="pr-empty">No officers on record.</td></tr>
          ) : d.officers.map((o, i) => (
            <tr key={`${i}-${o.position}-${o.name}`}>
              <td>{o.position}</td>
              <td>{o.name}</td>
              <td>{o.contact ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Page>
  );
}

/* ---------- Report Component ---------- */
export default function PresidentReport({
  data,
  hideToolbar = false,
}: {
  data: ReportData;
  hideToolbar?: boolean;
}) {
  const resolvedData = data;
  const restoreTitleRef = useRef<(() => void) | null>(null);

  const exportPdf = () => {
    const prev = document.title;
    document.title = `${resolvedData.org.abbr}-Executive-Report-${resolvedData.year}`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const restore = () => {
      document.title = prev;
      window.removeEventListener("afterprint", restore);
      if (timer !== undefined) clearTimeout(timer);
    };
    restoreTitleRef.current = restore;
    window.addEventListener("afterprint", restore);
    window.print();
    timer = setTimeout(restore, 1000);
  };

  useEffect(() => () => {
    restoreTitleRef.current?.();
  }, []);

  return (
    <div className="pr-root">
      {!hideToolbar && (
        <div className="pr-toolbar"><button type="button" onClick={exportPdf}>Export PDF</button></div>
      )}
      <ExecutiveOverview d={resolvedData} />
      <Highlights d={resolvedData} />
      <GovernanceRecord d={resolvedData} />
      <Plans d={resolvedData} />
      <Officers d={resolvedData} />
    </div>
  );
}

/* ---------- Printable Standalone HTML (Single Source of Truth for Modal Print) ---------- */
export function buildPresidentReportPrintHtml(d: ReportData): string {
  const s = d.summary;
  const logoImg = d.org.logoSrc
    ? `<img class="pr-logo" src="${escapeHtml(d.org.logoSrc)}" alt="${escapeHtml(d.org.name)} logo" />`
    : "";

  const wrapPage = (title: string, bodyHtml: string) => `
    <section class="pr-page">
      <header class="pr-head">
        ${logoImg}
        <div class="pr-gov">
          Republic of the Philippines<br />
          Province of ${escapeHtml(d.org.province)}<br />
          Municipality of ${escapeHtml(d.org.municipality)}<br />
          Barangay ${escapeHtml(d.org.barangay)}
        </div>
        <div class="pr-org">
          ${escapeHtml(d.org.name)} (${escapeHtml(d.org.abbr)})<br />
          DOLE Registration NO. ${escapeHtml(d.org.doleRegNo)}
        </div>
        <div class="pr-meta">
          Executive Reporting Year: ${d.year} &bull; Generated: ${escapeHtml(d.generatedDate)}
        </div>
      </header>
      <h2 class="pr-title">${escapeHtml(title)}</h2>
      <div class="pr-body">${bodyHtml}</div>
      <footer class="pr-sign">
        <div>
          <div class="role">Certified True and Correct:</div>
          <div class="space"></div>
          <div class="name">${escapeHtml(d.secretary)}</div>
          <div class="pos">Secretary</div>
        </div>
        <div class="center">
          <div class="role">Noted (Compliance):</div>
          <div class="space"></div>
          <div class="name">${escapeHtml(d.auditor)}</div>
          <div class="pos">Auditor</div>
        </div>
        <div class="right">
          <div class="role">Attested by:</div>
          <div class="space"></div>
          <div class="name">${escapeHtml(d.president)}</div>
          <div class="pos">President</div>
        </div>
      </footer>
    </section>
  `;

  const overviewBody = `
    <h3 class="pr-subtitle">1. Membership &amp; RSBSA Coverage</h3>
    <table class="pr-table">
      <thead><tr><th class="col-key">Executive Indicator</th><th>Outcome / Status</th></tr></thead>
      <tbody>
        <tr><td class="col-key">Registered Farmer Roster</td><td>${s.totalMembers} Total (${s.activeMembers} Active, ${s.inactiveMembers} Inactive) across ${s.sitioCount} Sitio(s)</td></tr>
        <tr><td class="col-key">RSBSA Registered Members</td><td>${s.rsbsaRegistered} Verified RSBSA Farmer(s)</td></tr>
        <tr><td class="col-key">Annual Dues Compliance (${d.year})</td><td>${s.duesPaidCount} Paid Member(s) (${escapeHtml(s.duesComplianceRate)}% of active roster)</td></tr>
      </tbody>
    </table>

    <h3 class="pr-subtitle">2. Governance, Legislative &amp; Audit Compliance</h3>
    <table class="pr-table">
      <thead><tr><th class="col-key">Governance / Oversight Indicator</th><th>Outcome / Status</th></tr></thead>
      <tbody>
        <tr><td class="col-key">General Assemblies &amp; Meetings</td><td>${s.meetingsHeld} Session(s) Held (Avg. ${s.avgMeetingAttendance} attendees; ${s.approvedMinutesCount} approved minutes)</td></tr>
        <tr><td class="col-key">Legislative Resolutions</td><td>${s.approvedResolutionsCount} Approved out of ${s.totalResolutionsCount} Recorded</td></tr>
        <tr><td class="col-key">Public Advisories Broadcasted</td><td>${s.announcementsPublished} Announcement(s) (${s.highPriorityAnnouncements} High Priority)</td></tr>
        <tr><td class="col-key">Financial Audit &amp; Executive Sign-Off</td><td>${escapeHtml(s.auditComplianceRate)}% Audited (${s.presidentSignedTransactionsCount} of ${s.auditedTransactionsCount} audited records signed off by President)</td></tr>
      </tbody>
    </table>

    <h3 class="pr-subtitle">3. Livelihood (IGP), Market &amp; Custodial Assets</h3>
    <table class="pr-table">
      <thead><tr><th class="col-key">Operational Indicator</th><th>Outcome / Status</th></tr></thead>
      <tbody>
        <tr><td class="col-key">Active IGP Livelihood Lines</td><td>${s.activeIgpProjectsCount} Active Project(s)</td></tr>
        <tr><td class="col-key">Verified &amp; Signed Egg Harvests</td><td>${s.signedEggHarvestBatches} Signed Batch(es) (${s.verifiedEggsTotal.toLocaleString()} verified eggs)</td></tr>
        <tr><td class="col-key">Farmers' Market Catalog</td><td>${s.publishedMarketProducts} Published Product Listing(s)</td></tr>
        <tr><td class="col-key">Custodial Asset Readiness</td><td>${s.goodConditionInventoryItems} of ${s.totalInventoryItems} Item(s) in Good Condition (${escapeHtml(s.assetReadinessRate)}%)</td></tr>
      </tbody>
    </table>

    ${d.customRemarks ? `<div class="pr-remarks"><strong>President's Remarks:</strong> ${escapeHtml(d.customRemarks).replace(/\n/g, "<br />")}</div>` : ""}

    <p class="pr-seg-note">
      <strong>Segregation of Duties Notice:</strong> This report is an Executive Summary only and intentionally excludes itemized cash ledgers and fund balances. Detailed financial statements are issued exclusively by the Treasurer; full alphabetical member rosters and meeting minutes by the Secretary; custodial inventory audits by the Auditor; and complete bulletin/activity logs by the PIO.
    </p>
  `;

  const highlightsBody = d.highlights.length > 0
    ? `<ul class="pr-list">${d.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>`
    : `<p class="pr-empty">No highlights recorded for this year.</p>`;

  const governanceBody = `
    <h3 class="pr-subtitle">Approved Legislative Resolutions</h3>
    <table class="pr-table">
      <thead><tr><th class="col-nowrap">Resolution No.</th><th>Title / Directive</th><th class="col-nowrap">Date Agreed</th><th class="col-nowrap">Vote Tally</th></tr></thead>
      <tbody>
        ${d.approvedResolutions.length === 0
          ? `<tr><td colspan="4" class="pr-empty">No approved resolutions recorded for this period.</td></tr>`
          : d.approvedResolutions.map((r) => `
              <tr>
                <td class="col-nowrap"><strong>${escapeHtml(r.resolutionNumber)}</strong></td>
                <td>${escapeHtml(r.title)}</td>
                <td class="col-nowrap">${escapeHtml(r.dateAgreed)}</td>
                <td class="col-nowrap">${escapeHtml(r.voteSummary)}</td>
              </tr>
            `).join("")}
      </tbody>
    </table>

    <h3 class="pr-subtitle">Vice President Executive Delegations</h3>
    <table class="pr-table">
      <thead><tr><th>Requested By</th><th>Authorized Scopes</th><th class="col-nowrap">Effective Period</th><th>Reason</th><th class="col-nowrap">Status</th></tr></thead>
      <tbody>
        ${d.delegations.length === 0
          ? `<tr><td colspan="5" class="pr-empty">No executive delegations exercised during this period.</td></tr>`
          : d.delegations.map((del) => `
              <tr>
                <td>${escapeHtml(del.requestedBy)}</td>
                <td>${escapeHtml(del.scopesLabel)}</td>
                <td class="col-nowrap">${escapeHtml(del.effectivePeriod)}</td>
                <td>${escapeHtml(del.reason)}</td>
                <td class="col-nowrap">${escapeHtml(del.status)}</td>
              </tr>
            `).join("")}
      </tbody>
    </table>
  `;

  const plansBody = `
    ${d.plans.length > 0
      ? `<ol class="pr-list pr-roman">${d.plans.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ol>`
      : `<p class="pr-empty">No plans recorded for this year.</p>`}
    ${d.closingLine ? `<p class="pr-closing">${escapeHtml(d.closingLine)}</p>` : ""}
  `;

  const officersBody = `
    <table class="pr-table">
      <thead><tr><th>Position</th><th>Names</th><th>Contact Number</th></tr></thead>
      <tbody>
        ${d.officers.length === 0
          ? `<tr><td colspan="3" class="pr-empty">No officers on record.</td></tr>`
          : d.officers.map((o) => `
              <tr>
                <td>${escapeHtml(o.position)}</td>
                <td>${escapeHtml(o.name)}</td>
                <td>${escapeHtml(o.contact ?? "")}</td>
              </tr>
            `).join("")}
      </tbody>
    </table>
  `;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(d.org.abbr)}-Executive-Report-${d.year}</title>
    <style>
      @page { size: A4; margin: 0; }
      body { margin: 0; font-family: Calibri, Carlito, "Segoe UI", Arial, sans-serif; color: #111; background: #fff; }
      .pr-page { width: 210mm; min-height: 296mm; box-sizing: border-box; margin: 0 auto; padding: 16mm 20mm 14mm; display: flex; flex-direction: column; font-size: 11.5pt; break-after: page; }
      .pr-page:last-child { break-after: auto; }
      .pr-head { position: relative; text-align: center; line-height: 1.35; min-height: 26mm; }
      .pr-logo { position: absolute; left: 0; top: 0; width: 28mm; height: auto; }
      .pr-gov { font-weight: 600; font-size: 11.5pt; padding: 0 30mm; }
      .pr-org { margin-top: 6mm; line-height: 1.35; font-weight: 600; }
      .pr-meta { margin-top: 3mm; font-size: 9.5pt; color: #444; }
      .pr-title { margin: 7mm 0 5mm; text-align: center; font-size: 12pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
      .pr-subtitle { margin: 6mm 0 2.5mm; font-size: 11pt; font-weight: 700; text-transform: uppercase; border-bottom: 1px solid #111; padding-bottom: 1mm; }
      .pr-body { flex: 0 0 auto; }
      .pr-list { margin: 0; padding-left: 7mm; line-height: 1.5; }
      .pr-list li { margin-bottom: 2.5mm; }
      .pr-roman { list-style: upper-roman; padding-left: 12mm; }
      .pr-closing { margin-top: 10mm; text-align: center; font-weight: 600; }
      .pr-remarks { margin-top: 6mm; padding: 3mm 4mm; border-left: 2.5px solid #111; background: #f8fafc; font-style: italic; font-size: 10.5pt; }
      .pr-empty { color: #555; font-style: italic; margin: 0; }
      .pr-seg-note { margin-top: 6mm; font-size: 9.5pt; color: #444; line-height: 1.45; border-top: 1px dotted #999; padding-top: 2.5mm; }
      .pr-table { width: 100%; border-collapse: collapse; font-size: 10.5pt; margin-bottom: 4mm; }
      .pr-table th { text-align: left; font-weight: 700; padding: 1.5mm 2mm 1.8mm 0; border-top: 1.5px solid #111; border-bottom: 1px solid #111; }
      .pr-table td { padding: 1.4mm 2mm 1.4mm 0; vertical-align: top; border-bottom: 0.5px solid #e5e7eb; }
      .pr-table tbody tr:last-child td { border-bottom: 1.5px solid #111; }
      .pr-table .col-key { width: 42%; font-weight: 600; }
      .pr-table .col-nowrap { white-space: nowrap; }
      .pr-sign { margin-top: auto; padding-top: 12mm; display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; break-inside: avoid; }
      .pr-sign > div { flex: 1 1 0; }
      .pr-sign .role { font-size: 10pt; }
      .pr-sign .space { height: 14mm; }
      .pr-sign .name { font-weight: 700; text-transform: uppercase; font-size: 10.5pt; }
      .pr-sign .pos { font-size: 10pt; }
      .pr-sign .center { text-align: center; }
      .pr-sign .right { text-align: right; }
    </style>
  </head>
  <body>
    ${wrapPage(`President's Executive Summary & State of the Association (${d.year})`, overviewBody)}
    ${wrapPage(`Highlights of Programs and Activities in ${d.year}`, highlightsBody)}
    ${wrapPage(`Approved Resolutions & Executive Delegations (${d.year})`, governanceBody)}
    ${wrapPage(`Plans and Programs for ${d.year + 1}`, plansBody)}
    ${wrapPage("List of Officers with Contact Information", officersBody)}
    <script>window.onload = function() { window.print(); };</script>
  </body>
</html>`;
}

/* ---------- Mappers: real FAMS state/API → unified ReportData ---------- */
export const DEFAULT_ORG = {
  name: "Alegria Farmers Association",
  abbr: "AFA",
  doleRegNo: "2315",
  province: "Cebu",
  municipality: "Tuburan",
  barangay: "Alegria",
} as const;

export interface BuildPresidentReportInput {
  year: number;
  generatedDate?: string;
  users?: User[];
  members?: Member[];
  meetings?: Meeting[];
  resolutions?: Resolution[];
  transactions?: FinancialTransaction[];
  announcements?: Announcement[];
  activities?: AssociationActivity[];
  achievements?: AssociationAchievement[];
  inventory?: InventoryItem[];
  products?: Product[];
  livestockIgp?: LivestockIgpState;
  delegationRequests?: DelegationRequest[];
  membershipPayments?: MembershipPayment[];
  highlights?: string[];
  plans?: string[];
  closingLine?: string;
  customRemarks?: string;
  logoSrc?: string;
  doleRegNo?: string;
}

export function buildReportData(input: BuildPresidentReportInput): ReportData {
  const {
    year,
    generatedDate = new Date().toISOString().split("T")[0],
    users = [],
    members = [],
    meetings = [],
    resolutions = [],
    transactions = [],
    announcements = [],
    activities = [],
    achievements = [],
    inventory = [],
    products = [],
    livestockIgp,
    delegationRequests = [],
    membershipPayments = [],
    highlights = [],
    plans = [],
    closingLine,
    customRemarks,
    logoSrc,
    doleRegNo = DEFAULT_ORG.doleRegNo,
  } = input;

  const signatory = (role: OfficerRole, fallback: string) =>
    users.find((u) => u.role === role)?.name || fallback;

  const toOfficerRow = (u: User): Officer => ({
    position: OFFICER_ROLE_LABELS[u.role as OfficerRole] ?? String(u.role).replace(/_/g, " "),
    name: u.name,
    contact: u.contactNumber,
  });

  // Sort officers in canonical association hierarchy order
  const sortedOfficers = users
    .filter((u) => u.role !== "Member")
    .sort((a, b) => {
      const ia = ROLE_ORDER.indexOf(a.role as OfficerRole);
      const ib = ROLE_ORDER.indexOf(b.role as OfficerRole);
      const oa = ia === -1 ? 999 : ia;
      const ob = ib === -1 ? 999 : ib;
      return oa - ob || a.name.localeCompare(b.name);
    })
    .map(toOfficerRow);

  // Membership & RSBSA metrics
  const activeMembers = members.filter((m) => m.status === "Active");
  const inactiveMembers = members.filter((m) => m.status !== "Active");
  const sitioSet = new Set(members.map((m) => m.farmLocation?.trim()).filter(Boolean));
  const rsbsaRegistered = members.filter((m) => Boolean(m.isRsbsaRegistered || m.rsbsaNumber)).length;
  const verifiedYearDues = new Set(
    membershipPayments
      .filter((p) => p.year === year && p.status === "Verified")
      .map((p) => p.memberId)
  );
  const duesPaidCount = verifiedYearDues.size;
  const duesBase = activeMembers.length || members.length;
  const duesComplianceRate = duesBase > 0 ? ((duesPaidCount / duesBase) * 100).toFixed(1) : "0.0";

  // Governance & Meetings metrics
  const yearMeetings = meetings.filter((m) => matchesYear(m.date, year));
  const scopedMeetings = yearMeetings.length > 0 ? yearMeetings : meetings;
  const avgMeetingAttendance = scopedMeetings.length > 0
    ? Math.round(scopedMeetings.reduce((sum, m) => sum + (m.attendanceCount || 0), 0) / scopedMeetings.length)
    : 0;
  const approvedMinutesCount = scopedMeetings.filter((m) => m.minutesApprovalStatus === "Approved").length;

  const approvedResolutionsList = resolutions.filter((r) => r.status === "Approved");
  const approvedResolutions: ResolutionSummaryRow[] = approvedResolutionsList.map((r) => ({
    resolutionNumber: r.resolutionNumber,
    title: r.title,
    dateAgreed: r.dateAgreed || "—",
    voteSummary: `${r.voteInFavor} Yes / ${r.voteAgainst} No / ${r.voteAbstain} Abs`,
  }));

  // Delegations exercised (Approved or Revoked)
  const resolveUserName = (idOrName: string) =>
    users.find((u) => u.id === idOrName || u.username === idOrName)?.name || idOrName;
  const delegations: DelegationSummaryRow[] = delegationRequests
    .filter((del) => del.status === "Approved" || del.status === "Revoked")
    .map((del) => ({
      requestedBy: resolveUserName(del.requestedBy),
      reason: del.reason,
      scopesLabel: (del.scopes || []).map((sc) => DELEGATION_SCOPE_LABELS[sc] || sc).join(", "),
      effectivePeriod: `${del.effectiveStart} to ${del.effectiveEnd}`,
      status: del.status,
    }));

  // Audit & Executive Sign-Off metrics (strictly counts & %, ZERO peso figures)
  const auditedTxs = transactions.filter((t) => t.auditedStatus === "Audited");
  const auditComplianceRate = transactions.length > 0
    ? ((auditedTxs.length / transactions.length) * 100).toFixed(1)
    : "100.0";
  const presidentSignedTransactionsCount = auditedTxs.filter((t) => t.presidentApprovalStatus === "Approved").length;

  // IGP, Market & Custodial Assets metrics
  const activeIgpProjectsCount = livestockIgp?.produces?.length ?? (livestockIgp?.livestockInventory?.length ?? 0);
  const eggHarvests = livestockIgp?.eggHarvests ?? livestockIgp?.choreLogs ?? [];
  const signedHarvests = eggHarvests.filter((h) => h.status === "Signed");
  const verifiedEggsTotal = signedHarvests.reduce((sum, h) => sum + (Number(h.eggCount) || 0), 0);
  const publishedMarketProducts = products.filter((p) => p.isPublished !== false).length;
  const goodConditionInventoryItems = inventory.filter((i) => i.condition === "Good").length;
  const assetReadinessRate = inventory.length > 0
    ? ((goodConditionInventoryItems / inventory.length) * 100).toFixed(1)
    : "100.0";

  // Auto-populate Highlights from completed activities & achievements for the reporting year + custom highlights
  const completedActivities = activities.filter(
    (a) => a.status === "Completed" && (matchesYear(a.scheduledDate, year) || !a.scheduledDate)
  );
  const autoActivityHighlights = completedActivities.map((a) => {
    const attendees = a.attendeesCount ? ` (${a.attendeesCount} attendees)` : "";
    const detail = a.documentedNotes ? ` — ${a.documentedNotes}` : a.location ? ` at ${a.location}` : "";
    return `${a.title}${detail}${attendees}.`;
  });
  const yearAchievements = achievements.filter((ach) => String(ach.year).trim() === String(year));
  const autoAchievementHighlights = yearAchievements.map((ach) =>
    `${ach.title}: ${ach.description}`
  );
  const mergedHighlights = dedupeStrings([
    ...autoAchievementHighlights,
    ...autoActivityHighlights,
    ...highlights,
  ]);

  // Auto-populate Plans from upcoming/in-progress activities + custom plans
  const upcomingActivities = activities.filter(
    (a) => a.status === "Scheduled" || a.status === "In Progress"
  );
  const autoPlans = upcomingActivities.map((a) => {
    const when = a.scheduledDate ? ` (${a.scheduledDate})` : "";
    const where = a.location ? ` at ${a.location}` : "";
    return `${a.title}${when}${where}`;
  });
  const mergedPlans = dedupeStrings([...autoPlans, ...plans]);

  return {
    year,
    generatedDate,
    org: {
      ...DEFAULT_ORG,
      doleRegNo,
      logoSrc: logoSrc ?? "/afa-logo.png",
    },
    summary: {
      totalMembers: members.length,
      activeMembers: activeMembers.length,
      inactiveMembers: inactiveMembers.length,
      sitioCount: sitioSet.size,
      rsbsaRegistered,
      duesPaidCount,
      duesComplianceRate,
      meetingsHeld: scopedMeetings.length,
      avgMeetingAttendance,
      approvedMinutesCount,
      approvedResolutionsCount: approvedResolutionsList.length,
      totalResolutionsCount: resolutions.length,
      announcementsPublished: announcements.length,
      highPriorityAnnouncements: announcements.filter((a) => a.priority === "High").length,
      auditComplianceRate,
      auditedTransactionsCount: auditedTxs.length,
      presidentSignedTransactionsCount,
      activeIgpProjectsCount,
      signedEggHarvestBatches: signedHarvests.length,
      verifiedEggsTotal,
      publishedMarketProducts,
      totalInventoryItems: inventory.length,
      goodConditionInventoryItems,
      assetReadinessRate,
    },
    highlights: mergedHighlights,
    approvedResolutions,
    delegations,
    plans: mergedPlans,
    closingLine,
    customRemarks: customRemarks?.trim() || undefined,
    officers: sortedOfficers,
    secretary: signatory("Secretary", "AFA Secretary"),
    auditor: signatory("Auditor", "AFA Auditor"),
    president: signatory("President", "AFA President"),
  };
}

/* ---------- Ready-to-use wiring component ---------- */
export function PresidentReportContainer(props: BuildPresidentReportInput) {
  const data = useMemo(() => buildReportData(props), [props]);
  return <PresidentReport data={data} />;
}

/* ---------- Sample data (kept for preview/Storybook use) ---------- */
export const sampleReport: ReportData = buildReportData({
  year: 2025,
  highlights: [
    "The association participated in the barangay Clean Up Drive, which is done twice a year.",
    "ATI RTC7 awarded 1.5 Million Pesos for the 40 Head Swine Fattening Project (SIRP).",
  ],
  plans: [
    "Follow up the Ready to Lay Chicken Project at the Department of Agriculture DA7",
    "Improve and increase the production of the DILEEP project of DOLE7",
    "Strengthen the bond of the members of the association.",
  ],
  closingLine: "MABUHAY ANG MGA MAG-UUMA, Welcome 2026!",
});
