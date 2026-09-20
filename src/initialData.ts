import { Member, Meeting, Resolution, FinancialTransaction, Announcement, SystemLog, HogRaisingState, Product, AssociationActivity, User, OrganizationFund, AuditorReport, DelegationRequest } from './types';
import { hashPassword } from './utils/audit';

// The 6 official officer accounts of Alegria Farmers Association (Tuburan, Cebu)
// Allows designated officers to log in securely with salted SHA-256 hashed credentials.
const DEFAULT_HASH = hashPassword('password123');

export const OFFICIAL_OFFICERS: User[] = [
  {
    id: 'user-pres',
    username: 'president',
    passwordHash: DEFAULT_HASH,
    name: 'Zenaida A. Elbiña',
    role: 'President',
    isApproved: true,
    joinedDate: '2024-01-01'
  },
  {
    id: 'user-vp',
    username: 'vp',
    passwordHash: DEFAULT_HASH,
    name: 'Anselna B Arnado',
    role: 'Vice_President',
    isApproved: true,
    joinedDate: '2024-01-01'
  },
  {
    id: 'user-sec',
    username: 'secretary',
    passwordHash: DEFAULT_HASH,
    name: 'Jennylyn S Lumactao',
    role: 'Secretary',
    isApproved: true,
    joinedDate: '2024-01-01'
  },
  {
    id: 'user-tres',
    username: 'treasurer',
    passwordHash: DEFAULT_HASH,
    name: 'Gracelyn P Asendiente',
    role: 'Treasurer',
    isApproved: true,
    joinedDate: '2024-01-01'
  },
  {
    id: 'user-aud',
    username: 'auditor',
    passwordHash: DEFAULT_HASH,
    name: 'Lorena B Pinote',
    role: 'Auditor',
    isApproved: true,
    joinedDate: '2024-01-01'
  },
  {
    id: 'user-pio',
    username: 'pio',
    passwordHash: DEFAULT_HASH,
    name: 'Ida S Manera',
    role: 'PIO',
    isApproved: true,
    joinedDate: '2024-01-01'
  }
];

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
    custodian: 'Treasurer Gracelyn P. Asendiente',
    lastUpdated: '2026-09-01'
  },
  {
    id: 'fund-dole-dilp',
    code: 'DOLE-DILP',
    name: 'DOLE Integrated Livelihood Program Capital Allocation',
    allocatedAmount: 85000,
    currentBalance: 85000,
    description: 'Kapital nga gigahin alang sa livelihood project, hog raising ug gamit sa produksyon sa asosasyon.',
    custodian: 'Treasurer Gracelyn P. Asendiente',
    lastUpdated: '2026-09-01'
  },
  {
    id: 'fund-cbu',
    code: 'CBU-EQUITY',
    name: 'Member Capital Build-Up & Equity Fund',
    allocatedAmount: 25000,
    currentBalance: 25000,
    description: 'Tampo ug equity sa mga miyembro alang sa institutional stability ug emergency buffer.',
    custodian: 'Treasurer Gracelyn P. Asendiente',
    lastUpdated: '2026-09-01'
  },
  {
    id: 'fund-ati-trg',
    code: 'ATI-TRG',
    name: 'ATI Training & Capacity Building Fund',
    allocatedAmount: 15000,
    currentBalance: 15000,
    description: 'Gahin alang sa mga pagbansay-bansay, seminar, ug edukasyon sa mga opisyal ug mag-uuma.',
    custodian: 'Treasurer Gracelyn P. Asendiente',
    lastUpdated: '2026-09-01'
  },
  {
    id: 'fund-fcct',
    code: 'FCCT-SAVINGS',
    name: 'FCCT Cooperative Bank Deposit',
    allocatedAmount: 40000,
    currentBalance: 40000,
    description: 'Opisyal nga bank savings account sa asosasyon sa FCCT Cooperative Bank.',
    custodian: 'Treasurer Gracelyn P. Asendiente',
    lastUpdated: '2026-09-01'
  }
];
export const INITIAL_ANNOUNCEMENTS: Announcement[] = [];
export const INITIAL_LOGS: SystemLog[] = [];
export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-chairs-rental',
    name: 'Abang sa Lingkoranan (Chairs Rental for All)',
    cebName: 'Plastic Chairs nga Abangan sa Tanan alang sa Okasyon',
    category: 'Rental & Services',
    price: 5,
    unit: 'matag adlaw / lingkoranan',
    quantityAvailable: '100 ka buok plastic chairs',
    description: 'Lig-on ug limpyo nga plastic chairs nga magamit ug ma-abangan sa bisan kinsa sa komunidad alang sa kasal, lubong, adlawng natawhan, seminar, ug panagtirok.',
    specs: 'Heavy-duty Monobloc Chairs (White & Beige)',
    stockStatus: 'In Stock',
    farmerName: 'AFA Equipment & Rental Committee',
    farmerSitio: 'Sitio Tapon (AFA Center)',
    farmerPhone: '0945-876-1234',
    contactPerson: 'President Zenaida A. Elbiña / Treasurer Gracelyn P. Asendiente',
    isPublished: true,
    updatedBy: 'AFA Admin',
    managedBy: 'Treasurer Gracelyn P. Asendiente',
    dateUpdated: '2026-09-07'
  },
  {
    id: 'prod-sacks-rental',
    name: 'Abang sa Sako (Harvest & Storage Sacks Rental)',
    cebName: 'Mga Sako nga Abangan para sa Ting-ani',
    category: 'Rental & Services',
    price: 3,
    unit: 'matag gamit / sako',
    quantityAvailable: '250 ka buok sako',
    description: 'Limpyo ug lig-on nga mga sako nga abangan sa mga mag-uuma ug lumulupyo para sa ting-ani sa mais, kopras, kape, ug abot sa uma.',
    specs: '50kg Capacity Woven Polypropylene Sacks',
    stockStatus: 'In Stock',
    farmerName: 'AFA Warehouse & Logistics',
    farmerSitio: 'Sitio Lamak',
    farmerPhone: '0917-345-6789',
    contactPerson: 'Vice President Anselna B. Arnado',
    isPublished: true,
    updatedBy: 'AFA Admin',
    managedBy: 'Treasurer Gracelyn P. Asendiente',
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
    farmerName: 'Zenaida A. Elbiña',
    farmerSitio: 'Sitio Tapon',
    farmerPhone: '0945-876-1234',
    contactPerson: 'Zenaida A. Elbiña (0945-876-1234)',
    isPublished: true,
    updatedBy: 'AFA Admin',
    managedBy: 'President Zenaida A. Elbiña',
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
    farmerName: 'Gracelyn P. Asendiente',
    farmerSitio: 'Sitio Pundok 2',
    farmerPhone: '0917-345-6789',
    contactPerson: 'Gracelyn P. Asendiente (0917-345-6789)',
    isPublished: true,
    updatedBy: 'AFA Admin',
    managedBy: 'Treasurer Gracelyn P. Asendiente',
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
    farmerName: 'Lorena B. Pinote',
    farmerSitio: 'Sitio Pundok 1',
    farmerPhone: '0998-123-4567',
    contactPerson: 'Lorena B. Pinote (0998-123-4567)',
    isPublished: true,
    updatedBy: 'AFA Admin',
    managedBy: 'Auditor Lorena B. Pinote',
    dateUpdated: '2026-09-07'
  }
];
export const INITIAL_ACTIVITIES: AssociationActivity[] = [];
export const INITIAL_AUDITOR_REPORTS: AuditorReport[] = [];
export const INITIAL_DELEGATIONS: DelegationRequest[] = [];

export const INITIAL_HOG_RAISING: HogRaisingState = {
  capitalGrant: 0,
  produces: ['Hog Raising', 'Chairs Rental (Abang sa Lingkoranan)', 'Sacks Rental (Abang sa Sako)', 'Poultry Raising'],
  expenses: [],
  sales: [],
  groups: [],
  choreLogs: [],
  closedYears: []
};
