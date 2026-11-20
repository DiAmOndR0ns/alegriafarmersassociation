import { Member, Meeting, Resolution, FinancialTransaction, Announcement, SystemLog, LivestockIgpState, AssociationActivity, User, OrganizationFund, DelegationRequest } from './types';

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
export const INITIAL_DELEGATIONS: DelegationRequest[] = [];

export const INITIAL_LIVESTOCK_IGP: LivestockIgpState = {
  livestockInventory: [],
  produces: [],
  expenses: [],
  sales: [],
  choreLogs: [],
  closedYears: []
};
