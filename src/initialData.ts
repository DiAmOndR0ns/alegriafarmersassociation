import { Member, Meeting, Resolution, FinancialTransaction, Announcement, SystemLog, HogRaisingState, AssociationActivity, User, OrganizationFund, AuditorReport, DelegationRequest } from './types';

// No hardcoded officer credentials — officers are provisioned by the Admin account.
export const OFFICIAL_OFFICERS: User[] = [];

// Clean empty collections — ready for real user input
export const INITIAL_MEMBERS: Member[] = [];
export const INITIAL_MEETINGS: Meeting[] = [];
export const INITIAL_RESOLUTIONS: Resolution[] = [];
export const INITIAL_TRANSACTIONS: FinancialTransaction[] = [];
export const INITIAL_FUNDS: OrganizationFund[] = [
  {
    id: 'fund-gf-slp',
    code: 'GF-SLP',
    name: 'General Fund / DSWD-SLP Operational Buffer',
    allocatedAmount: 50000,
    currentBalance: 50000,
    description: 'Pang-operasyon ug general reserve fund sa asosasyon gikan sa DSWD Sustainable Livelihood Program operational buffer.',
    custodian: 'Treasurer',
    lastUpdated: '2026-09-01'
  },
  {
    id: 'fund-dole-dilp',
    code: 'DOLE-DILP',
    name: 'DOLE Integrated Livelihood Program Capital Allocation',
    allocatedAmount: 85000,
    currentBalance: 85000,
    description: 'Kapital nga gigahin alang sa livelihood project, hog raising ug gamit sa produksyon sa asosasyon.',
    custodian: 'Treasurer',
    lastUpdated: '2026-09-01'
  },
  {
    id: 'fund-cbu',
    code: 'CBU-EQUITY',
    name: 'Member Capital Build-Up & Equity Fund',
    allocatedAmount: 25000,
    currentBalance: 25000,
    description: 'Tampo ug equity sa mga miyembro alang sa institutional stability ug emergency buffer.',
    custodian: 'Treasurer',
    lastUpdated: '2026-09-01'
  },
  {
    id: 'fund-ati-trg',
    code: 'ATI-TRG',
    name: 'ATI Training & Capacity Building Fund',
    allocatedAmount: 15000,
    currentBalance: 15000,
    description: 'Gahin alang sa mga pagbansay-bansay, seminar, ug edukasyon sa mga opisyal ug mag-uuma.',
    custodian: 'Treasurer',
    lastUpdated: '2026-09-01'
  },
  {
    id: 'fund-fcct',
    code: 'FCCT-SAVINGS',
    name: 'FCCT Cooperative Bank Deposit',
    allocatedAmount: 40000,
    currentBalance: 40000,
    description: 'Opisyal nga bank savings account sa asosasyon sa FCCT Cooperative Bank.',
    custodian: 'Treasurer',
    lastUpdated: '2026-09-01'
  }
];
export const INITIAL_ANNOUNCEMENTS: Announcement[] = [];
export const INITIAL_LOGS: SystemLog[] = [];
export const INITIAL_ACTIVITIES: AssociationActivity[] = [];
export const INITIAL_AUDITOR_REPORTS: AuditorReport[] = [];
export const INITIAL_DELEGATIONS: DelegationRequest[] = [];

export const INITIAL_HOG_RAISING: HogRaisingState = {
  openingHogCount: 0,
  herdBreakdown: {
    fattening: 0,
    gestation: 0,
    lactating: 0,
    dispersal: 0,
    cattleFattening: 0,
    cattleDispersal: 0,
    rtlCount: 0
  },
  produces: [],
  expenses: [],
  sales: [],
  choreLogs: [],
  groups: [],
  closedYears: []
};
