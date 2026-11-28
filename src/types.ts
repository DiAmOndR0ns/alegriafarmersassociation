export type OfficerRole = 'President' | 'Vice_President' | 'Secretary' | 'Assistant_Secretary' | 'Board_Member' | 'Treasurer' | 'Assistant_Treasurer' | 'Auditor' | 'PIO';

// The 5 Official Sitios of Barangay Alegria, Tuburan, Cebu (based on the official Barangay Profile of Tuburan)
export const OFFICIAL_ALEGRIA_SITIOS = [
  'Sitio Tapon',
  'Sitio Pundok 1',
  'Sitio Pundok 2',
  'Sitio Lamak',
  'Sitio Patag 1'
] as const;

export type AlegriaSitio = typeof OFFICIAL_ALEGRIA_SITIOS[number];

export interface MemberAffiliation {
  id: string; // Unique identifier for key
  name: string; // e.g. "Senior Citizen ID", "PWD ID", "4Ps / DSWD", "FCCT Cooperative", "PCA Coconut Farmers (CFIDP)", "Tuburan Coffee Growers"
  idNumber?: string; // e.g. "SC-2024-8819", "PWD-7712", "4PS-072251-01"
  type?: 'Senior Citizen' | 'PWD' | '4Ps / DSWD' | 'Cooperative' | 'Farmers Association' | 'Government Agency' | 'Other' | string;
}

/**
 * Outcome of a credential reset. `message` carries the server's own reason so
 * the officer sees why it failed instead of a generic guess.
 */
export interface PasswordResetResult {
  success: boolean;
  message?: string;
}

export interface User {
  /** Id of the linked member profile; allows a President sync to carry role changes. */
  memberId?: string;
  id: string;
  username: string;
  password?: string; // Legacy in-memory credentials only; never persisted in plaintext
  passwordHash?: string; // bcrypt hash or legacy hash pending login migration
  passwordHistory?: { hash: string; changedAt: string }[];
  passwordChangedAt?: string;
  mustChangePassword?: boolean;
  name: string;
  role: OfficerRole | 'Member';
  isApproved: boolean;
  avatarUrl?: string; // base64 string for uploaded profile picture
  memberIdNumber?: string;
  rsbsaNumber?: string;
  isRsbsaRegistered?: boolean;
  farmLocation?: string; // for Member role (e.g. Sitio Tapon, Sitio Pundok 1, Sitio Pundok 2, Sitio Lamak)
  primaryCrops?: string[]; // for Member role
  contactNumber?: string;
  joinedDate?: string;
  status?: 'Active' | 'Inactive'; // for Member status
  membershipPaidThrough?: number; // latest calendar membership year with settled dues
  inactiveReason?: string; // why the account was deactivated ("Unpaid dues", "Resigned", ...)
  resetRequested?: boolean; // True if they applied to reset their password
  failedLoginAttempts?: number; // Consecutive failed sign-in attempts; resets to 0 on success
  lockedUntil?: string; // ISO timestamp until which sign-in is blocked after too many failures
  affiliations?: MemberAffiliation[]; // Other IDs or organizations aside from RSBSA
  totpSecret?: string; // RFC 6238 Base32 TOTP secret for multi-factor authentication
  mfaEnabled?: boolean; // Whether 2FA is required and verified for this account
  adminPasscode?: string; // Administrative security gate passcode for executive actions
}

export interface Member {
  id: string;
  name: string;
  memberIdNumber?: string; // e.g. AFA-2026-001
  rsbsaNumber?: string; // Registry System for Basic Sectors in Agriculture (e.g. 07-22-51-001-000123)
  isRsbsaRegistered?: boolean;
  farmLocation: string; // e.g. Sitio Tapon, Sitio Pundok 1, Sitio Pundok 2, Sitio Lamak
  primaryCrops: string[]; // e.g. Corn, Coconut, Banana, Cacao, Vegetables
  contactNumber: string;
  status: 'Active' | 'Inactive';
  joinedDate: string;
  avatarUrl?: string;
  gender?: 'Male' | 'Female' | 'Other' | string;
  birthDate?: string;
  affiliations?: MemberAffiliation[]; // Other IDs or organizations aside from RSBSA (e.g., Senior Citizen, PWD, 4Ps, Cooperative)
  /** Membership year through which dues are settled (e.g. 2026). Derived from verified payments. */
  membershipPaidThrough?: number;
  /** Reason recorded when an officer closes a membership year without this member paying. */
  inactiveReason?: string;
  /** Whether the member self-registered and is awaiting Secretary approval before Treasurer fee settlement. */
  registrationStatus?: 'Pending Secretary Approval' | 'Approved';
}

export interface PendingMember {
  id: string;
  name: string;
  username?: string;
  rsbsaNumber?: string;
  isRsbsaRegistered?: boolean;
  farmLocation: string;
  primaryCrops: string[];
  contactNumber: string;
  joinedDate: string;
  avatarUrl?: string;
  gender?: 'Male' | 'Female' | 'Other' | string;
  birthDate?: string;
  affiliations?: MemberAffiliation[];
  /** Stage 1 = 'Pending Secretary Approval'; Stage 2 = 'Awaiting Treasurer Fee'. */
  registrationStatus: 'Pending Secretary Approval' | 'Awaiting Treasurer Fee';
  approvedBySecretary?: string;
  approvedBySecretaryDate?: string;
}

export interface DeletedRecordArchive {
  id: string;
  entityType: 'Member' | 'Meeting' | 'Resolution' | 'Transaction' | 'Announcement' | 'Activity' | 'Inventory' | 'Product' | 'IGP Expense' | 'IGP Sale' | 'Officer' | 'Fund' | string;
  entityId: string;
  title: string;
  details: string;
  deletedBy: string;
  deletedAt: string;
  snapshot?: Record<string, unknown>;
}

// ANNUAL MEMBERSHIP DUES
// The book closes every 31 December. A member is only "Active" for a year when
// a verified payment exists for it, so status is derived from these records
// instead of being hand-toggled by an officer.
export type MembershipPaymentStatus = 'Pending' | 'Verified' | 'Voided';
export type MembershipPaymentMethod = 'Cash' | 'GCash' | 'Bank Transfer' | 'In-Kind' | 'Other' | string;

export interface MembershipPayment {
  id: string;
  memberId: string;
  memberName: string; // snapshot, so the dues ledger survives a member rename
  memberIdNumber?: string; // snapshot of the AFA ID at the time of payment
  /** Calendar membership year this payment settles (e.g. 2026). */
  year: number;
  amount: number;
  datePaid: string; // YYYY-MM-DD
  method: MembershipPaymentMethod;
  referenceNo?: string; // OR number / GCash reference
  status: MembershipPaymentStatus;
  recordedBy: string; // Treasurer / Assistant Treasurer
  recordedAt: string; // ISO timestamp
  verifiedBy?: string; // Auditor
  verifiedDate?: string;
  voidedBy?: string;
  voidedDate?: string;
  voidReason?: string;
  notes?: string;
  /** Links this payment to the income entry it produced in the association ledger. */
  transactionId?: string;
}

/** Immutable roster kept when an officer closes a membership year. */
export interface MembershipYearSnapshot {
  year: number;
  closedBy: string;
  closedAt: string; // ISO timestamp
  duesAmount: number;
  totalMembers: number;
  paidMembers: number;
  unpaidMembers: number;
  totalCollected: number;
  listedMembers: Array<{
    memberId: string;
    name: string;
    memberIdNumber?: string;
    farmLocation: string;
    amountPaid: number;
    datePaid?: string;
  }>;
  unpaidMemberIds: string[];
  remarks?: string;
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  location: string;
  attendanceCount: number;
  agenda: string;
  minutes: string;
  officerInCharge: string;
  attendanceRecord?: Record<string, 'Present' | 'Absent' | 'Excused'>;
  // Secretary Minutes of Meeting approval workflow (Secretary drafts → President approves)
  minutesApprovalStatus?: 'Pending Approval' | 'Approved' | 'Returned';
  approvedBy?: string;
  approvedDate?: string;
  approvalRemarks?: string;
}

export interface Resolution {
  id: string;
  resolutionNumber: string; // e.g. Res. No. 2026-01
  title: string;
  description: string;
  dateAgreed: string;
  movedBy: string;
  secondedBy: string;
  voteInFavor: number;
  voteAgainst: number;
  voteAbstain: number;
  status: 'Pending Approval' | 'Approved' | 'Archived';
}

export type InventoryAssetType = 'rental' | 'usable';

export interface AssetPurchaseLink {
  mode: 'new' | 'existing';
  existingInventoryId?: string;
  assetType: InventoryAssetType;
  itemName: string;
  category: InventoryItem['category'];
  quantity: number;
  unit: string;
  location?: string;
}

export interface FinancialTransaction {
  id: string;
  type: 'income' | 'expense';
  category: string; // e.g. Membership Dues, Donation, Livelihood Capital, Fertilizer, Seeds, Snacks, Equipment
  amount: number;
  date: string;
  description: string;
  activityId?: string;
  meetingId?: string; // Optional link to an upcoming or scheduled association meeting
  purpose?: string; // Purpose of the funds or cash advance; required for expense/disbursement logs
  assetPurchase?: AssetPurchaseLink; // Transient link used when Treasurer records an asset purchase into inventory
  liquidationDeadline?: string; // Deadline when an officer must liquidate funds with receipts
  recordedBy: string; // Treasurer
  fundSource?: string; // Where the budget was taken from, e.g. "GF-SLP (General Fund / DSWD-SLP)", "DOLE-IGP (DOLE Livelihood Program)", "ATI-TRG (ATI Training Fund)", "DISP-5% (Dispersal Risk Pool)", "CBU (Member Equity)"
  auditedStatus: 'Unaudited' | 'Audited' | 'Flagged';
  auditedBy?: string; // Auditor
  auditedDate?: string;
  auditNotes?: string;
  // Auditor → President approval workflow for financial reports/records
  presidentApprovalStatus?: 'Pending Approval' | 'Approved' | 'Returned';
  presidentApprovedBy?: string;
  presidentApprovedDate?: string;
  presidentApprovalRemarks?: string;
}

export interface AssociationActivity {
  id: string;
  title: string;
  cebTitle?: string;
  category: 'Training / Workshop' | 'Community Outreach' | 'Harvest Fair' | 'Assembly & Fiesta' | 'Livelihood Project' | 'Assembly' | 'Training' | 'Community Work' | 'LGU Event' | 'Distribution' | 'Other' | string;
  scheduledDate: string;
  dateScheduled?: string;
  scheduledTime: string;
  timeScheduled?: string;
  location: string;
  description: string;
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled' | 'Postponed';
  statusReason?: string;
  documentedNotes?: string;
  organizer: string; // e.g. PIO (Ida S. Manera)
  targetAudience?: string; // e.g. "All AFA Members"
  attendeesCount?: number;
  imageUrl?: string;
}

export interface AssociationAchievement {
  id: string;
  year: string;
  title: string;
  cebTitle?: string;
  description: string;
  icon: 'Trophy' | 'Award' | 'ShieldCheck' | 'BookOpen' | 'Milestone';
}

export interface Product {
  id: string;
  name: string;
  cebName?: string;
  category: 'Produce' | 'Livestock' | 'Processed Goods' | 'Seeds & Fertilizer' | 'Coffee & Crops' | 'Crops' | 'Processed' | 'Services' | string;
  price: number;
  unit: string; // e.g. "per kilo", "per 250g bag", "per head", "per sack"
  quantityAvailable?: string; // e.g. "150 kilos available", "50 bags in harvest stock", "12 heads"
  description: string;
  specs?: string;
  eggSizeBreakdown?: EggSizeBreakdown;
  stockStatus: 'In Stock' | 'Low Stock' | 'Pre-Order' | 'Out of Stock' | 'Available' | 'Limited Stock';
  farmerName?: string; // e.g. "Zenaida A. Elbiña"
  farmerSitio?: string; // e.g. "Sitio Tapon"
  farmerPhone?: string; // e.g. "0945-876-1234"
  contactPerson?: string; // e.g. "Zenaida A. Elbiña (0945-876-1234)"
  imageUrl?: string;
  isPublished: boolean;
  updatedBy: string; // President, Treasurer, or Auditor
  managedBy?: string; // e.g. "Treasurer (Gracelyn P Asendiente)"
  dateUpdated: string;
}

export type PublicProduct = Pick<Product,
  'id' | 'name' | 'cebName' | 'category' | 'price' | 'unit' |
  'quantityAvailable' | 'description' | 'specs' | 'eggSizeBreakdown' | 'stockStatus' |
  'farmerName' | 'farmerSitio' | 'farmerPhone' | 'contactPerson' |
  'imageUrl' | 'isPublished'
>;

export interface Announcement {
  id: string;
  title: string;
  category: 'General' | 'Meeting' | 'Assistance' | 'Weather' | 'Price Advisory';
  content: string;
  datePosted: string;
  priority: 'Low' | 'Medium' | 'High';
  postedBy: string; // PIO
}

export interface SyncQueueItem {
  id: string;
  timestamp: string;
  action: 'create' | 'update' | 'delete';
  entityType: 'user' | 'officer' | 'member' | 'meeting' | 'resolution' | 'transaction' | 'announcement' | 'livestock_expense' | 'livestock_sale' | 'livestock_harvest' | 'egg_harvest' | 'product' | 'activity' | 'membership_payment' | string;
  payload: any;
}


export interface SystemLog {
  id: string;
  timestamp: string;
  user: string;
  role: OfficerRole;
  action: string;
  details: string;
  syncStatus: 'synced' | 'pending';
  hash: string;
  previousHash: string;
}

// Income-generating project (IGP) records.
export type IgpStage = string;

export const EGG_SIZES = [
  'Small',
  'Medium',
  'Large',
  'Extra Large (XL)',
  'Jumbo',
] as const;

export type EggSize = typeof EGG_SIZES[number];

export type EggSizeBreakdown = Partial<Record<EggSize, number>>;

export interface IgpLivestockInventory {
  produce: string;
  /** @deprecated Removed from afa_igp_livestocks; totals derive directly from stageBreakdown rows. */
  openingCount?: number;
  stageBreakdown: Record<string, number>;
}

export interface IgpExpense {
  id: string;
  produce?: string; // e.g., "Livestock", "Poultry Raising"
  stage?: IgpStage;
  category: 'Piglets' | 'Feeds' | 'Breeding / AI Service' | 'Vitamins/Medicines' | 'Farrowing & Pen Care' | 'Other' | string;
  quantity?: number;
  description: string;
  amount: number;
  date: string;
  recordedBy: string;
  fundSource?: string; // Where budget was taken from, e.g. "DOLE-DILP Program", "5% Livestock Insurance Pool", "AFA General Fund"
}

export interface IgpSale {
  id: string;
  produce?: string; // e.g., "Livestock", "Poultry Raising"
  stage?: IgpStage;
  eggSize?: EggSize; // Optional egg size sold when stage === 'Eggs'
  date: string;
  quantity: number;
  revenue: number;
  recordedBy: string;
  notes?: string;
  fundSource?: string;
}

// EGG HARVEST SUBMISSION (replaces the old IGP chore log).
// Members submit the number of chicken eggs harvested within the day. The record
// then flows through a three-stage approval chain:
//   1. Member submits the harvest count            -> status 'Pending Audit'
//   2. Auditor verifies the amount is accurate     -> status 'Audited' (auditRemarks)
//   3. President signs off the verified record     -> status 'Signed' (signedBy/signedDate)
export interface EggHarvestLog {
  id: string;
  produce?: string; // e.g., "Poultry Raising (RTL)" — defaults to Poultry project
  date: string; // harvest date (YYYY-MM-DD), the day the eggs were collected
  time: string; // time of submission
  collectedBy: string; // member name who submitted the harvest
  eggCount: number; // number of chicken eggs harvested within that day
  sizeBreakdown?: EggSizeBreakdown; // Segregated counts by egg size (Small, Medium, Large, Extra Large (XL), Jumbo)
  notes?: string; // e.g. "collected from coops 1-3", broken/damaged eggs, etc.
  // --- Approval workflow state ---
  status: 'Pending Audit' | 'Audited' | 'Signed' | 'Returned';
  auditedBy?: string; // Auditor name when verified
  auditedDate?: string;
  auditRemarks?: string; // Auditor's verification notes
  signedBy?: string; // President name when signed off
  signedDate?: string;
  signatureRemarks?: string; // President's signing remarks
}



export interface OrganizationFund {
  id: string;
  name: string;
  code: string;
  category?: string;
  source?: string;
  /** The initial fund placed into this account. Never mutated by transactions. */
  initialFund: number;
  /** Live balance = initialFund + income - expenses. Derived, never stored as truth. */
  currentBalance: number;
  description: string;
  custodian: string;
  lastUpdated: string;
}

export interface LivestockIgpState {
  livestockInventory?: IgpLivestockInventory[];
  produces?: string[]; // Dynamic list of produce projects, e.g. ["Livestock", "Chairs Rental (Abang sa Lingkoranan)", "Sacks Rental (Abang sa Sako)", "Poultry Raising"]
  expenses: IgpExpense[];
  sales: IgpSale[];
  /** @deprecated Legacy chore-log field — superseded by the eggHarvests collection. */
  choreLogs?: EggHarvestLog[];
  eggHarvests?: EggHarvestLog[]; // Daily chicken-egg harvest submissions (member → Auditor → President)
  closedYears?: number[];
}

export interface DatabaseStatus {
  connected: boolean;
  configured: boolean;
  /** 'Supabase' when cloud sync is live, 'Local' when Supabase is unreachable. */
  provider: 'Supabase' | 'Local' | string;
  /** 'supabase' when cloud sync is live, 'local' when records stay on this device. */
  storageMode?: 'supabase' | 'local';
  database?: string;
  timestamp?: string;
  error?: string;
  message?: string;
  checking?: boolean;
  tableCounts?: Record<string, number>;
  totalRecords?: number;
  hasPresident?: boolean;
}

export type DelegationScope = 'password_change' | 'record_approval' | 'announcements_activities';

export interface DelegationRequest {
  id: string;
  requestedBy: string;
  reason: string;
  scopes: DelegationScope[];
  requestedDate: string;
  effectiveStart: string;
  effectiveEnd: string;
  status: 'Pending' | 'Approved' | 'Declined' | 'Revoked';
  reviewedBy?: string;
  reviewedDate?: string;
  remarks?: string;
}

// ASSOCIATION INVENTORY REGISTRY (custodial duty assigned to the Auditor,
// since the association has no separate Property Custodian officer)
export interface InventoryItem {
  id: string;
  name: string; // e.g. "IGP Plastic Chairs", "Harvest Sacks", "Laptop", "Bond Paper"
  assetType?: InventoryAssetType; // 'rental' (chairs, tables, sacks) vs 'usable' (laptops, bondpaper, tools)
  category: 'IGP Equipment' | 'Farm Tools' | 'Office Supplies' | 'Rental Assets' | 'Livestock' | 'Other' | string;
  quantity: number;
  damagedQuantity?: number;
  lostQuantity?: number;
  usedQuantity?: number; // For usable/consumable supplies (e.g., bond paper reams consumed)
  unit: string; // e.g. "pieces", "sacks", "reams", "units"
  condition: 'Good' | 'Needs Repair' | 'Damaged' | 'Lost' | string;
  location?: string; // e.g. "Barangay Alegria Covered Court Storage"
  notes?: string; // Auditor's custody / inspection notes
  catalogProductId?: string;
  purchaseTransactionId?: string; // Linked Treasurer expense transaction ID
  activityId?: string; // Optional linked event / activity this asset was acquired for
  meetingId?: string; // Optional linked upcoming/scheduled meeting this asset was acquired for
  recordedBy: string; // Treasurer (purchase) / Auditor (inspection)
  dateRecorded: string;
  lastUpdated: string;
}
