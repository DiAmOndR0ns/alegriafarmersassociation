# DEVELOPMENT PROCESS & DATA DICTIONARY (APA 7th Edition Format)

**System:** Farmers Association Management System (FAMS) — Alegria Farmers Association (AFA)

---

## DEVELOPMENT PROCESS

**Table 1**  
*Developmental Software Platforms*

| Software | Description |
| :--- | :--- |
| React.js (v19.0.1) | Serves as the front-end library for building dynamic, component-based user interfaces across the Public Guest Portal, Member Portal, and Officer Management Suite. |
| TypeScript (v5.8.2) | Provides static type checking across both front-end and back-end modules, ensuring reliable data structures for membership, financial, inventory, and IGP records. |
| Vite (v6.2.3) | Acts as the modern front-end build tool and development server, enabling fast loading, rapid hot module replacement, and optimized production bundles. |
| HTML5 | Provides the semantic structural foundation of the web application, ensuring compatibility, responsiveness, and accessibility across desktop and mobile browsers. |
| CSS3 | Defines the layout rules, responsive viewports, and visual styling of the system, ensuring a clean and user-friendly interface for all users. |
| Tailwind CSS (v4.1.14) | Used to style components efficiently and maintain a consistent, mobile-first visual design system throughout the Farmers Association Management System (FAMS). |
| Node.js (v23.8.0) | Handles the server-side JavaScript/TypeScript runtime environment, enabling reliable processing of authentication, role-based access control, and data synchronization. |
| Express.js (v4.21.2) | Acts as the back-end web application framework that manages server-side routes, signed session cookies, security headers, and REST API endpoints efficiently. |
| PostgreSQL / Supabase (pg v8.23.0) | Serves as the relational database management system that securely stores all 20 system tables—including user accounts, members, annual dues, meetings, resolutions, organization funds, financial transactions, products, inventory, IGP records, and SHA-256 audit logs. |
| Vitest & Testing Library | Used for automated unit and component testing to verify authentication security, role permissions, image compression, and portal functionality. |

Table 1 presents the developmental software platforms used in building the Farmers Association Management System (FAMS) for the Alegria Farmers Association. These tools were selected to ensure the system's efficiency, data integrity, security, and offline-first reliability. The combination of React.js, TypeScript, Vite, HTML5, CSS3, and Tailwind CSS delivered a responsive, accessible, and visually consistent front-end interface across mobile, tablet, and desktop viewports. Meanwhile, Node.js and Express.js handled server-side operations, managing role-based access control, session security, and offline-to-cloud synchronization. PostgreSQL (hosted via Supabase and accessed through the pg driver) served as the primary relational database, securely storing membership, governance, financial, marketplace, and Income-Generating Project (IGP) records for structured retrieval, while Vitest and Testing Library verified application correctness through automated testing.

**Table 2**  
*Development Environment and Tools*

| Software/Hardware | Specification |
| :--- | :--- |
| Processor | 11th Gen Intel(R) Core(TM) i3-1115G4 @ 3.00GHz |
| Processor Speed | 3.00 GHz (4 Logical Processors) |
| RAM | 8.00 GB (7.65 GB Usable) |
| Operating System | Windows 11 Home Single Language |

Table 2 presents the hardware specifications and development environment used to develop the Farmers Association Management System (FAMS). Development was carried out on a computer equipped with an 11th Gen Intel(R) Core(TM) i3-1115G4 processor running at 3.00 GHz and 8.00 GB of RAM, operating on Windows 11 Home Single Language. This setup provided stable and responsive performance for coding, local server execution, automated test execution, production bundling, and database synchronization. The specifications were sufficient to support the computational requirements of the development tools, local environment testing, and verification of the system's web-based and offline-capable features.

---

## DATA DICTIONARY

**Table 3**  
*Data Dictionary for User Information (users)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| id | VARCHAR(100) | Primary key uniquely identifying the user account | Non-empty unique string | usr_pres_01 |
| username | VARCHAR(100) | Unique login username for authentication | Unique alphanumeric string | elena_pres |
| password | VARCHAR(255) | Bcrypt-hashed user password | Hashed string (bcrypt) | $2b$10$9xK... |
| name | TEXT | Full display name of the user | Any non-empty string | Elena M. Villarin |
| role | VARCHAR(50) | Assigned system role governing RBAC permissions | President, Vice_President, Secretary, Assistant_Secretary, Treasurer, Assistant_Treasurer, Auditor, PIO, Board_Member, Member | President |
| is_approved | BOOLEAN | Indicates whether the account is approved to log in | TRUE, FALSE | TRUE |
| joined_date | VARCHAR(50) | Date when the user joined the association | ISO date (YYYY-MM-DD) | 2023-06-15 |
| farm_location | TEXT | Sitio or farm location within Barangay Alegria | Sitio Proper, Sitio Lapyahan, Sitio Cambang-ug, Sitio Upper Alegria | Sitio Proper |
| primary_crops | TEXT[] | List of primary crops or livestock raised by the user | Array of crop strings | {Corn, Banana, Native Chicken} |
| contact_number | VARCHAR(50) | Mobile or telephone number of the user | Valid PH phone format | 0917-452-8810 |
| status | VARCHAR(50) | Current account/membership standing | Active, Inactive, Suspended | Active |
| avatar_url | TEXT | Profile photo URL or compressed base64 data URI | URL or image data URI | data:image/jpeg;base64,... |
| member_id_number | VARCHAR(100) | Official association member ID linking to members table | Formatted AFA ID string | AFA-2023-001 |
| rsbsa_number | VARCHAR(100) | Registry System for Basic Sectors in Agriculture number | RSBSA reference string | 07-22-51-001-000142 |
| is_rsbsa_registered | BOOLEAN | Indicates whether the farmer is RSBSA-registered | TRUE, FALSE | TRUE |
| password_history | JSONB | Array of previous password hashes preventing reuse | JSON array of strings | ["$2b$10$..."] |
| password_changed_at | TIMESTAMPTZ | Timestamp of the most recent password update | ISO 8601 timestamp | 2026-01-12T08:30:00Z |
| must_change_password | BOOLEAN | Forces password update on next login when TRUE | TRUE, FALSE | FALSE |
| failed_login_attempts | INTEGER | Consecutive failed login attempts counter | Non-negative integer | 0 |
| locked_until | TIMESTAMPTZ | Expiration timestamp for temporary account lockout | ISO 8601 timestamp or NULL | NULL |
| total_failed_logins | INTEGER | Cumulative count of failed login attempts | Non-negative integer | 2 |
| reset_requested | BOOLEAN | Flags an unauthenticated password reset request | TRUE, FALSE | FALSE |
| totp_secret | TEXT | Active Base32 TOTP secret key for 2FA/MFA | Base32 string or NULL | JBSWY3DPEHPK3PXP |
| pending_totp_secret | TEXT | Unverified TOTP secret during MFA enrollment | Base32 string or NULL | NULL |
| mfa_enabled | BOOLEAN | Indicates whether TOTP two-factor authentication is active | TRUE, FALSE | TRUE |
| totp_last_used_step | BIGINT | Last accepted 30-second TOTP time step (replay guard) | Positive integer or NULL | 58940120 |

*Note.* Unique constraint on username; partial unique index (users_unique_named_role_idx) enforces one seat per named officer role excluding Member and Board_Member.

Table 3 provides the data dictionary for the User Information (users) entity, which manages authentication, role-based access control, profile metadata, and multi-factor security across the system. Key attributes include the unique identifier (id), unique username, bcrypt-hashed password, role designation, and approval flag. Security fields such as password_history, failed_login_attempts, locked_until, reset_requested, and TOTP MFA columns enforce account protection and prevent unauthorized access, while member_id_number and avatar_url synchronize officer and member profiles across portals.

**Table 4**  
*Data Dictionary for Member Registry Information (members)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| id | VARCHAR(100) | Primary key uniquely identifying a member record | Non-empty unique string | mem_001 |
| name | TEXT | Full legal name of the association member | Any non-empty string | Roberto C. dela Cruz |
| farm_location | TEXT | Sitio where the member's farm is located | Sitio Proper, Sitio Lapyahan, Sitio Cambang-ug, Sitio Upper Alegria | Sitio Lapyahan |
| primary_crops | TEXT[] | Array of primary crops or produce farmed by the member | Array of strings | {Corn, Vegetables, Coconut} |
| contact_number | VARCHAR(50) | Member's active mobile contact number | Valid PH phone format | 0918-334-7721 |
| status | VARCHAR(50) | Current standing in the association roster | Active, Inactive, Pending | Active |
| joined_date | VARCHAR(50) | Date the member officially joined AFA | ISO date (YYYY-MM-DD) | 2024-02-10 |
| member_id_number | VARCHAR(100) | Official AFA membership ID card number | Formatted AFA ID string | AFA-2024-018 |
| rsbsa_number | VARCHAR(100) | Department of Agriculture RSBSA registration number | RSBSA string or NULL | 07-22-51-001-000219 |
| is_rsbsa_registered | BOOLEAN | Indicates RSBSA enrollment status | TRUE, FALSE | TRUE |
| avatar_url | TEXT | Compressed member profile image URI | URL or image data URI | data:image/jpeg;base64,... |
| gender | VARCHAR(20) | Member's recorded gender for demographic reporting | Male, Female, Other | Male |
| birth_date | VARCHAR(50) | Member's date of birth | ISO date (YYYY-MM-DD) | 1981-09-22 |

*Note.* Logically linked 0..1 to users via member_id_number and 1:N to membership_payments via member_id.

Table 4 presents the data dictionary for the Member Registry Information (members) entity. It stores official master-list details for every registered farmer of the Alegria Farmers Association, including farm sitio location, primary crops, RSBSA registration credentials, contact details, demographic fields, and profile imagery. This table serves as the authoritative roster for annual dues tracking, meeting attendance recording, and association census summaries.

**Table 5**  
*Data Dictionary for Membership Payments Information (membership_payments)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| id | VARCHAR(100) | Primary key uniquely identifying a dues payment record | Non-empty unique string | pay_2026_001 |
| member_id | VARCHAR(100) | Reference to the paying member in members(id) | Valid member id | mem_001 |
| member_name | TEXT | Denormalized member full name at payment time | Any non-empty string | Roberto C. dela Cruz |
| member_id_number | VARCHAR(100) | Denormalized official AFA member ID number | Formatted AFA ID string | AFA-2024-018 |
| year | INTEGER | Membership calendar year covered by the payment | 4-digit calendar year | 2026 |
| amount | NUMERIC | Annual membership dues amount paid in PHP | Non-negative decimal | 100.00 |
| date_paid | VARCHAR(50) | Date the payment was collected | ISO date (YYYY-MM-DD) | 2026-01-20 |
| method | VARCHAR(50) | Mode of payment used by the member | Cash, GCash, Bank Transfer | Cash |
| reference_no | VARCHAR(100) | Official receipt or e-wallet reference number | Alphanumeric string | OR-2026-0045 |
| status | VARCHAR(50) | Verification lifecycle state of the payment | Pending, Verified, Voided | Verified |
| recorded_by | TEXT | Officer who encoded the dues payment | Officer name | Maria L. Santos |
| recorded_at | VARCHAR(50) | Timestamp when payment was recorded | ISO 8601 timestamp | 2026-01-20T09:15:00Z |
| verified_by | TEXT | Treasurer or Auditor who verified the payment | Officer name or NULL | Jose R. Mendoza |
| verified_date | VARCHAR(50) | Date payment was verified | ISO date (YYYY-MM-DD) | 2026-01-21 |
| voided_by | TEXT | Officer who voided an erroneous payment entry | Officer name or NULL | NULL |
| voided_date | VARCHAR(50) | Date the payment was voided | ISO date or NULL | NULL |
| void_reason | TEXT | Documented reason for voiding the payment | Any string or NULL | NULL |
| notes | TEXT | Additional remarks regarding the collection | Any string or NULL | Paid during January assembly |
| transaction_id | VARCHAR(100) | Linked income entry in financial_transactions(id) | Valid transaction id or NULL | tx_2026_012 |

*Note.* Indexed on (year) and (member_id); partial unique index (membership_payments_one_live_per_year_idx) allows at most one non-voided payment per member per year.

Table 5 presents the data dictionary for the Membership Payments Information (membership_payments) entity. It tracks annual membership dues collections, receipt references, payment methods, and a three-stage verification workflow (Pending, Verified, Voided). Linking transaction_id to financial_transactions ensures that verified dues automatically reconcile with the association's financial ledger.

**Table 6**  
*Data Dictionary for Membership Year Snapshots (membership_year_snapshots)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| year | INTEGER | Primary key representing the closed membership year | 4-digit calendar year | 2025 |
| closed_by | TEXT | Officer who finalized and closed the membership year | Officer name | Elena M. Villarin |
| closed_at | VARCHAR(50) | Timestamp when the year-end snapshot was closed | ISO 8601 timestamp | 2025-12-31T17:00:00Z |
| dues_amount | NUMERIC | Standard annual dues rate applied for that year (PHP) | Non-negative decimal | 100.00 |
| total_members | INTEGER | Total active members counted in the year snapshot | Non-negative integer | 86 |
| paid_members | INTEGER | Number of members with verified dues for the year | Non-negative integer | 79 |
| unpaid_members | INTEGER | Number of members with unpaid dues at year-end | Non-negative integer | 7 |
| total_collected | NUMERIC | Total annual dues collected during the year (PHP) | Non-negative decimal | 7900.00 |
| listed_members | JSONB | Archived snapshot array of all listed member entries | JSON array of objects | [{"id":"mem_001","paid":true}] |
| unpaid_member_ids | JSONB | Archived list of member IDs who remained unpaid | JSON array of strings | ["mem_041","mem_052"] |
| remarks | TEXT | Closing notes or reconciliation commentary | Any string or NULL | Audited prior to annual assembly |

*Note.* Referenced logically by membership_payments(year) when summarizing annual dues compliance.

Table 6 presents the data dictionary for the Membership Year Snapshots (membership_year_snapshots) entity. It preserves immutable year-end dues summaries, including total active members, paid and unpaid counts, total collections, and JSONB member snapshots. Archiving each closed year prevents historical reporting figures from shifting when the active member roster changes in subsequent years.

**Table 7**  
*Data Dictionary for Delegation Requests (delegation_requests)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| id | VARCHAR(100) | Primary key uniquely identifying a delegation request | Non-empty unique string | del_2026_003 |
| requested_by | TEXT | Vice President user ID requesting temporary authority | Valid user id | usr_vp_01 |
| reason | TEXT | Justification for requesting presidential delegation | Non-empty string (<=2000 chars) | President on medical leave |
| scopes | JSONB | Array of requested presidential permission scopes | JSON array of DelegationScope | ["approve_finance","approve_meetings"] |
| requested_date | VARCHAR(50) | Date the delegation request was submitted | ISO date (YYYY-MM-DD) | 2026-03-01 |
| effective_start | VARCHAR(50) | Start date of the requested delegated authority | ISO date (YYYY-MM-DD) | 2026-03-03 |
| effective_end | VARCHAR(50) | Expiration date of the delegated authority | ISO date >= effective_start | 2026-03-10 |
| status | VARCHAR(50) | Current approval state of the delegation request | Pending, Approved, Rejected, Revoked | Approved |
| reviewed_by | TEXT | President user ID who reviewed the request | Valid user id or NULL | usr_pres_01 |
| reviewed_date | VARCHAR(50) | Date the request was approved, rejected, or revoked | ISO date or NULL | 2026-03-01 |
| remarks | TEXT | Review remarks provided by the President | Any string or NULL | Approved for March 3-10 |

*Note.* Enforces time-bounded Vice President delegation scopes evaluated server-side in push.ts.

Table 7 presents the data dictionary for the Delegation Requests (delegation_requests) entity. It supports formal continuity of governance by allowing the Vice President to request time-bounded presidential scopes—such as financial or meeting approvals—subject to explicit approval or revocation by the President.

**Table 8**  
*Data Dictionary for Meetings Information (meetings)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| id | VARCHAR(100) | Primary key uniquely identifying a meeting record | Non-empty unique string | mtg_2026_02 |
| title | TEXT | Official title of the assembly or board meeting | Any non-empty string | Q1 General Assembly |
| date | VARCHAR(50) | Scheduled or held date of the meeting | ISO date (YYYY-MM-DD) | 2026-02-14 |
| location | TEXT | Venue where the meeting was conducted | Any string | Brgy. Alegria Covered Court |
| attendance_count | INTEGER | Total number of recorded attendees | Non-negative integer | 68 |
| agenda | TEXT | Scheduled agenda items for discussion | Any text | 1. IGP Update 2. Dues Report |
| minutes | TEXT | Official documented minutes of the meeting | Any text | Meeting called to order at 9:00 AM... |
| officer_in_charge | TEXT | Presiding or recording officer | Officer name | Elena M. Villarin |
| attendance_record | JSONB | Map of member_id to attendance status | JSON object {memberId: status} | {"mem_001":"Present"} |
| minutes_approval_status | VARCHAR(50) | Approval state of the recorded minutes | Pending, Approved, Returned | Approved |
| approved_by | TEXT | President or presiding officer who approved minutes | Officer name or NULL | Elena M. Villarin |
| approved_date | VARCHAR(50) | Date the meeting minutes were approved | ISO date or NULL | 2026-02-16 |
| approval_remarks | TEXT | Comments accompanying minutes approval or return | Any string or NULL | Verified against attendance sheet |

*Note.* The attendance_record JSONB field maps individual member_id keys from members(id) to attendance statuses.

Table 8 presents the data dictionary for the Meetings Information (meetings) entity. It documents association assemblies and officer sessions, storing the agenda, formal minutes, presiding officer, member-level attendance map in JSONB format, and presidential minutes approval metadata.

**Table 9**  
*Data Dictionary for Resolutions Information (resolutions)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| id | VARCHAR(100) | Primary key uniquely identifying a board resolution | Non-empty unique string | res_2026_004 |
| resolution_number | VARCHAR(100) | Official sequential resolution code | Formatted code string | RES-2026-04 |
| title | TEXT | Title summarizing the policy or directive | Any non-empty string | Approval of Poultry Feed Budget |
| description | TEXT | Full text and rationale of the resolution | Any text | Resolved to allocate PHP 12,000... |
| date_agreed | VARCHAR(50) | Date the resolution was voted upon and agreed | ISO date (YYYY-MM-DD) | 2026-02-14 |
| moved_by | TEXT | Officer or member who formally moved the resolution | Person name | Carlos T. Bautista |
| seconded_by | TEXT | Officer or member who seconded the motion | Person name | Lorna P. Reyes |
| vote_in_favor | INTEGER | Total affirmative votes cast | Non-negative integer | 11 |
| vote_against | INTEGER | Total dissenting votes cast | Non-negative integer | 0 |
| vote_abstain | INTEGER | Total abstentions recorded | Non-negative integer | 1 |
| status | VARCHAR(50) | Lifecycle status of the resolution | Pending, Approved, Archived | Approved |

*Note.* Maintains parliamentary voting records moved and seconded by association officers and board members.

Table 9 presents the data dictionary for the Resolutions Information (resolutions) entity. It captures formal association decisions by recording the resolution number, full directive text, mover and seconder, itemized vote tallies (in favor, against, abstain), and current approval status.

**Table 10**  
*Data Dictionary for System Audit Logs (system_logs)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| id | VARCHAR(100) | Primary key uniquely identifying an audit log entry | Non-empty unique string | log_176890122 |
| timestamp | VARCHAR(100) | Exact timestamp when the logged event occurred | ISO 8601 timestamp | 2026-02-14T10:42:18Z |
| user_name | TEXT | Display name of the acting user or system process | Any non-empty string | Elena M. Villarin |
| role | VARCHAR(50) | Role of the user at the time of the action | Valid system role | President |
| action | TEXT | Short standardized label describing the operation | Any string | APPROVE_TRANSACTION |
| details | TEXT | Human-readable details of the affected record | Any text | Signed off tx_2026_012 (PHP 4,500) |
| sync_status | VARCHAR(50) | Cloud synchronization status of the audit record | synced, pending | synced |
| hash | TEXT | SHA-256 cryptographic hash of the entry payload | 64-char hex digest | a3f9c2e1...84b0 |
| previous_hash | TEXT | SHA-256 hash of the preceding log entry | 64-char hex digest or GENESIS | 71d4e8a9...09c2 |

*Note.* Implements a tamper-evident hash chain linking each entry's previous_hash to the prior record's hash.

Table 10 presents the data dictionary for the System Audit Logs (system_logs) entity. Every sensitive action across the system—such as financial approvals, member edits, and role changes—is recorded with the acting user, role, timestamp, action details, and SHA-256 hash-chain links (hash and previous_hash) to ensure accountability and tamper detection.

**Table 11**  
*Data Dictionary for Organization Funds (organization_funds)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| id | VARCHAR(100) | Primary key uniquely identifying a fund ledger | Non-empty unique string | fund_gen_01 |
| name | TEXT | Official name of the organizational fund | Any non-empty string | AFA General Operating Fund |
| code | VARCHAR(50) | Short alphanumeric code derived from the fund name | Short code string | AGOF |
| category | TEXT | Classification of the fund account | General, Grant, IGP, Emergency | General |
| source_origin | TEXT | Origin or donor agency of the fund | Association Dues, DA Grant, LGU | Association Dues |
| initial_fund | NUMERIC | Opening balance allocated when the fund was created | Non-negative decimal | 25000.00 |
| current_balance | NUMERIC | Current available fund balance in PHP | Decimal number | 38450.00 |
| description | TEXT | Detailed purpose and spending guidelines of the fund | Any text | Covers meetings and general supplies |
| custodian | TEXT | Treasurer or officer designated as fund custodian | Officer name | Jose R. Mendoza |
| last_updated | VARCHAR(50) | Date or timestamp of the last balance update | ISO date/timestamp | 2026-02-20 |

*Note.* Referenced logically via fund_source in financial_transactions, afa_igp_expenses, and afa_igp_sales.

Table 11 presents the data dictionary for the Organization Funds (organization_funds) entity. It defines the distinct cash funds managed by the Treasurer—such as general operating funds, government grants, and IGP capital—tracking each fund's source origin, initial allocation, live balance, and assigned custodian.

**Table 12**  
*Data Dictionary for Financial Transactions (financial_transactions)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| id | VARCHAR(100) | Primary key uniquely identifying a financial entry | Non-empty unique string | tx_2026_012 |
| type | VARCHAR(50) | Direction of cash flow for the transaction | Income, Expense | Expense |
| category | VARCHAR(100) | Accounting category of the transaction | Membership Dues, Feeds, Equipment, Event | Event |
| amount | NUMERIC | Monetary amount of the transaction in PHP | Positive decimal | 4500.00 |
| date | VARCHAR(50) | Date the transaction occurred | ISO date (YYYY-MM-DD) | 2026-02-14 |
| description | TEXT | Line-item description of the receipt or disbursement | Any text | Snacks and venue chairs for Q1 Assembly |
| recorded_by | TEXT | Treasurer or Assistant Treasurer who recorded entry | Officer name | Jose R. Mendoza |
| activity_id | VARCHAR(100) | Enforced FK referencing activities(id) | Valid activity id or NULL | act_2026_001 |
| meeting_id | VARCHAR(100) | Enforced FK referencing meetings(id) for meeting-linked acquisitions | Valid meeting id or NULL | mtg_2026_02 |
| fund_source | TEXT | Name or ID of the funding account in organization_funds | Valid fund reference | AFA General Operating Fund |
| purpose | TEXT | Stated operational purpose of the disbursement | Any text | General assembly logistics |
| liquidation_deadline | VARCHAR(50) | Target due date for cash-advance liquidation | ISO date or NULL | 2026-02-28 |
| audited_status | VARCHAR(50) | Auditor verification state of the transaction | Unaudited, Audited, Flagged | Audited |
| audited_by | TEXT | Auditor who reviewed the supporting receipts | Officer name or NULL | Ramon V. Cruz |
| audited_date | VARCHAR(50) | Date the audit review was completed | ISO date or NULL | 2026-02-18 |
| audit_notes | TEXT | Findings or notes added by the Auditor | Any text or NULL | Official receipts verified complete |
| president_approval_status | VARCHAR(50) | Presidential sign-off state after audit review | Pending, Approved, Returned | Approved |
| president_approved_by | TEXT | President (or delegated VP) who signed off | Officer name or NULL | Elena M. Villarin |
| president_approved_date | VARCHAR(50) | Date of presidential sign-off | ISO date or NULL | 2026-02-19 |
| president_approval_remarks | TEXT | Remarks entered during presidential sign-off | Any text or NULL | Approved for posting |

*Note.* Enforced PostgreSQL foreign keys on activity_id referencing activities(id) and meeting_id referencing meetings(id), both ON DELETE SET NULL.

Table 12 presents the data dictionary for the Financial Transactions (financial_transactions) entity. It captures all association income and expense records, enforcing a multi-tier internal control chain from Treasurer encoding to Auditor review (audited_status, audited_by) and final Presidential sign-off (president_approval_status, president_approved_by), while linking event and assembly disbursements directly to activities(id) or meetings(id).

**Table 13**  
*Data Dictionary for Activities and Events (activities)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| id | VARCHAR(100) | Primary key uniquely identifying an association activity | Non-empty unique string | act_2026_001 |
| title | TEXT | English title of the scheduled event or activity | Any non-empty string | Organic Composting Workshop |
| ceb_title | TEXT | Cebuano-localized title displayed in CEB language mode | Any string or NULL | Pagbansay sa Organikong Abono |
| category | VARCHAR(100) | Category of the event or community program | Training, Assembly, Harvest, Outreach | Training |
| scheduled_date | VARCHAR(50) | Primary scheduled date of the activity | ISO date (YYYY-MM-DD) | 2026-03-15 |
| date_scheduled | VARCHAR(50) | Legacy compatibility alias for scheduled_date | ISO date or NULL | 2026-03-15 |
| scheduled_time | VARCHAR(100) | Scheduled start and end time of the activity | Time range string | 08:00 AM - 12:00 PM |
| time_scheduled | VARCHAR(100) | Legacy compatibility alias for scheduled_time | Time string or NULL | 08:00 AM |
| location | TEXT | Sitio or venue where the activity takes place | Any text | Sitio Proper Demo Farm |
| description | TEXT | Full overview and instructions for attendees | Any text | Hands-on vermicomposting training... |
| organizer | TEXT | Officer or partner organization hosting the event | Person or agency name | DA-Tuburan & AFA PIO |
| status | VARCHAR(50) | Current lifecycle status of the activity | Upcoming, Ongoing, Completed, Cancelled | Upcoming |
| status_reason | TEXT | Explanation if activity was postponed or cancelled | Any text or NULL | NULL |
| documented_notes | TEXT | Post-event summary and documentation notes | Any text or NULL | 42 farmers completed practical demo |
| attendees_count | INTEGER | Actual or expected headcount of attendees | Non-negative integer | 42 |
| target_audience | TEXT | Intended participants for the event | All Members, Public, Officers | All Members & Public |
| image_url | TEXT | Banner or documentation photograph URI | URL or image data URI | /assets/workshop-demo.jpg |

*Note.* Referenced by financial_transactions(activity_id) via enforced PostgreSQL foreign key.

Table 13 presents the data dictionary for the Activities and Events (activities) entity. It powers both the bilingual (English/Cebuano) public calendar with tear-off date leaves and .ics calendar export, as well as internal post-activity documentation and activity-linked financial budgeting.

**Table 14**  
*Data Dictionary for Announcements (announcements)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| id | VARCHAR(100) | Primary key uniquely identifying an announcement | Non-empty unique string | ann_2026_008 |
| title | TEXT | Headline of the official announcement | Any non-empty string | RSBSA Free Seed Distribution |
| category | VARCHAR(100) | Topic classification of the bulletin | General, Advisory, Assistance, Meeting | Assistance |
| content | TEXT | Full body message of the announcement | Any non-empty text | Bring your RSBSA stub on Friday... |
| date_posted | VARCHAR(50) | Publication date of the announcement | ISO date (YYYY-MM-DD) | 2026-03-05 |
| priority | VARCHAR(50) | Urgency level controlling UI highlight styling | Low, Normal, High, Urgent | High |
| posted_by | TEXT | Officer who published the announcement | Officer name | Marites B. Navarro (PIO) |

*Note.* Published by authorized officers (President, Secretary, PIO) to the Guest and Member Portals.

Table 14 presents the data dictionary for the Announcements (announcements) entity. It enables officers to broadcast official advisories, government assistance schedules, and assembly notices with priority indicators to both association members and the general public.

**Table 15**  
*Data Dictionary for Association Achievements (achievements)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| id | VARCHAR(100) | Primary key uniquely identifying a milestone record | Non-empty unique string | ach_2024_01 |
| year | VARCHAR(20) | Year the recognition or milestone was achieved | 4-digit year string | 2024 |
| title | TEXT | English headline of the association milestone | Any non-empty string | DOLE Registration No. 2315 |
| ceb_title | TEXT | Cebuano-localized milestone headline | Any string or NULL | Opisyal nga Rehistro sa DOLE 2315 |
| description | TEXT | Narrative description of the achievement | Any non-empty text | Officially accredited rural workers association... |
| icon | VARCHAR(50) | Lucide icon identifier rendered on the public timeline | Trophy, Award, Sprout, Users, Shield | Trophy |

*Note.* Displayed on the public Guest Portal heritage and milestones showcase.

Table 15 presents the data dictionary for the Association Achievements (achievements) entity. It stores bilingual historical milestones, accreditations, and awards of the Alegria Farmers Association for transparent public presentation on the Guest Portal.

**Table 16**  
*Data Dictionary for Farmers' Market Products (products)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| id | VARCHAR(100) | Primary key uniquely identifying a catalog product | Non-empty unique string | prod_eggs_01 |
| name | TEXT | English display name of the product or rental | Any non-empty string | Organic Native Chicken Eggs |
| ceb_name | TEXT | Cebuano display name for bilingual shoppers | Any string or NULL | Organikong Itlog sa Bisayang Manok |
| category | VARCHAR(100) | Marketplace category for filtering | Poultry & Eggs, Crops, Processed, Rentals | Poultry & Eggs |
| description | TEXT | Detailed product description and harvest info | Any text | Fresh free-range eggs harvested daily |
| unit | VARCHAR(50) | Unit of measurement or rental duration | tray, kg, pack, piece/day | tray (30 pcs) |
| price | NUMERIC | Unit selling or rental price in PHP | Non-negative decimal | 240.00 |
| quantity_available | VARCHAR(100) | Available stock display label (synced for IGP eggs) | Numeric or descriptive string | 14 trays |
| stock_status | VARCHAR(50) | Availability badge displayed on storefront cards | In Stock, Limited, Out of Stock, Upcoming Harvest | In Stock |
| farmer_name | TEXT | Producer or association contact person | Person or group name | AFA Poultry IGP |
| farmer_sitio | TEXT | Origin sitio of the produce | Valid Barangay Alegria Sitio | Sitio Proper |
| farmer_phone | VARCHAR(50) | Direct contact phone number for tel:/sms: orders | Valid PH phone format | 0917-452-8810 |
| contact_person | TEXT | Alternate coordinator name for buyer inquiries | Person name or NULL | Elena M. Villarin |
| image_url | TEXT | Required compressed product photograph URI | Non-empty URL or data URI | data:image/jpeg;base64,... |
| is_published | BOOLEAN | Controls whether the listing appears publicly | TRUE, FALSE | TRUE |
| updated_by | TEXT | Officer who last updated the listing | Officer name | Marites B. Navarro |
| managed_by | TEXT | Role or unit managing the product listing | Role or committee name | PIO / IGP Committee |
| date_updated | VARCHAR(50) | Last modified date of the product listing | ISO date (YYYY-MM-DD) | 2026-03-10 |

*Note.* Referenced by inventory(catalog_product_id) via enforced PostgreSQL FK; image_url is mandatory during catalog creation.

Table 16 presents the data dictionary for the Farmers' Market Products (products) entity. It powers the public digital storefront—allowing community buyers to browse bilingual product listings with mandatory compressed product photos, check real-time availability (including verified IGP egg harvests), and contact farmers directly via Call or SMS.

**Table 17**  
*Data Dictionary for Custodial Assets and Inventory (inventory)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| id | VARCHAR(100) | Primary key uniquely identifying an inventory item | Non-empty unique string | inv_chairs_01 |
| name | TEXT | Name of the association tool, asset, or rental item | Any non-empty string | Monoblock Chairs (White) |
| asset_type | VARCHAR(20) | Custodial classification separating rental assets from usable supplies/equipment | rental, usable | rental |
| category | VARCHAR(100) | Asset classification category | Rental Assets, Office Supplies, Equipment, Farm Tools | Rental Assets |
| quantity | INTEGER | Total acquired stock quantity recorded by the Treasurer | Non-negative integer | 120 |
| damaged_quantity | INTEGER | Count of damaged or non-serviceable units flagged by the Auditor | Non-negative integer (<= quantity) | 4 |
| lost_quantity | INTEGER | Count of lost or missing units flagged by the Auditor | Non-negative integer (<= quantity) | 1 |
| used_quantity | INTEGER | Count of consumed or used units for usable supplies/consumables | Non-negative integer (<= quantity) | 0 |
| unit | VARCHAR(50) | Counting unit for the inventory item | pcs, sets, reams, sacks, units | pcs |
| item_condition | VARCHAR(50) | Overall physical condition rating of the asset | Good, Fair, Needs Repair, Condemned | Good |
| location | TEXT | Storage facility or custodian location | Any text | AFA Storage Room, Sitio Proper |
| notes | TEXT | Maintenance, inspection, or custody remarks | Any text or NULL | 4 cracked legs set aside |
| catalog_product_id | VARCHAR(100) | Enforced FK linking rental asset to products(id) | Valid product id or NULL | prod_chairs_01 |
| purchase_transaction_id | VARCHAR(100) | Enforced FK linking asset acquisition to financial_transactions(id) | Valid transaction id or NULL | tx_2026_012 |
| activity_id | VARCHAR(100) | Enforced FK linking acquisition to a scheduled event in activities(id) | Valid activity id or NULL | act_2026_001 |
| meeting_id | VARCHAR(100) | Enforced FK linking acquisition to an assembly in meetings(id) | Valid meeting id or NULL | mtg_2026_02 |
| recorded_by | TEXT | Treasurer or officer who logged the asset acquisition | Officer name | Jose R. Mendoza |
| date_recorded | VARCHAR(50) | Initial acquisition or encoding date | ISO date (YYYY-MM-DD) | 2025-05-10 |
| last_updated | VARCHAR(50) | Date of the most recent restock or Auditor inspection | ISO date (YYYY-MM-DD) | 2026-03-01 |

*Note.* Enforced PostgreSQL foreign keys on catalog_product_id -> products(id), purchase_transaction_id -> financial_transactions(id), activity_id -> activities(id), and meeting_id -> meetings(id), all ON DELETE SET NULL.

Table 17 presents the data dictionary for the Custodial Assets and Inventory (inventory) entity. Asset records are created exclusively from Treasurer purchase disbursements (purchase_transaction_id) and separated by asset_type into rental assets versus usable equipment/supplies, with Auditor-only inspection counts (damaged_quantity, lost_quantity, used_quantity) and optional relational links to Farmers' Market rentals (catalog_product_id), events (activity_id), and meetings (meeting_id).

**Table 18**  
*Data Dictionary for IGP Root Registry (afa_igp)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| id | VARCHAR(100) | Primary key identifying the singleton IGP configuration record | Non-empty unique string | main_state |
| produces | TEXT[] | Master array of active IGP produce lines | Array of produce names | {Swine Raising (Baboyan), RTL Chickens} |
| closed_years | INT[] | Array of finalized IGP accounting years | Array of 4-digit integers | {2024, 2025} |

*Note.* Serves as the parent registry enumerating active produce lines tracked in normalized IGP child tables.

Table 18 presents the data dictionary for the IGP Root Registry (afa_igp) entity. Reformatted to remove redundant JSONB fields, it stores the association's master list of active Income-Generating Project (IGP) produce lines and closed IGP accounting years, coordinating the normalized livestock, harvest, expense, and sales tables.

**Table 19**  
*Data Dictionary for IGP Livestock Inventory (afa_igp_livestocks)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| produce | TEXT | Composite primary key (1 of 2) naming the specific IGP livestock line | Non-empty produce string | Swine Raising (Baboyan) |
| stage | TEXT | Composite primary key (2 of 2) identifying the livestock growth or production stage | Fattening, Gestation, Lactating, Dispersal, RTL, General | Fattening |
| head_count | INTEGER | Current reconciled live headcount for the produce and stage | Non-negative integer (DEFAULT 0) | 12 |

*Note.* Composite PRIMARY KEY (produce, stage). Automatically reconciled from stock-purchase afa_igp_expenses minus non-egg afa_igp_sales; referenced logically by afa_igp_expenses, afa_igp_sales, and afa_igp_harvests.

Table 19 presents the data dictionary for the IGP Livestock Inventory (afa_igp_livestocks) entity. Normalized with a composite primary key (produce, stage) and no JSONB or opening-count columns, it stores live headcounts per project and growth stage across all association livestock enterprises.

**Table 20**  
*Data Dictionary for IGP Expenses (afa_igp_expenses)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| id | VARCHAR(100) | Primary key uniquely identifying an IGP expense | Non-empty unique string | igp_exp_041 |
| produce | TEXT | IGP produce line incurring the expense (indexed) | Valid produce name | Swine Raising (Baboyan) |
| date | VARCHAR(50) | Date the expense was incurred | ISO date (YYYY-MM-DD) | 2026-03-08 |
| expense_data | JSONB | Extended structured receipt metadata | JSON object or NULL | {"supplier":"Tuburan Agri"} |
| category | TEXT | Operational cost or stock purchase category | Feeds, Piglets / Stock, RTL Pullets Stock, Animal Stock, Medicine | Feeds |
| quantity | NUMERIC | Quantity of input items or livestock heads purchased | Non-negative decimal | 5 |
| description | TEXT | Itemized description of the purchased inputs or stock | Any text | 5 sacks grower feeds |
| amount | NUMERIC | Total expenditure amount in PHP | Non-negative decimal | 8250.00 |
| recorded_by | TEXT | Officer who recorded the IGP expenditure | Officer name | Jose R. Mendoza |
| fund_source | TEXT | Funding source in organization_funds | Valid fund name/id | IGP Revolving Fund |
| stage | TEXT | Livestock growth stage tied to the cost | Fattening, Gestation, Lactating, Dispersal, RTL, General | Fattening |

*Note.* Indexed on produce (afa_igp_expenses_produce_idx); stock-purchase expenses reconcile afa_igp_livestocks(head_count) and link logically to organization_funds via fund_source.

Table 20 presents the data dictionary for the IGP Expenses (afa_igp_expenses) entity. It itemizes livelihood operating costs and livestock stock purchases—categorized by produce line, growth stage, and organizational funding source—to support project profitability analysis and automatic livestock inventory reconciliation.

**Table 21**  
*Data Dictionary for IGP Sales (afa_igp_sales)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| id | VARCHAR(100) | Primary key uniquely identifying an IGP sale record | Non-empty unique string | igp_sal_019 |
| produce | TEXT | IGP produce line generating the sale revenue | Valid produce name | RTL Chickens |
| date | VARCHAR(50) | Date the sale transaction occurred | ISO date (YYYY-MM-DD) | 2026-03-09 |
| stage | TEXT | Produce stage or product grade sold | Fattening, Dispersal, RTL, Eggs, General | Eggs |
| quantity | NUMERIC | Number of units, eggs, or heads sold | Non-negative decimal | 120 |
| revenue | NUMERIC | Gross sales proceeds received in PHP | Non-negative decimal | 2880.00 |
| recorded_by | TEXT | Officer who encoded the IGP sale | Officer name | Jose R. Mendoza |
| fund_source | TEXT | Destination fund account in organization_funds | Valid fund name/id | IGP Revolving Fund |
| notes | TEXT | Buyer details or sale remarks | Any text or NULL | Sold to Barangay Alegria market |

*Note.* Logically linked to afa_igp_livestocks(produce, stage) and organization_funds via fund_source.

Table 21 presents the data dictionary for the IGP Sales (afa_igp_sales) entity. It records quantities sold and gross revenue generated from association livelihood projects, deducting non-egg livestock sales from afa_igp_livestocks and egg sales from verified harvest stock.

**Table 22**  
*Data Dictionary for IGP Livestock & Egg Harvests (afa_igp_harvests)*

| Field Name | Data Type | Description | Allowed Values | Example Values |
| :--- | :--- | :--- | :--- | :--- |
| id | VARCHAR(100) | Primary key uniquely identifying a harvest log | Non-empty unique string | har_2026_055 |
| produce | TEXT | IGP produce line for the harvest | Valid produce name | RTL Chickens |
| date | VARCHAR(50) | Date the harvest was collected | ISO date (YYYY-MM-DD) | 2026-03-10 |
| time | VARCHAR(50) | Collection time of day | Time string (HH:MM AM/PM) | 06:30 AM |
| collected_by | TEXT | Member or officer who collected the harvest | Person name | Pedro A. Gomez |
| egg_count | INTEGER | Total count of harvested units/eggs (<=100,000) | Integer (0 to 100,000) | 420 |
| notes | TEXT | Observations on harvest quality or flock health | Any text or NULL | Clean shells, zero breakage |
| status | VARCHAR(50) | Three-stage harvest verification status | Pending Audit, Audited, Signed, Returned | Signed |
| audited_by | TEXT | Auditor who physically verified the harvest count | Officer name or NULL | Ramon V. Cruz |
| audited_date | VARCHAR(50) | Date the harvest count was audited | ISO date or NULL | 2026-03-10 |
| audit_remarks | TEXT | Verification comments from the Auditor | Any text or NULL | Count matched 14 full trays |
| signed_by | TEXT | President who signed off verified harvest stock | Officer name or NULL | Elena M. Villarin |
| signed_date | VARCHAR(50) | Date of presidential harvest sign-off | ISO date or NULL | 2026-03-10 |
| signature_remarks | TEXT | Remarks recorded during final sign-off | Any text or NULL | Released to market catalog |

*Note.* Signed harvests automatically update verified egg availability displayed in products(quantity_available).

Table 22 presents the data dictionary for the IGP Livestock & Egg Harvests (afa_igp_harvests) entity. It records livestock and poultry harvests through a strict three-stage verification pipeline—Collection, Auditor Verification, and Presidential Sign-Off—ensuring that only verified harvest stock is reflected on the public Farmers' Market catalog.
