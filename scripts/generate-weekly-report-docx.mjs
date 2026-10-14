// Generates WEEKLY_PROGRESS_REPORT.docx from the weekly progress report data.
// Run: node scripts/generate-weekly-report-docx.mjs
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageBreak, convertInchesToTwip
} from 'docx';
import fs from 'fs';
import path from 'path';

const GREEN = '1B4332';
const SAGE = 'EAF4EC';
const PARCHMENT = 'D5CFC1';

const TEAM = [
  ['Ronar Diamante', 'Lead System Architect & Backend Developer',
    'System architecture, PostgreSQL schema design, offline PWA sync engine, Vercel build pipeline, cloud deployments, security implementation, code review'],
  ['Joshua Pesiao', 'Frontend Developer & UI/UX Designer',
    'React component development, responsive design, PWA offline UI/UX, form validation, API integration, loading states, error handling, design system'],
  ['Aella Marie Agsoy', 'QA & Security Tester',
    'Test plan creation, functional testing, regression testing, API testing, bug tracking, security testing, performance testing, cross-browser compatibility'],
  ['Honey Blare Gargar', 'Documentation Lead',
    'Technical documentation, user manuals, API documentation, deployment guides, meeting minutes, requirements gathering, stakeholder interviews, research'],
];

const WEEKS = [
  {
    week: 5,
    period: 'September 21, 2026 – September 25, 2026',
    summaryParagraph: 'This reporting period delivered the foundational UI overhaul of the entire AFA portal. Every officer dashboard was re-skinned onto a unified design system, the offline-first PWA shell was hardened, and the guest public portal was rebuilt — establishing the visual and structural baseline that all later features build upon.',
    achievements: [
      ['Full-System UI Overhaul', "Rebuilt the interface across all 23 modified source files, unifying the association's identity into a high-contrast agricultural theme (deep forest green #1B4332, soft sage #EAF4EC, warm parchment #D5CFC1) applied consistently to officers, members, and guests."],
      ['Unified Design System in index.css', 'Added 311 lines of shared component styling (card padding, button tokens, tab bars, badge classes) so all dashboards render identically without per-view duplication.'],
      ['Guest Public Portal Rebuild', 'Delivered a polished public-facing landing experience (Overview, Announcements, Activities, Products, Achievements, History) for non-logged-in visitors.'],
      ['Offline-First PWA Shell Refinement', 'Updated OfflineIndicator.tsx (52 lines) to reliably surface online/offline network state and pending-sync status to the user at all times.'],
      ['Dashboard-Wide Consistency Pass', 'Applied the new theme to ExecutiveView, SecretaryView, TreasurerView, HogRaisingIgpTracker, AnnouncementDashboard, ProductManagementModal, PioView, MemberDashboard, and OfficerReportModal.'],
    ],
    challenges: [
      ['Cross-Branch UI Reverts', 'The UI overhaul landed across several branches with re-apply/revert churn before stabilizing on main.', 'Consolidated the work into new-ui-changes (23 files) and merged through PRs #1 and #2, arriving at a single coherent baseline.'],
    ],
    sentiment: 'Strong week. The portal gained a consistent, accessible visual identity and a clean structural foundation, which unlocked faster feature delivery in every subsequent week.',
    completed: [
      ['Task 1: System-Wide Design System & Theme Establishment', 'Introduced shared CSS tokens and the unified green/sage/parchment palette.', 'September 22, 2026'],
      ['Task 2: Guest Public Portal Rebuild', 'Delivered the public landing experience for unauthenticated visitors.', 'September 22, 2026'],
      ['Task 3: Officer Dashboard Re-Skin', 'Applied the unified theme to all officer views (Executive, Secretary, Treasurer, PIO, Auditor shell).', 'September 22, 2026'],
      ['Task 4: Offline Indicator & Connectivity UX', 'Refined the live online/offline and sync-state indicator.', 'September 22, 2026'],
    ],
    inProgress: [
      ['Task 5: Treasurer Ledger Restructure', 'Begin separating treasury views in preparation for a dedicated Auditor dashboard.', 'September 29, 2026'],
      ['Task 6: Member Directory Enhancements', 'Prepare extended member profile fields (birthdate, affiliations).', 'September 28, 2026'],
    ],
    blocked: 'None. Core UI shell and routing were stable.',
    milestones: [
      { name: 'Officer Dashboard Feature Completion', date: 'September 30, 2026', deliverables: ['Auditor dashboard separation, member affiliations, and treasury ledger restructure.'] },
    ],
    nextSteps: 'Extend the member profile model (birthdate, affiliations) and restructure the treasurer/auditor boundary.',
  },
  {
    week: 6,
    period: 'September 28, 2026 – October 2, 2026',
    summaryParagraph: "This reporting period focused on separating the Auditor's responsibilities from the Treasurer, enriching the member registry with birthdate and multi-affiliation tracking, and adding COA-compliant liquidation references to the treasury ledger. It also removed the obsolete farm_size field from the schema and sync layer.",
    achievements: [
      ['Dedicated Auditor Dashboard (AuditorView.tsx)', 'Delivered a standalone 239-line audit workspace with transaction review, Audited/Flagged/Unaudited status filters, audit-notes capture, and live counts — decoupling audit duties from the Treasurer\'s entry screen.'],
      ['Treasurer View Refactor', 'Reduced TreasurerView.tsx by 185 lines by moving audit functions out, tightening the ledger to income/expense entry and reporting.'],
      ['Member Affiliations Model', 'Added MemberAffiliation support (Senior Citizen, PWD, 4Ps/DSWD, Cooperative, Farmers Association, Government Agency) with ID numbers, wired through types.ts, AffiliationManager, and the Secretary\'s registry.'],
      ['Birthdate Capture in Registry', "Added a birthdate capture modal and field to the Secretary's member forms."],
      ['COA Liquidation Compliance', 'Added explicit references to COA (Commission on Audit) regulation for liquidation flows in TreasurerView and types.ts.'],
      ['Schema Cleanup', 'Removed the unused farm_size column and its sync mappings from api/sync/pull.js, api/sync/push.js, and src/api/db.ts.'],
      ['Authentication Copy Fix', 'Removed an outdated election reference from AuthScreen.tsx.'],
    ],
    challenges: [
      ['Treasurer/Auditor Responsibility Overlap', 'Audit actions were originally buried inside the Treasurer view, creating a separation-of-duties conflict (the same role could both record and certify).', 'Extracted a dedicated AuditorView and relocated all certification actions there, enforcing an independent audit trail.'],
    ],
    sentiment: 'Very strong week. The governance model now correctly separates recording (Treasurer) from certification (Auditor), and the member registry captures the statutory identity fields required by partner agencies.',
    completed: [
      ['Task 1: Auditor Dashboard Separation', 'Standalone audit workspace with status filtering and notes.', 'September 29, 2026'],
      ['Task 2: Treasurer View Refactor', 'Removed audit logic, tightened ledger scope.', 'September 30, 2026'],
      ['Task 3: Member Affiliations & Birthdate', 'Multi-affiliation tracking and birthdate capture in the registry.', 'September 28, 2026'],
      ['Task 4: COA Liquidation References', 'Added statutory liquidation citation to treasury.', 'October 2, 2026'],
      ['Task 5: farm_size Schema Deprecation', 'Removed obsolete column and sync mappings.', 'September 28, 2026'],
      ['Task 6: Authentication Copy Cleanup', 'Removed stale election reference.', 'October 2, 2026'],
    ],
    inProgress: [
      ['Task 7: Affiliation Modal Optimization', 'Streamline the affiliation editor UX.', 'October 5, 2026'],
      ["Task 8: President's Report Export", 'Build the printable presidential report module.', 'October 9, 2026'],
    ],
    blocked: 'None. Sync layer and database schema migrations completed cleanly.',
    milestones: [
      { name: 'Officer Reporting & Registry Completion', date: 'October 9, 2026', deliverables: ["President's report export and polished member affiliation management."] },
    ],
    nextSteps: "Optimize the affiliation editor and deliver the President's printable report with proper name segmentation.",
  },
  {
    week: 7,
    period: 'October 5, 2026 – October 9, 2026',
    summaryParagraph: "This reporting period delivered the President's printable report module, name-segmentation utilities, affiliation editor optimization, and a cross-dashboard copy cleanup to remove redundant sub-text and tighten every screen.",
    achievements: [
      ["President's Report Module (PresidentReport.tsx)", 'Delivered a 352-line printable report component with a dedicated president-report.css stylesheet (55 lines), producing an audit-ready presidential summary for export.'],
      ['Farmer Name Segmentation (utils/names.ts)', 'Added a 55-line utility that splits a full name into structured personal-data components (Surname, First Name, Middle Initial), improving registry accuracy and report formatting.'],
      ["Secretary Registry Upgrade", "Substantially reworked the Secretary's member entry flow (159 lines changed) to use segmented name inputs and the new affiliation structure."],
      ['Officer Report Modal Extension', 'Extended OfficerReportModal.tsx (+58 lines) to support the expanded report data.'],
      ['Affiliation Editor Optimization', 'Iteratively refined AffiliationManager across three passes (Oct 4–5), cutting ~45 lines of redundant logic and simplifying the modal.'],
      ['Dashboard Copy Cleanup (removed-subtexts)', 'Removed redundant descriptive sub-text across 8 components (AnnouncementDashboard, ExecutiveView, GuestPortal, HogRaisingIgpTracker, MemberDashboard, SecretaryView, SyncQueuePanel, TreasurerView) — 142 lines removed for a cleaner, less cluttered UI.'],
    ],
    challenges: [
      ['Inconsistent Name Storage', 'Free-text full-name entry produced inconsistent formats that broke downstream report extraction.', 'Introduced utils/names.ts and migrated the Secretary\'s registry to segmented name capture, standardizing the "Surname, First Name M." convention.'],
    ],
    sentiment: 'Excellent week. The President now has a formal printable export, the registry captures names in a structured way, and the whole UI reads more cleanly after the sub-text cleanup.',
    completed: [
      ["Task 1: President's Report Export Module", 'Printable, branded presidential report with dedicated stylesheet.', 'October 9, 2026'],
      ['Task 2: Farmer Name Segmentation Utility', 'Structured name parsing for registry and reports.', 'October 9, 2026'],
      ['Task 3: Secretary Registry Name-Input Migration', 'Segmented name fields with validation.', 'October 9, 2026'],
      ['Task 4: Affiliation Modal Optimization', 'Simplified and de-duplicated the affiliation editor.', 'October 5, 2026'],
      ['Task 5: Cross-Dashboard Sub-Text Cleanup', 'Removed redundant descriptive copy across 8 components.', 'October 8, 2026'],
    ],
    inProgress: [
      ['Task 6: Role-Based Access Restraints', 'Define and enforce per-role authorities (President vs. Vice President).', 'October 12, 2026'],
      ['Task 7: Database Connection Handshake Hardening', 'Audit and fix TLS/connection handling across all API routes.', 'October 12, 2026'],
    ],
    blocked: 'None. All report exports and sync pipelines verified working.',
    milestones: [
      { name: 'Role Governance & Security Hardening', date: 'October 12, 2026', deliverables: ['Enforced role authorities and hardened database connection handshake.'] },
    ],
    nextSteps: 'Lock down officer-level privileges and eliminate the insecure global TLS override flagged in production logs.',
  },
  {
    week: 8,
    period: 'October 12, 2026 – October 16, 2026',
    summaryParagraph: 'This reporting period focused on role-based authority enforcement, the new Assistant Treasurer role, multi-stage officer approval workflows (Secretary minutes and audited financial records awaiting President sign-off), announcement publishing rights, IGP status-card data binding, and a security hardening fix for the cloud database connection handshake.',
    achievements: [
      ['Role-Based Authority Restraints (App.tsx + ExecutiveView.tsx)', "Implemented enforceable authority rules — the President (system admin) alone may appoint officers, reassign roles, and delete accounts; the President and Vice President may reset passwords, but the President's own password is protected and cannot be reset by anyone."],
      ['Assistant Treasurer Role (types.ts + ExecutiveView.tsx + OfficerReportModal.tsx)', "Added a new Assistant Treasurer governance role to the OfficerRole union and propagated it through the app — role assignment, reassignment, the turnover flow, the Association Officers roster, and a dedicated Assistant Treasurer financial report (HTML + CSV export) mirroring the Treasurer's statement."],
      ['Secretary Minutes Approval Workflow (Secretary -> President) (types.ts + App.tsx + ExecutiveView.tsx + SecretaryView.tsx)', 'Secretary-drafted minutes now carry a minutesApprovalStatus (Pending Approval -> Approved / Returned). The President reviews each set of minutes in a dedicated modal, then approves or returns it with remarks; the Secretary view shows a live status badge per meeting.'],
      ['Audited Financial Record Approval Workflow (Auditor -> President) (types.ts + App.tsx + ExecutiveView.tsx)', "Financial transactions audited by the Auditor (auditedStatus === 'Audited') now flow to a President Financial Approvals queue, where each record can be finally approved or returned for revision with remarks; the decision and audit trail (presidentApprovalStatus, presidentApprovedBy/Date/Remarks) are persisted and synced."],
      ['Member Appoint-as-Officer Workflow', 'Added an "Appoint" action to the Member Portal Accounts list allowing the President to provision a registered farmer directly into an officer role (Vice President, Secretary, Treasurer, Assistant Treasurer, Auditor, PIO).'],
      ['President Announcement Publishing (PioView reuse in App.tsx)', 'Granted the President full announcement authoring on the Announcements Board, with correct authorship attribution ("President (name)") instead of the PIO default.'],
      ['IGP Status Card Database Binding (HogRaisingIgpTracker.tsx)', 'Replaced hardcoded "17 Baboy / 8 Baboy / 6 caretakers" values with live, database-backed figures (current hog count, hogs sold, and unique rotational caretakers derived from the synced group data).'],
      ['Database Handshake Security Fix (src/api/db.ts + server.ts + rebuilt api/**)', "Removed the process-wide NODE_TLS_REJECT_UNAUTHORIZED='0' override that disabled TLS verification globally and triggered Node security warnings. Certificate acceptance is now scoped per-connection via ssl: { rejectUnauthorized: false }, preserving Supabase connectivity while eliminating the warning."],
    ],
    challenges: [
      ['Role Confusion in Officer Management', "The officer card used officer.role === 'President' (is this officer the President) where it needed currentRole === 'President' (is the logged-in user the President), which let the Vice President reset the President's password.", 'Introduced explicit canResetPasswords / canAppointOfficers / canManageThisOfficer flags and added authoritative server-side guards in App.tsx handlers (defense in depth: UI hidden and handler rejects).'],
      ['Redundant Global TLS Override', 'Production logs showed the Node TLS warning on every sync request.', 'Removed the global override from source, rebuilt the committed api/** bundles, and confirmed the ssl option still carries certificate acceptance.'],
    ],
    sentiment: 'Excellent week. The portal now enforces a correct separation of duties, the President has full administrative control (officers + announcements), the new Assistant Treasurer role is fully operational, multi-stage officer approval workflows (minutes and audited financials) are in place with a complete audit trail, the IGP status card reflects live data, and a genuine security weakness in the DB handshake was eliminated.',
    completed: [
      ['Task 1: Role-Based Authority Restraints', 'President/VP privilege separation with handler-level guards.', 'October 12, 2026'],
      ['Task 2: Member Appoint-as-Officer Workflow', 'Presidential appointment of members into officer roles.', 'October 12, 2026'],
      ['Task 3: President Announcement Publishing', 'President authoring on the Announcements Board with correct attribution.', 'October 12, 2026'],
      ['Task 4: IGP Status Card Live Data Binding', 'Database-backed hog counts and caretaker totals.', 'October 12, 2026'],
      ['Task 5: Database Handshake Security Hardening', 'Removed global TLS override; scoped SSL per pool.', 'October 12, 2026'],
      ['Task 6: Assistant Treasurer Role', 'New governance role added end-to-end (assignment, roster, turnover, dedicated financial report).', 'October 14, 2026'],
      ['Task 7: Secretary Minutes Approval Workflow', 'President review/approve/return of Secretary-drafted minutes with remarks.', 'October 14, 2026'],
      ['Task 8: Audited Financial Record Approval Workflow', 'Auditor -> President queue with final approval/return and audit trail.', 'October 14, 2026'],
    ],
    inProgress: [
      ['Task 9: Preparation for Officer User Acceptance Testing (UAT)', 'Device staging environments and role-based test credential matrices (President, Treasurer, Assistant Treasurer, Secretary, Auditor, Member).', 'October 20, 2026'],
      ['Task 10: Equipment Inventory & Rental Scheduling Optimization', 'Prevent double-booking of IGP chairs and sacks during peak harvest.', 'October 20, 2026'],
      ['Task 11: Final System Functionality & Officer Role Completion', 'Finalize officer-specific operations across all dashboards.', 'October 20, 2026'],
    ],
    blocked: 'None. All backend APIs, database connections, and sync queues are operating cleanly across test and production builds.',
    milestones: [
      { name: 'End-to-End Field Trial with Association Officers', date: 'October 20, 2026', deliverables: [] },
      { name: 'Production Release 1.2 — Complete Cloud Sync with Real-Time Accurate Data', date: 'October 20, 2026', deliverables: [
        "Organization's accurate data fully pushed to the system.",
        'Real-time data access for all officer roles.',
        'Verified data integrity across all 11 relational tables.',
        'Audit-ready ledgers and compliance reports.',
        'Seamless offline-to-online synchronization.',
      ] },
    ],
    nextSteps: 'Finalize all system functionalities, officer roles, and dashboard UIs; distribute the updated PWA build to officer mobile devices in Barangay Alegria for an offline data-entry rehearsal ahead of the formal October 20 field trial.',
  },
];

// ---------- helpers ----------
const FONT = 'Calibri';

function txt(text, opts = {}) {
  return new TextRun({ text, font: FONT, size: opts.size ?? 22, bold: opts.bold, italics: opts.italics, color: opts.color });
}

function para(children, opts = {}) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [children],
    spacing: { after: opts.after ?? 120, before: opts.before ?? 0, line: 276 },
    alignment: opts.alignment,
    heading: opts.heading,
    indent: opts.indent,
    border: opts.border,
  });
}

function h1(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: 32, bold: true, color: GREEN })],
    spacing: { before: 240, after: 160 },
    border: { bottom: { color: PARCHMENT, style: BorderStyle.SINGLE, size: 8, space: 4 } },
  });
}

function h2(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: 26, bold: true, color: GREEN })],
    spacing: { before: 240, after: 120 },
  });
}

function h3(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: 23, bold: true, color: '2D6A4F' })],
    spacing: { before: 180, after: 80 },
  });
}

function bullet(children, opts = {}) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [children],
    bullet: { level: opts.level ?? 0 },
    spacing: { after: 80, line: 276 },
  });
}

function metaRow(label, value) {
  return new Paragraph({
    children: [txt(`${label}: `, { bold: true }), txt(value)],
    spacing: { after: 40 },
  });
}

// label — text  (bold label, normal text)
function labeled(label, text) {
  return para([txt(`${label} — `, { bold: true }), txt(text)]);
}

function makeTable(headers, rows, widths) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      shading: { type: ShadingType.CLEAR, fill: GREEN },
      width: widths ? { size: widths[i], type: WidthType.PERCENTAGE } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: [new TextRun({ text: h, font: FONT, size: 20, bold: true, color: 'FFFFFF' })], spacing: { after: 0 } })],
    })),
  });

  const bodyRows = rows.map((r, ri) => new TableRow({
    children: r.map((cell, i) => new TableCell({
      shading: ri % 2 === 1 ? { type: ShadingType.CLEAR, fill: 'F7F4EF' } : undefined,
      width: widths ? { size: widths[i], type: WidthType.PERCENTAGE } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: [new TextRun({ text: cell, font: FONT, size: 20 })], spacing: { after: 0 } })],
    })),
  }));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: PARCHMENT },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: PARCHMENT },
      left: { style: BorderStyle.SINGLE, size: 4, color: PARCHMENT },
      right: { style: BorderStyle.SINGLE, size: 4, color: PARCHMENT },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: PARCHMENT },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: PARCHMENT },
    },
    rows: [headerRow, ...bodyRows],
  });
}

// ---------- build ----------
const children = [];

// Cover / title block
children.push(new Paragraph({
  children: [new TextRun({ text: 'Weekly Progress Report', font: FONT, size: 52, bold: true, color: GREEN })],
  alignment: AlignmentType.CENTER,
  spacing: { before: 1200, after: 160 },
}));
children.push(new Paragraph({
  children: [new TextRun({ text: 'Alegria Farmers Association (AFA) Portal & Offline-First PWA', font: FONT, size: 28, color: '2D6A4F' })],
  alignment: AlignmentType.CENTER,
  spacing: { after: 120 },
}));
children.push(new Paragraph({
  children: [new TextRun({ text: 'Weeks 5–8  •  September 21, 2026 – October 16, 2026', font: FONT, size: 24, italics: true, color: '5D6B54' })],
  alignment: AlignmentType.CENTER,
  spacing: { after: 120 },
}));
children.push(new Paragraph({ children: [new PageBreak()] }));

for (const w of WEEKS) {
  children.push(h1(`WEEK ${w.week} — ${w.period}`));
  children.push(metaRow('Reporting Period', w.period));
  children.push(metaRow('Project', 'Alegria Farmers Association (AFA) Portal & Offline-First PWA'));

  // 1. Summary
  children.push(h2('1. Summary of the Week'));
  children.push(para(txt(w.summaryParagraph)));

  children.push(h3('Key Achievements:'));
  for (const [label, text] of w.achievements) children.push(bullet([txt(`${label}: `, { bold: true }), txt(text)]));

  children.push(h3('Challenges Encountered:'));
  for (const [label, problem, resolution] of w.challenges) {
    children.push(bullet([txt(`${label}: `, { bold: true }), txt(problem)]));
    children.push(bullet([txt('Resolution: ', { bold: true, italics: true }), txt(resolution, { italics: true })], { level: 1 }));
  }

  children.push(h3('Overall Sentiment:'));
  children.push(para(txt(w.sentiment)));

  // 2. Progress Status
  children.push(h2('2. Progress Status'));

  children.push(h3('Completed Tasks:'));
  for (const [name, desc, date] of w.completed) {
    children.push(bullet([txt(`${name} — `, { bold: true }), txt(desc), txt(` Completed on ${date}.`, { italics: true })]));
  }

  children.push(h3('Tasks In Progress:'));
  for (const [name, desc, date] of w.inProgress) {
    children.push(bullet([txt(`${name} — `, { bold: true }), txt(desc), txt(` Estimated completion: ${date}.`, { italics: true })]));
  }

  children.push(h3('Blocked Tasks:'));
  children.push(para(txt(w.blocked)));

  // 3. Team
  children.push(h2('3. Assigned Member and Role'));
  children.push(makeTable(['Member Name', 'Role', 'Responsibilities'], TEAM, [22, 28, 50]));
  children.push(para(txt(''), { after: 80 }));

  // 4. Milestones
  children.push(h2('4. Upcoming Milestones'));
  w.milestones.forEach((m, idx) => {
    const prefix = w.milestones.length > 1 ? `Milestone ${idx + 1}: ` : 'Milestone: ';
    children.push(bullet([txt(prefix, { bold: true }), txt(m.name)]));
    children.push(bullet([txt('Target Date: ', { bold: true }), txt(m.date)], { level: 1 }));
    if (m.deliverables && m.deliverables.length) {
      children.push(bullet([txt('Key Deliverable' + (m.deliverables.length > 1 ? 's:' : ':'), { bold: true })], { level: 1 }));
      for (const d of m.deliverables) children.push(bullet([txt(d)], { level: 2 }));
    }
  });
  children.push(bullet([txt('Next Steps: ', { bold: true }), txt(w.nextSteps)]));

  if (w.week !== WEEKS[WEEKS.length - 1].week) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }
}

// Appendix
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1('Appendix — Change Log by Week'));
children.push(makeTable(
  ['Week', 'Dates', 'Focus', 'Key Files Changed'],
  [
    ['5', 'Sep 21–25', 'Full UI overhaul, design system, guest portal, offline indicator', '23 files incl. index.css, App.tsx, all dashboards'],
    ['6', 'Sep 28–Oct 2', 'Auditor dashboard separation, affiliations, birthdate, COA liquidation', 'AuditorView.tsx, TreasurerView.tsx, types.ts, AffiliationManager.tsx'],
    ['7', 'Oct 5–9', 'President report, name segmentation, affiliation polish, sub-text cleanup', 'PresidentReport.tsx, utils/names.ts, SecretaryView.tsx'],
    ['8', 'Oct 12–16', 'Role restraints, Assistant Treasurer role, minutes & financial approval workflows, announcement rights, IGP card binding, TLS hardening', 'App.tsx, ExecutiveView.tsx, SecretaryView.tsx, OfficerReportModal.tsx, types.ts, HogRaisingIgpTracker.tsx, PioView.tsx, src/api/db.ts'],
  ],
  [8, 16, 40, 36]
));

const doc = new Document({
  creator: 'Alegria Farmers Association',
  title: 'Weekly Progress Report — AFA Portal & Offline-First PWA',
  description: 'Weekly progress reports, Weeks 5–8 (September 21 – October 16, 2026)',
  sections: [{
    properties: {
      page: {
        margin: { top: convertInchesToTwip(0.8), bottom: convertInchesToTwip(0.8), left: convertInchesToTwip(0.9), right: convertInchesToTwip(0.9) },
      },
    },
    children,
  }],
});

const outPath = path.join(process.cwd(), 'WEEKLY_PROGRESS_REPORT.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log('Wrote ' + outPath + ' (' + buf.length + ' bytes)');
});
