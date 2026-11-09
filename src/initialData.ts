import { Member, Meeting, Resolution, FinancialTransaction, Announcement, SystemLog, HogRaisingState, AssociationActivity, User, OrganizationFund, AuditorReport, DelegationRequest } from './types';

// No hardcoded officer credentials — officers are provisioned by the Admin account.
export const OFFICIAL_OFFICERS: User[] = [];

// Clean empty collections — ready for real user input
export const INITIAL_MEMBERS: Member[] = [];
export const INITIAL_MEETINGS: Meeting[] = [];
export const INITIAL_RESOLUTIONS: Resolution[] = [];
export const INITIAL_TRANSACTIONS: FinancialTransaction[] = [];
export const INITIAL_FUNDS: OrganizationFund[] = [];
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
