# Draft Sections for fams_manu.docx

> Prepared 2026-11-02. Grounded in the actual FAMS codebase (`src/types.ts`, `package.json`,
> `src/components/`, `src/api/`). Paste each section into the corresponding heading in the
> manuscript, then delete the template guidance text that currently sits under those headings.
> Do NOT fill in testing/evaluation numbers until those activities are actually done.

---

## 1.3 Statement of the Problem

This study addresses the following problems encountered by the Alegria Farmers Association of Barangay Alegria, Tuburan, Cebu in managing its records and operations:

Specifically, the study sought to answer the following questions:

1. How may the current manual and paper-based recordkeeping practices of the Alegria Farmers Association be described in terms of:
   1.1 organizing and retrieving membership records;
   1.2 recording and monitoring income and expenses; and
   1.3 documenting association activities, products, and announcements?

2. What management system may be developed to address these recordkeeping concerns in terms of:
   2.1 a Member Management module that organizes member profiles, RSBSA registration details, farm locations, and membership statuses;
   2.2 a Financial Management module that records income, expenses, fund sources, liquidation deadlines, and audit status;
   2.3 an Association Activities module that schedules and documents events;
   2.4 a Product Management module that maintains association products for members and guests;
   2.5 a Guest View that publishes approved announcements and products to the public; and
   2.6 offline-first data entry with synchronization for periods without internet connectivity?

3. What is the level of acceptability of the developed system to the association's officers and members in terms of functionality, usability, reliability, and security?

**Summary table (Table 1):**

| Problem Identified | Effect on the Association | Proposed System Response |
|---|---|---|
| Membership records kept manually in separate paper files | Slow retrieval; duplicates; outdated member statuses | Member Management module with searchable, centralized profiles |
| Income and expenses recorded without a transparent ledger | Difficulty monitoring finances; hard to prepare reports | Financial Management module with categorized transactions, fund sources, and audit workflow |
| Activities and products not documented in a shared platform | Members and guests unaware of events and products | Activities and Product modules with a public Guest View |
| No formal announcement channel | Delayed or inconsistent communication to members | Announcements feature with priority levels, posted by the PIO |
| Unstable internet connectivity in farming areas | Online-only tools unusable in the field | Offline-first PWA storing entries locally and syncing later |
| Record modifications not traceable | Low accountability among officers | Audit trail and approval workflows (Secretary→President minutes; Auditor→President financial records) |

---

## 1.4 Objectives of the Study

**General Objective.** To develop and implement the Farmers Association Management System (FAMS), an offline-first Progressive Web Application, as a centralized platform for managing the records and operations of the Alegria Farmers Association of Barangay Alegria, Tuburan, Cebu.

**Specific Objectives.**

1. To develop a Member Management module that allows the Secretary and authorized officers to register, update, and monitor member profiles, including RSBSA registration, farm location (Sitio Tapon, Pundok 1, Pundok 2, Lamak), primary crops, and affiliation records.
2. To implement a Financial Management module that enables the Treasurer to record categorized income and expenses with fund-source tracking, and the Auditor to review, flag, and audit transactions before Presidential approval.
3. To develop an Association Activities module that allows the PIO to schedule, manage, and document association events, with attendance and documentation notes.
4. To develop a Product Management module that allows authorized officers to maintain and publish association products, with stock status and farmer/supplier details, for viewing by members and guests.
5. To implement a Guest View that publishes approved announcements, activities, and products to the public without requiring an account.
6. To implement offline-first data entry, in which supported records are stored locally (IndexedDB) and synchronized with the central PostgreSQL database when connectivity is restored.
7. To evaluate the system's functionality, usability, reliability, and security based on the results of functional testing and user evaluation.

---

## 1.5 Significance of the Study

**Alegria Farmers Association.** The primary beneficiary of this study. The system provides the association with organized, centralized, and retrievable records of members, finances, activities, and products, reducing the time and effort spent on manual recordkeeping and improving financial transparency and accountability.

**Association Officers.** The President, Vice President, Secretary, Treasurer, Auditor, PIO, and Board Members benefit from role-specific dashboards that match their responsibilities, approval workflows that formalize review of minutes and financial records, and printable reports that reduce documentation workload.

**Farmer-Members.** Members gain faster access to announcements, activity schedules, and product information, and can view their own membership information, improving engagement and participation in association affairs.

**Guests and the Community.** The public Guest View allows non-members, buyers, and partner agencies to view approved announcements, activities, and products, increasing the visibility of the association within the community.

**Local Government Unit and Partner Agencies.** The LGU, Department of Agriculture, and funding partners may use the system's organized membership and financial records when assessing the association's eligibility for programs and support.

**Future Researchers.** This study may serve as a reference for developing offline-first management systems for other rural organizations operating under similar connectivity constraints.

---

## 1.6 Scope and Limitations

**Scope.** The study covers the development, testing, and evaluation of the Farmers Association Management System (FAMS), a Progressive Web Application for the Alegria Farmers Association. The system includes: (a) role-based access for nine officer roles (President, Vice President, Secretary, Assistant Secretary, Board Member, Treasurer, Assistant Treasurer, Auditor, and PIO) plus regular Members; (b) modules for member, financial, meeting/minutes, resolution, activity, product, announcement, inventory, and hog-raising/income-generating-project (IGP) records; (c) approval workflows covering minutes of meetings (Secretary drafts, President approves), financial records (Auditor reviews, President approves), and resolutions; (d) a public Guest View; (e) an audit trail using hash-chained system logs; (f) offline-first entry with a synchronization queue stored in IndexedDB and synced to a central PostgreSQL database through pull/push API endpoints; and (g) account security features including bcrypt password hashing, TOTP-based multi-factor authentication, account lockout after repeated failed sign-ins, password policy enforcement, and administrative passcode gating of executive actions.

**Limitations.** The study is limited to the operations of a single farmers' association and does not cover general-purpose accounting, payroll, or cooperative lending functions. Offline mode supports selected data-entry tasks only; functions such as authentication with MFA, multi-user approval, and report generation against central data require connectivity. The system does not include online payment processing; all monetary transactions are recorded manually by the Treasurer. Guest access exposes only published, approved information and never restricted financial or personal records. Evaluation is limited to the officers and members of the association identified as respondents during the study period, and results may not generalize to other associations.

---

## 1.7 Definition of Terms

The following terms are defined operationally and technically for clarity:

**Association Activities.** Events organized or participated in by the association (trainings, assemblies, outreach, fairs, distributions) recorded with schedule, location, organizer, and attendance.

**Audit Trail.** A hash-chained, chronological log of record modifications showing which user performed which action, used to establish accountability.

**Audit Status.** The review state of a financial transaction — Unaudited, Audited, or Flagged — assigned by the Auditor.

**BCrypt.** A password-hashing function used to store member and officer passwords securely instead of plaintext.

**Fund Source.** The budget line from which an expense or disbursement is charged (e.g., General Fund/DSWD-SLP, DOLE Livelihood Program, ATI Training Fund, Member Equity/CBU).

**Guest View.** The public, unauthenticated portion of the system displaying approved announcements, activities, and published products.

**IndexedDB.** A browser-based local database used by the system to store entries and the synchronization queue while the user is offline.

**Income-Generating Project (IGP).** An association enterprise (e.g., hog raising, chair and sack rental) tracked with its own expenses, sales, chore logs, and batch groups.

**Liquidation Deadline.** The date by which an officer who received a cash advance must submit receipts and settle the advance.

**Minutes Approval Workflow.** The process in which the Secretary drafts minutes of a meeting and the President approves or returns them before they become official.

**Offline-First.** A design approach in which the application remains usable for supported tasks without an internet connection and synchronizes changes when connectivity returns.

**Progressive Web Application (PWA).** A web application built with standard web technologies that can be installed on a device, work offline, and send updates, combining web reach with app-like behavior.

**Resolution.** A formal decision of the association recorded with its number, movers and seconders, vote tally, and approval status.

**RSBSA.** Registry System for Basic Sectors in Agriculture — the national farmer registry number tracked for each member.

**Role-Based Access Control (RBAC).** Restriction of system functions according to the officer role assigned to the logged-in user.

**Synchronization Queue.** The ordered list of locally created, updated, or deleted records waiting to be pushed to the central database when connectivity is restored.

**TOTP (Time-based One-Time Password).** A multi-factor authentication method requiring a rotating six-digit code, implemented following RFC 6238.

---

## Additional blanks to fill (Chapter 2, "Development Tools and Environment")

Based on `package.json` and the project structure, insert:

- Programming language / framework: **TypeScript, React 19, Vite 6** (frontend); **Node.js with Express** (server/API); Tailwind CSS 4 for styling; Recharts for analytics charts
- Database or cloud service: **PostgreSQL** (via the `pg` client; Supabase supported as provider)
- Offline storage: **IndexedDB** (offline entries and sync queue; see `SyncQueuePanel.tsx`, `src/api/push.ts` / `pull.ts`)
- Development environment: **Visual Studio Code**; runtime executed with **tsx**; bundling with **esbuild**
- Testing: **Vitest** with React Testing Library (see `src/App.test.tsx`, `PresidentReport.test.tsx`)
- Hosting or deployment platform: **[insert actual host — e.g., Vercel, per `vercel.json`]**
- Design and prototyping tool: **[insert actual tool used, e.g., Figma]**
- Testing devices and browsers: **[insert devices and browser versions used]**

---

---

## Chapter 2 — Requirement Analysis

Requirements were drawn from the Technology Needs Assessment (TNA) survey of the Alegria Farmers Association supplemented by consultation with its officers. The TNA surfaced five concrete needs: organizing membership records, transparent monitoring of income and expenses, a formal platform for publishing products and activities, clearer reporting mechanisms, and usability under unstable internet connectivity. Requirements were organized into functional requirements (role-based access, member management, financial management with audit status, activities, products, announcements, public Guest View, approval workflows, offline entry with synchronization, audit trail) and non-functional requirements (usability, security, data integrity, reliability, performance, offline support, maintainability). Because the system handles personal and financial records, requirements were constrained to collect only the information the association needs for its own operations and reporting to partner agencies, with access restricted by role.

The functional requirements were refined against the association's actual governance structure: nine officer roles exist in the association's constitution (President, Vice President, Secretary, Assistant Secretary, Board Member, Treasurer, Assistant Treasurer, Auditor, and PIO), and each carries distinct recording versus certifying duties. This distinction directly shaped two requirements later enforced in the design: separation of duties between the Treasurer (who records transactions) and the Auditor (who certifies them), and multi-stage approval in which draft documents must be approved by a different officer than the one who created them.

---

## Chapter 2 — Development Methodology (actual narrative)

The system was developed following an iterative SDLC approach across five weekly iterations (Weeks 5–9 of the project schedule, September 21 – October 23, 2026), each cycle delivering a testable increment of the working system:

**Iteration 1 — Foundation and Interface (Week 5).** Established the full design system and unified agricultural theme across all dashboards, rebuilt the public Guest Portal for non-authenticated visitors, and refined the offline connectivity indicator.

**Iteration 2 — Registry and Governance Separation (Week 6).** Delivered the dedicated Auditor dashboard, separating certification duties from the Treasurer's entry screen; added multi-affiliation and birthdate capture to the member registry with Commission on Audit (COA) liquidation references; cleaned the schema of obsolete fields.

**Iteration 3 — Reporting and Data Quality (Week 7).** Delivered the President's printable report export, standardized name capture through structured segmentation, and simplified the affiliation editor.

**Iteration 4 — Role Enforcement and Approval Workflows (Week 8).** Enforced role-based authority rules with server-side guards, added the Assistant Treasurer role, implemented the Secretary→President minutes approval workflow and the Auditor→President financial approval workflow, added the Auditor-managed inventory registry, and removed a global TLS override that had weakened database connection security.

**Iteration 5 — Security Hardening and Testing (Week 9).** Implemented NIST-aligned password policy enforcement, a five-attempt lockout with timed release, TOTP-based multi-factor authentication for privileged accounts, expanded livestock monitoring into a multi-species dashboard backed by a dedicated relational table, added the Assistant Secretary role and Board Member policy workspace, consolidated duplicate sync handlers, and built an automated Vitest test suite covering cryptographic client storage.

Each iteration ended with TypeScript compilation checks and the automated test suite before merging into the main branch, allowing defects to be caught between increments rather than after deployment.

---

## Chapter 3 — Development Process (draft narrative)

The development process combined a role-divided team with iterative integration. Work was divided among four researchers: system architecture and backend development (PostgreSQL schema design, the offline synchronization engine, deployment, and security), frontend and interface development (component design, form validation, API integration), quality assurance (test planning and functional, regression, API, security, and cross-browser testing), and documentation (requirements gathering, stakeholder interviews, manuals, and reporting).

Development proceeded through weekly iterations, summarized in the table below:

| Iteration | Period | Focus | Representative outputs |
|---|---|---|---|
| 1 (Week 5) | Sep 21–25, 2026 | UI foundation & guest portal | Unified design system; Guest Portal rebuild; offline indicator |
| 2 (Week 6) | Sep 28–Oct 2, 2026 | Audit separation & registry | Auditor dashboard; affiliations & birthdate; COA liquidation references |
| 3 (Week 7) | Oct 5–9, 2026 | Reporting & data quality | President's report export; structured name capture |
| 4 (Week 8) | Oct 12–16, 2026 | Role governance & approvals | Authority guards; Assistant Treasurer; minutes and financial approval workflows; inventory registry |
| 5 (Week 9) | Oct 19–23, 2026 | Security & testing | Password policy and lockout; MFA; multi-species livestock dashboard; automated test suite |

**Problems encountered and solutions applied** (each of these is a genuine, documented issue from the development log — use them in the "Problems Encountered" discussion):

1. *Separation-of-duties conflict in the treasury.* Audit certification was initially embedded in the Treasurer's view, letting one role record and certify the same transaction. **Solution:** extracted a dedicated Auditor dashboard and relocated all certification actions, enforcing an independent audit trail.

2. *Privilege-escalation defect in password resets.* A comparison against the officer card's role instead of the logged-in user's role initially allowed the Vice President to reset the President's password. **Solution:** introduced explicit capability flags (`canResetPasswords`, `canAppointOfficers`, `canManageThisOfficer`) and added server-side handler guards in addition to hidden UI controls (defense in depth).

3. *Inconsistent member name formats.* Free-text full-name entry broke downstream report extraction. **Solution:** migrated the registry to segmented name capture (surname, first name, middle initial) via a dedicated parsing utility.

4. *Legacy credential and storage formats.* Early test accounts retained unhashed credentials and unencrypted local storage that conflicted with new security schemas. **Solution:** automated runtime migration routines that detect legacy entries on load, migrate them to AES-GCM ciphertext, and upgrade password hashes on successful authentication.

5. *Concurrency contention in income-generating-project records.* Storing all livestock expenses in a single JSON state blob caused write contention during high-volume entries. **Solution:** normalized IGP expenses into a dedicated relational table (`afa_igp_expenses`) with schema migration, retaining backward compatibility with cached offline payloads.

6. *Insecure global TLS override.* A process-wide environment override that disabled TLS certificate verification globally triggered Node security warnings on every synchronization request. **Solution:** removed the override and scoped certificate handling per database connection.

---

## Chapter 3 — Features of the System (draft narrative to pair with your screenshots)

Insert your labeled screenshots under each item; the text below describes the implemented behavior only.

**Public Guest View.** Non-authenticated visitors can view the association's overview, announcements, activities, products, achievements, and history without an account. Only published/approved content appears; restricted financial and personal records are never exposed.

**Member Management.** The Secretary and authorized officers register and update member profiles including member ID number, RSBSA registration, farm location (Sitio Tapon, Pundok 1, Pundok 2, or Lamak), primary crops, contact details, gender, birthdate, multiple affiliations (e.g., Senior Citizen ID, PWD ID, 4Ps/DSWD, cooperative memberships), and Active/Inactive status. Member lists are printable.

**Financial Management.** The Treasurer records categorized income and expenses with fund-source tracking (e.g., General Fund/DSWD-SLP, DOLE Livelihood Program, ATI Training Fund, Member Equity/CBU), liquidation deadlines with COA-compliant references, and monthly aggregation charts. The Auditor reviews each transaction and marks it Audited, Flagged, or Unaudited; audited records then enter the President's final-approval queue.

**Activities and Products.** The PIO schedules and documents association activities (trainings, assemblies, outreach, fairs, distributions) with status tracking and attendance counts. Authorized officers maintain product listings with price, unit, stock status, and farmer/supplier attribution; published products appear in the Guest View.

**Approval Workflows (two-person rule).** Two multi-stage workflows enforce that the record's creator cannot be its final approver: (a) *Minutes approval* — the Secretary drafts minutes, which carry a Pending Approval status until the President approves or returns them with remarks; (b) *Financial approval* — the Auditor certifies a transaction, which the President then approves or returns; approval identity, date, and remarks are persisted for the audit trail. Board Members additionally draft policy resolutions through a dedicated workspace for presidential sign-off.

**Offline Entry and Synchronization.** Supported entries created while offline are held in a local IndexedDB synchronization queue and visibly indicated through the offline indicator; on reconnection, queued creates, updates, and deletes are pushed to the central PostgreSQL database through dedicated pull/push API endpoints with payload validation. *(Verify the exact offline-tested behavior before finalizing this paragraph — describe only what your testing confirms.)*

**Reports and Analytics.** Role-appropriate reports include the President's executive summary (printable/exportable), Treasurer and Assistant Treasurer financial statements with CSV export, Auditor certification reports, PIO activity logs, and membership reports. Visual summaries (income/expense trends, livestock headcounts) are rendered as charts.

**Account Security.** bcrypt password hashing with NIST-aligned strength validation, TOTP multi-factor authentication for privileged accounts, automatic lockout after five failed sign-in attempts, password history tracking, encrypted local storage (AES-GCM) of cached state, and administrative passcode gating of executive actions.

---

## Notes for later chapters (do not fill yet)

- **Chapter 3 test table:** run the six test cases (TC-01…TC-06) against the working system and record *Actual Result* honestly — the codebase supports all six (role-gated routing; member CRUD; minutes/financial approval workflows with `minutesApprovalStatus` / `presidentApprovalStatus`; the `SyncQueuePanel` offline queue; report exports in print/CSV). Record only what QA (Aella Agsoy) actually executes.
- **Respondent table:** only fill after the evaluation instrument has been administered with permission.
- Per the Week 9 report, **15 automated Vitest suites** were passing at documentation freeze and the project targets **12 relational tables** (Week 9 milestone; the Week 8 draft said 11 — verify the final count against the live schema before writing Chapter 3).
- **Field trial:** a UAT dry run with Barangay Alegria officers was scheduled for October 23, 2026 (Week 9). If it happened, use its actual findings in Chapter 4; if not, describe evaluation as planned.
