import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import {
  OfficerRole, Member, Meeting, Resolution,
  FinancialTransaction, Announcement, SyncQueueItem, SystemLog, User, LivestockIgpState,
  IgpExpense, IgpSale, EggHarvestLog, Product, PublicProduct, AssociationActivity, AssociationAchievement, OrganizationFund, DatabaseStatus, InventoryItem,
  PasswordResetResult, DelegationRequest, DelegationScope,
  MembershipPayment, MembershipPaymentMethod, MembershipYearSnapshot
} from './types';
import type { PublicSummary } from './components/GuestPortal';
import {
  INITIAL_MEMBERS, INITIAL_MEETINGS, INITIAL_RESOLUTIONS,
  INITIAL_TRANSACTIONS, INITIAL_ANNOUNCEMENTS, INITIAL_LOGS, INITIAL_LIVESTOCK_IGP,
  INITIAL_ACTIVITIES, INITIAL_FUNDS
} from './initialData';
import OfflineIndicator from './components/OfflineIndicator';
import DashboardSkeleton from './components/DashboardSkeleton';

const SecretaryView = lazy(() => import('./components/SecretaryView'));
const TreasurerView = lazy(() => import('./components/TreasurerView'));
const AuditorView = lazy(() => import('./components/AuditorView'));
const PioView = lazy(() => import('./components/PioView'));
const ExecutiveView = lazy(() => import('./components/ExecutiveView'));
const BoardMemberView = lazy(() => import('./components/BoardMemberView'));
const AnnouncementDashboard = lazy(() => import('./components/AnnouncementDashboard'));
const LivestockMonitor = lazy(() => import('./components/LivestockMonitor'));
const SyncQueuePanel = lazy(() => import('./components/SyncQueuePanel'));
const AuthScreen = lazy(() => import('./components/AuthScreen'));
const MemberDashboard = lazy(() => import('./components/MemberDashboard'));
const GuestPortal = lazy(() => import('./components/GuestPortal'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));
const OfficerReportModal = lazy(() => import('./components/OfficerReportModal'));
const PresidentReport = lazy(() => import('./components/PresidentReport'));
const ProductManagementModal = lazy(() => import('./components/ProductManagementModal'));
import { buildReportData } from './components/PresidentReport';
import PasswordChangePrompt from './components/PasswordChangePrompt';
import ConfirmationModal from './components/ConfirmationModal';
import { useDatabaseStatus } from './hooks/useDatabaseStatus';
import { buildAuditChain, hashPassword, verifyPassword, sanitizeUserForStorage } from './utils/audit';
import { isActivityOpenForExpenses } from './utils/activityExpenses';
import { generateInitialPassword, getPasswordExpiryStatus, hashPassword as hashPolicyPassword, isLegacyPasswordHash, validatePasswordPolicy } from './utils/passwordPolicy';
import { LanguageToggle } from './i18n/LanguageContext';
import { clearSecureItems, getSecureItem, migrateSecureItems, removeSecureItem, setSecureItem } from './utils/secureStorage';
import { runNightlyBackupCheck } from './utils/backupSystem';
import { computeFundBalances, getInitialFund } from './utils/fundBalance';
import { deriveIgpLivestockInventory } from './utils/igpInventory';
import { getAvailableInventoryQuantity, getRentalStockStatus } from './utils/inventory';
import { getActiveDelegationScopes } from './utils/delegation';
import {
  DEFAULT_MEMBERSHIP_DUES,
  UNPAID_DUES_REASON,
  buildMembershipYearSnapshot,
  canCloseMembershipYear,
  getPaidThroughYear,
  hasPaymentForYear
} from './utils/membership';
import {
  Building, ShieldCheck, Megaphone, Users, Coins,
  Layers, CheckCircle, AlertTriangle, HelpCircle, ArrowRight, LogOut, Briefcase, FileText, ShoppingBag,
  ChevronLeft, ChevronRight, Database
} from 'lucide-react';

export function mergeSyncRecordsById<T extends { id: string }>(
  remoteRecords: T[],
  localRecords: T[],
  deletedIds: string[] = []
): T[] {
  const records = new Map(remoteRecords.map(record => [record.id, record]));
  localRecords.forEach(record => records.set(record.id, record));
  deletedIds.forEach(id => records.delete(id));
  return Array.from(records.values());
}

interface StoredDeletedIds {
  users?: string[];
  members?: string[];
  meetings?: string[];
  resolutions?: string[];
  financialTransactions?: string[];
  transactions?: string[];
  announcements?: string[];
  products?: string[];
  activities?: string[];
  achievements?: string[];
  funds?: string[];
  inventory?: string[];
  membershipPayments?: string[];
}

/** Entities a push may carry, keyed by the override field that supplies them. */
const SYNC_ENTITY_KEYS = [
  ['users', 'users'],
  ['members', 'members'],
  ['meetings', 'meetings'],
  ['resolutions', 'resolutions'],
  ['announcements', 'announcements'],
  ['products', 'products'],
  ['activities', 'activities'],
  ['achievements', 'achievements'],
  ['inventory', 'inventory'],
  ['membershipPayments', 'membershipPayments'],
  ['membershipYearSnapshots', 'membershipYearSnapshots'],
] as const;

/**
 * Decides what `/api/sync/push` actually receives.
 *
 * Two rules matter, and both were silently violating production:
 *
 * 1. A change that names an entity sends ONLY that entity. Filling the rest of
 *    the payload from the app snapshot made a Secretary's member save ship
 *    `financialTransactions`, `funds` and `livestockIgp` as well. The server
 *    answers 403 for financial fields from a non-Treasurer and discards the
 *    whole request, so the member, announcement or activity was never stored.
 *
 * 2. Financial entities only travel for the Treasurer / Assistant Treasurer.
 *    That applies to the full snapshot too, which is what every auto-sync path
 *    sends - otherwise a Secretary could never complete ANY sync.
 *
 * Pure on purpose: the payload contract is the thing that broke, so it is
 * covered directly by tests rather than through a rendered App.
 */
export function buildSyncPayload(params: {
  overrides?: Record<string, any>;
  options?: { scope?: 'eggHarvests' | 'roleUpdate' | 'presidentApproval' | 'auditorReview' };
  snapshot: { livestockIgp: any; transactions: unknown; funds: unknown } & Record<string, any>;
  deletedIds: StoredDeletedIds | Record<string, unknown>;
  canWriteFinancials: boolean;
}): Record<string, unknown> {
  const { overrides, options, snapshot, deletedIds, canWriteFinancials } = params;
  const scope = options?.scope;

  if (scope === 'eggHarvests') {
    return { eggHarvests: overrides?.eggHarvests || snapshot.livestockIgp.eggHarvests || [] };
  }
  if (scope === 'roleUpdate') {
    return { roleUpdate: overrides?.roleUpdate };
  }
  if (scope === 'presidentApproval') {
    // Send ONLY the sign-off. A full snapshot here would carry `funds` and the
    // server would strip them, wiping the ledger on every approval.
    return { financialTransactions: overrides?.financialTransactions || [], presidentApprovalOnly: true };
  }
  if (scope === 'auditorReview') {
    // Same reasoning for the Auditor step: send only the reviewed record.
    return { financialTransactions: overrides?.financialTransactions || [], auditorReviewOnly: true };
  }

  const hasOverride = overrides !== undefined && Object.keys(overrides).length > 0;

  if (hasOverride) {
    const payload: Record<string, unknown> = {};
    for (const [overrideKey, payloadKey] of SYNC_ENTITY_KEYS) {
      if (overrides![overrideKey] !== undefined) payload[payloadKey] = overrides![overrideKey];
    }
    if (canWriteFinancials && overrides!.financialTransactions !== undefined) {
      payload.financialTransactions = overrides!.financialTransactions;
    }
    if (canWriteFinancials && overrides!.membershipPayments !== undefined) {
      payload.membershipPayments = overrides!.membershipPayments;
    }
    if (canWriteFinancials && overrides!.membershipYearSnapshots !== undefined) {
      payload.membershipYearSnapshots = overrides!.membershipYearSnapshots;
    }
    if (canWriteFinancials && overrides!.funds !== undefined) payload.funds = overrides!.funds;
    if (canWriteFinancials && overrides!.livestockIgp !== undefined) payload.livestockIgp = overrides!.livestockIgp;
    if (overrides!.systemLogs !== undefined) payload.systemLogs = overrides!.systemLogs;
    payload.deletedIds = deletedIds;
    return payload;
  }

  const snapshotPayload: Record<string, unknown> = {};
  for (const [key] of SYNC_ENTITY_KEYS) {
    snapshotPayload[key] = snapshot[key];
  }
  snapshotPayload.systemLogs = snapshot.logs;
  if (canWriteFinancials) {
    snapshotPayload.financialTransactions = snapshot.transactions;
    snapshotPayload.funds = snapshot.funds;
    snapshotPayload.livestockIgp = snapshot.livestockIgp;
    snapshotPayload.membershipPayments = snapshot.membershipPayments;
    snapshotPayload.membershipYearSnapshots = snapshot.membershipYearSnapshots;
  }
  snapshotPayload.deletedIds = deletedIds;
  return snapshotPayload;
}

export default function App() {
  // Auth & Accounts State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const authEpochRef = useRef<number>(0);
  const sessionRefreshAbortRef = useRef<AbortController | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [guestMode, setGuestMode] = useState<boolean>(true);
  const [showPrivacyPage, setShowPrivacyPage] = useState<boolean>(
    () => typeof window !== 'undefined' && (window.location.pathname === '/privacy' || window.location.pathname === '/privacy/')
  );
  const [cachedPublicSummary, setCachedPublicSummary] = useState<PublicSummary | null>(null);
  const [cachedPublicAchievements, setCachedPublicAchievements] = useState<AssociationAchievement[] | null>(null);
  const [cachedPublicProducts, setCachedPublicProducts] = useState<PublicProduct[] | null>(null);
  const [dismissedPasswordWarningFor, setDismissedPasswordWarningFor] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const path = window.location.pathname;
      setShowPrivacyPage(path === '/privacy' || path === '/privacy/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openPrivacyInApp = () => {
    setShowPrivacyPage(true);
    if (typeof window !== 'undefined' && typeof window.history?.pushState === 'function') {
      window.history.pushState({ view: 'privacy' }, '', '/privacy');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const closePrivacyInApp = () => {
    setShowPrivacyPage(false);
    if (typeof window !== 'undefined' && typeof window.history?.pushState === 'function') {
      window.history.pushState({ view: 'portal' }, '', '/');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePublicDataLoaded = (payload: {
    summary?: PublicSummary;
    achievements?: AssociationAchievement[];
    products?: PublicProduct[];
  }) => {
    if (payload.summary) setCachedPublicSummary(payload.summary);
    if (payload.achievements) setCachedPublicAchievements(payload.achievements);
    if (payload.products) setCachedPublicProducts(payload.products);
  };

  // Connection and Sync State
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([]);
  const { dbStatus, setDbStatus, checkDatabaseConnection } = useDatabaseStatus();

  // Officer Role State
  const [currentRole, setCurrentRole] = useState<OfficerRole>('President');
  const [officerTab, setOfficerTab] = useState<'tasks' | 'livestock' | 'announcements' | 'member-view' | 'products'>('tasks');
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [showPresidentReport, setShowPresidentReport] = useState<boolean>(false);
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [showClearCacheConfirmModal, setShowClearCacheConfirmModal] = useState<boolean>(false);

  // Core App Data States (hydrated from localStorage or initials)
  const [members, setMembers] = useState<Member[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [livestockIgp, setLivestockIgp] = useState<LivestockIgpState>(INITIAL_LIVESTOCK_IGP);
  const [products, setProducts] = useState<Product[]>([]);
  const [activities, setActivities] = useState<AssociationActivity[]>([]);
  const [achievements, setAchievements] = useState<AssociationAchievement[]>([]);
  const [funds, setFunds] = useState<OrganizationFund[]>([]);
  // Association inventory registry — custodial duty of the Auditor (no Property Custodian officer exists)
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  // Annual membership dues ledger + the frozen rosters of closed membership years.
  const [membershipPayments, setMembershipPayments] = useState<MembershipPayment[]>([]);
  const [membershipYearSnapshots, setMembershipYearSnapshots] = useState<MembershipYearSnapshot[]>([]);
  const [duesAmount, setDuesAmount] = useState<number>(DEFAULT_MEMBERSHIP_DUES);
  const [delegationRequests, setDelegationRequests] = useState<DelegationRequest[]>([]);
  const [isRefreshingDelegations, setIsRefreshingDelegations] = useState(false);
  const activeDelegationScopes = getActiveDelegationScopes(delegationRequests, currentUser?.id || '');
  const hasDelegatedRecordApproval = currentRole === 'Vice_President' && activeDelegationScopes.has('record_approval');
  const hasDelegatedContentPosting = currentRole === 'Vice_President' && activeDelegationScopes.has('announcements_activities');
  const [isHydrating, setIsHydrating] = useState(true);
  const [hasPendingCloudSync, setHasPendingCloudSync] = useState(false);

  // Ref to prevent overlapping push requests and track synchronization status
  const isSyncingRef = useRef<boolean>(false);
  const syncQueueRef = useRef<SyncQueueItem[]>([]);
  const deletedIdsRef = useRef<StoredDeletedIds>({});
  const pendingSyncsRef = useRef<Array<{ run: () => Promise<boolean>; resolve: (synced: boolean) => void }>>([]);
  const appDataRef = useRef({
    users: [] as User[],
    members: [] as Member[],
    meetings: [] as Meeting[],
    resolutions: [] as Resolution[],
    transactions: [] as FinancialTransaction[],
    announcements: [] as Announcement[],
    products: [] as Product[],
    activities: [] as AssociationActivity[],
    achievements: [] as AssociationAchievement[],
    livestockIgp: INITIAL_LIVESTOCK_IGP,
    funds: [] as OrganizationFund[],
    inventory: [] as InventoryItem[],
    membershipPayments: [] as MembershipPayment[],
    membershipYearSnapshots: [] as MembershipYearSnapshot[],
    logs: [] as SystemLog[]
  });

  // Keep appDataRef up-to-date synchronously with current states
  useEffect(() => {
    appDataRef.current = {
      users,
      members,
      meetings,
      resolutions,
      transactions,
      announcements,
      products,
      activities,
      achievements,
      livestockIgp,
      funds,
      inventory,
      membershipPayments,
      membershipYearSnapshots,
      logs
    };
  }, [users, members, meetings, resolutions, transactions, announcements, products, activities, achievements, livestockIgp, funds, inventory, membershipPayments, membershipYearSnapshots, logs]);

  // Feedback State (Toasts)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' | 'info' | 'error' } | null>(null);

  const jumpToDashboardSection = (sectionId: string) => {
    const target = document.getElementById(sectionId);
    if (!target) return;

    const topOffset = window.innerWidth >= 1024 ? 130 : 90;
    const y = target.getBoundingClientRect().top + window.scrollY - topOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });
  };

  // Load and migrate encrypted browser data on mount.
  useEffect(() => {
    let cancelled = false;
    const loadLocalData = async () => {
      try {
        const storageKeys = ['bafa_members', 'bafa_meetings', 'bafa_resolutions', 'bafa_transactions', 'bafa_announcements', 'bafa_afa_igp', 'bafa_products', 'bafa_activities', 'bafa_achievements', 'bafa_funds', 'bafa_inventory', 'bafa_delegation_requests', 'bafa_membership_payments', 'bafa_membership_year_snapshots', 'bafa_membership_dues_amount', 'bafa_sync_queue', 'bafa_deleted_ids', 'bafa_pending_cloud_sync', 'bafa_logs', 'bafa_users', 'bafa_current_user', 'bafa_read_announcements', 'bafa_closed_log_years', 'bafa_treasurer_categories'];
        clearSecureItems(['bafa_hog_raising']);
        await migrateSecureItems(storageKeys);
        if (cancelled) return;
        const [storedMembers, storedMeetings, storedResolutions, storedTransactions, storedAnnouncements, storedLivestockIgp, storedProducts, storedActivities, storedAchievements, storedFunds, storedInventory, storedQueue, storedLogs, storedUsers, storedPendingCloudSync, storedDeletedIds, storedDelegationRequests, storedMembershipPayments, storedMembershipYearSnapshots, storedDuesAmount] = await Promise.all([
          getSecureItem<Member[]>('bafa_members'),
          getSecureItem<Meeting[]>('bafa_meetings'),
          getSecureItem<Resolution[]>('bafa_resolutions'),
          getSecureItem<FinancialTransaction[]>('bafa_transactions'),
          getSecureItem<Announcement[]>('bafa_announcements'),
          getSecureItem<LivestockIgpState>('bafa_afa_igp'),
          getSecureItem<Product[]>('bafa_products'),
          getSecureItem<AssociationActivity[]>('bafa_activities'),
          getSecureItem<AssociationAchievement[]>('bafa_achievements'),
          getSecureItem<OrganizationFund[]>('bafa_funds'),
          getSecureItem<InventoryItem[]>('bafa_inventory'),
          getSecureItem<SyncQueueItem[]>('bafa_sync_queue'),
          getSecureItem<SystemLog[]>('bafa_logs'),
          getSecureItem<User[]>('bafa_users'),
          getSecureItem<boolean>('bafa_pending_cloud_sync'),
          getSecureItem<StoredDeletedIds>('bafa_deleted_ids'),
          getSecureItem<DelegationRequest[]>('bafa_delegation_requests'),
          getSecureItem<MembershipPayment[]>('bafa_membership_payments'),
          getSecureItem<MembershipYearSnapshot[]>('bafa_membership_year_snapshots'),
          getSecureItem<number>('bafa_membership_dues_amount')
        ]);
        deletedIdsRef.current = storedDeletedIds || {};
        const hasStoredDeletions = Object.values(deletedIdsRef.current).some(ids => Array.isArray(ids) && ids.length > 0);
        setHasPendingCloudSync(Boolean(storedPendingCloudSync) || Boolean(storedQueue?.length) || hasStoredDeletions);

        // Detect and clear legacy dummy seed data from previous versions (e.g. Roberto Cañete / m-001)
        const storedMembersText = JSON.stringify(storedMembers || []);
        const hasOldSeedMembers = storedMembersText.includes('m-001') || storedMembersText.includes('Roberto M. Cañete') || storedMembersText.includes('Juanito') || storedMembersText.includes('user-m1');
        if (hasOldSeedMembers) {
          console.log('[Auto-Cleanup]: Detected legacy dummy seed data in local cache. Cleaning storage for real data...');
          clearSecureItems(['bafa_members', 'bafa_meetings', 'bafa_resolutions', 'bafa_transactions', 'bafa_announcements', 'bafa_products', 'bafa_activities', 'bafa_achievements', 'bafa_funds', 'bafa_afa_igp']);
          setMembers([]);
          setMeetings([]);
          setResolutions([]);
          setTransactions([]);
          setAnnouncements([]);
          setProducts([]);
          setActivities([]);
          setAchievements([]);
          setFunds([]);
          setLivestockIgp(INITIAL_LIVESTOCK_IGP);
        } else {
          setMembers(storedMembers || INITIAL_MEMBERS);
          setMeetings(storedMeetings || INITIAL_MEETINGS);
          setResolutions(storedResolutions || INITIAL_RESOLUTIONS);
          setTransactions(storedTransactions || INITIAL_TRANSACTIONS);
          setAnnouncements(storedAnnouncements || INITIAL_ANNOUNCEMENTS);
          setLivestockIgp(storedLivestockIgp || INITIAL_LIVESTOCK_IGP);
          const legacySeedProductIds = new Set(['prod-chairs-rental', 'prod-sacks-rental', 'prod-coffee', 'prod-corn', 'prod-coconut']);
          const localProducts = Array.isArray(storedProducts)
            ? storedProducts.filter(product => !legacySeedProductIds.has(product.id))
            : [];
          setProducts(localProducts);
          if (localProducts.length !== (storedProducts?.length || 0)) {
            updateStorage('bafa_products', localProducts);
          }
          setActivities(storedActivities || INITIAL_ACTIVITIES);
          setAchievements(storedAchievements || []);
          setFunds(storedFunds || INITIAL_FUNDS);
          setInventory(storedInventory || []);
        }
        setDelegationRequests(Array.isArray(storedDelegationRequests) ? storedDelegationRequests : []);
        setMembershipPayments(Array.isArray(storedMembershipPayments) ? storedMembershipPayments : []);
        setMembershipYearSnapshots(Array.isArray(storedMembershipYearSnapshots) ? storedMembershipYearSnapshots : []);
        const storedDues = Number(storedDuesAmount);
        setDuesAmount(Number.isFinite(storedDues) && storedDues > 0 ? storedDues : DEFAULT_MEMBERSHIP_DUES);

        syncQueueRef.current = storedQueue || [];
        setSyncQueue(syncQueueRef.current);

        const parsedUsers = storedUsers || [];
        // Filter out any dummy members from users and strip any plain-text passwords
        const sanitizedUsers = (Array.isArray(parsedUsers) ? parsedUsers : [])
          .filter((u: any) => u.role !== 'Member' || !u.id.startsWith('user-m'))
          .map((u: any) => {
            const copy = { ...u };
            const isPresident = copy.role?.toLowerCase() === 'president';
            if (isPresident) {
              copy.mfaEnabled = true;
            }
            const hadLegacyPlaintext = Boolean(copy.password);
            if (copy.password) {
              copy.passwordHash = copy.passwordHash?.startsWith('$2') ? copy.passwordHash : hashPolicyPassword(copy.password);
              copy.passwordChangedAt = copy.passwordChangedAt || new Date(0).toISOString();
              copy.passwordHistory = copy.passwordHistory || [];
              copy.mustChangePassword = true;
              delete copy.password;
            }
            if (hadLegacyPlaintext || !copy.passwordHash?.startsWith('$2')) copy.mustChangePassword = true;
            if (!copy.passwordHistory) copy.passwordHistory = [];
            return copy;
          });
        let finalLocalUsers = sanitizedUsers;
        if (import.meta.env.DEV) {
          try {
            const devRes = await fetch('/api/dev/local-officers');
            if (devRes.ok) {
              const devData = await devRes.json();
              if (devData?.success && Array.isArray(devData.officers) && devData.officers.length > 0) {
                const merged = [...sanitizedUsers];
                for (const devOfficer of devData.officers) {
                  const existingIdx = merged.findIndex(
                    (u: any) =>
                      u.id === devOfficer.id ||
                      String(u.username || '').toLowerCase() === String(devOfficer.username || '').toLowerCase()
                  );
                  if (existingIdx === -1) {
                    const hasRoleAlready = devOfficer.role !== 'Board_Member' &&
                      merged.some((u: any) => u.role === devOfficer.role);
                    if (!hasRoleAlready) {
                      merged.push(devOfficer);
                    }
                  } else if (String(merged[existingIdx].id || '').startsWith('local-officer-')) {
                    const prev = merged[existingIdx];
                    merged[existingIdx] = {
                      ...devOfficer,
                      ...prev,
                      passwordHash: devOfficer.passwordHash,
                      totpSecret: devOfficer.totpSecret ?? prev.totpSecret,
                      mfaEnabled: devOfficer.mfaEnabled
                    };
                  }
                }
                finalLocalUsers = merged;
              }
            }
          } catch {
            // Ignore when offline or outside local dev server.
          }
        }
        setUsers(finalLocalUsers);
        await setSecureItem('bafa_users', finalLocalUsers);

        const storedCurr = await getSecureItem<User>('bafa_current_user');
        if (storedCurr?.password) {
          const safeCurrentUser = { ...storedCurr };
          delete safeCurrentUser.password;
          await setSecureItem('bafa_current_user', safeCurrentUser);
        }
        if (storedCurr && !cancelled) {
          const matchedStoredUser = finalLocalUsers.find((u: User) => u.id === storedCurr.id);
          const safeUser: User = {
            ...matchedStoredUser,
            ...storedCurr,
            avatarUrl: storedCurr.avatarUrl ?? matchedStoredUser?.avatarUrl
          };
          delete safeUser.password;
          delete safeUser.passwordHash;
          delete safeUser.passwordHistory;
          if (safeUser.role?.toLowerCase() === 'president') {
            safeUser.mfaEnabled = true;
          }
          setCurrentUser(safeUser);
          if (safeUser.role !== 'Member') setCurrentRole(safeUser.role as OfficerRole);
          setGuestMode(false);
        }

        const rawLogs = storedLogs || INITIAL_LOGS;
        const needsChaining = rawLogs.some((l: any) => !l.hash || !l.previousHash);
        const activeLogs = needsChaining ? buildAuditChain(rawLogs) : rawLogs;
        if (needsChaining) {
          updateStorage('bafa_logs', activeLogs);
        }
        setLogs(activeLogs);

        // Check authenticated session before completing hydration
        const hydrationAuthEpoch = authEpochRef.current;
        try {
          const sessionRes = await fetch('/api/auth/session', {
            credentials: 'same-origin',
            cache: 'no-store'
          });
          if (sessionRes.ok) {
            const result = await sessionRes.json();
            if (cancelled || authEpochRef.current !== hydrationAuthEpoch) {
              // User explicitly logged in or logged out while hydration was in flight.
            } else if (result?.authenticated && result.user) {
              const safeUser = { ...result.user } as User;
              delete safeUser.password;
              delete safeUser.passwordHash;
              delete safeUser.passwordHistory;
              setCurrentUser(safeUser);
              if (safeUser.role !== 'Member') setCurrentRole(safeUser.role as OfficerRole);
              setGuestMode(false);
              setUsers(previous => [safeUser, ...previous.filter(user => user.id !== safeUser.id)]);
              if (typeof result.hasPresident === 'boolean') {
                setDbStatus(prev => ({ ...prev, hasPresident: result.hasPresident }));
              }
            } else if (!result?.authenticated && (import.meta.env.PROD || result?.configured)) {
              // No server session: the visitor is not signed in. Stay on the guest
              // portal (guestMode defaults to true) instead of forcing the login
              // form. `dbStatus.hasPresident` is only populated after a live status
              // check, so never leave a stale `false` standing here, or the login
              // screen offers "First-Time Setup" even though a President exists.
              setCurrentUser(null);
              void removeSecureItem('bafa_current_user');
              setDbStatus(prev => (typeof result.hasPresident === 'boolean'
                ? { ...prev, hasPresident: result.hasPresident }
                : (prev.hasPresident ? prev : { ...prev, hasPresident: undefined })));
            }
          }
        } catch {
          // Offline or session endpoint unreachable
        }

        // Initial database status check
        checkDatabaseConnection();
        void runNightlyBackupCheck();
        if (!cancelled) {
          setIsHydrating(false);
        }

        // Attempt pulling fresh data from PostgreSQL Cloud Database if online
        fetch('/api/sync/pull')
          .then(async res => {
            const text = await res.text();
            try {
              return JSON.parse(text);
            } catch {
              return { offlineMode: true, success: false };
            }
          })
          .then(res => {
            if (res?.success && res.data) {
              // Pending deletes are derived from the encrypted sync queue.
              let bootDeletedIds: StoredDeletedIds = {};
              try {
                bootDeletedIds = getStoredDeletedIds(storedQueue || []);
              } catch { }

              const hasPendingLocalChanges = Boolean(storedPendingCloudSync) || Boolean(storedQueue?.length) || hasStoredDeletions;
              const hasQueuedEntity = (...entities: string[]) => storedQueue?.some(item =>
                entities.includes(String(item.entityType).toLowerCase())
              ) || false;
              const delUsers = new Set(bootDeletedIds.users || []);
              const delMembers = new Set(bootDeletedIds.members || []);
              const delMeetings = new Set(bootDeletedIds.meetings || []);
              const delResolutions = new Set(bootDeletedIds.resolutions || []);
              const delTx = new Set([...(bootDeletedIds.financialTransactions || []), ...(bootDeletedIds.transactions || [])]);
              const delAnnouncements = new Set(bootDeletedIds.announcements || []);
              const delProducts = new Set(bootDeletedIds.products || []);
              const delActivities = new Set(bootDeletedIds.activities || []);
              const delAchievements = new Set(bootDeletedIds.achievements || []);
              const delFunds = new Set(bootDeletedIds.funds || []);
              const delInventory = new Set(bootDeletedIds.inventory || []);

              const cleanMembers = Array.isArray(res.data.members) ? res.data.members.filter((m: any) => !delMembers.has(m.id)) : [];
              const cleanMeetings = Array.isArray(res.data.meetings) ? res.data.meetings.filter((m: any) => !delMeetings.has(m.id)) : [];
              const cleanResolutions = Array.isArray(res.data.resolutions) ? res.data.resolutions.filter((r: any) => !delResolutions.has(r.id)) : [];
              const cleanTx = Array.isArray(res.data.financialTransactions) ? res.data.financialTransactions.filter((t: any) => !delTx.has(t.id)) : [];
              const cleanAnnouncements = Array.isArray(res.data.announcements) ? res.data.announcements.filter((a: any) => !delAnnouncements.has(a.id)) : [];
              const cleanProducts = Array.isArray(res.data.products) ? res.data.products.filter((p: any) => !delProducts.has(p.id)) : [];
              const cleanActivities = Array.isArray(res.data.activities) ? res.data.activities.filter((a: any) => !delActivities.has(a.id)) : [];
              const localMembers = hasOldSeedMembers ? [] : storedMembers || [];
              const legacySeedProductIds = new Set(['prod-chairs-rental', 'prod-sacks-rental', 'prod-coffee', 'prod-corn', 'prod-coconut']);
              const localProducts = Array.isArray(storedProducts)
                ? storedProducts.filter(product => !legacySeedProductIds.has(product.id))
                : [];
              const syncedMembers = storedPendingCloudSync || hasQueuedEntity('member') || delMembers.size > 0
                ? mergeSyncRecordsById(cleanMembers, localMembers, bootDeletedIds.members) : cleanMembers;
              const syncedMeetings = storedPendingCloudSync || hasQueuedEntity('meeting') || delMeetings.size > 0
                ? mergeSyncRecordsById(cleanMeetings, storedMeetings || [], bootDeletedIds.meetings) : cleanMeetings;
              const syncedResolutions = storedPendingCloudSync || hasQueuedEntity('resolution') || delResolutions.size > 0
                ? mergeSyncRecordsById(cleanResolutions, storedResolutions || [], bootDeletedIds.resolutions) : cleanResolutions;
              const syncedTransactions = storedPendingCloudSync || hasQueuedEntity('transaction') || delTx.size > 0
                ? mergeSyncRecordsById(cleanTx, storedTransactions || [], bootDeletedIds.financialTransactions) : cleanTx;
              const syncedAnnouncements = storedPendingCloudSync || hasQueuedEntity('announcement') || delAnnouncements.size > 0
                ? mergeSyncRecordsById(cleanAnnouncements, storedAnnouncements || [], bootDeletedIds.announcements) : cleanAnnouncements;
              const syncedProducts = storedPendingCloudSync || hasQueuedEntity('product') || delProducts.size > 0
                ? mergeSyncRecordsById(cleanProducts, localProducts, bootDeletedIds.products) : cleanProducts;
              const syncedActivities = storedPendingCloudSync || hasQueuedEntity('activity') || delActivities.size > 0
                ? mergeSyncRecordsById(cleanActivities, storedActivities || [], bootDeletedIds.activities) : cleanActivities;
              const achievementSource = Array.isArray(res.data.achievements) ? res.data.achievements : [];
              const cleanAchievements = achievementSource.filter((achievement: AssociationAchievement) => !delAchievements.has(achievement.id));
              const cleanFunds = Array.isArray(res.data.funds) ? res.data.funds.filter((f: any) => !delFunds.has(f.id)) : [];
              const cleanInventory = Array.isArray(res.data.inventory) ? res.data.inventory.filter((i: any) => !delInventory.has(i.id)) : [];
              const syncedAchievements = storedPendingCloudSync || hasQueuedEntity('achievement') || delAchievements.size > 0
                ? mergeSyncRecordsById(cleanAchievements, storedAchievements || [], bootDeletedIds.achievements)
                : cleanAchievements;
              const syncedFunds = storedPendingCloudSync || hasQueuedEntity('fund') || delFunds.size > 0
                ? mergeSyncRecordsById(cleanFunds, storedFunds || [], bootDeletedIds.funds) : cleanFunds;
              const syncedInventory = storedPendingCloudSync || hasQueuedEntity('inventory') || delInventory.size > 0
                ? mergeSyncRecordsById(cleanInventory, storedInventory || [], bootDeletedIds.inventory) : cleanInventory;
              const delMembershipPayments = new Set(bootDeletedIds.membershipPayments || []);
              const cleanMembershipPayments = Array.isArray(res.data.membershipPayments)
                ? res.data.membershipPayments.filter((p: any) => !delMembershipPayments.has(p.id))
                : [];
              const syncedMembershipPayments = storedPendingCloudSync || hasQueuedEntity('membership_payment', 'membership_payments') || delMembershipPayments.size > 0
                ? mergeSyncRecordsById(cleanMembershipPayments, storedMembershipPayments || [], bootDeletedIds.membershipPayments)
                : cleanMembershipPayments;
              const syncedMembershipYearSnapshots: MembershipYearSnapshot[] = Array.isArray(res.data.membershipYearSnapshots)
                ? res.data.membershipYearSnapshots as MembershipYearSnapshot[]
                : (storedMembershipYearSnapshots || []);
              const hasPendingLivestockChanges = storedPendingCloudSync || hasQueuedEntity('livestock_expense', 'livestock_sale', 'livestock_harvest', 'egg_harvest');
              const syncedLivestockIgp = hasPendingLivestockChanges && storedLivestockIgp
                ? storedLivestockIgp
                : res.data.livestockIgp || storedLivestockIgp || INITIAL_LIVESTOCK_IGP;

              if (Array.isArray(res.data.members) || hasPendingLocalChanges) { setMembers(syncedMembers); updateStorage('bafa_members', syncedMembers); }
              if (Array.isArray(res.data.meetings) || hasPendingLocalChanges) { setMeetings(syncedMeetings); updateStorage('bafa_meetings', syncedMeetings); }
              if (Array.isArray(res.data.resolutions) || hasPendingLocalChanges) { setResolutions(syncedResolutions); updateStorage('bafa_resolutions', syncedResolutions); }
              if (Array.isArray(res.data.financialTransactions) || hasPendingLocalChanges) { setTransactions(syncedTransactions); updateStorage('bafa_transactions', syncedTransactions); }
              if (Array.isArray(res.data.announcements) || hasPendingLocalChanges) { setAnnouncements(syncedAnnouncements); updateStorage('bafa_announcements', syncedAnnouncements); }
              if (Array.isArray(res.data.products) || hasPendingLocalChanges) { setProducts(syncedProducts); updateStorage('bafa_products', syncedProducts); }
              if (Array.isArray(res.data.activities) || hasPendingLocalChanges) { setActivities(syncedActivities); updateStorage('bafa_activities', syncedActivities); }
              if (Array.isArray(res.data.delegationRequests)) {
                const syncedDelegations = res.data.delegationRequests as DelegationRequest[];
                setDelegationRequests(syncedDelegations);
                updateStorage('bafa_delegation_requests', syncedDelegations);
              }
              if (Array.isArray(res.data.achievements) || hasPendingLocalChanges) { setAchievements(syncedAchievements); updateStorage('bafa_achievements', syncedAchievements); }
              if (Array.isArray(res.data.funds) || hasPendingLocalChanges) { setFunds(syncedFunds); updateStorage('bafa_funds', syncedFunds); }
              if (Array.isArray(res.data.inventory) || hasPendingLocalChanges) { setInventory(syncedInventory); updateStorage('bafa_inventory', syncedInventory); }
              if (Array.isArray(res.data.membershipPayments) || hasPendingLocalChanges) { setMembershipPayments(syncedMembershipPayments); updateStorage('bafa_membership_payments', syncedMembershipPayments); }
              if (Array.isArray(res.data.membershipYearSnapshots)) { setMembershipYearSnapshots(syncedMembershipYearSnapshots); updateStorage('bafa_membership_year_snapshots', syncedMembershipYearSnapshots); }
              if (res.data.livestockIgp || hasPendingLocalChanges) { setLivestockIgp(syncedLivestockIgp); updateStorage('bafa_afa_igp', syncedLivestockIgp); }
              const cleanUsers = Array.isArray(res.data.users) ? res.data.users
                .filter((u: any) => !delUsers.has(u.id))
                .map((user: User) => {
                  // The database row is the source of truth for credentials. Older rows store a
                  // plaintext `password`; promote it into the hash column exactly once instead of
                  // letting it be dropped during storage sanitization.
                  const isPresident = user.role?.toLowerCase() === 'president';
                  const upgraded = {
                    ...user,
                    mfaEnabled: isPresident ? true : Boolean(user.mfaEnabled),
                    passwordHistory: Array.isArray(user.passwordHistory) ? user.passwordHistory : []
                  };
                  if (upgraded.password) {
                    if (!upgraded.passwordHash?.startsWith('$2')) {
                      upgraded.passwordHash = hashPolicyPassword(upgraded.password);
                      upgraded.passwordChangedAt = upgraded.passwordChangedAt || new Date(0).toISOString();
                    }
                    delete upgraded.password;
                  }
                  upgraded.mustChangePassword = false;
                  return upgraded;
                }) : [];
              const syncedUsers = storedPendingCloudSync || hasQueuedEntity('user', 'officer', 'member') || delUsers.size > 0
                ? mergeSyncRecordsById(cleanUsers, sanitizedUsers, bootDeletedIds.users)
                : cleanUsers;
              if (Array.isArray(res.data.users) || hasPendingLocalChanges) {
                setUsers(syncedUsers);
                updateStorage('bafa_users', syncedUsers);
                if (isOnline && syncedUsers.some((user: User) => !user.passwordHash?.startsWith('$2'))) {
                  pushAllDataToCloud({ users: syncedUsers }, { silent: true, source: 'Password Hash Upgrade' });
                }
              }
              console.log('[Cloud DB] Successfully loaded fresh data from PostgreSQL Cloud DB');
              setDbStatus(prev => ({
                ...prev,
                connected: true,
                configured: true,
                checking: false,
              }));

              if (hasPendingLocalChanges) {
                console.log('[Auto-Sync]: Found locally pending changes. Merged them with cloud records and queued a full sync.');
                void pushAllDataToCloud({
                  users: syncedUsers,
                  members: syncedMembers,
                  meetings: syncedMeetings,
                  resolutions: syncedResolutions,
                  financialTransactions: syncedTransactions,
                  announcements: syncedAnnouncements,
                  products: syncedProducts,
                  activities: syncedActivities,
                  achievements: syncedAchievements,
                  funds: syncedFunds,
                  inventory: syncedInventory,
                  membershipPayments: syncedMembershipPayments,
                  membershipYearSnapshots: syncedMembershipYearSnapshots,
                  livestockIgp: syncedLivestockIgp,
                  systemLogs: activeLogs,
                  deletedIds: bootDeletedIds
                }, { silent: true, source: 'Boot Sync' });
              }
            } else if (res?.offlineMode) {
              console.log('[Cloud DB] Running in offline / local-first storage mode.');
            }
          })
          .catch(err => console.log('[Cloud DB Offline / Unreachable]: using local state', err));
      } catch (e) {
        console.error('Error reading encrypted local storage: ', e);
        // Fallback
        setMembers(INITIAL_MEMBERS);
        setMeetings(INITIAL_MEETINGS);
        setResolutions(INITIAL_RESOLUTIONS);
        setTransactions(INITIAL_TRANSACTIONS);
        setAnnouncements(INITIAL_ANNOUNCEMENTS);
        setLivestockIgp(INITIAL_LIVESTOCK_IGP);
        setAchievements([]);
        setFunds(INITIAL_FUNDS);
        setInventory([]);
        syncQueueRef.current = [];
        setSyncQueue([]);
        setLogs(INITIAL_LOGS);
        setUsers([]);
      }
    };
    void loadLocalData();
    return () => { cancelled = true; };
  }, []);

  // Save changes helper with automatic security sanitization
  const updateStorage = async (key: string, data: any) => {
    try {
      if (key === 'bafa_users' && Array.isArray(data)) {
        const sanitized = data.map((u: any) => {
          const copy = { ...u };
          if (copy.password) {
            copy.passwordHash = copy.passwordHash?.startsWith('$2') ? copy.passwordHash : hashPolicyPassword(copy.password);
            copy.passwordChangedAt = copy.passwordChangedAt || new Date(0).toISOString();
            copy.passwordHistory = copy.passwordHistory || [];
            copy.mustChangePassword = true;
            delete copy.password;
          }
          const { password: _password, passwordHash: _passwordHash, passwordHistory: _passwordHistory, ...safeUser } = copy;
          return safeUser;
        });
        await setSecureItem(key, sanitized);
        return;
      }
      if (key === 'bafa_current_user' && data && typeof data === 'object') {
        const writeEpoch = authEpochRef.current;
        const { password: _password, passwordHash: _passwordHash, passwordHistory: _passwordHistory, ...copy } = data;
        await setSecureItem(key, copy);
        if (authEpochRef.current !== writeEpoch) {
          removeSecureItem('bafa_current_user');
        }
        return;
      }
      await setSecureItem(key, data);
    } catch (error) {
      console.error(`Unable to encrypt local storage item ${key}:`, error);
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        showToastMessage('Puno na ang local browser storage. Palihug gamit og mas gamay nga hulagway o limpyohi ang cache.', 'warning');
      }
    }
  };

  const showToastMessage = (message: string, type: 'success' | 'warning' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  const refreshDatabaseConfiguration = async (): Promise<boolean | null> => {
    if (dbStatus.configured) return true;
    if (!navigator.onLine) return null;

    try {
      const response = await fetch('/api/db/status');
      if (!response.ok) return null;
      const status = await response.json();
      const configured = Boolean(status.configured);
      setDbStatus(previous => ({
        ...previous,
        configured,
        connected: Boolean(status.connected),
        // `hasPresident` is only known from a live database query; an offline or
        // degraded response must not overwrite it, or the login screen starts
        // offering "First-Time Setup" again.
        hasPresident: typeof status.hasPresident === 'boolean' ? status.hasPresident : previous.hasPresident,
        storageMode: status.storageMode,
        provider: status.provider,
        message: status.message,
        error: status.error,
        timestamp: status.timestamp || new Date().toISOString(),
        checking: false
      }));
      return configured;
    } catch (error) {
      console.warn('[Database Status] Unable to confirm database configuration.', error);
      return null;
    }
  };

  const handleSessionExpired = () => {
    authEpochRef.current += 1;
    sessionRefreshAbortRef.current?.abort();
    sessionRefreshAbortRef.current = null;
    setCurrentUser(null);
    removeSecureItem('bafa_current_user');
    setGuestMode(false);
    void fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store'
    }).catch(() => undefined);
    showToastMessage('Your session expired. Please sign in again. Your saved local changes are preserved.', 'warning');
  };

  const getOfficerName = (role: OfficerRole) => {
    if (currentUser && currentUser.role === role) return currentUser.name;
    const matchedUser = users.find(u => u.role === role);
    if (matchedUser) return matchedUser.name;
    return `AFA ${role.replace('_', ' ')}`;
  };

  // Deletion persistence tracking for PostgreSQL / Supabase
  const getStoredDeletedIds = (queue: SyncQueueItem[] = syncQueueRef.current): StoredDeletedIds => {
    const result: StoredDeletedIds = {};
    (Object.keys(deletedIdsRef.current) as Array<keyof StoredDeletedIds>).forEach(key => {
      const ids = deletedIdsRef.current[key];
      if (Array.isArray(ids)) result[key] = [...ids];
    });
    for (const item of queue) {
      if (item.action !== 'delete' || !item.payload?.id) continue;
      const id = item.payload.id;
      const entity = (item.entityType || '').toLowerCase();
      const keyByEntity: Record<string, keyof StoredDeletedIds> = {
        member: 'members', user: 'users', officer: 'users', meeting: 'meetings',
        resolution: 'resolutions', transaction: 'financialTransactions',
        financialtransaction: 'financialTransactions', announcement: 'announcements',
        product: 'products', activity: 'activities', achievement: 'achievements', fund: 'funds', inventory: 'inventory'
      };
      const key = keyByEntity[entity];
      if (key) result[key] = Array.from(new Set([...(result[key] || []), id]));
    }
    if (result.financialTransactions) result.transactions = result.financialTransactions;
    return result;
  };

  const storeDeletedId = (entity: keyof StoredDeletedIds, id: string): StoredDeletedIds => {
    const current = getStoredDeletedIds();
    current[entity] = Array.from(new Set([...(current[entity] || []), id]));
    if (entity === 'financialTransactions') {
      current.transactions = Array.from(new Set([...(current.transactions || []), id]));
    } else if (entity === 'transactions') {
      current.financialTransactions = Array.from(new Set([...(current.financialTransactions || []), id]));
    }
    deletedIdsRef.current = current;
    void updateStorage('bafa_deleted_ids', current);
    setHasPendingCloudSync(true);
    return current;
  };

  const clearStoredDeletedIds = (syncedIds: StoredDeletedIds) => {
    const remaining: StoredDeletedIds = {};
    (Object.keys(deletedIdsRef.current) as Array<keyof StoredDeletedIds>).forEach(key => {
      const current = deletedIdsRef.current[key] || [];
      const synced = new Set(syncedIds[key] || []);
      const unsynced = current.filter(id => !synced.has(id));
      if (unsynced.length > 0) remaining[key] = unsynced;
    });
    deletedIdsRef.current = remaining;
    void updateStorage('bafa_deleted_ids', remaining);
  };

  const hasPendingDeletions = (): boolean => {
    const ids = getStoredDeletedIds();
    return Object.values(ids).some(arr => Array.isArray(arr) && arr.length > 0);
  };

  /**
   * Immediately and permanently removes an item from PostgreSQL Cloud Database,
   * falling back to offline deletion tracking if network is unavailable.
   */
  const deleteFromDatabase = async (entity: string, idOrIds: string | string[]): Promise<boolean> => {
    const ids = Array.isArray(idOrIds) ? idOrIds.filter(Boolean) : [idOrIds].filter(Boolean);
    if (ids.length === 0) return true;

    // Track locally in bafa_deleted_ids so the delete is guaranteed even if offline
    const entityKeyMap: Record<string, keyof StoredDeletedIds> = {
      user: 'users',
      users: 'users',
      officer: 'users',
      officers: 'users',
      member: 'members',
      members: 'members',
      meeting: 'meetings',
      meetings: 'meetings',
      resolution: 'resolutions',
      resolutions: 'resolutions',
      transaction: 'financialTransactions',
      transactions: 'financialTransactions',
      financialTransaction: 'financialTransactions',
      financialTransactions: 'financialTransactions',
      announcement: 'announcements',
      announcements: 'announcements',
      product: 'products',
      products: 'products',
      activity: 'activities',
      activities: 'activities',
      fund: 'funds',
      funds: 'funds',
      inventory: 'inventory',
      achievement: 'achievements',
      achievements: 'achievements',
    };
    const mappedKey = entityKeyMap[entity] || (entity as keyof StoredDeletedIds);
    ids.forEach(id => storeDeletedId(mappedKey, id));

    if (!navigator.onLine) {
      console.log(`[Offline Delete Queue]: Queued ${entity} (${ids.join(', ')}) for deletion on connection`);
      return false;
    }

    try {
      let isSuccess = false;
      const res = await fetch('/api/db/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, ids })
      }).catch(() => null);

      if (res && res.ok) {
        try {
          const data = await res.json();
          if (data?.success) {
            console.log(`[Cloud DB Delete]: Successfully removed ${entity} (${ids.join(', ')}) directly from database`);
            isSuccess = true;
          }
        } catch { }
      }

      // If /api/db/delete failed or returned 404 (common on edge/Vercel before redeployment), fallback to /api/sync/push
      if (!isSuccess) {
        console.log(`[Cloud DB Delete Fallback]: Dispatching deletion to /api/sync/push for ${entity}...`);
        const pushRes = await fetch('/api/sync/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deleteItem: { entity, id: ids[0] },
            deletedIds: { [mappedKey]: ids }
          })
        }).catch(() => null);

        if (pushRes && pushRes.ok) {
          try {
            const pushData = await pushRes.json();
            if (pushData?.success) {
              console.log(`[Cloud DB Delete Fallback]: Successfully processed deletion via /api/sync/push for ${entity}`);
              isSuccess = true;
            }
          } catch { }
        }
      }

      return isSuccess;
    } catch (err: any) {
      console.warn(`[Cloud DB Delete Network Error]: Stored in pending deletion queue.`, err?.message || err);
      return false;
    }
  };

  const logAction = (action: string, details: string, syncStatus: 'synced' | 'pending' = 'synced', overrideLogs?: SystemLog[]) => {
    const rawNewLog: SystemLog = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: getOfficerName(currentRole),
      role: currentRole,
      action,
      details,
      syncStatus,
      hash: '',
      previousHash: ''
    };
    const currentLogs = overrideLogs || logs;
    const updatedLogs = buildAuditChain([rawNewLog, ...currentLogs]);
    setLogs(updatedLogs);
    updateStorage('bafa_logs', updatedLogs);
    return updatedLogs[0];
  };

  // Sync Queue handler
  const addToSyncQueue = (
    action: 'create' | 'update' | 'delete',
    entityType: 'user' | 'officer' | 'member' | 'meeting' | 'resolution' | 'transaction' | 'announcement' | 'livestock_expense' | 'livestock_sale' | 'livestock_harvest' | 'product' | 'activity' | string,
    payload: any
  ) => {
    const queueItem: SyncQueueItem = {
      id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      action,
      entityType,
      payload
    };
    const updatedQueue = [...syncQueueRef.current, queueItem];
    syncQueueRef.current = updatedQueue;
    setSyncQueue(updatedQueue);
    updateStorage('bafa_sync_queue', updatedQueue);
    setHasPendingCloudSync(true);

    // Also record a pending log
    logAction(
      `Queued Offline: ${action.toUpperCase()} ${entityType}`,
      `Saved offline change for ${action} ${entityType}. Auto-syncs to database on connection.`,
      'pending'
    );
    showToastMessage('Saved offline! Will automatically sync to database without needing to press any button.', 'warning');
  };

  // Central Cloud Synchronization Engine:
  // Pushes all current records and contributions to PostgreSQL/Supabase,
  // and upon successful persistence, immediately clears all locally stored pending queues.
  const pushAllDataToCloud = async (
    overrides?: {
      users?: User[];
      members?: Member[];
      meetings?: Meeting[];
      resolutions?: Resolution[];
      financialTransactions?: FinancialTransaction[];
      announcements?: Announcement[];
      products?: Product[];
      activities?: AssociationActivity[];
      achievements?: AssociationAchievement[];
      livestockIgp?: LivestockIgpState;
      eggHarvests?: EggHarvestLog[];
      funds?: OrganizationFund[];
      inventory?: InventoryItem[];
      membershipPayments?: MembershipPayment[];
      membershipYearSnapshots?: MembershipYearSnapshot[];
      systemLogs?: SystemLog[];
      deletedIds?: StoredDeletedIds;
      roleUpdate?: { userId: string; role: OfficerRole | 'Member' };
      presidentApprovalOnly?: boolean;
    },
    options?: { silent?: boolean; source?: string; scope?: 'eggHarvests' | 'roleUpdate' | 'presidentApproval' | 'auditorReview' }
  ): Promise<boolean> => {
    const scopedWrite = options?.scope === 'eggHarvests' || options?.scope === 'roleUpdate' || options?.scope === 'presidentApproval' || options?.scope === 'auditorReview';
    // A push that carries an explicit entity override is a PARTIAL write and must
    // stay that way. Filling the untouched entities from the app snapshot made a
    // Secretary's member save ship `financialTransactions`/`funds`/`livestockIgp`
    // too, and `/api/sync/push` rejects a non-Treasurer for those fields with a
    // 403 that discards the whole request - the member was never stored. See
    // `buildSyncPayload`, which owns that decision.
    const partialWrite = !scopedWrite && overrides !== undefined && Object.keys(overrides).length > 0;
    // PRECONDITION: `overrides` must never be captured loosely. Every push that
    // piggybacks an action ("Auto-Sync while pushing", the sync-queue flush) runs
    // AFTER this function returned, so a retry re-reads the caller's `overrides`
    // closure and would repeat a stale write (e.g. re-insert a deleted member).
    const tracksFullSnapshot = !scopedWrite;
    // Snapshot of the override taken at dispatch time; isTransient re-reads the
    // caller's variable, so only trust it when it still matches this snapshot.
    const overridesAtDispatch = overrides;
    const isTransient = () => overrides !== overridesAtDispatch;
    // Mirrors the server guard in `src/api/push.ts`: only these roles own the
    // ledger, so only they may put financial entities in a payload.
    const senderRole = String(currentUser?.role || '').trim().toLowerCase().replace(/\s+/g, '_');
    const canWriteFinancials = senderRole === 'treasurer' || senderRole === 'assistant_treasurer';
    const markFullSyncPending = async () => {
      if (!tracksFullSnapshot) return;
      setHasPendingCloudSync(true);
      await updateStorage('bafa_pending_cloud_sync', true);
    };

    if (!navigator.onLine) {
      await markFullSyncPending();
      return false;
    }
    if (await refreshDatabaseConfiguration() !== true) {
      await markFullSyncPending();
      return false;
    }
    if (isSyncingRef.current) {
      await markFullSyncPending();
      console.log('[Auto-Sync]: Synchronization already in-flight; queueing this update.');
      return new Promise((resolve) => {
        pendingSyncsRef.current.push({
          run: () => pushAllDataToCloud(overrides, options),
          resolve
        });
      });
    }

    isSyncingRef.current = true;
    setIsSyncing(true);
    const queuedIdsAtStart = new Set(syncQueueRef.current.map(item => item.id));
    const pendingLogIdsAtStart = new Set(logs.filter(log => log.syncStatus === 'pending').map(log => log.id));

    try {
      await markFullSyncPending();
      // A retried transient action (see `overridesAtDispatch`) already wrote its
      // entity through the full-sync path this retry waits on; re-sending the
      // captured override would clobber anything saved in the meantime.
      if (isTransient()) {
        console.log('[Auto-Sync]: Retried action already covered by the full sync; skipping the repeat write.');
        return true;
      }
      const currentDeletedIds = overrides?.deletedIds || getStoredDeletedIds();
      // `appDataRef` is only refreshed by a `useEffect`, i.e. after a render. A
      // push issued in the same tick as `setMembers(saveMembers(...))` sees the
      // PREVIOUS arrays there, so a full snapshot would omit the record that was
      // just created. When the caller supplies overrides, build the payload from
      // THOSE - they are the live values - and use the ref only as a fallback.
      const overrideHasEntries = overrides !== undefined
        && Object.keys(overrides).some(key => (overrides as Record<string, unknown>)[key] !== undefined);
      const snap = overrideHasEntries
        ? {
          ...appDataRef.current,
          users: overrides?.users ?? appDataRef.current.users,
          members: overrides?.members ?? appDataRef.current.members,
          meetings: overrides?.meetings ?? appDataRef.current.meetings,
          resolutions: overrides?.resolutions ?? appDataRef.current.resolutions,
          transactions: overrides?.financialTransactions ?? appDataRef.current.transactions,
          announcements: overrides?.announcements ?? appDataRef.current.announcements,
          products: overrides?.products ?? appDataRef.current.products,
          activities: overrides?.activities ?? appDataRef.current.activities,
          achievements: overrides?.achievements ?? appDataRef.current.achievements,
          livestockIgp: overrides?.livestockIgp ?? appDataRef.current.livestockIgp,
          funds: overrides?.funds ?? appDataRef.current.funds,
          inventory: overrides?.inventory ?? appDataRef.current.inventory,
          membershipPayments: overrides?.membershipPayments ?? appDataRef.current.membershipPayments,
          membershipYearSnapshots: overrides?.membershipYearSnapshots ?? appDataRef.current.membershipYearSnapshots,
          logs: overrides?.systemLogs ?? appDataRef.current.logs
        }
        : appDataRef.current;
      const payload = buildSyncPayload({
        overrides,
        options,
        snapshot: snap,
        deletedIds: currentDeletedIds,
        canWriteFinancials
      });

      const res = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });

      if (res.status === 401) {
        handleSessionExpired();
        return false;
      }
      const result = await res.json();
      if (res.ok && result?.success && !result?.offlineMode) {
        if (!tracksFullSnapshot) {
          // Scoped pushes (auditorReview / presidentApproval / eggHarvests / roleUpdate)
          // still represent a completed write. Recompute the pending flag from the
          // real sources instead of leaving it stuck at `true` forever.
          const stillPending = syncQueueRef.current.length > 0 || hasPendingDeletions();
          setHasPendingCloudSync(stillPending);
          await updateStorage('bafa_pending_cloud_sync', stillPending);
        } else if (partialWrite) {
          // A partial write only covered its own entities. The queue and the
          // pending-deletion list are unknown to this request, so treat them as
          // flushed ONLY when the delete list went along with it - otherwise the
          // leftover deletions stay queued and the caller's snapshot stays
          // `pending`, which is what re-triggers the full sync that clears them.
          const sentDeletions = Object.values(currentDeletedIds).some(ids => Array.isArray(ids) && ids.length > 0);
          const remainingQueue = sentDeletions
            ? syncQueueRef.current.filter(item => !queuedIdsAtStart.has(item.id))
            : syncQueueRef.current;
          syncQueueRef.current = remainingQueue;
          setSyncQueue(remainingQueue);
          void updateStorage('bafa_sync_queue', remainingQueue);
          if (sentDeletions) clearStoredDeletedIds(currentDeletedIds);
          const pending = remainingQueue.length > 0 || hasPendingDeletions();
          setHasPendingCloudSync(pending);
          await updateStorage('bafa_pending_cloud_sync', pending);
        } else {
          const remainingQueue = syncQueueRef.current.filter(item => !queuedIdsAtStart.has(item.id));
          syncQueueRef.current = remainingQueue;
          setSyncQueue(remainingQueue);
          void updateStorage('bafa_sync_queue', remainingQueue);
          clearStoredDeletedIds(currentDeletedIds);

          setLogs(prev => {
            const updated = prev.map(log =>
              pendingLogIdsAtStart.has(log.id) && log.syncStatus === 'pending'
                ? { ...log, syncStatus: 'synced' as const }
                : log
            );
            updateStorage('bafa_logs', updated);
            return updated;
          });
          const pending = remainingQueue.length > 0;
          setHasPendingCloudSync(pending);
          await updateStorage('bafa_pending_cloud_sync', pending);
        }

        // Refresh database row stats and status
        if (!options?.silent) {
          checkDatabaseConnection();
        }

        if (!options?.silent) {
          const prefix = options?.source ? `[${options.source}] ` : '';
          showToastMessage(`${prefix}Offline changes automatically synced to database!`, 'success');
        }
        return true;
      }
      if (!res.ok) {
        console.warn(`[Cloud DB Sync Rejected] ${res.status}: ${result?.message || 'Unable to sync state.'}`);
        if (options?.scope === 'eggHarvests') {
          showToastMessage(result?.message || 'Egg harvest could not be synced. It remains saved locally.', 'error');
        }
      }
      return false;
    } catch (err: any) {
      console.warn('[Cloud DB Sync Warning]:', err?.message || err);
      return false;
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      const nextSync = pendingSyncsRef.current.shift();
      if (nextSync) {
        void nextSync.run().then(nextSync.resolve).catch((error) => {
          console.error('[Auto-Sync]: Queued update failed unexpectedly.', error);
          nextSync.resolve(false);
        });
      }
    }
  };

  // Flush Queue / Synchronize
  const handleSynchronize = async () => {
    if (!isOnline || isSyncing) return;
    showToastMessage('Syncing all local contributions & records with PostgreSQL Cloud DB...', 'info');

    try {
      const success = await pushAllDataToCloud(undefined, { silent: false, source: 'Sync' });
      if (!success) {
        showToastMessage('Could not reach cloud database. Changes remain safely stored locally.', 'error');
      }
    } catch (err) {
      console.error('Sync error:', err);
      showToastMessage('Failed to reach PostgreSQL server. Changes stored locally.', 'error');
    }
  };

  // Enforce Zero Residual Storage by clearing local browser cache once cloud database is active
  const handleClearLocalCache = () => {
    if (!dbStatus.connected) {
      showToastMessage('Cannot purge local browser cache while database is disconnected! Connect to Supabase first to prevent data loss.', 'error');
      return;
    }
    setShowClearCacheConfirmModal(true);
  };

  const executeClearLocalCache = () => {
    setShowClearCacheConfirmModal(false);
    clearSecureItems(['bafa_members', 'bafa_meetings', 'bafa_resolutions', 'bafa_transactions', 'bafa_announcements', 'bafa_products', 'bafa_activities', 'bafa_achievements', 'bafa_funds', 'bafa_inventory', 'bafa_delegation_requests', 'bafa_hog_raising', 'bafa_logs', 'bafa_sync_queue', 'bafa_deleted_ids', 'bafa_pending_cloud_sync']);
    syncQueueRef.current = [];
    deletedIdsRef.current = {};
    setSyncQueue([]);
    setHasPendingCloudSync(false);
    showToastMessage('Local browser cache cleared! Operating in Zero-Residual Cloud Database mode.', 'success');
  };

  const handleClearQueue = () => {
    syncQueueRef.current = [];
    setSyncQueue([]);
    void updateStorage('bafa_sync_queue', []);
    showToastMessage('Pending queue cleared. Confidential data purged from local cache.', 'info');
  };

  const handleRemoveQueueItem = (id: string) => {
    const updated = syncQueueRef.current.filter(item => item.id !== id);
    syncQueueRef.current = updated;
    setSyncQueue(updated);
    void updateStorage('bafa_sync_queue', updated);
    showToastMessage('Removed pending change from queue.', 'warning');
  };

  // Network connectivity listener and auto-synchronization:
  // Automatically detects internet connection recovery or offline queue presence,
  // syncs all offline changes directly to the database without requiring officers to click any button.
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      checkDatabaseConnection();
      console.log('[Auto-Sync]: Connection online. Syncing all offline changes to database...');
      pushAllDataToCloud(undefined, { silent: false, source: 'Auto-Sync (Reconnected)' });
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleWindowFocus = () => {
      if (navigator.onLine && !isSyncingRef.current && (syncQueueRef.current.length > 0 || hasPendingDeletions())) {
        console.log('[Auto-Sync]: Window focused with pending items. Triggering auto-sync...');
        pushAllDataToCloud(undefined, { silent: true, source: 'Auto-Sync (Focus)' });
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleWindowFocus);

    // Fast reactive sync: If online and there are pending items or deletions, trigger auto-sync after ultra-fast debounce.
    // Reads the ref (not the closed-over state) so it stays correct without re-running this effect.
    let reactiveTimer: any = null;
    if (isOnline && (syncQueueRef.current.length > 0 || hasPendingDeletions())) {
      reactiveTimer = setTimeout(() => {
        if (isSyncingRef.current) return;
        console.log('[Auto-Sync Reactive]: Detected pending queue while online. Automatically syncing to database...');
        pushAllDataToCloud(undefined, { silent: true, source: 'Auto-Sync (Reactive)' });
      }, 150);
    }

    // Periodic auto-sync heartbeat: ensures officers never have to push a button.
    // Only fires when there is real unsynced work, and never while a push is in flight.
    const intervalId = setInterval(() => {
      if (!currentUser || !navigator.onLine || isSyncingRef.current) return;
      const hasWork = syncQueueRef.current.length > 0
        || hasPendingDeletions()
        || logs.some(l => l.syncStatus === 'pending');
      if (hasWork) {
        console.log('[Auto-Sync Heartbeat]: Automatically synchronizing pending items to database...');
        pushAllDataToCloud(undefined, { silent: true, source: 'Auto-Sync (Heartbeat)' });
      }
    }, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleWindowFocus);
      if (reactiveTimer) clearTimeout(reactiveTimer);
      clearInterval(intervalId);
    };
    // Intentionally keyed on identity/connectivity only. Including `hasPendingCloudSync`
    // or `syncQueue.length` here rebuilt the interval on every flag flip, which
    // re-armed the reactive timer and kept the UI in a permanent "Synchronizing" state.
  }, [isOnline, currentUser?.id]);

  // Keep the server session alive while the user is active. The server refreshes
  // the signed cookie only when the current session is still valid.
  useEffect(() => {
    if (!currentUser || !isOnline || !(import.meta.env.PROD || dbStatus.configured)) return;

    let cancelled = false;

    const refreshSession = async () => {
      const requestEpoch = authEpochRef.current;
      sessionRefreshAbortRef.current?.abort();
      const controller = new AbortController();
      sessionRefreshAbortRef.current = controller;

      try {
        const response = await fetch('/api/auth/session', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal
        });
        if (cancelled || controller.signal.aborted || authEpochRef.current !== requestEpoch) {
          return;
        }
        if (response.status === 401) {
          handleSessionExpired();
          return;
        }
        if (!response.ok) {
          console.warn(`[Auth Session] Refresh failed with status ${response.status}.`);
          return;
        }

        const result = await response.json();
        if (cancelled || controller.signal.aborted || authEpochRef.current !== requestEpoch) {
          return;
        }
        if (!result?.authenticated || !result.user) {
          handleSessionExpired();
          return;
        }

        const authenticatedUser = result.user as User;
        setCurrentUser(authenticatedUser);
        if (authenticatedUser.role !== 'Member') setCurrentRole(authenticatedUser.role as OfficerRole);
        setUsers(previous => [authenticatedUser, ...previous.filter(user => user.id !== authenticatedUser.id)]);
        updateStorage('bafa_current_user', authenticatedUser);
      } catch (error: any) {
        if (error?.name === 'AbortError' || cancelled || authEpochRef.current !== requestEpoch) {
          return;
        }
        console.warn('[Auth Session] Could not refresh session while online.', error);
      } finally {
        if (sessionRefreshAbortRef.current === controller) {
          sessionRefreshAbortRef.current = null;
        }
      }
    };

    const intervalId = window.setInterval(() => {
      if (navigator.onLine) void refreshSession();
    }, 15 * 60 * 1000);
    const handleFocus = () => {
      if (navigator.onLine) void refreshSession();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      sessionRefreshAbortRef.current?.abort();
      sessionRefreshAbortRef.current = null;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentUser?.id, isOnline, dbStatus.configured]);

  // SECRETARY ACTION HANDLERS
  const provisionServerAccount = async (account: {
    id: string;
    username: string;
    password: string;
    name: string;
    role: string;
  }) => {
    if (!import.meta.env.PROD && !dbStatus.configured) return { status: 'local' as const };
    if (!isOnline) return { status: 'unavailable' as const, message: 'The server is offline.' };

    try {
      const response = await fetch('/api/auth/accounts/provision', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(account)
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        const message = result?.message || 'Account provisioning was rejected.';
        return response.status >= 500
          ? { status: 'unavailable' as const, message }
          : { status: 'rejected' as const, message };
      }
      return { status: 'created' as const, user: result.user };
    } catch {
      return { status: 'unavailable' as const, message: 'The server could not be reached.' };
    }
  };

  const handleAddMember = async (
    memberData: Omit<Member, 'id' | 'joinedDate'>,
    loginCredentials?: { username: string; initialPassword?: string }
  ): Promise<{ saved: boolean; accountCreated: boolean }> => {
    if (loginCredentials?.username.trim() && loginCredentials.initialPassword) {
      const policyError = validatePasswordPolicy(loginCredentials.initialPassword, loginCredentials.username, 'Member');
      if (policyError) {
        showToastMessage(policyError, 'error');
        return { saved: false, accountCreated: false };
      }
    }
    const newId = `member-${Date.now()}`;
    const newMember: Member = {
      ...memberData,
      id: newId,
      joinedDate: new Date().toISOString().split('T')[0]
    };
    let updatedUsers = users;
    let accountCreated = false;
    let profileOnlyReason = '';

    // If login credentials provided by the Secretary, create authenticated User account
    if (loginCredentials && loginCredentials.username.trim()) {
      const cleanUsername = loginCredentials.username.trim().toLowerCase();
      const initialPassword = loginCredentials.initialPassword?.trim() || generateInitialPassword(cleanUsername, 'Member');
      const provision = await provisionServerAccount({
        id: newId,
        username: cleanUsername,
        password: initialPassword,
        name: newMember.name,
        role: 'Member'
      });
      if (provision.status === 'rejected') {
        showToastMessage(provision.message, 'error');
        return { saved: false, accountCreated: false };
      }
      accountCreated = provision.status === 'created' || provision.status === 'local';
      if (provision.status === 'unavailable') {
        profileOnlyReason = provision.message;
      }
      if (accountCreated) {
        const memberCredentialHash = hashPolicyPassword(initialPassword);
        const credentialChangedAt = new Date().toISOString();
        const newMemberUser: User = {
          id: newId,
          username: cleanUsername,
          passwordHash: memberCredentialHash,
          passwordHistory: [],
          passwordChangedAt: credentialChangedAt,
          mustChangePassword: false,
          name: newMember.name,
          role: 'Member',
          isApproved: true,
          memberIdNumber: newMember.memberIdNumber,
          rsbsaNumber: newMember.rsbsaNumber,
          isRsbsaRegistered: newMember.isRsbsaRegistered,
          farmLocation: newMember.farmLocation,
          primaryCrops: newMember.primaryCrops,
          contactNumber: newMember.contactNumber,
          joinedDate: newMember.joinedDate,
          status: newMember.status,
          affiliations: newMember.affiliations
        };

        updatedUsers = [newMemberUser, ...users.filter(u => u.username.toLowerCase() !== cleanUsername && u.id !== newId)];
        logAction('Created Member Portal Login', `Secretary enrolled ${newMember.name} and issued portal login: ${cleanUsername}`);
      }
    }

    const updated = [newMember, ...members];
    setMembers(updated);
    updateStorage('bafa_members', updated);
    if (accountCreated) {
      setUsers(updatedUsers);
      updateStorage('bafa_users', updatedUsers);
    }

    if (isOnline) {
      logAction('Registered Farmer', `Registered new member: ${newMember.name} from ${newMember.farmLocation}`);
      showToastMessage(
        accountCreated
          ? `Registered ${newMember.name} & created portal login (${loginCredentials?.username})!`
          : loginCredentials
            ? `Registered ${newMember.name} without portal login. Set up credentials when the server is available.${profileOnlyReason ? ` ${profileOnlyReason}` : ''}`
            : `Registered ${newMember.name} successfully!`,
        loginCredentials && !accountCreated ? 'warning' : 'success'
      );
      pushAllDataToCloud({ members: updated, users: updatedUsers }, { silent: true });
    } else {
      addToSyncQueue('create', 'member', newMember);
      showToastMessage(
        loginCredentials
          ? `Registered ${newMember.name} offline without portal login. Set up credentials when connected.`
          : `Registered ${newMember.name} offline. Ready to sync when connected.`,
        'warning'
      );
    }
    return { saved: true, accountCreated };
  };

  const handleUpdateMember = (updatedMember: Member) => {
    const updatedMembers = members.map(m => m.id === updatedMember.id ? updatedMember : m);
    setMembers(updatedMembers);
    updateStorage('bafa_members', updatedMembers);

    // Also update linked user profile if exists
    const updatedUsers = users.map(u => {
      if (u.id === updatedMember.id || (updatedMember.memberIdNumber && u.memberIdNumber === updatedMember.memberIdNumber) || u.name.toLowerCase() === updatedMember.name.toLowerCase()) {
        return {
          ...u,
          name: updatedMember.name,
          memberIdNumber: updatedMember.memberIdNumber,
          rsbsaNumber: updatedMember.rsbsaNumber,
          isRsbsaRegistered: updatedMember.isRsbsaRegistered,
          farmLocation: updatedMember.farmLocation,
          primaryCrops: updatedMember.primaryCrops,
          contactNumber: updatedMember.contactNumber,
          status: updatedMember.status,
          affiliations: updatedMember.affiliations
        };
      }
      return u;
    });
    setUsers(updatedUsers);
    updateStorage('bafa_users', updatedUsers);

    if (isOnline) {
      logAction('Updated Farmer Record', `Secretary updated details & IDs for: ${updatedMember.name}`);
      showToastMessage(`Updated ${updatedMember.name}'s information and affiliations!`, 'success');
      pushAllDataToCloud({ members: updatedMembers, users: updatedUsers }, { silent: true, source: 'Member Updated' });
    } else {
      addToSyncQueue('update', 'member', updatedMember);
      showToastMessage(`Updated ${updatedMember.name} offline. Ready to sync when connected.`, 'warning');
    }
  };

  // Secretary sets or resets portal credentials for an enrolled member
  const handleManageMemberLogin = async (memberId: string, username: string, initialPassword: string): Promise<boolean> => {
    const member = members.find(m => m.id === memberId);
    if (!member) return false;
    const policyError = validatePasswordPolicy(initialPassword, username, 'Member');
    if (policyError) {
      showToastMessage(policyError, 'error');
      return false;
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = initialPassword.trim();

    const existingIndex = users.findIndex(u => u.id === memberId || u.memberIdNumber === member.memberIdNumber);
    const existingUser = existingIndex >= 0 ? users[existingIndex] : undefined;
    if (users.some(user => user.id !== existingUser?.id && user.username.toLowerCase() === cleanUsername)) {
      showToastMessage('That username is already in use.', 'error');
      return false;
    }
    const accountId = existingUser?.id || member.id;
    const provision = await provisionServerAccount({
      id: accountId,
      username: cleanUsername,
      password: cleanPassword,
      name: member.name,
      role: 'Member'
    });
    if (provision.status === 'rejected') {
      showToastMessage(provision.message, 'error');
      return false;
    }
    if (provision.status === 'unavailable') {
      showToastMessage('Portal credentials were not changed. Connect to the server and try again.', 'warning');
      return false;
    }

    let updatedUsers: User[];
    if (existingIndex >= 0) {
      updatedUsers = users.map((u, idx) => {
        if (idx === existingIndex) {
          const { password, ...rest } = u;
          return {
            ...rest,
            username: cleanUsername,
            passwordHash: hashPolicyPassword(cleanPassword),
            passwordHistory: [...(u.passwordHistory || []), ...(u.passwordHash ? [{ hash: u.passwordHash, changedAt: u.passwordChangedAt || new Date(0).toISOString() }] : [])].slice(-5),
            passwordChangedAt: new Date().toISOString(),
            mustChangePassword: false,
            name: member.name,
            isApproved: provision.status === 'created'
              ? Boolean(provision.user?.isApproved)
              : u.isApproved,
            resetRequested: false
          };
        }
        return u;
      });
    } else {
      const newMemberUser: User = {
        id: accountId,
        username: cleanUsername,
        passwordHash: hashPolicyPassword(cleanPassword),
        passwordHistory: [],
        passwordChangedAt: new Date().toISOString(),
        mustChangePassword: false,
        name: member.name,
        role: 'Member',
        isApproved: provision.status === 'created' ? Boolean(provision.user?.isApproved) : true,
        memberIdNumber: member.memberIdNumber,
        rsbsaNumber: member.rsbsaNumber,
        isRsbsaRegistered: member.isRsbsaRegistered,
        farmLocation: member.farmLocation,
        primaryCrops: member.primaryCrops,
        contactNumber: member.contactNumber,
        joinedDate: member.joinedDate,
        status: member.status
      };
      updatedUsers = [newMemberUser, ...users];
    }

    setUsers(updatedUsers);
    updateStorage('bafa_users', updatedUsers);
    logAction('Managed Member Login', `Secretary set portal login for ${member.name} (Username: ${cleanUsername})`);
    showToastMessage(`Portal login for ${member.name} set! Username: ${cleanUsername}`, 'success');
    if (isOnline) {
      pushAllDataToCloud({ users: updatedUsers }, { silent: true });
    }
    return true;
  };

  const handleUpdateMemberStatus = (id: string, status: 'Active' | 'Inactive') => {
    // Re-activating by hand is not enough: the dues ledger for the current year
    // is what puts a member on the list. Tell the officer instead of leaving a
    // flag that reads "Active" while the roster still shows them unpaid.
    if (status === 'Active' && !hasPaymentForYear(membershipPayments, id, new Date().getFullYear())) {
      showToastMessage(
        `Record the ${new Date().getFullYear()} membership dues first — paying is what lists a member again.`, 'warning'
      );
      return;
    }
    const updated = members.map(m => m.id === id ? { ...m, status } : m);
    setMembers(updated);
    updateStorage('bafa_members', updated);

    const targetMember = members.find(m => m.id === id);
    const mName = targetMember ? targetMember.name : 'Unknown';

    if (isOnline) {
      logAction('Updated Farmer Status', `Changed status of ${mName} to ${status}`);
      showToastMessage(`Updated status for ${mName} to ${status}.`);
      pushAllDataToCloud({ members: updated }, { silent: true });
    } else {
      addToSyncQueue('update', 'member', { id, status, name: mName });
    }
  };

  // ANNUAL MEMBERSHIP DUES
  // The book closes every 31 December. A member is listed again only after the
  // dues for the new year are recorded here — status is derived from the ledger,
  // never hand-toggled.
  const currentMembershipYear = new Date().getFullYear();

  const handleRecordMembershipPayment = (
    input: {
      memberId: string;
      year: number;
      amount: number;
      datePaid: string;
      method: MembershipPaymentMethod;
      referenceNo?: string;
      notes?: string;
    },
    options?: { verifyImmediately?: boolean }
  ) => {
    if (!isTreasurerAuthorized(currentUser?.role)) {
      showToastMessage('Only the Treasurer or Assistant Treasurer may record membership dues.', 'error');
      return false;
    }
    const member = members.find(m => m.id === input.memberId);
    if (!member) {
      showToastMessage('Select a registered member before recording dues.', 'error');
      return false;
    }
    if (member.status === 'Inactive' && member.inactiveReason && member.inactiveReason !== UNPAID_DUES_REASON) {
      showToastMessage(`${member.name} was delisted (${member.inactiveReason}). Reinstate the member before recording dues.`, 'error');
      return false;
    }
    const year = Math.floor(Number(input.year));
    const amount = Number(input.amount);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      showToastMessage('Enter a valid membership year.', 'error');
      return false;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      showToastMessage('Enter the amount actually received.', 'error');
      return false;
    }
    if (hasPaymentForYear(membershipPayments, member.id, year)) {
      showToastMessage(`${member.name} already has a recorded payment for ${year}.`, 'warning');
      return false;
    }

    const now = new Date().toISOString();
    const newPayment: MembershipPayment = {
      id: `mp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      memberId: member.id,
      memberName: member.name,
      memberIdNumber: member.memberIdNumber,
      year,
      amount,
      datePaid: input.datePaid,
      method: input.method,
      referenceNo: input.referenceNo?.trim() || undefined,
      status: options?.verifyImmediately ? 'Verified' : 'Pending',
      recordedBy: currentUser?.name || 'Treasurer',
      recordedAt: now,
      verifiedBy: options?.verifyImmediately ? (currentUser?.name || undefined) : undefined,
      verifiedDate: options?.verifyImmediately ? now.split('T')[0] : undefined,
      notes: input.notes?.trim() || undefined
    };
    const updatedPayments = [newPayment, ...membershipPayments];
    setMembershipPayments(updatedPayments);
    updateStorage('bafa_membership_payments', updatedPayments);

    // Paying dues reinstates a member who was dropped for unpaid dues only. An
    // officer-recorded removal (resigned, expelled) keeps its own reason.
    const updatedMembers = members.map(m => m.id === member.id
      ? {
        ...m,
        status: m.inactiveReason && m.inactiveReason !== UNPAID_DUES_REASON ? m.status : 'Active' as const,
        membershipPaidThrough: getPaidThroughYear(updatedPayments, m.id),
        inactiveReason: m.inactiveReason && m.inactiveReason !== UNPAID_DUES_REASON ? m.inactiveReason : undefined
      }
      : m);
    setMembers(updatedMembers);
    updateStorage('bafa_members', updatedMembers);

    // Mirror the dues on the member's portal account so sign-in and the
    // dashboard agree with the roster.
    const linkedUserIds = new Set<string>();
    const updatedUsers = users.map(u => {
      const linked = u.id === member.id
        || (member.memberIdNumber && u.memberIdNumber === member.memberIdNumber)
        || (u.role === 'Member' && u.name.trim().toLowerCase() === member.name.trim().toLowerCase());
      if (!linked) return u;
      linkedUserIds.add(u.id);
      const keepsInactive = u.status === 'Inactive' && u.inactiveReason && u.inactiveReason !== UNPAID_DUES_REASON;
      return {
        ...u,
        status: keepsInactive ? 'Inactive' as const : 'Active' as const,
        membershipPaidThrough: getPaidThroughYear(updatedPayments, member.id),
        inactiveReason: keepsInactive ? u.inactiveReason : undefined
      };
    });
    if (linkedUserIds.size > 0) {
      setUsers(updatedUsers);
      updateStorage('bafa_users', updatedUsers);
    }

    // Dues are income in the ledger, so the fund balance and the books agree.
    const duesFund = funds.find(f => f.code.toUpperCase() === 'DUES') || funds[0];
    const label = `Membership dues ${year} - ${member.memberIdNumber || member.name}${input.referenceNo?.trim() ? ` (OR ${input.referenceNo.trim()})` : ''}`;
    if (duesFund) {
      handleAddTransaction({
        type: 'income',
        category: 'Membership Dues',
        amount,
        date: input.datePaid,
        description: label,
        purpose: `Annual membership dues for ${year}`,
        fundSource: `${duesFund.code} (${duesFund.name})`,
        recordedBy: currentUser?.name || 'Treasurer'
      });
    }

    if (isOnline) {
      logAction('Recorded Membership Dues', `${member.name} paid PHP ${amount.toLocaleString()} for membership year ${year}.`);
      pushAllDataToCloud({ membershipPayments: updatedPayments, members: updatedMembers, users: updatedUsers }, { silent: true, source: 'Membership Dues Recorded' });
    } else {
      addToSyncQueue('create', 'membership_payment', newPayment);
    }
    showToastMessage(`${member.name} is now listed as a member for ${year}.`, 'success');
    return true;
  };

  const handleVoidMembershipPayment = (paymentId: string, reason: string) => {
    if (!isTreasurerAuthorized(currentUser?.role)) {
      showToastMessage('Only the Treasurer or Assistant Treasurer may void a dues receipt.', 'error');
      return;
    }
    const target = membershipPayments.find(p => p.id === paymentId);
    if (!target) return;
    const today = new Date().toISOString().split('T')[0];
    const updatedPayments = membershipPayments.map(p => p.id === paymentId
      ? { ...p, status: 'Voided' as const, voidedBy: currentUser?.name || 'Treasurer', voidedDate: today, voidReason: reason.trim() || 'Voided by officer' }
      : p);
    setMembershipPayments(updatedPayments);
    updateStorage('bafa_membership_payments', updatedPayments);

    // The member's standing follows the ledger, so re-derive it from the remaining receipts.
    const paidThrough = getPaidThroughYear(updatedPayments, target.memberId);
    const stillPaidForCurrentYear = Boolean(paidThrough && paidThrough >= currentMembershipYear);
    const updatedMembers = members.map(m => m.id === target.memberId ? {
      ...m,
      membershipPaidThrough: paidThrough,
      status: stillPaidForCurrentYear || (m.inactiveReason && m.inactiveReason !== UNPAID_DUES_REASON) ? m.status : 'Inactive' as const,
      inactiveReason: stillPaidForCurrentYear ? m.inactiveReason : UNPAID_DUES_REASON
    } : m);
    setMembers(updatedMembers);
    updateStorage('bafa_members', updatedMembers);

    if (isOnline) {
      logAction('Voided Membership Dues', `Voided the PHP ${target.amount.toLocaleString()} dues receipt of ${target.memberName} for ${target.year}: ${reason.trim() || 'No reason given'}`);
      pushAllDataToCloud({ membershipPayments: updatedPayments, members: updatedMembers }, { silent: true, source: 'Membership Dues Voided' });
    } else {
      addToSyncQueue('update', 'membership_payment', { id: paymentId, action: 'void', reason });
    }
    showToastMessage(`Dues receipt for ${target.memberName} (${target.year}) voided.`, 'warning');
  };

  const handleCloseMembershipYear = (year: number, remarks?: string) => {
    if (!isTreasurerAuthorized(currentUser?.role)) {
      showToastMessage('Only the Treasurer or Assistant Treasurer may close a membership year.', 'error');
      return;
    }
    if (!canCloseMembershipYear(membershipYearSnapshots, year)) {
      showToastMessage(`Membership year ${year} is already closed.`, 'warning');
      return;
    }
    const snapshot = buildMembershipYearSnapshot({
      year,
      members,
      payments: membershipPayments,
      duesAmount,
      closedBy: currentUser?.name || 'Treasurer',
      remarks
    });
    const updatedSnapshots = [snapshot, ...membershipYearSnapshots];
    setMembershipYearSnapshots(updatedSnapshots);
    updateStorage('bafa_membership_year_snapshots', updatedSnapshots);

    // Members who did not settle are dropped from the active roster, with the
    // reason recorded so a later payment is recognised as a renewal.
    const unpaidIds = new Set(snapshot.unpaidMemberIds);
    const updatedMembers = members.map(m => unpaidIds.has(m.id)
      ? {
        ...m,
        status: 'Inactive' as const,
        membershipPaidThrough: getPaidThroughYear(membershipPayments, m.id),
        inactiveReason: m.inactiveReason && m.inactiveReason !== UNPAID_DUES_REASON ? m.inactiveReason : UNPAID_DUES_REASON
      }
      : m);
    setMembers(updatedMembers);
    updateStorage('bafa_members', updatedMembers);

    const updatedUsers = users.map(u => {
      const member = updatedMembers.find(m =>
        m.id === u.id
        || (m.memberIdNumber && u.memberIdNumber === m.memberIdNumber)
        || (u.role === 'Member' && m.name.trim().toLowerCase() === u.name.trim().toLowerCase())
      );
      if (!member || !unpaidIds.has(member.id)) return u;
      if (u.inactiveReason && u.inactiveReason !== UNPAID_DUES_REASON) return u;
      return { ...u, status: 'Inactive' as const, inactiveReason: UNPAID_DUES_REASON, membershipPaidThrough: member.membershipPaidThrough };
    });
    if (JSON.stringify(updatedUsers) !== JSON.stringify(users)) {
      setUsers(updatedUsers);
      updateStorage('bafa_users', updatedUsers);
    }

    if (isOnline) {
      logAction(
        'Closed Membership Year',
        `Closed membership year ${year}: ${snapshot.paidMembers} of ${snapshot.totalMembers} members paid, PHP ${snapshot.totalCollected.toLocaleString()} collected. ${snapshot.unpaidMembers} member(s) delisted.`
      );
      pushAllDataToCloud({ membershipYearSnapshots: updatedSnapshots, members: updatedMembers, users: updatedUsers }, { silent: true, source: 'Membership Year Closed' });
    } else {
      addToSyncQueue('create', 'membership_year_snapshot', snapshot);
    }
    showToastMessage(`Membership year ${year} closed. ${snapshot.paidMembers} listed, ${snapshot.unpaidMembers} delisted.`, 'success');
  };

  const handleUpdateDuesAmount = (amount: number) => {
    if (!isTreasurerAuthorized(currentUser?.role)) return;
    const next = Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : DEFAULT_MEMBERSHIP_DUES;
    setDuesAmount(next);
    updateStorage('bafa_membership_dues_amount', next);
    logAction('Set Annual Dues', `Annual membership dues set to PHP ${next.toLocaleString()}.`);
  };

  const handleDeleteMember = async (id: string) => {
    const targetMember = members.find(m => m.id === id);
    const mName = targetMember ? targetMember.name : 'Farmer';

    // 1. Immediately remove from local state and storage
    const updated = members.filter(m => m.id !== id);
    setMembers(updated);
    updateStorage('bafa_members', updated);
    storeDeletedId('members', id);

    // 2. Identify linked portal user accounts by ID, memberIdNumber, or matching name
    const matchedUsers = users.filter(u =>
      u.id === id ||
      (targetMember?.memberIdNumber && u.memberIdNumber === targetMember.memberIdNumber) ||
      (targetMember?.name && u.role === 'Member' && u.name.trim().toLowerCase() === targetMember.name.trim().toLowerCase())
    );
    const matchedUserIds = matchedUsers.map(u => u.id);

    const updatedUsers = users.filter(u => !matchedUserIds.includes(u.id));
    if (matchedUserIds.length > 0) {
      setUsers(updatedUsers);
      updateStorage('bafa_users', updatedUsers);
      matchedUserIds.forEach(uid => storeDeletedId('users', uid));
    }

    // Keep appDataRef up to date immediately for immediate subsequent sync dispatches
    appDataRef.current = {
      ...appDataRef.current,
      members: updated,
      users: updatedUsers
    };

    // 3. Directly dispatch immediate database delete requests
    const deletePromises: Promise<boolean>[] = [deleteFromDatabase('member', id)];
    matchedUserIds.forEach(uid => {
      deletePromises.push(deleteFromDatabase('user', uid));
    });

    if (isOnline) {
      logAction('Deleted Farmer Registration', `Removed member registration for: ${mName}`);
      showToastMessage(`Removed ${mName} from roster. Syncing to database...`, 'warning');

      // Await direct deletes, then dispatch state push with explicit deletedIds payload
      try {
        await Promise.allSettled(deletePromises);
      } catch { }

      const allDeleted = getStoredDeletedIds();
      pushAllDataToCloud(
        {
          members: updated,
          users: updatedUsers,
          deletedIds: allDeleted
        },
        { silent: true, source: 'Member Deletion' }
      );
    } else {
      addToSyncQueue('delete', 'member', { id, name: mName });
      matchedUserIds.forEach(uid => {
        addToSyncQueue('delete', 'user', { id: uid, name: mName });
      });
      showToastMessage(`Removed ${mName} offline. Will automatically sync to database on connection.`, 'warning');
    }
  };

  const handleDeleteMeeting = (id: string) => {
    const targetMeeting = meetings.find(m => m.id === id);
    const title = targetMeeting ? targetMeeting.title : 'Assembly Record';
    const updated = meetings.filter(m => m.id !== id);
    setMeetings(updated);
    updateStorage('bafa_meetings', updated);
    storeDeletedId('meetings', id);

    // Direct and permanent removal from PostgreSQL Cloud Database
    deleteFromDatabase('meeting', id);

    logAction('Deleted Assembly Minutes', `Removed assembly record: "${title}"`);

    if (isOnline) {
      showToastMessage(`Deleted meeting "${title}". Auto-syncing to database...`, 'warning');
      pushAllDataToCloud({ meetings: updated }, { silent: true, source: 'Meeting Deletion' });
    } else {
      addToSyncQueue('delete', 'meeting', { id, title });
      showToastMessage(`Meeting deleted offline. Will automatically sync to database.`, 'warning');
    }
  };

  const handleDeleteResolution = (id: string) => {
    const targetRes = resolutions.find(r => r.id === id);
    const title = targetRes ? `${targetRes.resolutionNumber}: ${targetRes.title}` : 'Resolution';
    const updated = resolutions.filter(r => r.id !== id);
    setResolutions(updated);
    updateStorage('bafa_resolutions', updated);
    storeDeletedId('resolutions', id);

    // Direct and permanent removal from PostgreSQL Cloud Database
    deleteFromDatabase('resolution', id);

    logAction('Deleted Resolution', `Removed resolution: "${title}"`);

    if (isOnline) {
      showToastMessage(`Deleted resolution "${title}". Auto-syncing to database...`, 'warning');
      pushAllDataToCloud({ resolutions: updated }, { silent: true, source: 'Resolution Deletion' });
    } else {
      addToSyncQueue('delete', 'resolution', { id, title });
      showToastMessage(`Resolution deleted offline. Will automatically sync to database.`, 'warning');
    }
  };

  const handleDeleteTransaction = (id: string) => {
    // ADVISER RULE: Treasurers cannot delete recorded financial logs, even when a record is flagged.
    if (currentUser?.role === 'Treasurer' || currentUser?.role === 'Assistant_Treasurer') {
      showToastMessage('The Treasurer cannot delete financial logs. Please ask the President or Auditor to review the record.', 'error');
      return;
    }
    const targetTx = transactions.find(t => t.id === id);
    const desc = targetTx ? `${targetTx.description} (PHP ${targetTx.amount.toLocaleString()})` : 'Transaction';
    const updated = transactions.filter(t => t.id !== id);
    setTransactions(updated);
    updateStorage('bafa_transactions', updated);
    storeDeletedId('financialTransactions', id);

    // Direct and permanent removal from PostgreSQL Cloud Database
    deleteFromDatabase('transaction', id);

    logAction('Deleted Financial Transaction', `Removed transaction entry: "${desc}"`);

    if (isOnline) {
      showToastMessage(`Deleted transaction "${desc}". Auto-syncing to database...`, 'warning');
      pushAllDataToCloud({ financialTransactions: updated }, { silent: true, source: 'Transaction Deletion' });
    } else {
      addToSyncQueue('delete', 'transaction', { id, desc });
      showToastMessage(`Transaction deleted offline. Will automatically sync to database.`, 'warning');
    }
  };

  const handleAddMeeting = (meetingData: Omit<Meeting, 'id'>) => {
    const newMeeting: Meeting = {
      ...meetingData,
      id: `meet-${Date.now()}`,
      // Secretary drafts minutes → they await President approval before becoming official.
      minutesApprovalStatus: meetingData.minutesApprovalStatus ?? 'Pending Approval'
    };
    const updated = [newMeeting, ...meetings];
    setMeetings(updated);
    updateStorage('bafa_meetings', updated);

    if (isOnline) {
      logAction('Logged Assembly Minutes', `Compiled minutes for assembly: "${newMeeting.title}" with ${newMeeting.attendanceCount} present.`);
      showToastMessage(`Minutes for "${newMeeting.title}" have been compiled successfully!`);
      pushAllDataToCloud({ meetings: updated }, { silent: true });
    } else {
      addToSyncQueue('create', 'meeting', newMeeting);
    }
  };

  const handleUpdateMeeting = (updatedMeeting: Meeting) => {
    const updated = meetings.map(m => m.id === updatedMeeting.id ? updatedMeeting : m);
    setMeetings(updated);
    updateStorage('bafa_meetings', updated);

    if (isOnline) {
      logAction('Updated Meeting Record', `Updated details/attendance for assembly: "${updatedMeeting.title}".`);
      showToastMessage(`Meeting "${updatedMeeting.title}" has been updated.`);
      pushAllDataToCloud({ meetings: updated }, { silent: true });
    } else {
      addToSyncQueue('update', 'meeting', updatedMeeting);
    }
  };

  const handleAddResolution = (resolutionData: Omit<Resolution, 'id' | 'status'>) => {
    const newResolution: Resolution = {
      ...resolutionData,
      id: `res-${Date.now()}`,
      status: 'Pending Approval'
    };
    const updated = [newResolution, ...resolutions];
    setResolutions(updated);
    updateStorage('bafa_resolutions', updated);

    if (isOnline) {
      logAction('Drafted Association Resolution', `Drafted Resolution ${newResolution.resolutionNumber}: "${newResolution.title}"`);
      showToastMessage(`Draft Resolution ${newResolution.resolutionNumber} registered. Awaiting signature.`);
      pushAllDataToCloud({ resolutions: updated }, { silent: true });
    } else {
      addToSyncQueue('create', 'resolution', newResolution);
    }
  };

  // TREASURER & AUDITOR HANDLERS
  // ADVISER RULE: Only the Treasurer or Assistant Treasurer may record income or expenses.
  const isTreasurerAuthorized = (role: string | undefined) =>
    role === 'Treasurer' || role === 'Assistant_Treasurer';
  const handleAddTransaction = (txData: Omit<FinancialTransaction, 'id' | 'auditedStatus'>) => {
    if (!isTreasurerAuthorized(currentUser?.role)) {
      showToastMessage('Only the Treasurer or Assistant Treasurer may record income or expenses.', 'error');
      return;
    }
    const registeredFund = funds.find(fund => txData.fundSource === `${fund.code} (${fund.name})`);
    if (!registeredFund) {
      showToastMessage('Select a registered fund source before recording income or expenses.', 'error');
      return;
    }
    if (txData.type === 'expense' && txData.activityId) {
      const activity = activities.find(item => item.id === txData.activityId);
      if (!activity || !isActivityOpenForExpenses(activity)) {
        showToastMessage('This activity is closed for new expenses. Only scheduled or in-progress activities can receive new expense entries.', 'error');
        return;
      }
    }
    const { assetPurchase, ...cleanTxData } = txData;
    const newTx: FinancialTransaction = {
      ...cleanTxData,
      id: `tx-${Date.now()}`,
      auditedStatus: 'Unaudited'
    };
    const updated = [newTx, ...transactions];
    setTransactions(updated);
    updateStorage('bafa_transactions', updated);

    // If this expense is an association asset purchase, automatically create or restock
    // the linked custodial inventory record (Treasurer purchases -> Auditor inspects).
    let updatedInventory: InventoryItem[] | undefined;
    let updatedProducts: Product[] | undefined;
    let assetSummary = '';
    if (newTx.type === 'expense' && assetPurchase && assetPurchase.quantity > 0) {
      const todayStr = newTx.date || new Date().toISOString().split('T')[0];
      const addedQty = Math.max(1, Math.floor(Number(assetPurchase.quantity) || 0));
      if (assetPurchase.mode === 'existing' && assetPurchase.existingInventoryId) {
        const target = inventory.find(item => item.id === assetPurchase.existingInventoryId);
        if (target) {
          const nextQty = Math.max(0, Math.floor(Number(target.quantity) || 0)) + addedQty;
          const updatedItem: InventoryItem = {
            ...target,
            quantity: nextQty,
            purchaseTransactionId: newTx.id,
            activityId: newTx.activityId ?? target.activityId,
            meetingId: newTx.meetingId ?? target.meetingId,
            lastUpdated: todayStr
          };
          updatedInventory = inventory.map(item => (item.id === target.id ? updatedItem : item));
          assetSummary = ` (+${addedQty} ${target.unit} added to "${target.name}")`;
          if (updatedItem.catalogProductId) {
            const linkedProduct = products.find(product => product.id === updatedItem.catalogProductId);
            if (linkedProduct) {
              updatedProducts = products.map(product => product.id === linkedProduct.id
                ? {
                  ...product,
                  quantityAvailable: `${getAvailableInventoryQuantity(updatedItem)} ${updatedItem.unit} available`,
                  stockStatus: getRentalStockStatus(updatedItem),
                  dateUpdated: todayStr
                }
                : product);
              setProducts(updatedProducts);
              updateStorage('bafa_products', updatedProducts);
            }
          }
        }
      }
      if (!updatedInventory) {
        const newAsset: InventoryItem = {
          id: `inv-${Date.now() + 1}`,
          name: assetPurchase.itemName.trim(),
          assetType: assetPurchase.assetType,
          category: assetPurchase.assetType === 'rental' ? 'Rental Assets' : (assetPurchase.category || 'Office Supplies'),
          quantity: addedQty,
          damagedQuantity: 0,
          lostQuantity: 0,
          usedQuantity: 0,
          unit: assetPurchase.unit.trim() || 'pieces',
          condition: 'Good',
          location: assetPurchase.location?.trim() || undefined,
          purchaseTransactionId: newTx.id,
          activityId: newTx.activityId,
          meetingId: newTx.meetingId,
          recordedBy: newTx.recordedBy || `Treasurer (${getOfficerName('Treasurer')})`,
          dateRecorded: todayStr,
          lastUpdated: todayStr
        };
        updatedInventory = [newAsset, ...inventory];
        assetSummary = ` (Added ${addedQty} ${newAsset.unit} of "${newAsset.name}" to ${newAsset.assetType === 'rental' ? 'Rental Assets' : 'Usable Assets'})`;
      }
      setInventory(updatedInventory);
      updateStorage('bafa_inventory', updatedInventory);
    }

    // Recompute the live balance from the initial fund plus the full ledger.
    // Deriving (rather than incrementing) means the balance can never drift from
    // the transactions that produced it, and overspending shows as negative.
    let updatedFunds: OrganizationFund[] | undefined;
    if (newTx.fundSource) {
      updatedFunds = computeFundBalances(funds, updated);
      setFunds(updatedFunds);
      updateStorage('bafa_funds', updatedFunds);
    }

    if (isOnline) {
      logAction('Recorded Transaction', `Logged PHP ${newTx.amount.toLocaleString()} ${newTx.type} under "${newTx.category}"${assetSummary}`);
      showToastMessage(
        assetSummary
          ? `Expense & linked inventory updated${assetSummary}. Syncing to database...`
          : `Contribution & ledger entry recorded. Syncing to database...`,
        'info'
      );
      pushAllDataToCloud(
        {
          financialTransactions: updated,
          ...(updatedFunds ? { funds: updatedFunds } : {}),
          ...(updatedInventory ? { inventory: updatedInventory } : {}),
          ...(updatedProducts ? { products: updatedProducts } : {})
        },
        { silent: false, source: assetSummary ? 'Asset Purchase Recorded' : 'Contribution Recorded' }
      );
    } else {
      addToSyncQueue('create', 'transaction', newTx);
    }
  };

  const handleAddFund = (fundData: Omit<OrganizationFund, 'id' | 'lastUpdated'>) => {
    const newFund: OrganizationFund = {
      ...fundData,
      id: `fund-${Date.now()}`,
      lastUpdated: new Date().toISOString().split('T')[0]
    };
    // Derive the balance from the initial fund and any existing ledger entries
    // already tagged to this fund source, so the figure is accurate from day one.
    const updated = computeFundBalances([...funds, newFund], transactions);
    setFunds(updated);
    updateStorage('bafa_funds', updated);

    if (isOnline) {
      logAction('Added Fund Source', `Registered new fund account "${newFund.name}" (${newFund.code})`);
      showToastMessage(`Tinubdan sa pundo "${newFund.name}" malampusong narehistro.`, 'success');
      pushAllDataToCloud({ funds: updated }, { silent: false, source: 'Fund Source Added' });
    } else {
      addToSyncQueue('create', 'fund', newFund);
      showToastMessage(`Pundo "${newFund.name}" na-save sa offline storage.`, 'info');
    }
  };

  const handleDeleteFund = (id: string) => {
    const target = funds.find(f => f.id === id);
    const updated = funds.filter(f => f.id !== id);
    setFunds(updated);
    updateStorage('bafa_funds', updated);

    if (isOnline) {
      logAction('Removed Fund Source', `Deleted fund source "${target?.name || id}"`);
      showToastMessage(`Tinubdan sa pundo natangtang na.`, 'info');
      pushAllDataToCloud({ funds: updated }, { silent: false, source: 'Fund Source Removed' });
    } else {
      addToSyncQueue('delete', 'fund', { id });
      showToastMessage(`Pundo natangtang na sa offline storage.`, 'info');
    }
  };

  const handleAuditTransaction = (id: string, status: 'Audited' | 'Flagged', notes: string) => {
    const updated = transactions.map(t => {
      if (t.id === id) {
        return {
          ...t,
          auditedStatus: status,
          auditedBy: `Auditor (${getOfficerName('Auditor')})`,
          auditedDate: new Date().toISOString().split('T')[0],
          auditNotes: notes
        };
      }
      return t;
    });
    setTransactions(updated);
    updateStorage('bafa_transactions', updated);

    const targetTx = transactions.find(t => t.id === id);
    const txDescStr = targetTx ? `PHP ${targetTx.amount} (${targetTx.category})` : 'Transaction';

    if (isOnline) {
      logAction(
        status === 'Audited' ? 'Audited & Verified' : 'Flagged Audit Discrepancy',
        `${status === 'Audited' ? 'Verified' : 'Flagged'} ledger item: ${txDescStr}. Comments: "${notes}"`
      );
      showToastMessage(`Audit submitted: marked as ${status}.`);
      // Send only the audited record. A full snapshot would carry `funds`, which the
      // server strips for non-Treasurer roles, wiping the ledger on every audit.
      pushAllDataToCloud(
        { financialTransactions: updated.filter(t => t.id === id) },
        { silent: true, scope: 'auditorReview' }
      );
    } else {
      addToSyncQueue('update', 'transaction', { id, status, notes, desc: txDescStr });
    }
  };

  // AFA IGP HANDLERS
  const handleAddPigExpense = (expData: Omit<IgpExpense, 'id' | 'recordedBy'>) => {
    if (!funds.some(fund => expData.fundSource === `${fund.code} (${fund.name})`)) {
      showToastMessage('Select a registered budget source before recording this livestock expense.', 'error');
      return;
    }
    const officerLabel = currentUser ? `${currentUser.role.replace('_', ' ')} (${currentUser.name})` : `Treasurer (${getOfficerName('Treasurer')})`;
    const newExp: IgpExpense = {
      ...expData,
      id: `igp-exp-${Date.now()}`,
      recordedBy: officerLabel
    };
    const updatedExpenses = [newExp, ...livestockIgp.expenses];
    const updatedState: LivestockIgpState = {
      ...livestockIgp,
      expenses: updatedExpenses,
      livestockInventory: deriveIgpLivestockInventory(updatedExpenses, livestockIgp.sales || [], livestockIgp.produces?.[0])
    };
    setLivestockIgp(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    const projectLabel = expData.produce || 'AFA IGP';
    const stageLabel = expData.stage && expData.stage !== 'General' ? ` • ${expData.stage}` : '';
    // Also register in general ledger for complete co-op records!
    handleAddTransaction({
      type: 'expense',
      category: `${projectLabel} Project`,
      amount: expData.amount,
      date: expData.date,
      description: `[${projectLabel} IGP${stageLabel}] ${expData.category}${expData.quantity ? ` (${expData.quantity})` : ''}: ${expData.description}`,
      fundSource: expData.fundSource,
      recordedBy: officerLabel
    });

    if (isOnline) {
      logAction('Recorded IGP Expense', `Logged PHP ${newExp.amount.toLocaleString()} expense for ${projectLabel} ("${newExp.category}"${stageLabel})`);
      showToastMessage(`${projectLabel} expense recorded and linked to general ledger.`);
      pushAllDataToCloud({ livestockIgp: updatedState }, { silent: true, source: 'IGP Expense' });
    } else {
      addToSyncQueue('create', 'livestock_expense', newExp);
    }
  };

  const handleAddHogSale = (saleData: Omit<IgpSale, 'id' | 'recordedBy'>) => {
    if (!funds.some(fund => saleData.fundSource === `${fund.code} (${fund.name})`)) {
      showToastMessage('Select a registered deposit destination before recording this livestock income.', 'error');
      return;
    }
    const officerLabel = currentUser ? `${currentUser.role.replace('_', ' ')} (${currentUser.name})` : `Treasurer (${getOfficerName('Treasurer')})`;
    const newSale: IgpSale = {
      ...saleData,
      id: `igp-sale-${Date.now()}`,
      recordedBy: officerLabel
    };
    const updatedSales = [newSale, ...livestockIgp.sales];
    const updatedState: LivestockIgpState = {
      ...livestockIgp,
      sales: updatedSales,
      livestockInventory: deriveIgpLivestockInventory(livestockIgp.expenses || [], updatedSales, livestockIgp.produces?.[0])
    };
    setLivestockIgp(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    const projectLabel = saleData.produce || 'AFA IGP';
    const stageLabel = saleData.stage && saleData.stage !== 'General' ? ` (${saleData.stage})` : '';
    // Also register in general ledger for complete co-op records!
    handleAddTransaction({
      type: 'income',
      category: `${projectLabel} Project`,
      amount: saleData.revenue,
      date: saleData.date,
      description: `[${projectLabel} IGP] Revenue (${saleData.quantity} unit/head${stageLabel}): ${saleData.notes || `${projectLabel} sale/rental income.`}`,
      fundSource: saleData.fundSource,
      recordedBy: officerLabel
    });

    if (isOnline) {
      logAction('Recorded IGP Revenue', `Recorded PHP ${newSale.revenue.toLocaleString()} revenue for ${projectLabel}${stageLabel}`);
      showToastMessage(`${projectLabel} revenue of PHP ${newSale.revenue.toLocaleString()} recorded and linked to general ledger.`);
      pushAllDataToCloud({ livestockIgp: updatedState }, { silent: true, source: 'IGP Revenue' });
    } else {
      addToSyncQueue('create', 'livestock_sale', newSale);
    }
  };

  const handleUpdatePigExpense = (updatedExp: IgpExpense) => {
    const updatedExpenses = (livestockIgp.expenses || []).map((e) => (e.id === updatedExp.id ? updatedExp : e));
    const updatedState: LivestockIgpState = {
      ...livestockIgp,
      expenses: updatedExpenses,
      livestockInventory: deriveIgpLivestockInventory(updatedExpenses, livestockIgp.sales || [], livestockIgp.produces?.[0])
    };
    setLivestockIgp(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    if (isOnline) {
      logAction('Updated IGP Expense', `Updated ${updatedExp.produce || 'IGP'} expense for "${updatedExp.category}" (PHP ${updatedExp.amount.toLocaleString()})`);
      showToastMessage('IGP expense updated successfully.');
      pushAllDataToCloud({ livestockIgp: updatedState }, { silent: true, source: 'IGP Expense Update' });
    } else {
      addToSyncQueue('update', 'livestock_expense', updatedExp);
    }
  };

  const handleDeletePigExpense = (expenseId: string) => {
    const target = (livestockIgp.expenses || []).find((e) => e.id === expenseId);
    const updatedExpenses = (livestockIgp.expenses || []).filter((e) => e.id !== expenseId);
    const updatedState: LivestockIgpState = {
      ...livestockIgp,
      expenses: updatedExpenses,
      livestockInventory: deriveIgpLivestockInventory(updatedExpenses, livestockIgp.sales || [], livestockIgp.produces?.[0])
    };
    setLivestockIgp(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    if (isOnline) {
      logAction('Deleted IGP Expense', `Removed ${target?.produce || 'IGP'} expense for "${target?.category || expenseId}" (PHP ${(target?.amount || 0).toLocaleString()})`);
      showToastMessage('IGP expense deleted.', 'info');
      pushAllDataToCloud({ livestockIgp: updatedState }, { silent: true, source: 'IGP Expense Deletion' });
    } else {
      addToSyncQueue('delete', 'livestock_expense', { id: expenseId });
    }
  };

  const handleUpdateHogSale = (updatedSale: IgpSale) => {
    const updatedSales = (livestockIgp.sales || []).map((s) => (s.id === updatedSale.id ? updatedSale : s));
    const updatedState: LivestockIgpState = {
      ...livestockIgp,
      sales: updatedSales,
      livestockInventory: deriveIgpLivestockInventory(livestockIgp.expenses || [], updatedSales, livestockIgp.produces?.[0])
    };
    setLivestockIgp(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    if (isOnline) {
      logAction('Updated IGP Revenue', `Updated ${updatedSale.produce || 'IGP'} revenue record (PHP ${updatedSale.revenue.toLocaleString()})`);
      showToastMessage('IGP revenue record updated successfully.');
      pushAllDataToCloud({ livestockIgp: updatedState }, { silent: true, source: 'IGP Revenue Update' });
    } else {
      addToSyncQueue('update', 'livestock_sale', updatedSale);
    }
  };

  const handleDeleteHogSale = (saleId: string) => {
    const target = (livestockIgp.sales || []).find((s) => s.id === saleId);
    const updatedSales = (livestockIgp.sales || []).filter((s) => s.id !== saleId);
    const updatedState: LivestockIgpState = {
      ...livestockIgp,
      sales: updatedSales,
      livestockInventory: deriveIgpLivestockInventory(livestockIgp.expenses || [], updatedSales, livestockIgp.produces?.[0])
    };
    setLivestockIgp(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    if (isOnline) {
      logAction('Deleted IGP Revenue', `Removed ${target?.produce || 'IGP'} revenue record (PHP ${(target?.revenue || 0).toLocaleString()})`);
      showToastMessage('IGP revenue record deleted.', 'info');
      pushAllDataToCloud({ livestockIgp: updatedState }, { silent: true, source: 'IGP Revenue Deletion' });
    } else {
      addToSyncQueue('delete', 'livestock_sale', { id: saleId });
    }
  };

  const handleAddProduct = (newProduct: Omit<Product, 'id'>) => {
    const product: Product = {
      ...newProduct,
      id: `prod-${Date.now()}`
    };
    const updated = [product, ...products];
    setProducts(updated);
    updateStorage('bafa_products', updated);

    if (isOnline) {
      logAction('Added Product', `Registered new product: "${product.name}" (PHP ${product.price}/${product.unit})`);
      showToastMessage(`Gi-dugang ang bag-ong produkto "${product.name}"!`, 'success');
      pushAllDataToCloud({ products: updated }, { silent: true });
    } else {
      addToSyncQueue('create', 'product', product);
    }
  };

  const handleUpdateProduct = (updatedProd: Product) => {
    const updated = products.map(p => p.id === updatedProd.id ? updatedProd : p);
    setProducts(updated);
    updateStorage('bafa_products', updated);

    if (isOnline) {
      logAction('Updated Product', `Updated product details for "${updatedProd.name}"`);
      showToastMessage(`Gi-update ang produkto "${updatedProd.name}"!`, 'success');
      pushAllDataToCloud({ products: updated }, { silent: true });
    } else {
      addToSyncQueue('update', 'product', updatedProd);
    }
  };

  const handleDeleteProduct = (id: string) => {
    const target = products.find(p => p.id === id);
    const updated = products.filter(p => p.id !== id);
    const updatedInventory = inventory.map(item =>
      item.catalogProductId === id ? { ...item, catalogProductId: undefined } : item
    );
    setProducts(updated);
    updateStorage('bafa_products', updated);
    if (updatedInventory.some((item, index) => item.catalogProductId !== inventory[index]?.catalogProductId)) {
      setInventory(updatedInventory);
      updateStorage('bafa_inventory', updatedInventory);
    }
    storeDeletedId('products', id);

    // Direct and permanent removal from PostgreSQL Cloud Database
    deleteFromDatabase('product', id);

    if (isOnline) {
      logAction('Deleted Product', `Removed product: "${target?.name || id}"`);
      showToastMessage('Gipapas ang produkto!', 'info');
      pushAllDataToCloud({
        products: updated,
        ...(updatedInventory.some((item, index) => item.catalogProductId !== inventory[index]?.catalogProductId)
          ? { inventory: updatedInventory }
          : {})
      }, { silent: true, source: 'Product Deletion' });
    } else {
      addToSyncQueue('delete', 'product', { id });
      updatedInventory.filter((item, index) => item.catalogProductId !== inventory[index]?.catalogProductId)
        .forEach(item => addToSyncQueue('update', 'inventory', item));
    }
  };

  const buildActivityAnnouncement = (act: AssociationActivity, existingDatePosted?: string): Announcement => {
    const schedDate = act.scheduledDate || act.dateScheduled || 'TBA';
    const schedTime = act.scheduledTime || act.timeScheduled || 'TBA';
    const isDisrupted = act.status === 'Cancelled' || act.status === 'Postponed';
    const statusPrefix = isDisrupted
      ? `[${act.status.toUpperCase()}] `
      : act.status === 'Completed'
        ? '[Completed Activity] '
        : '[Upcoming Activity] ';
    const detailsLines = [
      `📅 Date & Time: ${schedDate} • ${schedTime}`,
      `📍 Location: ${act.location || 'Barangay Alegria'}`,
      ...(act.targetAudience ? [`👥 Target Audience: ${act.targetAudience}`] : []),
      ...(isDisrupted && act.statusReason ? [`⚠️ ${act.status} Reason: ${act.statusReason}`] : []),
      '',
      act.description || ''
    ];
    return {
      id: `ann-act-${act.id}`,
      title: `${statusPrefix}${act.title}`,
      category: (act.category || 'General') as Announcement['category'],
      content: detailsLines.join('\n').trim(),
      datePosted: existingDatePosted || new Date().toISOString().split('T')[0],
      priority: isDisrupted ? 'High' : 'Medium',
      postedBy: act.organizer || (currentUser ? `${currentRole.replace('_', ' ')} (${currentUser.name})` : 'PIO')
    };
  };

  const handleAddActivity = (newAct: Omit<AssociationActivity, 'id'>) => {
    const activity: AssociationActivity = {
      ...newAct,
      id: `act-${Date.now()}`
    };
    const updated = [activity, ...activities];
    setActivities(updated);
    updateStorage('bafa_activities', updated);

    const linkedAnnouncement = buildActivityAnnouncement(activity);
    const updatedAnnouncements = [linkedAnnouncement, ...announcements.filter(a => a.id !== linkedAnnouncement.id)];
    setAnnouncements(updatedAnnouncements);
    updateStorage('bafa_announcements', updatedAnnouncements);

    if (isOnline) {
      logAction('Scheduled Activity', `Created association activity & announcement: "${activity.title}" scheduled for ${activity.scheduledDate || activity.dateScheduled}`);
      showToastMessage(`Gipasa ang bag-ong kalihokan ug pahibalo "${activity.title}"!`, 'success');
      pushAllDataToCloud({ activities: updated, announcements: updatedAnnouncements }, { silent: true });
    } else {
      addToSyncQueue('create', 'activity', activity);
      addToSyncQueue('create', 'announcement', linkedAnnouncement);
    }
  };

  const handleUpdateActivity = (updatedAct: AssociationActivity) => {
    const updated = activities.map(a => a.id === updatedAct.id ? updatedAct : a);
    setActivities(updated);
    updateStorage('bafa_activities', updated);

    const linkedAnnId = `ann-act-${updatedAct.id}`;
    const existingAnn = announcements.find(a => a.id === linkedAnnId);
    const syncedAnnouncement = buildActivityAnnouncement(updatedAct, existingAnn?.datePosted);
    const updatedAnnouncements = existingAnn
      ? announcements.map(a => a.id === linkedAnnId ? syncedAnnouncement : a)
      : [syncedAnnouncement, ...announcements];
    setAnnouncements(updatedAnnouncements);
    updateStorage('bafa_announcements', updatedAnnouncements);

    if (isOnline) {
      logAction('Updated Activity', `Updated activity & announcement for "${updatedAct.title}"`);
      showToastMessage(`Gi-update ang kalihokan ug pahibalo "${updatedAct.title}"!`, 'success');
      pushAllDataToCloud({ activities: updated, announcements: updatedAnnouncements }, { silent: true });
    } else {
      addToSyncQueue('update', 'activity', updatedAct);
      addToSyncQueue(existingAnn ? 'update' : 'create', 'announcement', syncedAnnouncement);
    }
  };

  const handleDeleteActivity = (id: string) => {
    const target = activities.find(a => a.id === id);
    const updated = activities.filter(a => a.id !== id);
    setActivities(updated);
    updateStorage('bafa_activities', updated);
    storeDeletedId('activities', id);

    const linkedAnnId = `ann-act-${id}`;
    const hasLinkedAnn = announcements.some(a => a.id === linkedAnnId);
    const updatedAnnouncements = hasLinkedAnn
      ? announcements.filter(a => a.id !== linkedAnnId)
      : announcements;
    if (hasLinkedAnn) {
      setAnnouncements(updatedAnnouncements);
      updateStorage('bafa_announcements', updatedAnnouncements);
      storeDeletedId('announcements', linkedAnnId);
      deleteFromDatabase('announcement', linkedAnnId);
    }

    // Direct and permanent removal from PostgreSQL Cloud Database
    deleteFromDatabase('activity', id);

    if (isOnline) {
      logAction('Deleted Activity', `Removed activity: "${target?.title || id}"`);
      showToastMessage('Gipapas ang kalihokan!', 'info');
      pushAllDataToCloud({
        activities: updated,
        ...(hasLinkedAnn ? { announcements: updatedAnnouncements } : {})
      }, { silent: true, source: 'Activity Deletion' });
    } else {
      addToSyncQueue('delete', 'activity', { id });
      if (hasLinkedAnn) addToSyncQueue('delete', 'announcement', { id: linkedAnnId });
    }
  };

  const handleAddAchievement = (achievementData: Omit<AssociationAchievement, 'id'>) => {
    if (!currentUser || !['PIO', 'President'].includes(currentUser.role)) {
      showToastMessage('Only the PIO or President may manage association achievements.', 'error');
      return;
    }

    const achievement: AssociationAchievement = {
      ...achievementData,
      id: `achievement-${Date.now()}`
    };
    const updated = [achievement, ...achievements];
    setAchievements(updated);
    updateStorage('bafa_achievements', updated);

    if (isOnline) {
      logAction('Added Association Achievement', `Published "${achievement.title}" (${achievement.year})`);
      showToastMessage('Association achievement added to the guest portal.', 'success');
      pushAllDataToCloud({ achievements: updated }, { silent: true, source: 'Achievement Added' });
    } else {
      addToSyncQueue('create', 'achievement', achievement);
    }
  };

  const handleDeleteAchievement = (id: string) => {
    if (!currentUser || !['PIO', 'President'].includes(currentUser.role)) {
      showToastMessage('Only the PIO or President may manage association achievements.', 'error');
      return;
    }

    const target = achievements.find(achievement => achievement.id === id);
    const updated = achievements.filter(achievement => achievement.id !== id);
    setAchievements(updated);
    updateStorage('bafa_achievements', updated);

    if (isOnline) {
      logAction('Deleted Association Achievement', `Removed "${target?.title || id}"`);
      pushAllDataToCloud(
        { achievements: updated, deletedIds: { achievements: [id] } },
        { silent: true, source: 'Achievement Deleted' }
      );
    } else {
      addToSyncQueue('delete', 'achievement', { id });
    }
  };

  // AUDITOR INVENTORY HANDLERS (inventory custody assigned to the Auditor — no Property Custodian exists)
  const handleAddInventoryItem = (itemData: Omit<InventoryItem, 'id' | 'dateRecorded' | 'lastUpdated'>) => {
    const today = new Date().toISOString().split('T')[0];
    const newItem: InventoryItem = { ...itemData, id: `inv-${Date.now()}`, dateRecorded: today, lastUpdated: today };
    const updated = [newItem, ...inventory];
    setInventory(updated);
    updateStorage('bafa_inventory', updated);

    if (isOnline) {
      logAction('Recorded Inventory Item', `Auditor recorded inventory: "${newItem.name}" (${newItem.quantity} ${newItem.unit}, ${newItem.condition})`);
      showToastMessage(`Inventory item "${newItem.name}" recorded!`, 'success');
      pushAllDataToCloud({ inventory: updated }, { silent: true, source: 'Inventory Recorded' });
    } else {
      addToSyncQueue('create', 'inventory', newItem);
    }
  };

  const handleUpdateInventoryItem = (updatedItem: InventoryItem) => {
    const linkedProduct = updatedItem.catalogProductId
      ? products.find(product => product.id === updatedItem.catalogProductId)
      : undefined;
    const shouldUnlinkRentalProduct = Boolean(linkedProduct && updatedItem.category !== 'Rental Assets');
    const inventoryItem = shouldUnlinkRentalProduct
      ? { ...updatedItem, catalogProductId: undefined }
      : updatedItem;
    const updated = inventory.map(i => i.id === inventoryItem.id ? inventoryItem : i);
    const updatedProducts = linkedProduct
      ? products.map(product => product.id === linkedProduct.id
        ? shouldUnlinkRentalProduct
          ? {
            ...product,
            isPublished: false,
            quantityAvailable: '0 available',
            stockStatus: 'Out of Stock' as const
          }
          : {
            ...product,
            name: updatedItem.name,
            specs: updatedItem.notes || undefined,
            quantityAvailable: `${getAvailableInventoryQuantity(updatedItem)} ${updatedItem.unit} available`,
            stockStatus: getRentalStockStatus(updatedItem),
            dateUpdated: new Date().toISOString().split('T')[0]
          }
        : product)
      : products;
    setInventory(updated);
    updateStorage('bafa_inventory', updated);
    if (linkedProduct) {
      setProducts(updatedProducts);
      updateStorage('bafa_products', updatedProducts);
    }

    if (isOnline) {
      logAction('Updated Inventory Item', `Auditor updated inventory record for "${updatedItem.name}" (${updatedItem.condition})`);
      showToastMessage(`Inventory item "${updatedItem.name}" updated!`, 'success');
      pushAllDataToCloud({
        inventory: updated,
        ...(linkedProduct ? { products: updatedProducts } : {})
      }, { silent: true, source: 'Inventory Updated' });
    } else {
      addToSyncQueue('update', 'inventory', inventoryItem);
      if (linkedProduct) {
        const updatedProduct = updatedProducts.find(product => product.id === linkedProduct.id);
        if (updatedProduct) addToSyncQueue('update', 'product', updatedProduct);
      }
    }
  };

  const handleDeleteInventoryItem = (id: string) => {
    const target = inventory.find(i => i.id === id);
    const updated = inventory.filter(i => i.id !== id);
    const linkedProduct = target?.catalogProductId
      ? products.find(product => product.id === target.catalogProductId)
      : undefined;
    const updatedProducts = linkedProduct
      ? products.map(product => product.id === linkedProduct.id
        ? { ...product, isPublished: false, quantityAvailable: '0 available', stockStatus: 'Out of Stock' as const }
        : product)
      : products;
    setInventory(updated);
    updateStorage('bafa_inventory', updated);
    if (linkedProduct) {
      setProducts(updatedProducts);
      updateStorage('bafa_products', updatedProducts);
    }
    storeDeletedId('inventory', id);

    // Direct and permanent removal from PostgreSQL Cloud Database
    deleteFromDatabase('inventory', id);

    if (isOnline) {
      logAction('Deleted Inventory Item', `Removed inventory record: "${target?.name || id}"`);
      showToastMessage('Inventory item removed!', 'info');
      pushAllDataToCloud({
        inventory: updated,
        ...(linkedProduct ? { products: updatedProducts } : {})
      }, { silent: true, source: 'Inventory Deletion' });
    } else {
      addToSyncQueue('delete', 'inventory', { id });
      if (linkedProduct) {
        const updatedProduct = updatedProducts.find(product => product.id === linkedProduct.id);
        if (updatedProduct) addToSyncQueue('update', 'product', updatedProduct);
      }
    }
  };

  const handlePublishRentalProduct = (
    item: InventoryItem,
    listing: { price: number; unit: string; description: string }
  ) => {
    const availableQuantity = getAvailableInventoryQuantity(item);
    const today = new Date().toISOString().split('T')[0];
    const product: Product = {
      id: `rental-${Date.now()}`,
      name: item.name,
      category: 'Rental Assets',
      price: listing.price,
      unit: listing.unit,
      quantityAvailable: `${availableQuantity} ${item.unit} available`,
      description: listing.description,
      specs: item.notes || undefined,
      stockStatus: getRentalStockStatus(item),
      farmerName: 'Alegria Farmers Association',
      farmerSitio: item.location || '',
      contactPerson: 'Contact an AFA officer to arrange a rental.',
      isPublished: true,
      updatedBy: `Auditor (${getOfficerName('Auditor')})`,
      managedBy: `Auditor (${getOfficerName('Auditor')})`,
      dateUpdated: today
    };
    const linkedItem: InventoryItem = { ...item, catalogProductId: product.id, lastUpdated: today };
    const updatedInventory = inventory.map(record => record.id === item.id ? linkedItem : record);
    const updatedProducts = [product, ...products];
    setInventory(updatedInventory);
    setProducts(updatedProducts);
    updateStorage('bafa_inventory', updatedInventory);
    updateStorage('bafa_products', updatedProducts);

    if (isOnline) {
      logAction('Published Rental Asset', `Published "${product.name}" in the product catalog.`);
      showToastMessage(`"${product.name}" is now in the product catalog.`, 'success');
      pushAllDataToCloud(
        { inventory: updatedInventory, products: updatedProducts },
        { silent: true, source: 'Rental Asset Published' }
      );
    } else {
      addToSyncQueue('create', 'product', product);
      addToSyncQueue('update', 'inventory', linkedItem);
    }
  };

  // Egg harvest workflow: member submits -> Auditor verifies -> President signs off (3-stage)
  const handleSubmitEggHarvest = (harvestData: Omit<EggHarvestLog, 'id' | 'status'>) => {
    if (currentUser?.role !== 'Member') {
      showToastMessage('Only member accounts may submit egg harvests. Auditors and the President approve submissions.', 'error');
      return;
    }
    const newHarvest: EggHarvestLog = {
      ...harvestData,
      id: `egg-${Date.now()}`,
      status: 'Pending Audit'
    };
    const updatedState: LivestockIgpState = {
      ...livestockIgp,
      eggHarvests: [newHarvest, ...(livestockIgp.eggHarvests || [])]
    };
    setLivestockIgp(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    if (isOnline) {
      logAction('Submitted Egg Harvest', `${newHarvest.collectedBy} submitted ${newHarvest.eggCount} eggs harvested on ${newHarvest.date}.`);
      showToastMessage('Daily egg harvest has been submitted for Auditor verification!');
      pushAllDataToCloud({ eggHarvests: updatedState.eggHarvests }, { silent: true, scope: 'eggHarvests' });
    } else {
      addToSyncQueue('create', 'egg_harvest', newHarvest);
    }
  };

  const handleUpdateEggHarvestStatus = (harvestId: string, action: 'audit' | 'sign' | 'return', remarks?: string) => {
    const updatedHarvests = (livestockIgp.eggHarvests || []).map((h) => {
      if (h.id !== harvestId) return h;
      if (action === 'audit') {
        return {
          ...h,
          status: 'Audited' as const,
          auditedBy: currentUser?.name || 'Auditor',
          auditedDate: new Date().toISOString().split('T')[0],
          auditRemarks: remarks
        };
      }
      if (action === 'sign') {
        return {
          ...h,
          status: 'Signed' as const,
          signedBy: currentUser?.name || 'President',
          signedDate: new Date().toISOString().split('T')[0],
          signatureRemarks: remarks
        };
      }
      return {
        ...h,
        status: 'Returned' as const,
        auditRemarks: remarks || 'Returned for correction'
      };
    });
    const updatedState: LivestockIgpState = { ...livestockIgp, eggHarvests: updatedHarvests };
    setLivestockIgp(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    const target = updatedHarvests.find((h) => h.id === harvestId);
    const detail = target ? ` (harvest of ${target.date}, ${target.eggCount} eggs by ${target.collectedBy})` : '';
    const actionLabel = action === 'audit' ? 'Verified Egg Harvest' : action === 'sign' ? 'Signed Off Egg Harvest' : 'Returned Egg Harvest';

    if (isOnline) {
      logAction(actionLabel, `${currentUser?.name || 'Officer'} ${action === 'audit' ? 'verified' : action === 'sign' ? 'signed off' : 'returned'} an egg harvest record.${detail}`);
      showToastMessage(action === 'audit' ? 'Egg harvest verified!' : action === 'sign' ? 'Egg harvest signed off!' : 'Egg harvest returned to the member.');
      pushAllDataToCloud({ eggHarvests: updatedState.eggHarvests }, { silent: true, scope: 'eggHarvests' });
    } else {
      addToSyncQueue('update', 'egg_harvest', { id: harvestId, action, remarks, ...target });
    }
  };

  const handleAddProduce = (produceName: string) => {
    const cleanName = produceName.trim();
    if (!cleanName) return;
    const updatedState: LivestockIgpState = {
      ...livestockIgp,
      produces: Array.from(new Set([...(livestockIgp.produces || []), cleanName]))
    };
    setLivestockIgp(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    if (isOnline) {
      logAction('Added AFA IGP Project', `Added current IGP project: "${cleanName}"`);
      showToastMessage(`Successfully added IGP project: "${cleanName}"`, 'success');
      pushAllDataToCloud({ livestockIgp: { produces: updatedState.produces } as unknown as LivestockIgpState }, { silent: true, source: 'Added AFA IGP Project' });
    }
  };

  const handleDeleteProduce = (produceName: string) => {
    const updatedState: LivestockIgpState = {
      ...livestockIgp,
      produces: (livestockIgp.produces || []).filter(p => p !== produceName)
    };
    setLivestockIgp(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    if (isOnline) {
      logAction('Removed AFA IGP Project', `Removed IGP project from active list: "${produceName}"`);
      showToastMessage(`Removed IGP project: "${produceName}"`, 'info');
      pushAllDataToCloud({ livestockIgp: { produces: updatedState.produces } as unknown as LivestockIgpState }, { silent: true, source: 'Removed AFA IGP Project' });
    }
  };

  const handleCloseDecemberBook = (year: number) => {
    const closedList = livestockIgp.closedYears || [2025];
    if (closedList.includes(year)) return;
    const updatedState: LivestockIgpState = {
      ...livestockIgp,
      closedYears: [...closedList, year]
    };
    setLivestockIgp(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    if (isOnline) {
      logAction('Closed Financial Book', `Officially closed and sealed the Livestock IGP financial book for December ${year}.`);
      showToastMessage(`Successfully closed and locked the financial books for ${year}!`, 'success');
      pushAllDataToCloud({ livestockIgp: updatedState }, { silent: true });
    } else {
      addToSyncQueue('update', 'livestock_expense', { id: `close-book-${year}`, year });
    }
  };

  // PIO ACTION HANDLERS
  const handleAddAnnouncement = (annData: Omit<Announcement, 'id' | 'datePosted'>) => {
    const newAnn: Announcement = {
      ...annData,
      id: `ann-${Date.now()}`,
      datePosted: new Date().toISOString().split('T')[0]
    };
    const updated = [newAnn, ...announcements];
    setAnnouncements(updated);
    updateStorage('bafa_announcements', updated);

    if (isOnline) {
      logAction('Posted Announcement', `Published notice: "${newAnn.title}" under ${newAnn.category}`);
      showToastMessage(`Notice published to public board.`);
      pushAllDataToCloud({ announcements: updated }, { silent: true });
    } else {
      addToSyncQueue('create', 'announcement', newAnn);
    }
  };

  const handleDeleteAnnouncement = (id: string) => {
    const targetAnn = announcements.find(a => a.id === id);
    const titleStr = targetAnn ? targetAnn.title : 'Notice';

    const updated = announcements.filter(a => a.id !== id);
    setAnnouncements(updated);
    updateStorage('bafa_announcements', updated);
    storeDeletedId('announcements', id);

    // Direct and permanent removal from PostgreSQL Cloud Database
    deleteFromDatabase('announcement', id);

    if (isOnline) {
      logAction('Deleted Announcement', `Removed board publication: "${titleStr}"`);
      showToastMessage(`Announcement removed from board.`, 'warning');
      pushAllDataToCloud({ announcements: updated }, { silent: true, source: 'Announcement Deletion' });
    } else {
      addToSyncQueue('delete', 'announcement', { id, title: titleStr });
    }
  };

  // EXECUTIVE ACTION HANDLERS (PRESIDENT / VP)
  const handleApproveResolution = (id: string) => {
    const updated = resolutions.map(r => r.id === id ? { ...r, status: 'Approved' as const } : r);
    setResolutions(updated);
    updateStorage('bafa_resolutions', updated);

    const targetRes = resolutions.find(r => r.id === id);
    const resNo = targetRes ? targetRes.resolutionNumber : 'Resolution';

    if (isOnline) {
      logAction('Signed & Approved Resolution', `Officially approved Resolution ${resNo}: "${targetRes?.title}"`);
      showToastMessage(`Resolution ${resNo} has been signed and enacted!`, 'success');
      pushAllDataToCloud({ resolutions: updated }, { silent: true });
    } else {
      addToSyncQueue('update', 'resolution', { id, status: 'Approved', resNo });
    }
  };

  // PRESIDENT APPROVAL WORKFLOW FOR SECRETARY MINUTES OF MEETING
  const handleApproveMeetingMinutes = (id: string, remarks?: string) => {
    const targetMeeting = meetings.find(m => m.id === id);
    const approvingOfficer = currentRole === 'Vice_President' ? 'Vice President' : 'President';
    const updated = meetings.map(m => m.id === id
      ? {
        ...m,
        minutesApprovalStatus: 'Approved' as const,
        approvedBy: `${approvingOfficer} (${currentUser?.name || getOfficerName(currentRole)})`,
        approvedDate: new Date().toISOString().split('T')[0],
        approvalRemarks: remarks
      }
      : m);
    setMeetings(updated);
    updateStorage('bafa_meetings', updated);

    if (isOnline) {
      logAction(`${approvingOfficer} Approved Minutes of Meeting`, `${approvingOfficer} approved the minutes for: "${targetMeeting?.title || 'Meeting'}"${remarks ? `. Remarks: "${remarks}"` : ''}`);
      showToastMessage(`Minutes for "${targetMeeting?.title || 'Meeting'}" approved by the ${approvingOfficer}.`, 'success');
      pushAllDataToCloud({ meetings: updated }, { silent: true });
    } else {
      addToSyncQueue('update', 'meeting', { id, minutesApprovalStatus: 'Approved', remarks });
    }
  };

  const handleReturnMeetingMinutes = (id: string, remarks: string) => {
    const targetMeeting = meetings.find(m => m.id === id);
    const approvingOfficer = currentRole === 'Vice_President' ? 'Vice President' : 'President';
    const updated = meetings.map(m => m.id === id
      ? {
        ...m,
        minutesApprovalStatus: 'Returned' as const,
        approvedBy: `${approvingOfficer} (${currentUser?.name || getOfficerName(currentRole)})`,
        approvedDate: new Date().toISOString().split('T')[0],
        approvalRemarks: remarks
      }
      : m);
    setMeetings(updated);
    updateStorage('bafa_meetings', updated);

    if (isOnline) {
      logAction(`${approvingOfficer} Returned Minutes of Meeting`, `${approvingOfficer} returned the minutes for revision: "${targetMeeting?.title || 'Meeting'}". Remarks: "${remarks}"`);
      showToastMessage(`Minutes returned to the Secretary for revision.`, 'warning');
      pushAllDataToCloud({ meetings: updated }, { silent: true });
    } else {
      addToSyncQueue('update', 'meeting', { id, minutesApprovalStatus: 'Returned', remarks });
    }
  };

  // PRESIDENT APPROVAL WORKFLOW FOR AUDITED FINANCIAL REPORTS / RECORDS (Auditor → President)
  const handlePresidentApproveTransaction = (id: string, remarks?: string) => {
    const targetTx = transactions.find(t => t.id === id);
    const approvingOfficer = currentRole === 'Vice_President' ? 'Vice President' : 'President';
    const updated = transactions.map(t => t.id === id
      ? {
        ...t,
        presidentApprovalStatus: 'Approved' as const,
        presidentApprovedBy: `${approvingOfficer} (${currentUser?.name || getOfficerName(currentRole)})`,
        presidentApprovedDate: new Date().toISOString().split('T')[0],
        presidentApprovalRemarks: remarks
      }
      : t);
    setTransactions(updated);
    updateStorage('bafa_transactions', updated);

    const txDescStr = targetTx ? `PHP ${targetTx.amount.toLocaleString()} (${targetTx.category})` : 'Transaction';

    if (isOnline) {
      logAction(`${approvingOfficer} Approved Financial Record`, `${approvingOfficer} approved the audited financial record: ${txDescStr}${remarks ? `. Remarks: "${remarks}"` : ''}`);
      showToastMessage(`Financial record approved by the ${approvingOfficer}.`, 'success');
      pushAllDataToCloud(
        { financialTransactions: updated.filter(t => t.id === id), presidentApprovalOnly: true },
        { silent: true, scope: 'presidentApproval' }
      );
    } else {
      addToSyncQueue('update', 'transaction', { id, presidentApprovalStatus: 'Approved', remarks });
    }
  };

  const handlePresidentReturnTransaction = (id: string, remarks: string) => {
    const targetTx = transactions.find(t => t.id === id);
    const approvingOfficer = currentRole === 'Vice_President' ? 'Vice President' : 'President';
    const updated = transactions.map(t => t.id === id
      ? {
        ...t,
        presidentApprovalStatus: 'Returned' as const,
        presidentApprovedBy: `${approvingOfficer} (${currentUser?.name || getOfficerName(currentRole)})`,
        presidentApprovedDate: new Date().toISOString().split('T')[0],
        presidentApprovalRemarks: remarks
      }
      : t);
    setTransactions(updated);
    updateStorage('bafa_transactions', updated);

    const txDescStr = targetTx ? `PHP ${targetTx.amount.toLocaleString()} (${targetTx.category})` : 'Transaction';

    if (isOnline) {
      logAction(`${approvingOfficer} Returned Financial Record`, `${approvingOfficer} returned the financial record for revision: ${txDescStr}. Remarks: "${remarks}"`);
      showToastMessage(`Financial record returned by the ${approvingOfficer}.`, 'warning');
      pushAllDataToCloud(
        { financialTransactions: updated.filter(t => t.id === id), presidentApprovalOnly: true },
        { silent: true, scope: 'presidentApproval' }
      );
    } else {
      addToSyncQueue('update', 'transaction', { id, presidentApprovalStatus: 'Returned', remarks });
    }
  };

  type DelegationAction =
    | { action: 'request'; reason: string; scopes: DelegationScope[]; effectiveStart: string; effectiveEnd: string }
    | { action: 'approve' | 'decline' | 'revoke'; requestId: string; remarks?: string };

  const handleRefreshDelegations = async () => {
    if (!isOnline || !navigator.onLine || isRefreshingDelegations) return;
    setIsRefreshingDelegations(true);
    try {
      const response = await fetch('/api/sync/pull', { credentials: 'same-origin' });
      const result = await response.json();
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!response.ok || !result?.success || !Array.isArray(result.data?.delegationRequests)) {
        throw new Error(result?.message || 'Unable to refresh delegation requests.');
      }
      const latestRequests = result.data.delegationRequests as DelegationRequest[];
      setDelegationRequests(latestRequests);
      updateStorage('bafa_delegation_requests', latestRequests);
    } catch (error) {
      showToastMessage(error instanceof Error ? error.message : 'Unable to refresh delegation requests.', 'error');
    } finally {
      setIsRefreshingDelegations(false);
    }
  };

  const submitDelegationAction = async (action: DelegationAction): Promise<DelegationRequest | null> => {
    if (!isOnline || !navigator.onLine) {
      showToastMessage('Delegated access requests and reviews require an online connection.', 'error');
      return null;
    }

    try {
      const response = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ delegationAction: action })
      });
      if (response.status === 401) {
        handleSessionExpired();
        return null;
      }
      const result = await response.json();
      if (!response.ok || !result?.success || !result.delegationRequest) {
        throw new Error(result?.message || 'Unable to save the delegated access request.');
      }

      const savedRequest = result.delegationRequest as DelegationRequest;
      const updatedRequests = [
        ...delegationRequests.filter(request => request.id !== savedRequest.id),
        savedRequest
      ];
      setDelegationRequests(updatedRequests);
      updateStorage('bafa_delegation_requests', updatedRequests);
      return savedRequest;
    } catch (error) {
      showToastMessage(error instanceof Error ? error.message : 'Unable to save the delegated access request.', 'error');
      return null;
    }
  };

  const handleRequestDelegation = async (request: {
    reason: string;
    scopes: DelegationScope[];
    effectiveStart: string;
    effectiveEnd: string;
  }): Promise<boolean> => {
    if (currentRole !== 'Vice_President') return false;
    const saved = await submitDelegationAction({ action: 'request', ...request });
    if (!saved) return false;
    const updatedLogs = logAction(
      'Requested Delegated Access',
      `Requested ${saved.scopes.join(', ')} from ${saved.effectiveStart} through ${saved.effectiveEnd}.`
    );
    await pushAllDataToCloud({ systemLogs: [updatedLogs, ...logs] }, { silent: true, source: 'Delegation Request' });
    showToastMessage('Delegated access request sent to the President.', 'success');
    return true;
  };

  const handleReviewDelegation = async (
    requestId: string,
    decision: 'approve' | 'decline',
    remarks?: string
  ): Promise<boolean> => {
    if (currentRole !== 'President') return false;
    const saved = await submitDelegationAction({ action: decision, requestId, remarks });
    if (!saved) return false;
    const updatedLogs = logAction(
      decision === 'approve' ? 'Approved Delegated Access' : 'Declined Delegated Access',
      `${decision === 'approve' ? 'Approved' : 'Declined'} delegated access for ${saved.requestedBy}${remarks ? `: ${remarks}` : ''}.`
    );
    await pushAllDataToCloud({ systemLogs: [updatedLogs, ...logs] }, { silent: true, source: 'Delegation Review' });
    showToastMessage(`Delegation request ${decision === 'approve' ? 'approved' : 'declined'}.`, 'success');
    return true;
  };

  const handleRevokeDelegation = async (requestId: string, remarks?: string): Promise<boolean> => {
    if (currentRole !== 'President') return false;
    const saved = await submitDelegationAction({ action: 'revoke', requestId, remarks });
    if (!saved) return false;
    const updatedLogs = logAction(
      'Revoked Delegated Access',
      `Revoked delegated access for ${saved.requestedBy}${remarks ? `: ${remarks}` : ''}.`
    );
    await pushAllDataToCloud({ systemLogs: [updatedLogs, ...logs] }, { silent: true, source: 'Delegation Revocation' });
    showToastMessage('Delegated access revoked.', 'success');
    return true;
  };

  // USER AUTHENTICATION & MANAGEMENT ACTIONS
  const refreshCloudDataAfterLogin = async () => {
    try {
      const response = await fetch('/api/sync/pull', { credentials: 'same-origin' });
      const text = await response.text();
      let result: { success?: boolean; message?: string; data?: Record<string, unknown> };
      try {
        result = JSON.parse(text) as typeof result;
      } catch {
        throw new Error('The database returned an unreadable response.');
      }

      if (!response.ok || !result?.success || !result.data) {
        const reason = result?.message || `Request failed with status ${response.status}.`;
        console.warn('[Cloud DB Pull After Login]:', reason);
        showToastMessage('Could not refresh database records after login. Showing locally saved data.', 'warning');
        return;
      }

      const data = result.data;
      const local = appDataRef.current;
      const pendingDeletes = deletedIdsRef.current;
      const hasPendingLocalChanges =
        hasPendingCloudSync ||
        syncQueueRef.current.length > 0 ||
        Object.values(pendingDeletes).some(ids => Array.isArray(ids) && ids.length > 0);
      const reconcile = <T extends { id: string }>(
        remoteRows: unknown,
        localRows: T[],
        deletedIds: string[] = []
      ): T[] => {
        if (!Array.isArray(remoteRows)) return localRows;
        return hasPendingLocalChanges
          ? mergeSyncRecordsById(remoteRows as T[], localRows, deletedIds)
          : remoteRows as T[];
      };

      const usersFromPull = reconcile(data.users, local.users, pendingDeletes.users);
      const nextUsers = Array.isArray(data.users)
        ? usersFromPull.map(user => ({
          ...user,
          mfaEnabled: user.role?.toLowerCase() === 'president' || Boolean(user.mfaEnabled),
          passwordHistory: Array.isArray(user.passwordHistory) ? user.passwordHistory : [],
          mustChangePassword: false
        }))
        : usersFromPull;
      const nextMembers = reconcile(data.members, local.members, pendingDeletes.members);
      const nextMeetings = reconcile(data.meetings, local.meetings, pendingDeletes.meetings);
      const nextResolutions = reconcile(data.resolutions, local.resolutions, pendingDeletes.resolutions);
      const nextTransactions = reconcile(
        data.financialTransactions ?? data.transactions,
        local.transactions,
        [...(pendingDeletes.financialTransactions || []), ...(pendingDeletes.transactions || [])]
      );
      const nextAnnouncements = reconcile(data.announcements, local.announcements, pendingDeletes.announcements);
      const nextProducts = reconcile(data.products, local.products, pendingDeletes.products);
      const nextActivities = reconcile(data.activities, local.activities, pendingDeletes.activities);
      const nextAchievements = reconcile(data.achievements, local.achievements, pendingDeletes.achievements);
      const nextFunds = reconcile(data.funds, local.funds, pendingDeletes.funds);
      const nextInventory = reconcile(data.inventory, local.inventory, pendingDeletes.inventory);
      const nextMembershipPayments = reconcile(data.membershipPayments, local.membershipPayments, pendingDeletes.membershipPayments);
      const nextMembershipYearSnapshots = Array.isArray(data.membershipYearSnapshots)
        ? data.membershipYearSnapshots as MembershipYearSnapshot[]
        : local.membershipYearSnapshots;
      const nextLogs = reconcile(data.logs ?? data.systemLogs, local.logs);
      const nextLivestockIgp = hasPendingLocalChanges || !data.livestockIgp
        ? local.livestockIgp
        : data.livestockIgp as LivestockIgpState;

      setUsers(nextUsers);
      updateStorage('bafa_users', nextUsers);
      setMembers(nextMembers);
      updateStorage('bafa_members', nextMembers);
      setMeetings(nextMeetings);
      updateStorage('bafa_meetings', nextMeetings);
      setResolutions(nextResolutions);
      updateStorage('bafa_resolutions', nextResolutions);
      setTransactions(nextTransactions);
      updateStorage('bafa_transactions', nextTransactions);
      setAnnouncements(nextAnnouncements);
      updateStorage('bafa_announcements', nextAnnouncements);
      setProducts(nextProducts);
      updateStorage('bafa_products', nextProducts);
      setActivities(nextActivities);
      updateStorage('bafa_activities', nextActivities);
      if (Array.isArray(data.delegationRequests)) {
        setDelegationRequests(data.delegationRequests as DelegationRequest[]);
        updateStorage('bafa_delegation_requests', data.delegationRequests);
      }
      setAchievements(nextAchievements);
      updateStorage('bafa_achievements', nextAchievements);
      setFunds(nextFunds);
      updateStorage('bafa_funds', nextFunds);
      setInventory(nextInventory);
      updateStorage('bafa_inventory', nextInventory);
      setMembershipPayments(nextMembershipPayments);
      updateStorage('bafa_membership_payments', nextMembershipPayments);
      setMembershipYearSnapshots(nextMembershipYearSnapshots);
      updateStorage('bafa_membership_year_snapshots', nextMembershipYearSnapshots);
      setLogs(nextLogs);
      updateStorage('bafa_logs', nextLogs);
      if (data.livestockIgp) {
        setLivestockIgp(nextLivestockIgp);
        updateStorage('bafa_afa_igp', nextLivestockIgp);
      }
      setDbStatus(previous => ({
        ...previous,
        connected: true,
        configured: true,
        checking: false
      }));
      console.log('[Cloud DB] Refreshed database records after login.');
    } catch (error) {
      console.warn('[Cloud DB Pull After Login]:', error);
      showToastMessage('Could not refresh database records after login. Showing locally saved data.', 'warning');
    }
  };

  const handleLogin = (user: User, password: string, serverAuthenticated = false) => {
    authEpochRef.current += 1;
    sessionRefreshAbortRef.current?.abort();
    sessionRefreshAbortRef.current = null;
    if (import.meta.env.PROD || serverAuthenticated || dbStatus.configured) {
      void password;
      const { password: _p, passwordHash: _ph, passwordHistory: _hist, ...safeUser } = user;
      const cleanUser = safeUser as User;
      setCurrentUser(cleanUser);
      setGuestMode(false);
      setUsers(previous => [cleanUser, ...previous.filter(candidate => candidate.id !== cleanUser.id)]);
      updateStorage('bafa_current_user', cleanUser);
      if (cleanUser.role !== 'Member') {
        setCurrentRole(cleanUser.role as OfficerRole);
      }
      showToastMessage(`Maayong adlaw, ${cleanUser.name}! Successful login.`, 'success');
      if (isOnline) void refreshCloudDataAfterLogin();
      return;
    }

    const { password: legacyPassword, passwordHash, passwordHistory, ...safeUser } = user;
    const wasLegacy = isLegacyPasswordHash(passwordHash) || !passwordHash;
    const upgradedHash = wasLegacy ? hashPolicyPassword(password) : passwordHash;
    const upgradedUser: User = {
      ...user,
      passwordHash: upgradedHash,
      passwordHistory: user.passwordHistory || [],
      passwordChangedAt: user.passwordChangedAt || new Date().toISOString(),
      mustChangePassword: Boolean(user.mustChangePassword) || wasLegacy,
      failedLoginAttempts: 0,
      lockedUntil: undefined
    };
    delete upgradedUser.password;

    const upgradedUsers = users.map((candidate) => candidate.id === user.id ? upgradedUser : candidate);
    setUsers(upgradedUsers);
    setCurrentUser({ ...safeUser, passwordChangedAt: upgradedUser.passwordChangedAt, passwordHistory: upgradedUser.passwordHistory, mustChangePassword: upgradedUser.mustChangePassword } as User);
    updateStorage('bafa_current_user', { ...safeUser, passwordChangedAt: upgradedUser.passwordChangedAt, mustChangePassword: upgradedUser.mustChangePassword });
    updateStorage('bafa_users', upgradedUsers);
    if (isOnline) pushAllDataToCloud({ users: upgradedUsers }, { silent: true, source: 'Password Hash Migration' });

    if (user.role !== 'Member') {
      setCurrentRole(user.role as OfficerRole);
    }
    showToastMessage(`Maayong adlaw, ${user.name}! Successful login.`, 'success');
  };

  const handleChangeOwnPassword = async (newPassword: string) => {
    if (!currentUser) return;
    const account = users.find((candidate) => candidate.id === currentUser.id);
    if (!account) return;
    if (import.meta.env.PROD || dbStatus.configured) {
      try {
        const response = await fetch('/api/auth/password/change', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPassword })
        });
        const result = await response.json();
        if (!response.ok || !result?.success) {
          showToastMessage(result?.message || 'Password could not be updated. Please try again.', 'error');
          return;
        }
        const updatedCurrent = { ...currentUser, mustChangePassword: false, passwordChangedAt: result.user?.passwordChangedAt || new Date().toISOString() };
        setCurrentUser(updatedCurrent);
        setUsers(previous => previous.map(candidate => candidate.id === currentUser.id ? updatedCurrent : candidate));
        updateStorage('bafa_current_user', updatedCurrent);
        setDismissedPasswordWarningFor(null);
        showToastMessage('Your password has been updated successfully.', 'success');
      } catch {
        showToastMessage('Password could not be updated because the server could not be reached.', 'error');
      }
      return;
    }
    const policyError = validatePasswordPolicy(newPassword, account.username, account.role, account.passwordHistory);
    if (policyError) {
      showToastMessage(policyError, 'error');
      return;
    }
    const nextChangedAt = new Date().toISOString();
    const updatedHistory = [...(account.passwordHistory || []), ...(account.passwordHash ? [{ hash: account.passwordHash, changedAt: account.passwordChangedAt || new Date(0).toISOString() }] : [])].slice(-5);
    const newPasswordHash = hashPolicyPassword(newPassword);
    const updatedUsers = users.map((candidate) => candidate.id === account.id ? {
      ...candidate,
      passwordHash: newPasswordHash,
      passwordHistory: updatedHistory,
      passwordChangedAt: nextChangedAt,
      mustChangePassword: false
    } : candidate);
    setUsers(updatedUsers);
    updateStorage('bafa_users', updatedUsers);
    const changedAccount = updatedUsers.find((candidate) => candidate.id === account.id)!;
    const { password, passwordHash, passwordHistory: _history, ...safeCurrent } = changedAccount;
    const updatedCurrent = { ...safeCurrent, mustChangePassword: false, passwordChangedAt: nextChangedAt, passwordHistory: updatedHistory };
    setCurrentUser(updatedCurrent);
    setDismissedPasswordWarningFor(null);
    updateStorage('bafa_current_user', updatedCurrent);
    if (isOnline) pushAllDataToCloud({ users: updatedUsers }, { silent: true, source: 'Password Changed' });
    showToastMessage('Your password has been updated successfully.', 'success');
  };

  const handleLogout = async () => {
    const logoutEpoch = ++authEpochRef.current;
    sessionRefreshAbortRef.current?.abort();
    sessionRefreshAbortRef.current = null;

    if (currentUser) {
      logAction('Logged Out', `${currentUser.name} signed out of the system.`);
    }
    setCurrentUser(null);
    removeSecureItem('bafa_current_user');
    setGuestMode(true);
    showToastMessage('You have been signed out securely. Session ended.', 'info');

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store'
      });
    } catch {
      // Offline or server logout unreachable; local session is already cleared.
    }

    if (authEpochRef.current === logoutEpoch) {
      removeSecureItem('bafa_current_user');
    }
  };

  const handleRegister = async (userData: Omit<User, 'id' | 'isApproved'>) => {
    const copy = { ...userData };
    if (!copy.password) {
      showToastMessage('Enter a password that meets the password policy.', 'error');
      return;
    }
    const rawPassword = copy.password;
    if (users.some((user) => user.username.toLowerCase() === copy.username.toLowerCase())) {
      showToastMessage('That username is already in use.', 'error');
      return;
    }
    const message = validatePasswordPolicy(rawPassword, copy.username, copy.role, copy.passwordHistory);
    if (message) {
      showToastMessage(message, 'error');
      return;
    }
    const hasPresidentAlready = users.some((user) => user.role === 'President');
    if (hasPresidentAlready && copy.role === 'President') {
      // Prevent privilege escalation: only the first setup may claim the President role.
      // Subsequent registrations are forced to Member status pending officer review.
      copy.role = 'Member';
    }
    const isInitialAdminBootstrap = !hasPresidentAlready && copy.role === 'President';

    copy.passwordHash = hashPolicyPassword(rawPassword);
    copy.passwordChangedAt = new Date().toISOString();
    delete copy.password;
    const newUser: User = {
      ...copy,
      id: `user-${Date.now()}`,
      username: copy.username.trim().toLowerCase(),
      passwordHistory: [],
      passwordChangedAt: copy.passwordChangedAt || new Date().toISOString(),
      mustChangePassword: false,
      failedLoginAttempts: 0,
      isApproved: isInitialAdminBootstrap,
      joinedDate: new Date().toISOString().split('T')[0],
      status: 'Active',
      mfaEnabled: isInitialAdminBootstrap ? true : Boolean(copy.mfaEnabled)
    };
    const updated = [newUser, ...users];
    setUsers(updated);
    updateStorage('bafa_users', updated);

    if (isOnline) {
      pushAllDataToCloud({ users: updated }, { silent: true, source: isInitialAdminBootstrap ? 'Admin Bootstrap' : 'User Registration' });
    }

    if (isInitialAdminBootstrap) {
      const { password: _p, passwordHash: _ph, passwordHistory: _hist, ...safeAdmin } = newUser;
      setCurrentUser({ ...safeAdmin, passwordChangedAt: newUser.passwordChangedAt, passwordHistory: [], mustChangePassword: false } as User);
      setCurrentRole('President');
      updateStorage('bafa_current_user', { ...safeAdmin, passwordChangedAt: newUser.passwordChangedAt, mustChangePassword: false });
      logAction('Bootstrapped Admin Account', `Created initial Admin/President account for ${newUser.name} (@${newUser.username}).`);
      showToastMessage(`Admin/President account created! Welcome, ${newUser.name}.`, 'success');
      return;
    }

    showToastMessage('Sign-up request received! Awaiting President/Admin approval.', 'warning');
  };

  const handleLoginFailed = (userId: string, state: { failedLoginAttempts: number; lockedUntil?: string }) => {
    const updated = users.map((candidate) =>
      candidate.id === userId
        ? { ...candidate, failedLoginAttempts: state.failedLoginAttempts, lockedUntil: state.lockedUntil }
        : candidate
    );
    setUsers(updated);
    updateStorage('bafa_users', updated);
  };

  const handleRequestPasswordReset = async (username: string, sitio: string) => {
    if (isOnline && (import.meta.env.PROD || dbStatus.configured)) {
      try {
        const response = await fetch('/api/auth/password/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, sitio })
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          showToastMessage(result?.message || 'Palihug sulayi pag-usab ang hangyo sa pag-reset.', 'error');
          return;
        }
        showToastMessage(
          'Kung adunay account nga motakdo, na-queue na ang imong hangyo sa mga opisyales sa AFA. (If an account matches, your reset request has been queued.)',
          'success'
        );
        return;
      } catch {
        // Fall through to local offline queue when the server cannot be reached.
      }
    }

    const matchedUser = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!matchedUser) {
      showToastMessage(
        'Kung adunay account nga motakdo, na-queue na ang imong hangyo sa mga opisyales sa AFA. (If an account matches, your reset request has been queued.)',
        'success'
      );
      return;
    }
    const updated = users.map(u => u.id === matchedUser.id ? { ...u, resetRequested: true } : u);
    setUsers(updated);
    updateStorage('bafa_users', updated);

    logAction('Requested Reset', `Requested password reset for ${matchedUser.name} (${matchedUser.username}) — ${sitio}`);
    if (isOnline) {
      pushAllDataToCloud({ users: updated }, { silent: true, source: 'Password Reset Requested' });
    } else {
      addToSyncQueue('update', 'user', { id: matchedUser.id, resetRequested: true });
    }
    showToastMessage(
      'Kung adunay account nga motakdo, na-queue na ang imong hangyo sa mga opisyales sa AFA. (If an account matches, your reset request has been queued.)',
      'success'
    );
  };

  const handleVerifyAdminPassword = async (
    password: string,
    totpCode?: string
  ): Promise<'verified' | 'mfa-required' | 'invalid'> => {
    if (!currentUser || (currentRole !== 'President' && currentRole !== 'Vice_President')) return 'invalid';

    if (import.meta.env.PROD || dbStatus.configured) {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentUser.username,
          password,
          ...(totpCode ? { totpCode } : {})
        })
      });
      const result = await response.json();
      if (result?.mfaRequired) return totpCode ? 'invalid' : 'mfa-required';
      if (!response.ok || !result?.success || result.user?.id !== currentUser.id) return 'invalid';
      return 'verified';
    }

    const account = users.find(user => user.id === currentUser.id);
    return account && verifyPassword(password, account.passwordHash, account.password)
      ? 'verified'
      : 'invalid';
  };

  /**
   * Destroys an account's authenticator so it re-enrols at next sign-in.
   * The server verifies the acting officer's password and enforces who may
   * reset whom (President: any officer; Secretary: members; self: MFA roles).
   */
  const handleResetMfa = async (
    userId: string,
    currentPassword: string
  ): Promise<{ success: boolean; message?: string }> => {
    if (!currentUser) return { success: false, message: 'Sign in to continue.' };
    const target = users.find(u => u.id === userId);
    if (!target) return { success: false, message: 'Target account was not found.' };

    if (import.meta.env.PROD || dbStatus.configured) {
      try {
        const response = await fetch('/api/auth/mfa/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ targetUserId: userId, currentPassword })
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.success) {
          return { success: false, message: result?.message || 'Two-factor reset was rejected.' };
        }
        logAction('Reset 2FA', `Authenticator reset for ${target.name} (@${target.username}); re-enrolment required.`);
        return { success: true };
      } catch {
        return { success: false, message: 'Two-factor reset could not reach the server.' };
      }
    }

    // Offline mode has no server-side authenticator state to clear; the account
    // simply loses its local secret and must complete MFA setup on next sign-in.
    const updated = users.map(u =>
      u.id === userId ? { ...u, totpSecret: undefined, mfaEnabled: false } : u
    );
    setUsers(updated);
    updateStorage('bafa_users', updated);
    if (currentUser.id === userId) {
      const nextCurrent = { ...currentUser, totpSecret: undefined, mfaEnabled: false };
      setCurrentUser(nextCurrent);
      updateStorage('bafa_current_user', nextCurrent);
    }
    logAction('Reset 2FA', `Authenticator reset for ${target.name} (@${target.username}); re-enrolment required.`);
    return { success: true };
  };

  const handleResetPassword = async (userId: string, newPass: string, currentPassword = ''): Promise<PasswordResetResult> => {
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return { success: false, message: 'That account could not be found.' };

    // The President may reset officer credentials; the Secretary may reset member credentials.
    // but the President's own account can never be reset from this desk.
    const canResetPasswords =
      !!currentUser && (
        currentUser.role === 'President' ||
        (['Secretary', 'Assistant_Secretary'].includes(currentUser.role) && targetUser.role === 'Member')
      );
    if (!canResetPasswords) {
      showToastMessage('Only the President may reset officer credentials; the Secretary may reset member credentials.', 'error');
      return { success: false, message: 'Only the President may reset officer credentials; the Secretary may reset member credentials.' };
    }
    if (targetUser.role === 'President') {
      showToastMessage('Dili ma-reset ang password sa Presidente. (The President\'s password cannot be reset.)', 'error');
      return { success: false, message: 'The President\'s password cannot be reset.' };
    }

    if (import.meta.env.PROD || dbStatus.configured) {
      try {
        // `credentials` must match the sign-in call: without it the session
        // cookie is dropped, the server sees an anonymous caller and answers
        // 401 "Authentication required.".
        const response = await fetch('/api/auth/password/reset', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, targetUserId: userId, newPassword: newPass, currentPassword })
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.success) {
          const reason = result?.message || 'Password reset was rejected.';
          showToastMessage(reason, 'error');
          return { success: false, message: reason };
        }
        const updatedTarget = { ...targetUser, mustChangePassword: true, resetRequested: false, failedLoginAttempts: 0, lockedUntil: undefined };
        setUsers(previous => previous.map(user => user.id === userId ? updatedTarget : user));
        updateStorage('bafa_users', users.map(user => user.id === userId ? updatedTarget : user));
        showToastMessage(`A temporary password was created for ${targetUser.name}; it must be changed at next sign-in.`, 'success');
        return { success: true };
      } catch {
        showToastMessage('Password reset could not be completed because the server could not be reached.', 'error');
        return { success: false, message: 'The server could not be reached. Check your connection and try again.' };
      }
    }

    if (!currentUser || !verifyPassword(currentPassword, currentUser.passwordHash, currentUser.password)) {
      showToastMessage('Your current password is incorrect.', 'error');
      return { success: false, message: 'Your current password is incorrect.' };
    }

    const safeHistory = Array.isArray(targetUser.passwordHistory) ? targetUser.passwordHistory : [];
    const policyError = validatePasswordPolicy(newPass, targetUser.username, targetUser.role, safeHistory);
    if (policyError) {
      showToastMessage(policyError, 'error');
      return { success: false, message: policyError };
    }
    const resetChangedAt = new Date().toISOString();
    const resetHash = hashPolicyPassword(newPass);
    const updated = users.map(u => {
      if (u.id === userId) {
        const { password, ...rest } = u;
        return {
          ...rest,
          passwordHash: resetHash,
          passwordHistory: [...safeHistory, ...(targetUser.passwordHash ? [{ hash: targetUser.passwordHash, changedAt: targetUser.passwordChangedAt || new Date(0).toISOString() }] : [])].slice(-5),
          passwordChangedAt: resetChangedAt,
          mustChangePassword: true,
          resetRequested: false,
          failedLoginAttempts: 0,
          lockedUntil: undefined
        };
      }
      return u;
    });
    setUsers(updated);
    updateStorage('bafa_users', updated);

    const newLog = logAction('Reset Password', `Updated password credentials for ${targetUser.name} (${targetUser.role})`);
    if (isOnline) {
      pushAllDataToCloud(
        { users: updated, systemLogs: [newLog, ...logs] },
        { silent: true, source: 'Password Reset' }
      );
    } else {
      addToSyncQueue('update', 'user', { id: userId, resetRequested: false });
    }
    showToastMessage(`Malampusong na-reset ang password ni ${targetUser.name}!`, 'success');
    return { success: true };
  };

  const handleDeleteUser = (id: string) => {
    const targetUser = users.find(u => u.id === id);
    if (!targetUser) return;

    // Authority guard: only the President (system admin) may delete users/officers.
    if (!currentUser || currentUser.role !== 'President') {
      showToastMessage('Wala kay katungod sa pagtangtang og account. Ang Presidente lamang ang makahimo niini. (Only the President may delete accounts.)', 'error');
      return;
    }

    const roleName = targetUser.role.replace('_', ' ');
    const isOfficer = ['President', 'Vice_President', 'Secretary', 'Assistant_Secretary', 'Board_Member', 'Treasurer', 'Assistant_Treasurer', 'Auditor', 'PIO'].includes(targetUser.role);

    const updatedUsers = users.filter(u => u.id !== id);
    setUsers(updatedUsers);
    updateStorage('bafa_users', updatedUsers);
    storeDeletedId('users', id);

    // Also remove from members roster if linked
    const updatedMembers = members.filter(m => m.id !== id && m.memberIdNumber !== targetUser.memberIdNumber);
    const memberRemoved = updatedMembers.length !== members.length;
    if (memberRemoved) {
      setMembers(updatedMembers);
      updateStorage('bafa_members', updatedMembers);
      storeDeletedId('members', id);
    }

    // Direct and permanent removal from PostgreSQL Cloud Database
    deleteFromDatabase('user', id);
    if (memberRemoved) {
      deleteFromDatabase('member', id);
    }

    logAction(
      isOfficer ? 'Deleted Officer & Revoked Role' : 'Revoked User Access',
      `Permanently deleted ${isOfficer ? 'officer' : 'user'} account for ${targetUser.name} and revoked role ${roleName}.`
    );

    // If currently logged-in user is the one being deleted
    if (currentUser && currentUser.id === id) {
      showToastMessage(`Your officer account (${roleName}) was deleted. Logging out...`, 'warning');
      setTimeout(() => {
        handleLogout();
      }, 1200);
      return;
    }

    if (isOnline) {
      showToastMessage(`Officer ${targetUser.name} (${roleName}) deleted. Auto-syncing to database...`, 'warning');
      pushAllDataToCloud({ users: updatedUsers, members: updatedMembers }, { silent: true, source: 'Officer Deletion' });
    } else {
      addToSyncQueue('delete', isOfficer ? 'officer' : 'user', { id, name: targetUser.name, role: targetUser.role });
      showToastMessage(`Officer ${targetUser.name} deleted offline. Will automatically sync to database on connection.`, 'warning');
    }
  };

  const handleUpdateUserRole = async (id: string, newRole: OfficerRole | 'Member') => {
    const targetUser = users.find(u => u.id === id);
    if (!targetUser) return;

    // Authority guard: only the President (system admin) may appoint or reassign officers.
    if (!currentUser || currentUser.role !== 'President') {
      showToastMessage('Wala kay katungod sa pag-appoint o pag-usab og role. Ang Presidente lamang ang makahimo niini. (Only the President may appoint or reassign officers.)', 'error');
      return;
    }

    if (targetUser.role === 'President' || newRole === 'President') {
      showToastMessage('Presidential role changes must use the verified turnover workflow.', 'error');
      return;
    }
    if (
      newRole !== 'Member' &&
      newRole !== 'Board_Member' &&
      users.some(user => user.id !== id && user.role === newRole)
    ) {
      showToastMessage(`The ${newRole.replace('_', ' ')} position is already filled.`, 'error');
      return;
    }

    const oldRoleName = targetUser.role.replace('_', ' ');
    const newRoleName = newRole.replace('_', ' ');

    const updatedUsers = users.map(u => u.id === id ? { ...u, role: newRole } : u);
    setUsers(updatedUsers);
    updateStorage('bafa_users', updatedUsers);

    // If current logged-in user role changed, update session
    if (currentUser && currentUser.id === id) {
      const updatedCurrent = { ...currentUser, role: newRole };
      setCurrentUser(updatedCurrent);
      setCurrentRole(newRole as any);
      // Keep role updates in memory; do not persist an alternate session identity in web storage.
    }

    const databaseConfigured = await refreshDatabaseConfiguration();
    if (databaseConfigured === false) {
      logAction(
        'Updated Officer Role',
        `Modified governance role for ${targetUser.name} from "${oldRoleName}" to "${newRoleName}".`
      );
      showToastMessage(`${targetUser.name}'s role was saved locally. Configure the database to sync it to the cloud.`, 'warning');
      return;
    }

    if (databaseConfigured && isOnline && navigator.onLine) {
      const saved = await pushAllDataToCloud(
        { roleUpdate: { userId: id, role: newRole } },
        { silent: true, source: 'Role Updated', scope: 'roleUpdate' }
      );
      if (saved) {
        logAction(
          'Updated Officer Role',
          `Modified governance role for ${targetUser.name} from "${oldRoleName}" to "${newRoleName}".`
        );
        showToastMessage(`${targetUser.name}'s role was saved to the database as ${newRoleName}.`, 'success');
      } else {
        const revertedUsers = updatedUsers.map(user => user.id === id ? targetUser : user);
        setUsers(revertedUsers);
        updateStorage('bafa_users', revertedUsers);
        showToastMessage(`Could not save ${targetUser.name}'s role to the database. The local change was reverted. Check the database connection and President session, then retry.`, 'error');
      }
    } else {
      addToSyncQueue('update', 'officer', { id, name: targetUser.name, newRole });
      logAction(
        'Updated Officer Role',
        `Modified governance role for ${targetUser.name} from "${oldRoleName}" to "${newRoleName}".`
      );
      showToastMessage(`Role updated offline. Will auto-sync to database once reconnected.`, 'warning');
    }
  };

  const handleAddOfficer = async (officerData: { name: string; username: string; password: string; role: OfficerRole }): Promise<boolean> => {
    if (!currentUser || currentUser.role !== 'President') {
      showToastMessage('Wala kay katungod sa pagdugang og opisyal. Ang Presidente/Admin lamang ang makahimo niini.', 'error');
      return false;
    }
    if (officerData.role === 'President') {
      showToastMessage('The President position can only be assigned through the verified turnover workflow.', 'error');
      return false;
    }
    if (
      officerData.role !== 'Board_Member' &&
      users.some(user => user.role === officerData.role)
    ) {
      showToastMessage(`The ${officerData.role.replace('_', ' ')} position is already filled.`, 'error');
      return false;
    }

    const cleanName = officerData.name.trim();
    const cleanUsername = officerData.username.trim().toLowerCase();
    const rawPassword = officerData.password.trim();

    if (!cleanName || !cleanUsername || !rawPassword) {
      showToastMessage('Palihug kompletoha ang Ngalan, Username, ug Password sa opisyal.', 'error');
      return false;
    }

    if (users.some(u => u.username.toLowerCase() === cleanUsername)) {
      showToastMessage('Kini nga username gigamit na sa laing account (Username already in use).', 'error');
      return false;
    }

    const policyError = validatePasswordPolicy(rawPassword, cleanUsername, officerData.role, []);
    if (policyError) {
      showToastMessage(policyError, 'error');
      return false;
    }

    const nowIso = new Date().toISOString();
    const officerId = `user-${Date.now()}`;
    const provision = await provisionServerAccount({
      id: officerId,
      username: cleanUsername,
      password: rawPassword,
      name: cleanName,
      role: officerData.role
    });
    if (provision.status === 'rejected') {
      showToastMessage(provision.message, 'error');
      return false;
    }
    const accountCreated = provision.status === 'created' || provision.status === 'local';
    const newOfficer: User = {
      id: officerId,
      username: cleanUsername,
      passwordHash: accountCreated ? hashPolicyPassword(rawPassword) : '',
      passwordHistory: [],
      passwordChangedAt: nowIso,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      name: cleanName,
      role: officerData.role,
      isApproved: true,
      joinedDate: nowIso.split('T')[0],
      status: 'Active'
    };

    const updatedUsers = [newOfficer, ...users];
    setUsers(updatedUsers);
    updateStorage('bafa_users', updatedUsers);

    const roleName = officerData.role.replace('_', ' ');
    logAction('Added Officer Account', `Created ${roleName} account for ${cleanName} (@${cleanUsername}).`);

    if (isOnline) {
      showToastMessage(
        accountCreated
          ? `Malampusong nadugang si ${cleanName} isip ${roleName}! Auto-syncing to database...`
          : `Added ${cleanName} as ${roleName}, but not the login. Set up credentials when the server is available.`,
        accountCreated ? 'success' : 'warning'
      );
      pushAllDataToCloud({ users: updatedUsers }, { silent: true, source: 'Officer Created' });
    } else {
      addToSyncQueue('create', 'officer', { id: newOfficer.id, name: cleanName, role: officerData.role });
      showToastMessage(`Officer ${cleanName} added offline without login credentials. Set up credentials when connected.`, 'warning');
    }
    return true;
  };

  const getPrimaryRoleDashboardLabel = (role: OfficerRole) => {
    switch (role) {
      case 'Secretary':
      case 'Assistant_Secretary':
        return 'Secretary Dashboard';
      case 'Treasurer':
      case 'Assistant_Treasurer':
        return 'Treasurer Dashboard';
      case 'Auditor':
        return 'Auditor Dashboard';
      case 'PIO':
        return 'PIO Information Board';
      case 'Board_Member':
        return 'Board Member View';
      case 'President':
      case 'Vice_President':
      default:
        return 'Executive Dashboard';
    }
  };

  const handleUpdateProfile = (updatedUser: User) => {
    const ownerFromList = currentUser ? users.find(u => u.id === currentUser.id) : undefined;
    const owner = ownerFromList || (currentUser && currentUser.id === updatedUser.id ? currentUser : null);
    if (!owner || updatedUser.id !== owner.id) {
      showToastMessage('Profile update denied: this account does not own the requested data.', 'error');
      return;
    }

    // Only allow profile fields to change; identity, role, approval, and credentials stay authoritative.
    const ownedProfile: User = {
      ...owner,
      name: updatedUser.name,
      avatarUrl: updatedUser.avatarUrl,
      memberIdNumber: updatedUser.memberIdNumber,
      rsbsaNumber: updatedUser.rsbsaNumber,
      isRsbsaRegistered: updatedUser.isRsbsaRegistered,
      farmLocation: updatedUser.farmLocation,
      primaryCrops: updatedUser.primaryCrops,
      contactNumber: updatedUser.contactNumber,
      status: updatedUser.status,
      joinedDate: updatedUser.joinedDate,
      affiliations: updatedUser.affiliations
    };

    const updatedUsers = ownerFromList
      ? users.map(u => u.id === owner.id ? ownedProfile : u)
      : [ownedProfile, ...users];
    setUsers(updatedUsers);
    void updateStorage('bafa_users', updatedUsers);

    setCurrentUser(ownedProfile);
    void updateStorage('bafa_current_user', ownedProfile);

    // Sync matching member roster record (for both Members and Officers-as-Members)
    const matchesMember = (m: Member) =>
      (ownedProfile.memberId && m.id === ownedProfile.memberId) ||
      m.id === ownedProfile.id ||
      Boolean(ownedProfile.memberIdNumber && m.memberIdNumber === ownedProfile.memberIdNumber) ||
      m.name.trim().toLowerCase() === ownedProfile.name.trim().toLowerCase() ||
      m.name.trim().toLowerCase() === owner.name.trim().toLowerCase();

    const hasMatchedMember = members.some(matchesMember);
    const updatedMembers = hasMatchedMember
      ? members.map(m => matchesMember(m) ? {
        ...m,
        name: ownedProfile.name,
        farmLocation: ownedProfile.farmLocation || m.farmLocation,
        primaryCrops: ownedProfile.primaryCrops || m.primaryCrops,
        contactNumber: ownedProfile.contactNumber || m.contactNumber,
        avatarUrl: ownedProfile.avatarUrl,
        affiliations: ownedProfile.affiliations || m.affiliations
      } : m)
      : members;

    if (hasMatchedMember) {
      setMembers(updatedMembers);
      void updateStorage('bafa_members', updatedMembers);
    }

    logAction('Updated Profile', `${ownedProfile.name} modified their profile details`);
    if (isOnline) {
      void pushAllDataToCloud(
        {
          users: updatedUsers,
          ...(hasMatchedMember ? { members: updatedMembers } : {})
        },
        { silent: true, source: 'Profile Updated' }
      );
    } else {
      addToSyncQueue('update', 'user', {
        id: ownedProfile.id,
        name: ownedProfile.name,
        avatarUrl: ownedProfile.avatarUrl,
        farmLocation: ownedProfile.farmLocation,
        contactNumber: ownedProfile.contactNumber,
        primaryCrops: ownedProfile.primaryCrops
      });
    }
    showToastMessage('Profile details updated successfully!', 'success');
  };

  const handlePresidentTurnover = (
    newPresidentId: string,
    electionDate: string,
    turnoverNotes: string,
    outgoingNewRole: 'Member' | 'Vice_President' | 'Secretary' | 'Assistant_Secretary' | 'Board_Member' | 'Treasurer' | 'Assistant_Treasurer' | 'Auditor' | 'PIO' | 'None'
  ) => {
    if (!currentUser || currentUser.role !== 'President') {
      showToastMessage('Only the currently authenticated President can complete officer turnover.', 'error');
      return;
    }
    const currentPresident = (currentUser && currentUser.role === 'President' ? users.find(u => u.id === currentUser.id) : null) || users.find(u => u.role === 'President');
    if (!currentPresident) {
      showToastMessage('Error: No active President found in the system.', 'error');
      return;
    }

    const newPresidentUser = users.find(u => u.id === newPresidentId);
    if (!newPresidentUser) {
      showToastMessage('Error: Selected new President user not found.', 'error');
      return;
    }
    if (!newPresidentUser.isApproved || newPresidentUser.role === 'Member') {
      showToastMessage('Only an approved officer may receive the presidency.', 'error');
      return;
    }
    if (newPresidentUser.id === currentPresident.id) {
      showToastMessage('Select a different officer to receive the presidency.', 'error');
      return;
    }

    const resolvedOutgoingRole = (outgoingNewRole === 'None' ? 'Member' : outgoingNewRole) as OfficerRole | 'Member';
    if (
      resolvedOutgoingRole !== 'Member' &&
      resolvedOutgoingRole !== 'Board_Member' &&
      users.some(user =>
        user.id !== currentPresident.id &&
        user.id !== newPresidentUser.id &&
        user.role === resolvedOutgoingRole
      )
    ) {
      showToastMessage(`The ${resolvedOutgoingRole.replace('_', ' ')} position is already filled.`, 'error');
      return;
    }

    const updatedUsers = users.map(user => {
      if (user.id === currentPresident.id) {
        return {
          ...user,
          role: resolvedOutgoingRole
        };
      }
      if (user.id === newPresidentId) {
        return { ...user, role: 'President' as const };
      }
      return user;
    });

    setUsers(updatedUsers);
    updateStorage('bafa_users', updatedUsers);

    const turnoverDetails = `FORMAL OFFICERS TURNOVER: Following the election on ${electionDate}, ${currentPresident.name} has formally turned over the presidency and all AFA files, keys, and assets to the newly-elected President, ${newPresidentUser.name}. Memo/Notes: ${turnoverNotes}`;
    const newLog = logAction('Presidential Turnover', turnoverDetails);

    if (isOnline) {
      pushAllDataToCloud(
        { users: updatedUsers, systemLogs: [newLog, ...logs] },
        { silent: true, source: 'Presidential Turnover' }
      );
    } else {
      addToSyncQueue('update', 'officer', {
        id: newPresidentId,
        name: newPresidentUser.name,
        newRole: 'President',
        previousPresidentId: currentPresident.id,
        outgoingNewRole: resolvedOutgoingRole
      });
    }

    if (currentUser) {
      if (currentUser.id === currentPresident.id) {
        const updatedCurrentUser = {
          ...currentUser,
          role: resolvedOutgoingRole
        };
        setCurrentUser(updatedCurrentUser);
        if (resolvedOutgoingRole !== 'Member') {
          setCurrentRole(resolvedOutgoingRole);
        }
        updateStorage('bafa_current_user', updatedCurrentUser);
      } else if (currentUser.id === newPresidentId) {
        const updatedCurrentUser = {
          ...currentUser,
          role: 'President' as const
        };
        setCurrentUser(updatedCurrentUser);
        setCurrentRole('President');
        updateStorage('bafa_current_user', updatedCurrentUser);
      }
    }

    showToastMessage(`Turnover completed! The new President is ${newPresidentUser.name}!`, 'success');
  };

  const handleRestoreSystemBackup = async (rawBackup: any): Promise<boolean> => {
    try {
      const data = rawBackup?.data || rawBackup;
      if (!data || typeof data !== 'object') {
        showToastMessage('Invalid backup format. Missing data structure.', 'error');
        return false;
      }

      let restoredCounts = 0;

      // 1. Members
      if (Array.isArray(data.members)) {
        setMembers(data.members);
        await updateStorage('bafa_members', data.members);
        restoredCounts += data.members.length;
      }

      // 2. Transactions
      const txList = Array.isArray(data.transactions) ? data.transactions : (Array.isArray(data.financialTransactions) ? data.financialTransactions : null);
      if (txList) {
        setTransactions(txList);
        await updateStorage('bafa_transactions', txList);
        restoredCounts += txList.length;
      }

      // 3. Meetings
      if (Array.isArray(data.meetings)) {
        setMeetings(data.meetings);
        await updateStorage('bafa_meetings', data.meetings);
        restoredCounts += data.meetings.length;
      }

      // 4. Resolutions
      if (Array.isArray(data.resolutions)) {
        setResolutions(data.resolutions);
        await updateStorage('bafa_resolutions', data.resolutions);
        restoredCounts += data.resolutions.length;
      }

      // 5. Announcements
      if (Array.isArray(data.announcements)) {
        setAnnouncements(data.announcements);
        await updateStorage('bafa_announcements', data.announcements);
      }

      // 6. Products
      if (Array.isArray(data.products)) {
        setProducts(data.products);
        await updateStorage('bafa_products', data.products);
      }

      // 7. Activities
      if (Array.isArray(data.activities)) {
        setActivities(data.activities);
        await updateStorage('bafa_activities', data.activities);
      }

      // 8. Achievements
      if (Array.isArray(data.achievements)) {
        setAchievements(data.achievements);
        await updateStorage('bafa_achievements', data.achievements);
      }

      // 9. Organization Funds
      if (Array.isArray(data.funds) || Array.isArray(data.organizationFunds)) {
        const fundsList = data.funds || data.organizationFunds;
        setFunds(fundsList);
        await updateStorage('bafa_funds', fundsList);
      }

      // 10. Inventory
      if (Array.isArray(data.inventory)) {
        setInventory(data.inventory);
        await updateStorage('bafa_inventory', data.inventory);
      }

      // 11. IGP / Livestock
      const igp = data.livestockIgp || data.afa_igp;
      if (igp && typeof igp === 'object') {
        setLivestockIgp(igp);
        await updateStorage('bafa_afa_igp', igp);
      }

      // 12. Users (Preserve existing credentials if not included in safe backup)
      if (Array.isArray(data.users) && data.users.length > 0) {
        const mergedUsers = [...users];
        for (const u of data.users) {
          const idx = mergedUsers.findIndex(existing => existing.id === u.id || existing.username?.toLowerCase() === u.username?.toLowerCase());
          if (idx >= 0) {
            mergedUsers[idx] = { ...mergedUsers[idx], ...u, password: mergedUsers[idx].password || u.password };
          } else {
            mergedUsers.push(u);
          }
        }
        setUsers(mergedUsers);
        await updateStorage('bafa_users', mergedUsers);
      }

      // 13. System Logs
      if (Array.isArray(data.logs) || Array.isArray(data.systemLogs)) {
        const logList = data.logs || data.systemLogs;
        setLogs(logList);
        await updateStorage('bafa_logs', logList);
      }

      const restoredState = {
        users: data.users || users,
        members: data.members || members,
        meetings: data.meetings || meetings,
        resolutions: data.resolutions || resolutions,
        financialTransactions: txList || transactions,
        announcements: data.announcements || announcements,
        products: data.products || products,
        activities: data.activities || activities,
        achievements: data.achievements || achievements,
        funds: data.funds || data.organizationFunds || funds,
        inventory: data.inventory || inventory,
        livestockIgp: igp || livestockIgp,
        systemLogs: data.logs || data.systemLogs || logs,
      };

      const synced = await pushAllDataToCloud(restoredState, { silent: true, source: 'Backup Restore' });
      if (synced) {
        checkDatabaseConnection();
        showToastMessage(`Backup successfully restored and synchronized! ${restoredCounts} core records updated.`, 'success');
      } else {
        showToastMessage(`Backup restored locally, but cloud synchronization is pending. ${restoredCounts} core records are saved on this device and will retry automatically.`, 'warning');
      }

      return true;
    } catch (err: any) {
      console.error('[Restore Error]:', err);
      showToastMessage(`Failed to restore backup: ${err?.message || 'Unknown error'}`, 'error');
      return false;
    }
  };

  const handleDownloadSystemBackup = () => {
    const backupData = {
      exportDate: new Date().toISOString(),
      exportedBy: currentUser ? `${currentUser.name} (${currentUser.role})` : 'Guest / System',
      association: 'Alegria Farmers Association (Tuburan, Cebu)',
      version: '1.0.0',
      data: {
        users: users.map(({ password, passwordHash, passwordHistory, ...safeUser }) => safeUser),
        members,
        meetings,
        resolutions,
        transactions,
        announcements,
        livestockIgp,
        products,
        activities,
        logs,
        syncQueue
      }
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `AFA_System_Backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToastMessage('System Backup downloaded successfully as a formatted JSON file!', 'success');
  };

  const isPrivacyPage = showPrivacyPage || (typeof window !== 'undefined' && (window.location.pathname === '/privacy' || window.location.pathname === '/privacy/'));
  if (isPrivacyPage) {
    return (
      <Suspense fallback={<DashboardSkeleton variant="app" />}>
        <PrivacyPolicy onBack={closePrivacyInApp} />
      </Suspense>
    );
  }

  if (isHydrating) {
    return <DashboardSkeleton variant={guestMode ? 'guest' : 'officer'} />;
  }

  if (!currentUser) {
    const publicPresidentName = cachedPublicSummary?.officers?.find(
      o => o.role.trim().toLowerCase() === 'president'
    )?.name;

    if (guestMode) {
      return (
        <Suspense fallback={<DashboardSkeleton variant="guest" />}>
          <GuestPortal
            onEnterLogin={() => setGuestMode(false)}
            onOpenPrivacy={openPrivacyInApp}
            members={members}
            livestockIgp={livestockIgp}
            products={products}
            announcements={announcements}
            activities={activities}
            achievements={achievements}
            users={users}
            cachedSummary={cachedPublicSummary}
            cachedAchievements={cachedPublicAchievements}
            cachedProducts={cachedPublicProducts}
            onPublicDataLoaded={handlePublicDataLoaded}
          />
        </Suspense>
      );
    }

    return (
      <div id="auth-screen-wrapper" className="min-h-screen bg-bafa-50">
        <Suspense fallback={<DashboardSkeleton variant="app" />}>
          <AuthScreen
            users={users}
            hasPresident={Boolean(dbStatus.hasPresident || users.some(u => u.role?.toLowerCase() === 'president'))}
            presidentName={publicPresidentName}
            onLogin={handleLogin}
            serverAuthRequired={import.meta.env.PROD || dbStatus.configured || dbStatus.checking}
            onRegister={handleRegister}
            onLoginFailed={handleLoginFailed}
            toast={showToastMessage}
            onRequestPasswordReset={handleRequestPasswordReset}
            onBackToGuest={() => setGuestMode(true)}
          />
        </Suspense>
        {toast && (
          <div className="fixed bottom-6 right-6 z-50">
            <div className={`flex items-center gap-2 px-4.5 py-3 rounded-2xl shadow-2xl border-2 text-sm font-extrabold max-w-sm ${toast.type === 'success'
              ? 'bg-bafa-700 text-bafa-100 border-bafa-600'
              : toast.type === 'warning'
                ? 'bg-amber-900 text-amber-100 border-amber-600'
                : toast.type === 'error'
                  ? 'bg-rose-950 text-rose-100 border-rose-600'
                  : 'bg-[#F7F4EF] text-[#1B4332] border-[#D5CFC1]'
              }`}>
              {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-300 shrink-0" />}
              {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0" />}
              <span>{toast.message}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (currentUser.role === 'Member') {
    return (
      <div id="member-screen-wrapper" className="min-h-screen bg-[#F3FAF5] text-[#163327] flex flex-col font-sans antialiased">
        {/* COMPACT STICKY DIMENSIONAL HEADER FOR MEMBER PORTAL */}
        <header className="app-header-forest shrink-0 text-white no-print">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 h-[62px] sm:h-[68px] flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-10 h-10 sm:w-11 sm:h-11 bg-white p-0.5 rounded-full shadow-sm shrink-0 overflow-hidden border-2 border-[#7EC79F]">
                <img src="/afa-logo.png" alt="Alegria Farmers Association logo" className="w-full h-full object-contain block rounded-full" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <h1 className="text-[13px] sm:text-base md:text-lg font-extrabold tracking-tight text-white uppercase font-display leading-tight truncate">
                    Alegria Farmers Association
                  </h1>
                  <span className="hidden sm:inline-flex text-[10px] bg-[#2D6A4F] text-[#FFF0C2] px-2 py-0.5 rounded-full border border-[#7EC79F]/30 font-extrabold font-mono shrink-0">
                    FAMS Member
                  </span>
                </div>
                <p className="brand-subtitle text-xs text-[#D6EFD9] font-medium truncate">
                  FAMS • Member Portal • Tuburan, Cebu
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              <div className="hidden md:block">
                <OfflineIndicator dbStatus={dbStatus} />
              </div>
              <LanguageToggle onDark />
              <div className="hidden sm:flex items-center gap-2 bg-[#0F2D24]/80 px-2.5 py-1 rounded-xl border border-[#7EC79F]/30">
                <div className="w-7 h-7 rounded-lg bg-[#FFF0C2] text-[#163327] font-mono font-extrabold flex items-center justify-center text-xs shrink-0 uppercase overflow-hidden">
                  {currentUser?.avatarUrl ? (
                    <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    currentUser?.name.substring(0, 2)
                  )}
                </div>
                <div className="text-left min-w-0 leading-tight">
                  <span className="block text-xs font-extrabold text-white truncate max-w-[120px] md:max-w-[160px]">{currentUser?.name}</span>
                  <span className="block text-[10px] text-[#D6EFD9] font-semibold truncate max-w-[120px]">
                    {currentUser?.farmLocation || 'Tuburan, Cebu'}
                  </span>
                </div>
              </div>
              <button
                id="header-member-logout-btn"
                type="button"
                onClick={handleLogout}
                className="btn-bevel-terracotta px-2.5 sm:px-3.5 py-2 rounded-xl font-extrabold text-xs cursor-pointer flex items-center gap-1.5 shrink-0"
                title="Sign out of member portal"
                aria-label="Logout"
              >
                <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
          <div className="hero-banig-border !h-[6px]" aria-hidden="true" />
        </header>

        <Suspense fallback={null}>
          {currentUser.mustChangePassword && (
            <PasswordChangePrompt
              user={currentUser}
              forced
              onSubmit={handleChangeOwnPassword}
            />
          )}
          {!currentUser.mustChangePassword && !dismissedPasswordWarningFor && currentUser.passwordChangedAt && (() => {
            const expiry = getPasswordExpiryStatus(currentUser.passwordChangedAt);
            return expiry.warning ? <PasswordChangePrompt user={users.find((candidate) => candidate.id === currentUser.id) || currentUser} forced={false} warningDays={expiry.daysRemaining} onSubmit={handleChangeOwnPassword} onClose={() => setDismissedPasswordWarningFor(currentUser.id)} /> : null;
          })()}
        </Suspense>
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6">
          <Suspense fallback={<DashboardSkeleton variant="member" />}>
            <MemberDashboard
              currentUser={currentUser}
              onUpdateProfile={handleUpdateProfile}
              onLogout={handleLogout}
              toast={showToastMessage}
              announcements={announcements}
              livestockIgpState={livestockIgp}
              members={members}
              onSubmitEggHarvest={handleSubmitEggHarvest}
              onUpdateEggHarvestStatus={handleUpdateEggHarvestStatus}
              products={products}
              activities={activities}
              users={users}
              membershipPayments={membershipPayments}
              duesAmount={duesAmount}
            />
          </Suspense>
        </main>

        {toast && (
          <div className="fixed bottom-20 md:bottom-6 right-4 left-4 sm:left-auto z-50 flex justify-center sm:justify-end pointer-events-none">
            <div className={`pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl border text-sm font-extrabold max-w-sm ${toast.type === 'success'
              ? 'bg-[#1B4332] text-[#D8F3DC] border-[#7EC79F]/40'
              : toast.type === 'warning'
                ? 'bg-amber-900 text-amber-100 border-amber-500'
                : toast.type === 'error'
                  ? 'bg-rose-950 text-rose-100 border-rose-500'
                  : 'bg-white text-[#1B4332] border-[#1B4332]/20'
              }`}>
              {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-[#F4C76D] shrink-0" />}
              {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0" />}
              <span>{toast.message}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div id="application-root" className="min-h-screen bg-[#F3FAF5] text-[#163327] flex flex-col font-sans antialiased lg:pl-72">

      {/* GLOBAL TOAST NOTIFICATION BANNER */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-6 right-4 left-4 sm:left-auto z-50 flex justify-center sm:justify-end pointer-events-none">
          <div className={`pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl border text-sm font-extrabold max-w-sm ${toast.type === 'success'
            ? 'bg-[#1B4332] text-[#D8F3DC] border-[#7EC79F]/40'
            : toast.type === 'warning'
              ? 'bg-amber-900 text-amber-100 border-amber-500'
              : toast.type === 'error'
                ? 'bg-rose-950 text-rose-100 border-rose-500'
                : 'bg-white text-[#1B4332] border-[#1B4332]/20'
            }`}>
            {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-[#F4C76D] shrink-0" />}
            {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0" />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
      <Suspense fallback={null}>
        {currentUser.mustChangePassword && (
          <PasswordChangePrompt
            user={currentUser}
            forced
            onSubmit={handleChangeOwnPassword}
          />
        )}
        {!currentUser.mustChangePassword && !dismissedPasswordWarningFor && currentUser.passwordChangedAt && (() => {
          const expiry = getPasswordExpiryStatus(currentUser.passwordChangedAt);
          return expiry.warning ? <PasswordChangePrompt user={users.find((candidate) => candidate.id === currentUser.id) || currentUser} forced={false} warningDays={expiry.daysRemaining} onSubmit={handleChangeOwnPassword} onClose={() => setDismissedPasswordWarningFor(currentUser.id)} /> : null;
        })()}
      </Suspense>

      {/* COMPACT STICKY DIMENSIONAL HEADER FOR OFFICER SUITE */}
      <header className="app-header-forest shrink-0 text-white no-print">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-[62px] sm:h-[68px] flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="lg:hidden w-10 h-10 bg-white p-0.5 rounded-full shadow-sm shrink-0 overflow-hidden border-2 border-[#7EC79F]">
              <img src="/afa-logo.png" alt="Alegria Farmers Association logo" className="w-full h-full object-contain block rounded-full" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <h1 className="text-[13px] sm:text-base md:text-lg font-extrabold tracking-tight text-white uppercase font-display leading-tight truncate">
                  Alegria Farmers Association
                </h1>
                <span className="hidden sm:inline-flex text-[10px] bg-[#2D6A4F] text-[#FFF0C2] px-2 py-0.5 rounded-full border border-[#7EC79F]/30 font-extrabold font-mono shrink-0">
                  FAMS Suite
                </span>
              </div>
              <p className="brand-subtitle text-xs text-[#D6EFD9] font-medium truncate">
                {getPrimaryRoleDashboardLabel(currentRole)} • Barangay Alegria, Tuburan
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <div className="hidden sm:block">
              <OfflineIndicator dbStatus={dbStatus} />
            </div>
            <LanguageToggle onDark />
            {/* Active officer chip */}
            <div className="hidden md:flex items-center gap-2 bg-[#0F2D24]/80 px-2.5 py-1 rounded-xl border border-[#7EC79F]/30 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-[#FFF0C2] text-[#163327] font-mono font-extrabold flex items-center justify-center text-xs shrink-0 uppercase overflow-hidden">
                {currentUser?.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  currentUser?.name.substring(0, 2)
                )}
              </div>
              <div className="text-left min-w-0 leading-tight">
                <span className="block text-xs font-extrabold text-white truncate max-w-[140px]">{currentUser?.name}</span>
                <span className="block text-[10px] text-[#D6EFD9] font-bold uppercase tracking-wide truncate">
                  {currentUser?.role.replace('_', ' ')}
                </span>
              </div>
            </div>
            <button
              id="header-officer-logout-btn"
              type="button"
              onClick={handleLogout}
              className="lg:hidden btn-bevel-terracotta px-2.5 sm:px-3 py-2 rounded-xl font-extrabold text-xs cursor-pointer flex items-center gap-1.5 shrink-0"
              title="Sign out of administration suite"
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
        <div className="hero-banig-border !h-[6px]" aria-hidden="true" />
      </header>

      {/* PERMANENT LEFT SIDEBAR NAVIGATION (Desktop 1024px+) */}
      {!guestMode && currentUser && (currentUser.role as string) !== 'Member' && (
        <aside
          id="officer-left-sidebar"
          className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-72 flex-col app-sidebar-dimensional text-white no-print"
        >
          {/* FAMS Brand Header in Sidebar */}
          <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
            <div className="w-11 h-11 bg-white p-0.5 rounded-full shadow-md shrink-0 overflow-hidden border-2 border-[#7EC79F]">
              <img src="/afa-logo.png" alt="Alegria Farmers Association logo" className="w-full h-full object-contain block rounded-full" />
            </div>
            <div className="min-w-0 text-left">
              <span className="block font-display text-sm font-bold text-white leading-tight truncate">
                AFA • FAMS Portal
              </span>
              <span className="block text-[11px] font-bold text-[#FFF0C2] uppercase tracking-wider truncate">
                {currentUser?.role.replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 pt-4 pb-4 space-y-1" aria-label="Officer navigation">
            <p className="px-3 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-[#95D5B2]">Main Views</p>
            {([
              { tab: 'tasks' as const, label: getPrimaryRoleDashboardLabel(currentRole), icon: ShieldCheck },
              { tab: 'livestock' as const, label: 'IGP Tracker', icon: Briefcase },
              { tab: 'announcements' as const, label: 'Announcements Board', icon: Megaphone },
              { tab: 'member-view' as const, label: 'Member Portal & ID', icon: Users },
              { tab: 'products' as const, label: 'Products Catalog', icon: ShoppingBag }
            ]).map(({ tab, label, icon: Icon }) => {
              const isActive = officerTab === tab;
              return (
                <button
                  key={tab}
                  id={`sidebar-nav-${tab}`}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => {
                    setOfficerTab(tab);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-bold text-left transition-all cursor-pointer border ${isActive
                    ? 'bg-[#D6EFD9] text-[#1B4332] border-[#7EC79F] shadow-md'
                    : 'bg-transparent text-[#D6EFD9] border-transparent hover:bg-white/10 hover:text-white'
                    }`}
                >
                  <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-[#1B4332]' : 'text-[#95D5B2]'}`} />
                  <span className="truncate">{label}</span>
                  {isActive && <span className="ml-auto w-2 h-2 rounded-full bg-[#C2410C] shrink-0" aria-hidden="true" />}
                </button>
              );
            })}

            <p className="px-3 pt-4 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-[#95D5B2]">System</p>
            <button
              id="sidebar-nav-sync"
              type="button"
              onClick={() => jumpToDashboardSection('sync-queue-panel-window')}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-bold text-left bg-transparent text-[#D6EFD9] border border-transparent hover:bg-white/10 hover:text-white transition-all cursor-pointer"
            >
              <Layers className="w-4.5 h-4.5 shrink-0 text-[#95D5B2]" />
              <span className="truncate">Sync Queue</span>
              {(syncQueue.length > 0 || hasPendingCloudSync) && (
                <span className="ml-auto min-w-6 text-center bg-[#F4C76D] text-[#163327] text-[11px] font-extrabold px-1.5 py-0.5 rounded-full">
                  {syncQueue.length || 1}
                </span>
              )}
            </button>

            <button
              id="sidebar-nav-logout"
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-bold text-left bg-rose-950/50 text-rose-100 border border-rose-700/40 hover:bg-rose-900 hover:text-white transition-all cursor-pointer mt-2"
              title="Sign out of administration suite"
            >
              <LogOut className="w-4.5 h-4.5 shrink-0 text-rose-300" />
              <span className="truncate">Logout</span>
            </button>
          </nav>

          {/* Footer status */}
          <div className="px-5 py-3.5 border-t border-white/10 bg-[#0B221B]/60">
            <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#D6EFD9]">
              <span className="flex items-center gap-2 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dbStatus.connected ? 'bg-emerald-400' : 'bg-[#F4C76D]'}`} aria-hidden="true" />
                <span className="truncate">{dbStatus.checking ? 'Checking database…' : dbStatus.connected ? 'Supabase Live' : 'Local Storage'}</span>
              </span>
              <span className="font-mono text-[10px] text-[#95D5B2] shrink-0">DOLE #2315</span>
            </div>
          </div>
        </aside>
      )}

      {/* MAIN LAYOUT BODY */}
      <main className="flex-1 px-3 sm:px-5 lg:px-6 py-4 sm:py-5 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-5">

          {/* OFFICER TABLET TAB BAR (768px-1023px — mobile uses bottom dock, desktop uses left sidebar) */}
          <nav aria-label="Officer tablet navigation" className="hidden md:block lg:hidden dim-card rounded-2xl p-2 no-print">
            <div className="grid grid-cols-5 gap-1.5">
              {([
                { id: 'officer-tasks-tab-btn', tab: 'tasks' as const, label: getPrimaryRoleDashboardLabel(currentRole), icon: ShieldCheck },
                { id: 'officer-livestock-tab-btn', tab: 'livestock' as const, label: 'IGP Tracker', icon: Briefcase },
                { id: 'officer-announcements-tab-btn', tab: 'announcements' as const, label: 'Notices', icon: Megaphone },
                { id: 'officer-member-view-tab-btn', tab: 'member-view' as const, label: 'My Member ID', icon: Users },
                { id: 'officer-products-tab-btn', tab: 'products' as const, label: 'Market', icon: ShoppingBag }
              ]).map(({ id, tab, label, icon: Icon }) => {
                const isActive = officerTab === tab;
                return (
                  <button
                    key={tab}
                    id={id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      setOfficerTab(tab);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`px-3 py-2.5 text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 rounded-xl border cursor-pointer min-w-0 ${isActive
                      ? 'bg-[#D6EFD9] border-[#1B4332]/30 text-[#1B4332] shadow-xs'
                      : 'border-transparent text-[#455C50] hover:text-[#1B4332] hover:bg-[#FAF8F5]'
                      }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <Suspense fallback={<DashboardSkeleton variant="officer" />}>
            {officerTab === 'tasks' && (
              /* ACTIVE VIEW WRAPPER */
              <div id="officer-dashboard-window" className="dim-card p-3.5 sm:p-5 lg:p-6 rounded-3xl text-[#163327]">
                {/* President & Vice President View */}
                {(currentRole === 'President' || currentRole === 'Vice_President') && (
                  <ExecutiveView
                    members={members}
                    meetings={meetings}
                    resolutions={resolutions}
                    onApproveResolution={handleApproveResolution}
                    transactions={transactions}
                    logs={logs}
                    currentRole={currentRole}
                    currentUserId={currentUser?.id}
                    onUpdateLogs={(newLogs) => {
                      setLogs(newLogs);
                      updateStorage('bafa_logs', newLogs);
                    }}
                    users={users}
                    onAddOfficer={handleAddOfficer}
                    onDeleteUser={handleDeleteUser}
                    onUpdateUserRole={handleUpdateUserRole}
                    onResetPassword={handleResetPassword}
                    onResetMfa={handleResetMfa}
                    onPresidentTurnover={handlePresidentTurnover}
                    onOpenReportModal={() => setShowReportModal(true)}
                    onDownloadBackup={currentRole === 'President' ? handleDownloadSystemBackup : undefined}
                    onRestoreBackup={currentRole === 'President' ? handleRestoreSystemBackup : undefined}
                    onVerifyAdminPassword={handleVerifyAdminPassword}
                    activities={activities}
                    livestockIgp={livestockIgp}
                    funds={funds}
                    onApproveMeetingMinutes={handleApproveMeetingMinutes}
                    onReturnMeetingMinutes={handleReturnMeetingMinutes}
                    onPresidentReturnTransaction={currentRole === 'President' || hasDelegatedRecordApproval ? handlePresidentReturnTransaction : undefined}
                    onPresidentApproveTransaction={currentRole === 'President' || hasDelegatedRecordApproval ? handlePresidentApproveTransaction : undefined}
                    delegationRequests={delegationRequests}
                    isOnline={isOnline}
                    isRefreshingDelegations={isRefreshingDelegations}
                    onRefreshDelegations={handleRefreshDelegations}
                    onRequestDelegation={handleRequestDelegation}
                    onReviewDelegation={handleReviewDelegation}
                    onRevokeDelegation={handleRevokeDelegation}
                    membershipPayments={membershipPayments}
                    membershipYear={new Date().getFullYear()}
                    onUpdateUser={(updatedUser) => {
                      const exists = users.some(u => u.id === updatedUser.id || u.username.toLowerCase() === updatedUser.username.toLowerCase());
                      const updated = exists
                        ? users.map(u => (u.id === updatedUser.id || u.username.toLowerCase() === updatedUser.username.toLowerCase()) ? { ...u, ...updatedUser } : u)
                        : [...users, updatedUser];
                      setUsers(updated);
                      updateStorage('bafa_users', updated);
                      if (currentUser?.id === updatedUser.id || currentUser?.username.toLowerCase() === updatedUser.username.toLowerCase()) {
                        const nextCurrent = { ...currentUser, ...updatedUser };
                        setCurrentUser(nextCurrent);
                        updateStorage('bafa_current_user', nextCurrent);
                      }
                      if (isOnline) {
                        pushAllDataToCloud({ users: updated }, { silent: true, source: 'User Updated' });
                      } else {
                        addToSyncQueue('update', 'user', updatedUser);
                      }
                      showToastMessage(
                        updatedUser.mfaEnabled
                          ? 'Two-factor authentication (2FA) is now required for the President account.'
                          : 'Two-factor authentication requirement disabled.',
                        'info'
                      );
                    }}
                  />
                )}

                {currentRole === 'Board_Member' && (
                  <BoardMemberView
                    resolutions={resolutions}
                    currentUser={currentUser!}
                    onAddResolution={handleAddResolution}
                  />
                )}

                {/* Secretary View */}
                {(currentRole === 'Secretary' || currentRole === 'Assistant_Secretary') && (
                  <SecretaryView
                    members={members}
                    users={users}
                    currentUser={currentUser!}
                    currentRole={currentRole}
                    membershipPayments={membershipPayments}
                    membershipYear={currentMembershipYear}
                    onAddMember={async (memberData, loginCredentials) => {
                      if (loginCredentials && users.some((user) => user.username.toLowerCase() === loginCredentials.username.toLowerCase())) {
                        showToastMessage('That username is already in use.', 'error');
                        return { saved: false, accountCreated: false };
                      }
                      return handleAddMember(memberData, loginCredentials);
                    }}
                    onUpdateMember={handleUpdateMember}
                    onUpdateMemberStatus={handleUpdateMemberStatus}
                    onDeleteMember={handleDeleteMember}
                    onManageMemberLogin={handleManageMemberLogin}
                    onResetMemberPassword={handleResetPassword}
                    meetings={meetings}
                    onAddMeeting={handleAddMeeting}
                    onUpdateMeeting={handleUpdateMeeting}
                    onDeleteMeeting={handleDeleteMeeting}
                    resolutions={resolutions}
                    onAddResolution={handleAddResolution}
                    onDeleteResolution={handleDeleteResolution}
                    isOnline={isOnline}
                    onOpenReportModal={() => setShowReportModal(true)}
                  />
                )}

                {(currentRole === 'Treasurer' || currentRole === 'Assistant_Treasurer') && (
                  <TreasurerView
                    transactions={transactions}
                    activities={activities}
                    meetings={meetings}
                    funds={funds}
                    livestockIgp={livestockIgp}
                    inventory={inventory}
                    onAddTransaction={handleAddTransaction}
                    onDeleteTransaction={handleDeleteTransaction}
                    onAddFund={handleAddFund}
                    onDeleteFund={handleDeleteFund}
                    onOpenReportModal={() => setShowReportModal(true)}
                    users={users}
                    currentUser={currentUser!}
                    currentRole={currentRole}
                    members={members}
                    membershipPayments={membershipPayments}
                    membershipYearSnapshots={membershipYearSnapshots}
                    duesAmount={duesAmount}
                    onRecordMembershipPayment={handleRecordMembershipPayment}
                    onVoidMembershipPayment={handleVoidMembershipPayment}
                    onCloseMembershipYear={handleCloseMembershipYear}
                    onUpdateDuesAmount={handleUpdateDuesAmount}
                  />
                )}

                {currentRole === 'Auditor' && (
                  <AuditorView
                    transactions={transactions}
                    activities={activities}
                    meetings={meetings}
                    livestockIgp={livestockIgp}
                    onAuditTransaction={handleAuditTransaction}
                    onOpenReportModal={() => setShowReportModal(true)}
                    inventory={inventory}
                    products={products}
                    onUpdateInventory={handleUpdateInventoryItem}
                    onPublishRentalProduct={handlePublishRentalProduct}
                    auditorName={`Auditor (${getOfficerName('Auditor')})`}
                  />
                )}

                {/* PIO View */}
                {currentRole === 'PIO' && (
                  <PioView
                    announcements={announcements}
                    activities={activities}
                    achievements={achievements}
                    onAddAnnouncement={handleAddAnnouncement}
                    onDeleteAnnouncement={handleDeleteAnnouncement}
                    onAddAchievement={handleAddAchievement}
                    onDeleteAchievement={handleDeleteAchievement}
                    onAddActivity={handleAddActivity}
                    onUpdateActivity={handleUpdateActivity}
                    onDeleteActivity={handleDeleteActivity}
                    onOpenReportModal={() => setShowReportModal(true)}
                  />
                )}

              </div>
            )}

            {officerTab === 'livestock' && (
              <div id="officer-livestock-window" className="dim-card p-3.5 sm:p-5 lg:p-6 rounded-3xl text-[#163327] text-left">
                <LivestockMonitor
                  state={livestockIgp}
                  funds={funds}
                  members={members}
                  meetings={meetings}
                  membershipPayments={membershipPayments}
                  membershipYear={currentMembershipYear}
                  onAddExpense={handleAddPigExpense}
                  onUpdateExpense={handleUpdatePigExpense}
                  onDeleteExpense={handleDeletePigExpense}
                  onAddSale={handleAddHogSale}
                  onUpdateSale={handleUpdateHogSale}
                  onDeleteSale={handleDeleteHogSale}
                  onSubmitEggHarvest={handleSubmitEggHarvest}
                  onUpdateEggHarvestStatus={handleUpdateEggHarvestStatus}
                  isAuditor={currentRole === 'Auditor'}
                  isPresident={currentRole === 'President'}
                  canSignEggHarvests={hasDelegatedRecordApproval}
                  onAddProduce={handleAddProduce}
                  onDeleteProduce={handleDeleteProduce}
                  isTreasurerOrOfficer={['Auditor', 'Treasurer', 'Assistant_Treasurer', 'President', 'Vice_President'].includes(currentRole || '')}
                  isTreasurer={currentRole === 'Treasurer' || currentRole === 'Assistant_Treasurer'}
                  currentUser={currentUser!}
                  isOfficerMode={true}
                  users={users}
                  closedYears={livestockIgp.closedYears || [2025]}
                  onCloseDecemberBook={handleCloseDecemberBook}
                />
              </div>
            )}

            {officerTab === 'products' && (
              <div id="officer-products-window" className="w-full">
                <ProductManagementModal
                  products={products}
                  currentRole={currentRole}
                  onAddProduct={handleAddProduct}
                  onUpdateProduct={handleUpdateProduct}
                  onDeleteProduct={handleDeleteProduct}
                  onClose={() => setOfficerTab('tasks')}
                  users={users}
                />
              </div>
            )}

            {officerTab === 'announcements' && (
              <div id="officer-announcements-window" className="dim-card p-3.5 sm:p-5 lg:p-6 rounded-3xl text-[#163327]">
                {/* President, PIO, or a Vice President with active content delegation can publish announcements & activities. */}
                {currentRole === 'President' || currentRole === 'PIO' || hasDelegatedContentPosting ? (
                  <PioView
                    announcements={announcements}
                    activities={activities}
                    achievements={achievements}
                    onAddAnnouncement={handleAddAnnouncement}
                    onDeleteAnnouncement={handleDeleteAnnouncement}
                    onAddAchievement={handleAddAchievement}
                    onDeleteAchievement={handleDeleteAchievement}
                    onAddActivity={handleAddActivity}
                    onUpdateActivity={handleUpdateActivity}
                    onDeleteActivity={handleDeleteActivity}
                    postedByName={
                      currentRole === 'President'
                        ? `President (${currentUser?.name || 'AFA President'})`
                        : currentRole === 'PIO'
                          ? `PIO (${currentUser?.name || 'AFA PIO'})`
                          : `Vice President (${currentUser?.name || 'AFA Vice President'})`
                    }
                    activityOrganizerName={
                      currentRole === 'President'
                        ? `President (${currentUser?.name || 'AFA President'})`
                        : currentRole === 'PIO'
                          ? `PIO (${currentUser?.name || 'AFA PIO'})`
                          : `Vice President (${currentUser?.name || 'AFA Vice President'})`
                    }
                    postingOnly={currentRole === 'Vice_President'}
                  />
                ) : (
                  <AnnouncementDashboard
                    announcements={announcements}
                    isOfficerMode={false}
                  />
                )}
              </div>
            )}

            {officerTab === 'member-view' && (
              <div id="officer-member-view-window" className="dim-card-warm text-[#163327] p-3.5 sm:p-5 lg:p-6 rounded-3xl space-y-4">
                <div className="dim-card-mint rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-[#1B4332] text-[#FFF0C2] rounded-xl shadow-xs">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-display text-base sm:text-lg font-bold text-[#1B4332]">My Member Dashboard & ID</h2>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOfficerTab('tasks');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="btn-bevel-forest px-4 py-2 text-xs font-extrabold rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <img src="/afa-logo.png" alt="Alegria Farmers Association logo" className="w-6 h-6 object-contain rounded-full bg-white shrink-0" />
                    <span>Back to Officer Suite</span>
                  </button>
                </div>

                <MemberDashboard
                  currentUser={currentUser!}
                  onUpdateProfile={handleUpdateProfile}
                  onLogout={handleLogout}
                  toast={showToastMessage}
                  announcements={announcements}
                  livestockIgpState={livestockIgp}
                  members={members}
                  onSubmitEggHarvest={handleSubmitEggHarvest}
                  onUpdateEggHarvestStatus={handleUpdateEggHarvestStatus}
                  products={products}
                  activities={activities}
                  users={users}
                  membershipPayments={membershipPayments}
                  duesAmount={duesAmount}
                />
              </div>
            )}

            {/* OFFLINE SYNC QUEUE MANAGEMENT SCREEN (Always available to monitor) */}
            <div id="sync-queue-panel-window">
              <SyncQueuePanel
                queue={syncQueue}
                isOnline={isOnline}
                hasPendingCloudSync={hasPendingCloudSync}
                onSync={handleSynchronize}
                isSyncing={isSyncing}
                onClearQueue={handleClearQueue}
                onRemoveItem={handleRemoveQueueItem}
              />
            </div>
          </Suspense>

        </div>
      </main>

      {/* LOWER FOOTER */}
      <footer className="bg-slate-900 border-t border-slate-800 py-4 px-6 text-center text-xs text-slate-500 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© 2026 Alegria Farmers Association (AFA) • Tuburan, Cebu</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Offline-First Progressive Web App (PWA) Standard Certified
          </span>
        </div>
      </footer>

      {/* OFFICER REPORT & EXPORT MODAL */}
      {showReportModal && (
        <Suspense fallback={null}>
          <OfficerReportModal
            currentRole={currentRole}
            users={users}
            members={members}
            meetings={meetings}
            resolutions={resolutions}
            transactions={transactions}
            announcements={announcements}
            activities={activities}
            achievements={achievements}
            inventory={inventory}
            products={products}
            logs={logs}
            funds={funds}
            livestockIgp={livestockIgp}
            delegationRequests={delegationRequests}
            membershipPayments={membershipPayments}
            onClose={() => setShowReportModal(false)}
            onDownloadBackup={currentRole === 'President' ? handleDownloadSystemBackup : undefined}
          />
        </Suspense>
      )}

      {/* PRESIDENT'S LETTERHEAD REPORT (print / save as PDF) — UNIFIED EXECUTIVE SUMMARY:
          no financial statements; those are the Treasurer's exclusive export. */}
      {showPresidentReport && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 p-4">
          <div className="mx-auto max-w-[210mm]">
            <button
              type="button"
              onClick={() => setShowPresidentReport(false)}
              className="mb-3 w-full rounded-xl bg-white px-4 py-2 text-sm font-black text-[#1B4332] shadow hover:bg-slate-100 cursor-pointer print:hidden"
            >
              ✕ Close Report
            </button>
            <Suspense fallback={<div className="p-8 text-center text-white font-bold">Loading report...</div>}>
              <PresidentReport
                data={buildReportData({
                  year: new Date().getFullYear(),
                  users,
                  members,
                  meetings,
                  resolutions,
                  transactions,
                  announcements,
                  activities,
                  achievements,
                  inventory,
                  products,
                  livestockIgp,
                  delegationRequests,
                  membershipPayments,
                })}
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* PRODUCT MANAGEMENT MODAL */}
      {showProductModal && (
        <Suspense fallback={null}>
          <ProductManagementModal
            products={products}
            currentRole={currentRole}
            onAddProduct={handleAddProduct}
            onUpdateProduct={handleUpdateProduct}
            onDeleteProduct={handleDeleteProduct}
            onClose={() => setShowProductModal(false)}
            users={users}
          />
        </Suspense>
      )}

      {/* CONFIRM CLEAR LOCAL CACHE IN-MODAL DIALOG */}
      <ConfirmationModal
        isOpen={showClearCacheConfirmModal}
        title="Limpyohan ang Local Browser Cache?"
        description="Limpyohan ang local browser table caches niini nga device? Ang tanang opisyal nga records luwas nga nakasulod ug naka-sync sa inyong live Supabase database."
        notice="🔒 Ang paglimpyo sa cache magpatuman sa Zero-Residual confidential storage policy sa maong kompyuter."
        icon={<Database className="w-6 h-6" />}
        confirmLabel="Oo, Limpyohan ang Cache"
        cancelLabel="Kanselahon"
        onCancel={() => setShowClearCacheConfirmModal(false)}
        onConfirm={executeClearLocalCache}
      />

      {/* FIXED 5-TAB OFFICER MOBILE BOTTOM DOCK (<768px) */}
      <nav
        aria-label="Officer mobile navigation"
        className="mobile-bottom-dock cols-5 no-print"
      >
        {([
          { tab: 'tasks' as const, label: 'Suite', icon: ShieldCheck },
          { tab: 'livestock' as const, label: 'IGP', icon: Briefcase },
          { tab: 'announcements' as const, label: 'Notices', icon: Megaphone },
          { tab: 'member-view' as const, label: 'My ID', icon: Users },
          { tab: 'products' as const, label: 'Market', icon: ShoppingBag }
        ]).map(({ tab, label, icon: Icon }) => {
          const isActive = officerTab === tab;
          return (
            <button
              key={tab}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                setOfficerTab(tab);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`mobile-dock-btn ${isActive ? 'is-active' : ''}`}
            >
              <Icon className="w-[19px] h-[19px] shrink-0" aria-hidden="true" />
              <span className="mobile-dock-label">{label}</span>
            </button>
          );
        })}
      </nav>

    </div>
  );
}
