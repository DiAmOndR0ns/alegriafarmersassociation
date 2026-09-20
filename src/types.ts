export type OfficerRole = 'President' | 'Vice_President' | 'Secretary' | 'Treasurer' | 'Auditor' | 'PIO';

// The 4 Official Sitios of Barangay Alegria, Tuburan, Cebu (based on the official Barangay Profile of Tuburan)
export const OFFICIAL_ALEGRIA_SITIOS = [
  'Sitio Tapon',
  'Sitio Pundok 1',
  'Sitio Pundok 2',
  'Sitio Lamak'
] as const;

export type AlegriaSitio = typeof OFFICIAL_ALEGRIA_SITIOS[number];

export interface User {
  id: string;
  username: string;
  password?: string; // Kept optional for in-memory handling; NEVER saved in plain text to localStorage
  passwordHash?: string; // Cryptographic SHA-256 hash
  name: string;
  role: OfficerRole | 'Member';
  isApproved: boolean;
  avatarUrl?: string; // base64 string for uploaded profile picture
  memberIdNumber?: string;
  rsbsaNumber?: string;
  isRsbsaRegistered?: boolean;
  farmLocation?: string; // for Member role (e.g. Sitio Tapon, Sitio Pundok 1, Sitio Pundok 2, Sitio Lamak)
  farmSize?: number; // in hectares, for Member role
  primaryCrops?: string[]; // for Member role
  contactNumber?: string;
  joinedDate?: string;
  status?: 'Active' | 'Inactive'; // for Member status
  resetRequested?: boolean; // True if they applied to reset their password
}

export interface Member {
  id: string;
  name: string;
  memberIdNumber?: string; // e.g. AFA-2026-001
  rsbsaNumber?: string; // Registry System for Basic Sectors in Agriculture (e.g. 07-22-51-001-000123)
  isRsbsaRegistered?: boolean;
  farmLocation: string; // e.g. Sitio Tapon, Sitio Pundok 1, Sitio Pundok 2, Sitio Lamak
  farmSize?: number; // in hectares (optional/not requested by AFA)
  primaryCrops: string[]; // e.g. Corn, Coconut, Banana, Cacao, Vegetables
  contactNumber: string;
  status: 'Active' | 'Inactive';
  joinedDate: string;
  avatarUrl?: string;
  gender?: 'Male' | 'Female' | 'Other';
  birthDate?: string;
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

export interface FinancialTransaction {
  id: string;
  type: 'income' | 'expense';
  category: string; // e.g. Membership Dues, Donation, Livelihood Capital, Fertilizer, Seeds, Snacks, Equipment
  amount: number;
  date: string;
  description: string;
  recordedBy: string; // Treasurer
  fundSource?: string; // Where the budget was taken from, e.g. "GF-SLP (General Fund / DSWD-SLP)", "DOLE-IGP (DOLE Livelihood Program)", "ATI-TRG (ATI Training Fund)", "DISP-5% (Dispersal Risk Pool)", "CBU (Member Equity)"
  auditedStatus: 'Unaudited' | 'Audited' | 'Flagged';
  auditedBy?: string; // Auditor
  auditedDate?: string;
  auditNotes?: string;
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
  documentedNotes?: string;
  organizer: string; // e.g. PIO (Ida S. Manera)
  targetAudience?: string; // e.g. "All AFA Members"
  attendeesCount?: number;
  imageUrl?: string;
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
  entityType: 'user' | 'officer' | 'member' | 'meeting' | 'resolution' | 'transaction' | 'announcement' | 'hog_expense' | 'hog_sale' | 'hog_chore' | 'product' | 'activity' | string;
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

// HOG RAISING & GENERAL INCOME GENERATING PROJECT (IGP) TYPES
export interface IgpExpense {
  id: string;
  produce?: string; // e.g., "Hog Raising", "Poultry Raising"
  category: 'Piglets' | 'Feeds' | 'Vitamins/Medicines' | 'Other' | string;
  description: string;
  amount: number;
  date: string;
  recordedBy: string;
  fundSource?: string; // Where budget was taken from, e.g. "DOLE-DILP Capital Allocation", "5% Livestock Insurance Pool", "AFA General Fund"
}

export interface IgpSale {
  id: string;
  produce?: string; // e.g., "Hog Raising", "Poultry Raising"
  date: string;
  hogsCount: number; // For backward compatibility
  produceCount?: number; // General quantity
  revenue: number;
  recordedBy: string;
  notes?: string;
}

export interface IgpGroup {
  id: string;
  name: string; // e.g. "Batch 1 (Lunes / Monday)"
  members: string[]; // List of member names
  scheduleDays: string[]; // e.g. ["Monday", "Thursday"]
}

export interface IgpChoreLog {
  id: string;
  produce?: string; // e.g., "Hog Raising", "Poultry Raising"
  date: string;
  time: string;
  batchName: string;
  checkedBy: string; // member name
  activities: string[]; // e.g. ["Feeding", "Cleaning", "Vitamins"]
  notes?: string;
}

export interface OrganizationFund {
  id: string;
  name: string;
  code: string;
  allocatedAmount: number;
  currentBalance: number;
  description: string;
  custodian: string;
  lastUpdated: string;
}

export interface HogRaisingState {
  capitalGrant: number;
  produces?: string[]; // Dynamic list of produce projects, e.g. ["Hog Raising", "Chairs Rental (Abang sa Lingkoranan)", "Sacks Rental (Abang sa Sako)", "Poultry Raising"]
  expenses: IgpExpense[];
  sales: IgpSale[];
  groups: IgpGroup[];
  choreLogs: IgpChoreLog[];
  closedYears?: number[];
}

export interface DatabaseStatus {
  connected: boolean;
  configured: boolean;
  provider: 'Supabase' | 'PostgreSQL' | 'Local Storage' | string;
  database?: string;
  timestamp?: string;
  error?: string;
  message?: string;
  checking?: boolean;
  tableCounts?: Record<string, number>;
  totalRecords?: number;
}

export interface AuditorReport {
  id: string;
  reportPeriod: string;
  reportType: string;
  totalIncome: number;
  totalExpenses: number;
  netSurplus: number;
  findings: string;
  recommendations: string;
  preparedBy: string;
  certifiedBy?: string;
  status: 'Draft' | 'Submitted' | 'Certified' | 'Returned';
  dateSubmitted: string;
  dateCertified?: string;
}

export interface DelegationRequest {
  id: string;
  requestedBy: string;
  reason: string;
  requestedDate: string;
  effectiveStart?: string;
  effectiveEnd?: string;
  status: 'Pending' | 'Approved' | 'Declined' | 'Revoked';
  reviewedBy?: string;
  reviewedDate?: string;
  remarks?: string;
}


