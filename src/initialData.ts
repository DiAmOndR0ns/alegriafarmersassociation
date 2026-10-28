import { Member, Meeting, Resolution, FinancialTransaction, Announcement, SystemLog, HogRaisingState, Product, AssociationActivity, User, OrganizationFund, AuditorReport, DelegationRequest } from './types';

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
export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-chairs-rental',
    name: 'Chairs Rental',
    cebName: 'Heavy-duty monobloc chairs available for any event.',
    category: 'Rental & Services',
    price: 5,
    unit: 'per chair / day',
    quantityAvailable: '100 plastic chairs',
    description: 'Durable, clean plastic chairs available for weddings, wakes, birthdays, seminars, and community gatherings.',
    specs: 'Heavy-duty Monobloc Chairs (White & Beige)',
    stockStatus: 'In Stock',
    farmerName: 'AFA Equipment & Rental Committee',
    farmerSitio: 'Sitio Tapon (AFA Center)',
    farmerPhone: '0945-876-1234',
    contactPerson: 'President / Treasurer (see Officers directory)',
    isPublished: true,
    updatedBy: 'AFA Admin',
    managedBy: 'Treasurer',
    dateUpdated: '2026-09-07'
  },
  {
    id: 'prod-sacks-rental',
    name: 'Harvest & Storage Sacks Rental',
    cebName: 'Clean, reusable 50kg woven sacks for harvest season.',
    category: 'Rental & Services',
    price: 3,
    unit: 'per sack / use',
    quantityAvailable: '250 sacks',
    description: 'Clean, durable sacks available to farmers and residents for corn, copra, coffee, and other farm harvests.',
    specs: '50kg Capacity Woven Polypropylene Sacks',
    stockStatus: 'In Stock',
    farmerName: 'AFA Warehouse & Logistics',
    farmerSitio: 'Sitio Lamak',
    farmerPhone: '0917-345-6789',
    contactPerson: 'Vice President',
    isPublished: true,
    updatedBy: 'AFA Admin',
    managedBy: 'Treasurer',
    dateUpdated: '2026-09-07'
  },
  {
    id: 'prod-coffee',
    name: 'Kape sa Tuburan (Tuburan Coffee)',
    cebName: 'Espesyal nga Roasted Coffee Beans & Ginaling nga Kape',
    category: 'Coffee & Crops',
    price: 250,
    unit: 'matag 250g pack',
    quantityAvailable: '45 ka pack',
    description: 'Lunsay ug organiko nga kape gikan sa mga bungtod sa Tuburan. Humot, lami, ug gi-atiman sa atong mag-uuma sa AFA.',
    specs: '100% Organic Robusta & Liberica',
    stockStatus: 'In Stock',
    farmerName: 'AFA President',
    farmerSitio: 'Sitio Tapon',
    farmerPhone: '0945-876-1234',
    contactPerson: 'President (see Officers directory)',
    isPublished: true,
    updatedBy: 'AFA Admin',
    managedBy: 'President',
    dateUpdated: '2026-09-07'
  },
  {
    id: 'prod-corn',
    name: 'Dalag ug Puti nga Mais (Cebu Yellow & White Corn)',
    cebName: 'Lab-as nga Mais alang sa Pagkaon ug Binhi',
    category: 'Produce',
    price: 45,
    unit: 'matag kilo',
    quantityAvailable: '250 ka kilo',
    description: 'Gitanom sa tabunok nga yuta sa Alegria nga walay makadaot nga kemikal. Tam-is ug lab-as kaayo.',
    specs: 'Bag-ong ani sa Alegria',
    stockStatus: 'In Stock',
    farmerName: 'Treasurer (see Officers directory)',
    farmerSitio: 'Sitio Pundok 2',
    farmerPhone: '0917-345-6789',
    contactPerson: 'Treasurer',
    isPublished: true,
    updatedBy: 'AFA Admin',
    managedBy: 'Treasurer',
    dateUpdated: '2026-09-07'
  },
  {
    id: 'prod-coconut',
    name: 'Lubi ug Kopras (Organic Coconut & Copra)',
    cebName: 'Pang-unang Tinubdan sa Atong Mag-uuma',
    category: 'Produce',
    price: 20,
    unit: 'matag buok',
    quantityAvailable: '500 ka buok',
    description: 'Katas sa lubi ug taas nga kalidad nga kopras para sa mantika. Direkta gikan sa mga mag-uuma sa 4 ka opisyal nga Sitio sa Alegria.',
    specs: 'Premium Copra & Fresh Buko',
    stockStatus: 'In Stock',
    farmerName: 'Auditor (see Officers directory)',
    farmerSitio: 'Sitio Pundok 1',
    farmerPhone: '0998-123-4567',
    contactPerson: 'Auditor',
    isPublished: true,
    updatedBy: 'AFA Admin',
    managedBy: 'Auditor',
    dateUpdated: '2026-09-07'
  }
];
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
  groups: [],
  choreLogs: [],
  closedYears: []
};
