"""Builds the mock capstone defense deck for FAMS (Alegria Farmers Association)."""
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

FOREST = RGBColor(0x1B, 0x43, 0x32)
SAGE = RGBColor(0xEA, 0xF4, 0xEC)
CREAM = RGBColor(0xD5, 0xCF, 0xC1)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
DARK = RGBColor(0x2A, 0x2A, 0x2A)
ACCENT = RGBColor(0x2D, 0x6A, 0x4F)

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]

def bg(slide, color):
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = color

def textbox(slide, l, t, w, h):
    tb = slide.shapes.add_textbox(Inches(l), Inches(t), Inches(w), Inches(h))
    tb.text_frame.word_wrap = True
    return tb

def title_bar(slide, text):
    bar = slide.shapes.add_shape(1, Inches(0), Inches(0), prs.slide_width, Inches(1.1))
    bar.fill.solid(); bar.fill.fore_color.rgb = FOREST; bar.line.fill.background()
    tf = bar.text_frame; tf.margin_left = Inches(0.6)
    p = tf.paragraphs[0]; run = p.add_run(); run.text = text
    run.font.size = Pt(32); run.font.bold = True; run.font.color.rgb = WHITE
    strip = slide.shapes.add_shape(1, Inches(0), Inches(1.1), prs.slide_width, Inches(0.06))
    strip.fill.solid(); strip.fill.fore_color.rgb = CREAM; strip.line.fill.background()

def bullets(slide, items, l=0.7, t=1.5, w=12.0, h=5.5, size=20):
    tb = textbox(slide, l, t, w, h)
    tf = tb.text_frame
    for i, (text, lvl) in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = text; p.level = lvl
        p.font.size = Pt(size) if lvl == 0 else Pt(size - 3)
        p.font.color.rgb = DARK
        p.space_after = Pt(10)
    return tb

def add_slide(title, items, size=20):
    s = prs.slides.add_slide(BLANK); bg(s, SAGE)
    title_bar(s, title)
    bullets(s, items, size=size)
    return s

# ---------- 1. Title ----------
s = prs.slides.add_slide(BLANK); bg(s, FOREST)
tb = textbox(s, 0.8, 1.6, 11.7, 3.6)
tf = tb.text_frame
p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
r = p.add_run(); r.text = "FARMERS ASSOCIATION MANAGEMENT SYSTEM"
r.font.size = Pt(40); r.font.bold = True; r.font.color.rgb = WHITE
p2 = tf.add_paragraph(); p2.alignment = PP_ALIGN.CENTER
r = p2.add_run(); r.text = "An Offline-First Progressive Web Application for the\nAlegria Farmers Association, Barangay Alegria, Tuburan, Cebu"
r.font.size = Pt(22); r.font.color.rgb = CREAM
p3 = tf.add_paragraph(); p3.alignment = PP_ALIGN.CENTER; p3.space_before = Pt(28)
r = p3.add_run(); r.text = "Diamante, Ronar  •  Pesiao, Joshua G.  •  Agsoy, Aella Marie C.  •  Gargar, Honey Blare B."
r.font.size = Pt(18); r.font.color.rgb = WHITE
tb2 = textbox(s, 0.8, 5.9, 11.7, 1.0)
p = tb2.text_frame.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
r = p.add_run(); r.text = "Bachelor of Science in Information Technology\nCebu Technological University – Tuburan Campus  |  Mock Defense • 2026"
r.font.size = Pt(15); r.font.color.rgb = CREAM

# ---------- 2. Overview / Agenda ----------
add_slide("Presentation Outline", [
    ("Background of the Study", 0),
    ("Statement of the Problem", 0),
    ("Objectives of the Study", 0),
    ("Scope and Limitations", 0),
    ("Methodology & Development Process", 0),
    ("System Design & Architecture", 0),
    ("Implemented Features (Live Demo Points)", 0),
    ("Testing & Security", 0),
    ("Conclusions & Recommendations", 0),
], size=24)

# ---------- 3. Background ----------
add_slide("Background of the Study", [
    ("Farming is a primary livelihood in Tuburan, Cebu; farmers' associations link farmers to the DA, LGU, and support programs", 0),
    ("Alegria Farmers Association still relies on manual, paper-based recordkeeping", 1),
    ("Slow retrieval, outdated member statuses, non-transparent finances", 2),
    ("Related studies: digital records restored member confidence (DATUFA, Barili); manual computations raise error risk (Cofino & Devero, 2023)", 0),
    ("Rural ICT barrier: unstable internet connectivity (Roxas & Dela Cruz, 2020)", 0),
    ("Response: an offline-first Progressive Web App usable even without internet", 0),
])

# ---------- 4. Problem ----------
add_slide("Statement of the Problem", [
    ("How may the association's manual recordkeeping be described in terms of:", 0),
    ("organizing and retrieving membership records", 1),
    ("recording and monitoring income and expenses", 1),
    ("documenting activities, products, and announcements?", 1),
    ("What management system may be developed to address these concerns?", 0),
    ("member, financial, activities, and product modules with a public Guest View", 1),
    ("offline-first data entry with synchronization", 1),
    ("What is the system's acceptability to officers and members?", 0),
])

# ---------- 5. Objectives ----------
add_slide("Objectives of the Study", [
    ("General: develop and implement FAMS, an offline-first PWA, as the association's centralized management platform", 0),
    ("Specific:", 0),
    ("Member Management – profiles, RSBSA registry, farm locations, statuses", 1),
    ("Financial Management – Treasurer records; Auditor reviews and certifies", 1),
    ("Reports & Analytics – visual summaries; exportable reports", 1),
    ("Activities module – PIO schedules and documents events", 1),
    ("Product Management – publish products to members and guests", 1),
    ("Offline entry stored locally (IndexedDB), synced to PostgreSQL", 1),
    ("Evaluate functionality, usability, reliability, and security", 1),
])

# ---------- 6. Scope & Limitations ----------
add_slide("Scope and Limitations", [
    ("SCOPE", 0),
    ("Role-based access: 9 officer roles + Member accounts", 1),
    ("Modules: members, finances, minutes, resolutions, activities, products, announcements, inventory, livestock IGP", 1),
    ("Approval workflows: Secretary→President (minutes); Auditor→President (finances) — the creator can never be the sole approver", 1),
    ("Public Guest View; hash-chained audit trail; offline sync queue", 1),
    ("Security: bcrypt hashing, TOTP multi-factor authentication, lockout, password policy", 1),
    ("LIMITATIONS", 0),
    ("Single association only; no payroll, lending, or online payments", 1),
    ("Offline supports selected entry tasks only; approvals and MFA need connectivity", 1),
    ("Evaluation limited to the association's officers and members", 1),
])

# ---------- 7. Methodology ----------
add_slide("Methodology — Iterative SDLC", [
    ("Requirements from TNA survey + officer consultations", 0),
    ("Five one-week iterations (Sep 21 – Oct 23, 2026):", 0),
    ("1. UI foundation, design system, Guest Portal rebuild", 1),
    ("2. Auditor dashboard separation; affiliations; COA liquidation references", 1),
    ("3. President's report export; structured name capture", 1),
    ("4. Role authority enforcement; approval workflows; inventory registry", 1),
    ("5. Password policy + lockout; MFA; livestock IGP expansion; automated tests", 1),
    ("Each iteration verified by TypeScript checks and the automated test suite before merge", 0),
])

# ---------- 8. Tools ----------
add_slide("Development Tools & Environment", [
    ("Frontend: TypeScript, React 19, Vite 6, Tailwind CSS 4, Recharts", 0),
    ("Backend: Node.js + Express serverless API endpoints", 0),
    ("Database: PostgreSQL (Supabase-hosted)", 0),
    ("Offline storage: IndexedDB + sync queue (pull/push API)", 0),
    ("Security: bcryptjs, RFC 6238 TOTP, AES-GCM encrypted local state", 0),
    ("Testing: Vitest + React Testing Library (15 automated suites)", 0),
    ("Deployment: Vercel (frontend + serverless API)", 0),
])

# ---------- 9. Architecture ----------
s = prs.slides.add_slide(BLANK); bg(s, SAGE)
title_bar(s, "System Architecture")
tb = textbox(s, 0.7, 1.5, 12.0, 5.6); tf = tb.text_frame
lines = [
    "CLIENT (PWA — installable, offline-capable)",
    "   React dashboards per role • IndexedDB offline queue • AES-GCM local cache • Service-worker assets",
    "",
    "        │  HTTPS  (fetch with credentials; sync pull/push when online)",
    "        ▼",
    "SERVERLESS API (Vercel — Express endpoints)",
    "   auth: login, session, logout, MFA confirm, password change/reset, bootstrap",
    "   sync: pull, push (validated payloads)   •   db: status, delete",
    "",
    "        │  TLS PostgreSQL connection (scoped certificate handling)",
    "        ▼",
    "POSTGRESQL / SUPABASE",
    "   12 relational tables: users, members, meetings, resolutions, transactions,",
    "   announcements, products, activities, IGP expenses, inventory, funds, audit logs",
]
for i, text in enumerate(lines):
    p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
    p.text = text
    p.font.size = Pt(16) if text.startswith("  ") or text == "" else Pt(18)
    p.font.bold = not (text.startswith("  ") or text == "")
    p.font.color.rgb = FOREST if p.font.bold else DARK

# ---------- 10. ERD/data summary ----------
add_slide("Data Model Highlights", [
    ("User / Member — role, RSBSA number, farm location (4 official sitios), primary crops, affiliations", 0),
    ("Meeting — attendance record + minutesApprovalStatus: Pending → Approved / Returned", 0),
    ("FinancialTransaction — type, category, fundSource, liquidationDeadline, auditedStatus, presidentApprovalStatus", 0),
    ("AssociationActivity — category, schedule, organizer, attendance count", 0),
    ("Product — price, unit, stockStatus, farmer attribution, isPublished (drives Guest View)", 0),
    ("IgpExpense / IgpSale / IgpChoreLog — dedicated relational table for livestock IGP", 0),
    ("InventoryItem — custodial duty assigned to the Auditor", 0),
    ("SystemLog — hash-chained audit trail (each entry links to the previous hash)", 0),
])

# ---------- 11. Key features I ----------
add_slide("Implemented Features — Officer Side", [
    ("Executive (President/VP): officer appointment & turnover, approval queues, executive analytics", 0),
    ("Secretary: member registry with segmented names, affiliations, birthdate; printable member lists; minutes drafting", 0),
    ("Treasurer: categorized income/expense ledger, fund sources, liquidation deadlines (COA-referenced), monthly charts", 0),
    ("Auditor: independent certification workspace (Audited / Flagged / Unaudited), audit notes, inventory registry", 0),
    ("PIO: announcements (priority levels), activity scheduling & documentation", 0),
    ("Board Member: policy proposal workspace → presidential sign-off", 0),
])

# ---------- 12. Key features II ----------
add_slide("Implemented Features — Members, Guests, Offline", [
    ("Member Portal: profile, RSBSA info, announcements, activities, products", 0),
    ("Guest View: overview, announcements, activities, products, achievements, history — no account required", 0),
    ("Offline-first: supported entries saved to IndexedDB queue while offline", 1),
    ("OfflineIndicator + SyncQueuePanel show connectivity and pending items", 2),
    ("On reconnect: validated push/pull synchronization to PostgreSQL", 1),
    ("Reports: President's printable report, financial statements (HTML + CSV), PIO activity logs", 0),
])

# ---------- 13. Security ----------
add_slide("Security & Accountability", [
    ("Passwords: bcrypt hashing, NIST-aligned strength policy, password history", 0),
    ("Multi-factor: TOTP (RFC 6238) enforced for the President's account", 0),
    ("Lockout: 5 failed attempts → 15-minute lock, with timestamped tracking", 0),
    ("Two-person rule: drafters can never be the sole approver of minutes or finances", 0),
    ("Separation of duties: Treasurer records, Auditor certifies, President finally approves", 0),
    ("Defense in depth: capability flags in UI + server-side handler guards", 0),
    ("Audit trail: hash-chained system logs make record tampering evident", 0),
    ("Local state encrypted with AES-GCM (Web Crypto)", 0),
])

# ---------- 14. Testing ----------
add_slide("Testing & Results (So Far)", [
    ("Automated: 15 Vitest suites passing — includes AES-GCM storage roundtrips, corrupt-payload recovery, hash migration", 0),
    ("Static: TypeScript compiles with zero errors in application logic", 0),
    ("Functional test plan: role access, member CRUD, proposal/minutes workflow, approval rule, offline entry, exports", 0),
    ("Field validation: officer UAT dry run staged in Barangay Alegria (Week 9)", 0),
    ("Honest status: user-acceptance evaluation results will be reported after the formal evaluation — figures are not invented", 0),
])

# ---------- 15. Deployment ----------
add_slide("Deployment & Deliverables", [
    ("Production cutover on Vercel (app + serverless API) with Supabase PostgreSQL", 0),
    ("Installable PWA distributed to officers' mobile devices in Barangay Alegria", 0),
    ("Release 1.2 targets: real-time data access for all roles, verified integrity across tables, audit-ready ledgers", 0),
    ("Documentation: user manuals, deployment guides, this capstone manuscript", 0),
])

# ---------- 16. Conclusion ----------
add_slide("Conclusions", [
    ("FAMS replaces scattered paper records with one centralized, role-aware platform", 0),
    ("Approval workflows and the hash-chained audit trail directly answer the transparency problem", 0),
    ("Offline-first design fits the barangay's intermittent connectivity — entry work does not stop when internet does", 0),
    ("Final conclusions will be completed against actual testing and evaluation evidence", 0),
])

# ---------- 17. Recommendations ----------
add_slide("Recommendations", [
    ("Adopt the system formally and load the association's actual records", 0),
    ("Run officer orientation and distribute the short user guide", 0),
    ("Institutionalize regular backups and review of audit logs", 0),
    ("Test offline entry and synchronization across more network conditions", 0),
    ("Future work: SMS/alternate notification channel, more export formats, multi-association deployment", 0),
])

# ---------- 18. Thank you ----------
s = prs.slides.add_slide(BLANK); bg(s, FOREST)
tb = textbox(s, 0.8, 2.4, 11.7, 2.6)
tf = tb.text_frame
p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
r = p.add_run(); r.text = "Thank You!"
r.font.size = Pt(48); r.font.bold = True; r.font.color.rgb = WHITE
p2 = tf.add_paragraph(); p2.alignment = PP_ALIGN.CENTER; p2.space_before = Pt(20)
r = p2.add_run(); r.text = "Questions and suggestions from the panel are welcome."
r.font.size = Pt(20); r.font.color.rgb = CREAM

out = r"c:\Users\HP\OneDrive\Documents\alegriafarmersassociation\FAMS_Mock_Defense.pptx"
prs.save(out)
print(f"Saved {out} with {len(prs.slides.slides if hasattr(prs.slides,'slides') else prs.slides._sldIdLst)} slides" if False else f"Saved {out} with {len(prs.slides._sldIdLst)} slides")
