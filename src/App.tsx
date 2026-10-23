import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { 
  OfficerRole, Member, Meeting, Resolution, 
  FinancialTransaction, Announcement, SyncQueueItem, SystemLog, User, HogRaisingState, HogHerdBreakdown,
  IgpExpense, IgpSale, IgpChoreLog, Product, AssociationActivity, OrganizationFund, DatabaseStatus, InventoryItem
} from './types';
import {
  INITIAL_MEMBERS, INITIAL_MEETINGS, INITIAL_RESOLUTIONS,
  INITIAL_TRANSACTIONS, INITIAL_ANNOUNCEMENTS, INITIAL_LOGS, INITIAL_HOG_RAISING,
  INITIAL_PRODUCTS, INITIAL_ACTIVITIES, INITIAL_FUNDS
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
import PasswordChangePrompt from './components/PasswordChangePrompt';
import ConfirmationModal from './components/ConfirmationModal';
import { useDatabaseStatus } from './hooks/useDatabaseStatus';
import { buildAuditChain, hashPassword, verifyPassword, sanitizeUserForStorage } from './utils/audit';
import { generateInitialPassword, getPasswordExpiryStatus, hashPassword as hashPolicyPassword, isLegacyPasswordHash, validatePasswordPolicy } from './utils/passwordPolicy';
import { LanguageToggle } from './i18n/LanguageContext';
import { clearSecureItems, getSecureItem, migrateSecureItems, removeSecureItem, setSecureItem } from './utils/secureStorage';
import { runNightlyBackupCheck } from './utils/backupSystem';
import {
  Building, ShieldCheck, Megaphone, Users, Coins,
  Layers, CheckCircle, AlertTriangle, HelpCircle, ArrowRight, LogOut, Briefcase, FileText, ShoppingBag,
  ChevronLeft, ChevronRight, Download, Database
} from 'lucide-react';

export default function App() {
  // Auth & Accounts State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [guestMode, setGuestMode] = useState<boolean>(true);
  const [dismissedPasswordWarningFor, setDismissedPasswordWarningFor] = useState<string | null>(null);

  // Connection and Sync State
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([]);
  const { dbStatus, setDbStatus, checkDatabaseConnection } = useDatabaseStatus();

  // Officer Role State
  const [currentRole, setCurrentRole] = useState<OfficerRole>('President');
  const [officerTab, setOfficerTab] = useState<'tasks' | 'hog-raising' | 'announcements' | 'member-view' | 'products'>('tasks');
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
  const [hogRaising, setHogRaising] = useState<HogRaisingState>(INITIAL_HOG_RAISING);
  const [products, setProducts] = useState<Product[]>([]);
  const [activities, setActivities] = useState<AssociationActivity[]>([]);
  const [funds, setFunds] = useState<OrganizationFund[]>([]);
  // Association inventory registry — custodial duty of the Auditor (no Property Custodian officer exists)
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);

  // Ref to prevent overlapping push requests and track synchronization status
  const isSyncingRef = useRef<boolean>(false);
  const appDataRef = useRef({
    users: [] as User[],
    members: [] as Member[],
    meetings: [] as Meeting[],
    resolutions: [] as Resolution[],
    transactions: [] as FinancialTransaction[],
    announcements: [] as Announcement[],
    products: [] as Product[],
    activities: [] as AssociationActivity[],
    hogRaising: INITIAL_HOG_RAISING,
    funds: [] as OrganizationFund[],
    inventory: [] as InventoryItem[],
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
      hogRaising,
      funds,
      inventory,
      logs
    };
  }, [users, members, meetings, resolutions, transactions, announcements, products, activities, hogRaising, funds, inventory, logs]);

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
        const storageKeys = ['bafa_members', 'bafa_meetings', 'bafa_resolutions', 'bafa_transactions', 'bafa_announcements', 'bafa_afa_igp', 'bafa_products', 'bafa_activities', 'bafa_funds', 'bafa_inventory', 'bafa_sync_queue', 'bafa_logs', 'bafa_users', 'bafa_current_user', 'bafa_read_announcements', 'bafa_closed_log_years', 'bafa_treasurer_categories'];
        clearSecureItems(['bafa_hog_raising']);
        await migrateSecureItems(storageKeys);
      if (cancelled) return;
      const [storedMembers, storedMeetings, storedResolutions, storedTransactions, storedAnnouncements, storedHogRaising, storedProducts, storedActivities, storedFunds, storedInventory, storedQueue, storedLogs, storedUsers] = await Promise.all([
        getSecureItem<Member[]>('bafa_members'),
        getSecureItem<Meeting[]>('bafa_meetings'),
        getSecureItem<Resolution[]>('bafa_resolutions'),
        getSecureItem<FinancialTransaction[]>('bafa_transactions'),
        getSecureItem<Announcement[]>('bafa_announcements'),
        getSecureItem<HogRaisingState>('bafa_afa_igp'),
        getSecureItem<Product[]>('bafa_products'),
        getSecureItem<AssociationActivity[]>('bafa_activities'),
        getSecureItem<OrganizationFund[]>('bafa_funds'),
        getSecureItem<InventoryItem[]>('bafa_inventory'),
        getSecureItem<SyncQueueItem[]>('bafa_sync_queue'),
        getSecureItem<SystemLog[]>('bafa_logs'),
        getSecureItem<User[]>('bafa_users')
      ]);

      // Detect and clear legacy dummy seed data from previous versions (e.g. Roberto Cañete / m-001)
      const storedMembersText = JSON.stringify(storedMembers || []);
      const hasOldSeedMembers = storedMembersText.includes('m-001') || storedMembersText.includes('Roberto M. Cañete') || storedMembersText.includes('Juanito') || storedMembersText.includes('user-m1');
      if (hasOldSeedMembers) {
        console.log('[Auto-Cleanup]: Detected legacy dummy seed data in local cache. Cleaning storage for real data...');
        clearSecureItems(['bafa_members', 'bafa_meetings', 'bafa_resolutions', 'bafa_transactions', 'bafa_announcements', 'bafa_products', 'bafa_activities', 'bafa_funds', 'bafa_afa_igp']);
        setMembers([]);
        setMeetings([]);
        setResolutions([]);
        setTransactions([]);
        setAnnouncements([]);
        setProducts([]);
        setActivities([]);
        setFunds([]);
        setHogRaising(INITIAL_HOG_RAISING);
      } else {
        setMembers(storedMembers || INITIAL_MEMBERS);
        setMeetings(storedMeetings || INITIAL_MEETINGS);
        setResolutions(storedResolutions || INITIAL_RESOLUTIONS);
        setTransactions(storedTransactions || INITIAL_TRANSACTIONS);
        setAnnouncements(storedAnnouncements || INITIAL_ANNOUNCEMENTS);
        setHogRaising(storedHogRaising || INITIAL_HOG_RAISING);
        setProducts(storedProducts || INITIAL_PRODUCTS);
        setActivities(storedActivities || INITIAL_ACTIVITIES);
        setFunds(storedFunds || INITIAL_FUNDS);
        setInventory(storedInventory || []);
      }

      setSyncQueue(storedQueue || []);

      const parsedUsers = storedUsers || [];
      // Filter out any dummy members from users and strip any plain-text passwords
      const sanitizedUsers = (Array.isArray(parsedUsers) ? parsedUsers : [])
        .filter((u: any) => u.role !== 'Member' || !u.id.startsWith('user-m'))
        .map((u: any) => {
          const copy = { ...u };
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
      setUsers(sanitizedUsers);
      await setSecureItem('bafa_users', sanitizedUsers);

      const storedCurr = await getSecureItem<User>('bafa_current_user');
      if (storedCurr?.password) {
        const safeCurrentUser = { ...storedCurr };
        delete safeCurrentUser.password;
        await setSecureItem('bafa_current_user', safeCurrentUser);
      }
      if (storedCurr && !cancelled) {
        const safeUser = { ...storedCurr };
        delete safeUser.password;
        delete safeUser.passwordHash;
        delete safeUser.passwordHistory;
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
      try {
        const sessionRes = await fetch('/api/auth/session');
        if (sessionRes.ok) {
          const result = await sessionRes.json();
          if (result?.authenticated && result.user && !cancelled) {
            const safeUser = { ...result.user } as User;
            delete safeUser.password;
            delete safeUser.passwordHash;
            delete safeUser.passwordHistory;
            setCurrentUser(safeUser);
            if (safeUser.role !== 'Member') setCurrentRole(safeUser.role as OfficerRole);
            setGuestMode(false);
            setUsers(previous => [safeUser, ...previous.filter(user => user.id !== safeUser.id)]);
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
            // Deletions pending for this session only; do not trust browser-persisted deletion markers.
            let bootDeletedIds: StoredDeletedIds = {};
            try {
              bootDeletedIds = getStoredDeletedIds();
            } catch {}

            const delUsers = new Set(bootDeletedIds.users || []);
            const delMembers = new Set(bootDeletedIds.members || []);
            const delMeetings = new Set(bootDeletedIds.meetings || []);
            const delResolutions = new Set(bootDeletedIds.resolutions || []);
            const delTx = new Set([...(bootDeletedIds.financialTransactions || []), ...(bootDeletedIds.transactions || [])]);
            const delAnnouncements = new Set(bootDeletedIds.announcements || []);
            const delProducts = new Set(bootDeletedIds.products || []);
            const delActivities = new Set(bootDeletedIds.activities || []);
            const delFunds = new Set(bootDeletedIds.funds || []);
            const delInventory = new Set(bootDeletedIds.inventory || []);

            const cleanMembers = Array.isArray(res.data.members) ? res.data.members.filter((m: any) => !delMembers.has(m.id)) : [];
            const cleanMeetings = Array.isArray(res.data.meetings) ? res.data.meetings.filter((m: any) => !delMeetings.has(m.id)) : [];
            const cleanResolutions = Array.isArray(res.data.resolutions) ? res.data.resolutions.filter((r: any) => !delResolutions.has(r.id)) : [];
            const cleanTx = Array.isArray(res.data.financialTransactions) ? res.data.financialTransactions.filter((t: any) => !delTx.has(t.id)) : [];
            const cleanAnnouncements = Array.isArray(res.data.announcements) ? res.data.announcements.filter((a: any) => !delAnnouncements.has(a.id)) : [];
            const cleanProducts = Array.isArray(res.data.products) ? res.data.products.filter((p: any) => !delProducts.has(p.id)) : [];
            const cleanActivities = Array.isArray(res.data.activities) ? res.data.activities.filter((a: any) => !delActivities.has(a.id)) : [];
            const cleanFunds = Array.isArray(res.data.funds) ? res.data.funds.filter((f: any) => !delFunds.has(f.id)) : [];
            const cleanInventory = Array.isArray(res.data.inventory) ? res.data.inventory.filter((i: any) => !delInventory.has(i.id)) : [];

            if (Array.isArray(res.data.members)) { setMembers(cleanMembers); updateStorage('bafa_members', cleanMembers); }
            if (Array.isArray(res.data.meetings)) { setMeetings(cleanMeetings); updateStorage('bafa_meetings', cleanMeetings); }
            if (Array.isArray(res.data.resolutions)) { setResolutions(cleanResolutions); updateStorage('bafa_resolutions', cleanResolutions); }
            if (Array.isArray(res.data.financialTransactions)) { setTransactions(cleanTx); updateStorage('bafa_transactions', cleanTx); }
            if (Array.isArray(res.data.announcements)) { setAnnouncements(cleanAnnouncements); updateStorage('bafa_announcements', cleanAnnouncements); }
            if (Array.isArray(res.data.products)) { setProducts(cleanProducts); updateStorage('bafa_products', cleanProducts); }
            if (Array.isArray(res.data.activities)) { setActivities(cleanActivities); updateStorage('bafa_activities', cleanActivities); }
            if (Array.isArray(res.data.funds)) { setFunds(cleanFunds); updateStorage('bafa_funds', cleanFunds); }
            if (Array.isArray(res.data.inventory)) { setInventory(cleanInventory); updateStorage('bafa_inventory', cleanInventory); }
            if (res.data.hogRaising) { setHogRaising(res.data.hogRaising); updateStorage('bafa_afa_igp', res.data.hogRaising); }
            if (Array.isArray(res.data.users)) {
              const cleanUsers = res.data.users
                .filter((u: any) => !delUsers.has(u.id))
                .map((user: User) => {
                  // The database row is the source of truth for credentials. Older rows store a
                  // plaintext `password`; promote it into the hash column exactly once instead of
                  // letting it be dropped during storage sanitization.
                  const upgraded = { ...user, passwordHistory: Array.isArray(user.passwordHistory) ? user.passwordHistory : [] };
                  if (upgraded.password) {
                    if (!upgraded.passwordHash?.startsWith('$2')) {
                      upgraded.passwordHash = hashPolicyPassword(upgraded.password);
                      upgraded.passwordChangedAt = upgraded.passwordChangedAt || new Date(0).toISOString();
                    }
                    delete upgraded.password;
                  }
                  upgraded.mustChangePassword = false;
                  return upgraded;
                });
              setUsers(cleanUsers);
              updateStorage('bafa_users', cleanUsers);
              if (isOnline && cleanUsers.some((user) => !user.passwordHash?.startsWith('$2'))) {
                pushAllDataToCloud({ users: cleanUsers }, { silent: true, source: 'Password Hash Upgrade' });
              }
            }
            console.log('[Cloud DB] Successfully loaded fresh data from PostgreSQL Cloud DB');
            setDbStatus(prev => ({
              ...prev,
              connected: true,
              configured: true,
              checking: false,
            }));

            // If there were pending offline operations or pending deletions queued in local storage, sync them immediately
            const hasQueuedItems = Array.isArray(storedQueue) ? storedQueue.length > 0 : Boolean(storedQueue);
            const hasQueuedDeletions = Object.values(bootDeletedIds).some(arr => Array.isArray(arr) && arr.length > 0);

            if (hasQueuedItems || hasQueuedDeletions) {
              try {
                console.log('[Auto-Sync]: Found pending offline contributions or deletions. Syncing to database...');
                fetch('/api/sync/push', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    users: cleanMembers.length > 0 ? (res.data.users || sanitizedUsers) : sanitizedUsers,
                    members: cleanMembers,
                    meetings: cleanMeetings,
                    resolutions: cleanResolutions,
                    financialTransactions: cleanTx,
                    announcements: cleanAnnouncements,
                    products: cleanProducts,
                    activities: cleanActivities,
                    funds: cleanFunds,
                    inventory: cleanInventory,
                    hogRaising: res.data.hogRaising || INITIAL_HOG_RAISING,
                    systemLogs: activeLogs,
                    deletedIds: bootDeletedIds
                  })
                }).then(r => r.json()).then(pushRes => {
                  if (pushRes?.success) {
                    setSyncQueue([]);
                    void updateStorage('bafa_sync_queue', []);
                    console.log('[Auto-Sync]: Synced offline items and deletions on boot and purged local pending queue.');
                  }
                }).catch(e => console.warn('[Boot sync push error]:', e));
              } catch {}
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
      setHogRaising(INITIAL_HOG_RAISING);
      setFunds(INITIAL_FUNDS);
      setInventory([]);
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
        const { password: _password, passwordHash: _passwordHash, passwordHistory: _passwordHistory, ...copy } = data;
        await setSecureItem(key, copy);
        return;
      }
      await setSecureItem(key, data);
    } catch (error) {
      console.error(`Unable to encrypt local storage item ${key}:`, error);
    }
  };

  const showToastMessage = (message: string, type: 'success' | 'warning' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  const getOfficerName = (role: OfficerRole) => {
    if (currentUser && currentUser.role === role) return currentUser.name;
    const matchedUser = users.find(u => u.role === role);
    if (matchedUser) return matchedUser.name;
    return `AFA ${role.replace('_', ' ')}`;
  };

  // Deletion persistence tracking for PostgreSQL / Supabase
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
    funds?: string[];
    inventory?: string[];
  }

  const getStoredDeletedIds = (): StoredDeletedIds => {
    const result: StoredDeletedIds = {};
    for (const item of syncQueue) {
      if (item.action !== 'delete' || !item.payload?.id) continue;
      const id = item.payload.id;
      const entity = (item.entityType || '').toLowerCase();
      const keyByEntity: Record<string, keyof StoredDeletedIds> = {
        member: 'members', user: 'users', officer: 'users', meeting: 'meetings',
        resolution: 'resolutions', transaction: 'financialTransactions',
        financialtransaction: 'financialTransactions', announcement: 'announcements',
        product: 'products', activity: 'activities', fund: 'funds', inventory: 'inventory'
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
    return current;
  };

  const clearStoredDeletedIds = () => {
    // Pending deletion markers are session-local and kept in the sync queue.
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
        } catch {}
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
          } catch {}
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
    entityType: 'user' | 'officer' | 'member' | 'meeting' | 'resolution' | 'transaction' | 'announcement' | 'hog_expense' | 'hog_sale' | 'hog_chore' | 'product' | 'activity' | string,
    payload: any
  ) => {
    const queueItem: SyncQueueItem = {
      id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      action,
      entityType,
      payload
    };
    const updatedQueue = [...syncQueue, queueItem];
    setSyncQueue(updatedQueue);
    updateStorage('bafa_sync_queue', updatedQueue);

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
      hogRaising?: HogRaisingState;
      funds?: OrganizationFund[];
      inventory?: InventoryItem[];
      systemLogs?: SystemLog[];
      deletedIds?: StoredDeletedIds;
    },
    options?: { silent?: boolean; source?: string; force?: boolean }
  ): Promise<boolean> => {
    if (!navigator.onLine) return false;
    if (isSyncingRef.current && !options?.force) {
      console.log('[Auto-Sync]: Synchronization already in-flight, skipping duplicate dispatch.');
      return false;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const currentDeletedIds = overrides?.deletedIds || getStoredDeletedIds();
      const snap = appDataRef.current;
      const payload = {
        users: overrides?.users || snap.users,
        members: overrides?.members || snap.members,
        meetings: overrides?.meetings || snap.meetings,
        resolutions: overrides?.resolutions || snap.resolutions,
        financialTransactions: overrides?.financialTransactions || snap.transactions,
        announcements: overrides?.announcements || snap.announcements,
        products: overrides?.products || snap.products,
        activities: overrides?.activities || snap.activities,
        hogRaising: overrides?.hogRaising || snap.hogRaising,
        funds: overrides?.funds || snap.funds,
        inventory: overrides?.inventory || snap.inventory,
        systemLogs: overrides?.systemLogs || snap.logs,
        deletedIds: currentDeletedIds
      };

      const res = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (result?.success && !result?.offlineMode) {
        // Clear all locally stored pending contributions, mutations, and deletions
        setSyncQueue([]);
        void updateStorage('bafa_sync_queue', []);
        clearStoredDeletedIds();

        // Mark pending system logs as synced in state and storage
        setLogs(prev => {
          const updated = prev.map(l => l.syncStatus === 'pending' ? { ...l, syncStatus: 'synced' as const } : l);
          updateStorage('bafa_logs', updated);
          return updated;
        });

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
      return false;
    } catch (err: any) {
      console.warn('[Cloud DB Sync Warning]:', err?.message || err);
      return false;
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
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
    clearSecureItems(['bafa_members', 'bafa_meetings', 'bafa_resolutions', 'bafa_transactions', 'bafa_announcements', 'bafa_products', 'bafa_activities', 'bafa_funds', 'bafa_hog_raising', 'bafa_logs', 'bafa_sync_queue', 'bafa_deleted_ids']);
    showToastMessage('Local browser cache cleared! Operating in Zero-Residual Cloud Database mode.', 'success');
  };

  const handleClearQueue = () => {
    setSyncQueue([]);
    void updateStorage('bafa_sync_queue', []);
    showToastMessage('Pending queue cleared. Confidential data purged from local cache.', 'info');
  };

  const handleRemoveQueueItem = (id: string) => {
    const updated = syncQueue.filter(item => item.id !== id);
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
      if (navigator.onLine && (syncQueue.length > 0 || hasPendingDeletions())) {
        console.log('[Auto-Sync]: Window focused with pending items. Triggering auto-sync...');
        pushAllDataToCloud(undefined, { silent: true, source: 'Auto-Sync (Focus)' });
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleWindowFocus);

    // Fast reactive sync: If online and there are pending items or deletions, trigger auto-sync after ultra-fast debounce
    let reactiveTimer: any = null;
    if (isOnline && (syncQueue.length > 0 || hasPendingDeletions())) {
      reactiveTimer = setTimeout(() => {
        console.log('[Auto-Sync Reactive]: Detected pending queue while online. Automatically syncing to database...');
        pushAllDataToCloud(undefined, { silent: true, source: 'Auto-Sync (Reactive)' });
      }, 150);
    }

    // Periodic auto-sync heartbeat every 5 seconds: ensures officers never have to push a button
    const intervalId = setInterval(() => {
      if (currentUser && navigator.onLine && (syncQueue.length > 0 || hasPendingDeletions() || logs.some(l => l.syncStatus === 'pending'))) {
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
  }, [isOnline, syncQueue.length, currentUser?.id]);

  // SECRETARY ACTION HANDLERS
  const handleAddMember = (
    memberData: Omit<Member, 'id' | 'joinedDate'>,
    loginCredentials?: { username: string; initialPassword?: string }
  ) => {
    if (loginCredentials?.username.trim() && loginCredentials.initialPassword) {
      const policyError = validatePasswordPolicy(loginCredentials.initialPassword, loginCredentials.username, 'Member');
      if (policyError) {
        showToastMessage(policyError, 'error');
        return;
      }
    }
    const newId = `member-${Date.now()}`;
    const newMember: Member = {
      ...memberData,
      id: newId,
      joinedDate: new Date().toISOString().split('T')[0]
    };
    const updated = [newMember, ...members];
    setMembers(updated);
    updateStorage('bafa_members', updated);

    let updatedUsers = users;
    let accountCreated = false;

    // If login credentials provided by the Secretary, create authenticated User account
    if (loginCredentials && loginCredentials.username.trim()) {
      const cleanUsername = loginCredentials.username.trim().toLowerCase();
      const initialPassword = loginCredentials.initialPassword?.trim() || generateInitialPassword(cleanUsername, 'Member');
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
      setUsers(updatedUsers);
      updateStorage('bafa_users', updatedUsers);
      accountCreated = true;
      logAction('Created Member Portal Login', `Secretary enrolled ${newMember.name} and issued portal login: ${cleanUsername}`);
    }

    if (isOnline) {
      logAction('Registered Farmer', `Registered new member: ${newMember.name} from ${newMember.farmLocation}`);
      showToastMessage(
        accountCreated
          ? `Registered ${newMember.name} & created portal login (${loginCredentials?.username})!`
          : `Registered ${newMember.name} successfully!`
      );
      pushAllDataToCloud({ members: updated, users: updatedUsers }, { silent: true });
    } else {
      addToSyncQueue('create', 'member', newMember);
      if (accountCreated && updatedUsers[0]) {
        addToSyncQueue('create', 'user', updatedUsers[0]);
      }
      showToastMessage(`Registered ${newMember.name} offline. Ready to sync when connected.`);
    }
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
  const handleManageMemberLogin = (memberId: string, username: string, initialPassword: string) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;
    const policyError = validatePasswordPolicy(initialPassword, username, 'Member');
    if (policyError) {
      showToastMessage(policyError, 'error');
      return;
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = initialPassword.trim();

    const existingIndex = users.findIndex(u => u.id === memberId || u.memberIdNumber === member.memberIdNumber);

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
            resetRequested: false
          };
        }
        return u;
      });
    } else {
      const newMemberUser: User = {
        id: member.id,
        username: cleanUsername,
        passwordHash: hashPolicyPassword(cleanPassword),
        passwordHistory: [],
        passwordChangedAt: new Date().toISOString(),
        mustChangePassword: false,
        name: member.name,
        role: 'Member',
        isApproved: true,
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
  };

  const handleUpdateMemberStatus = (id: string, status: 'Active' | 'Inactive') => {
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
      } catch {}

      const allDeleted = getStoredDeletedIds();
      pushAllDataToCloud(
        {
          members: updated,
          users: updatedUsers,
          deletedIds: allDeleted
        },
        { silent: true, source: 'Member Deletion', force: true }
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
  const handleAddTransaction = (txData: Omit<FinancialTransaction, 'id' | 'auditedStatus'>) => {
    const newTx: FinancialTransaction = {
      ...txData,
      id: `tx-${Date.now()}`,
      auditedStatus: 'Unaudited'
    };
    const updated = [newTx, ...transactions];
    setTransactions(updated);
    updateStorage('bafa_transactions', updated);

    if (isOnline) {
      logAction('Recorded Transaction', `Logged PHP ${newTx.amount.toLocaleString()} ${newTx.type} under "${newTx.category}"`);
      showToastMessage(`Contribution & ledger entry recorded. Syncing to database...`, 'info');
      pushAllDataToCloud({ financialTransactions: updated }, { silent: false, source: 'Contribution Recorded' });
    } else {
      addToSyncQueue('create', 'transaction', newTx);
    }

    // Automatically update the live balance of the affected Organization Fund if matching account exists
    if (newTx.fundSource) {
      setFunds(prevFunds => {
        let hasUpdated = false;
        const updatedFunds = prevFunds.map(f => {
          const isMatch = (f.code && newTx.fundSource?.includes(f.code)) ||
                          (f.name && newTx.fundSource?.toLowerCase().includes(f.name.toLowerCase()));
          if (isMatch) {
            hasUpdated = true;
            const diff = newTx.type === 'income' ? newTx.amount : -newTx.amount;
            return {
              ...f,
              currentBalance: Math.max(0, f.currentBalance + diff),
              lastUpdated: new Date().toISOString().split('T')[0]
            };
          }
          return f;
        });

        if (hasUpdated) {
          updateStorage('bafa_funds', updatedFunds);
          if (isOnline) {
            pushAllDataToCloud({ funds: updatedFunds }, { silent: true, source: 'Fund Balance Updated' });
          }
        }
        return updatedFunds;
      });
    }
  };

  const handleAddFund = (fundData: Omit<OrganizationFund, 'id' | 'lastUpdated'>) => {
    const newFund: OrganizationFund = {
      ...fundData,
      id: `fund-${Date.now()}`,
      lastUpdated: new Date().toISOString().split('T')[0]
    };
    const updated = [...funds, newFund];
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
      pushAllDataToCloud({ financialTransactions: updated }, { silent: true });
    } else {
      addToSyncQueue('update', 'transaction', { id, status, notes, desc: txDescStr });
    }
  };

  // AFA IGP HANDLERS
  const handleAddPigExpense = (expData: Omit<IgpExpense, 'id' | 'recordedBy'>) => {
    const officerLabel = currentUser ? `${currentUser.role.replace('_', ' ')} (${currentUser.name})` : `Treasurer (${getOfficerName('Treasurer')})`;
    const newExp: IgpExpense = {
      ...expData,
      id: `pig-exp-${Date.now()}`,
      recordedBy: officerLabel
    };
    const updatedState: HogRaisingState = {
      ...hogRaising,
      expenses: [newExp, ...hogRaising.expenses]
    };
    setHogRaising(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    const projectLabel = expData.produce || 'AFA IGP';
    const stageLabel = expData.hogStage && expData.hogStage !== 'General' ? ` • ${expData.hogStage}` : '';
    // Also register in general ledger for complete co-op records!
    handleAddTransaction({
      type: 'expense',
      category: `${projectLabel} Project`,
      amount: expData.amount,
      date: expData.date,
      description: `[${projectLabel} IGP${stageLabel}] ${expData.category}${expData.quantity ? ` (${expData.quantity})` : ''}: ${expData.description}`,
      recordedBy: officerLabel
    });

    if (isOnline) {
      logAction('Recorded IGP Expense', `Logged PHP ${newExp.amount.toLocaleString()} expense for ${projectLabel} ("${newExp.category}"${stageLabel})`);
      showToastMessage(`${projectLabel} expense recorded and linked to general ledger.`);
      pushAllDataToCloud({ hogRaising: updatedState }, { silent: true, source: 'IGP Expense' });
    } else {
      addToSyncQueue('create', 'hog_expense', newExp);
    }
  };

  const handleAddHogSale = (saleData: Omit<IgpSale, 'id' | 'recordedBy'>) => {
    const officerLabel = currentUser ? `${currentUser.role.replace('_', ' ')} (${currentUser.name})` : `Treasurer (${getOfficerName('Treasurer')})`;
    const newSale: IgpSale = {
      ...saleData,
      id: `pig-sale-${Date.now()}`,
      recordedBy: officerLabel
    };
    const updatedState: HogRaisingState = {
      ...hogRaising,
      sales: [newSale, ...hogRaising.sales]
    };
    setHogRaising(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    const projectLabel = saleData.produce || 'AFA IGP';
    const stageLabel = saleData.hogStage && saleData.hogStage !== 'General' ? ` (${saleData.hogStage})` : '';
    // Also register in general ledger for complete co-op records!
    handleAddTransaction({
      type: 'income',
      category: `${projectLabel} Project`,
      amount: saleData.revenue,
      date: saleData.date,
      description: `[${projectLabel} IGP] Revenue (${saleData.hogsCount} unit/head${stageLabel}): ${saleData.notes || `${projectLabel} sale/rental income.`}`,
      recordedBy: officerLabel
    });

    if (isOnline) {
      logAction('Recorded IGP Revenue', `Recorded PHP ${newSale.revenue.toLocaleString()} revenue for ${projectLabel}${stageLabel}`);
      showToastMessage(`${projectLabel} revenue of PHP ${newSale.revenue.toLocaleString()} recorded and linked to general ledger.`);
      pushAllDataToCloud({ hogRaising: updatedState }, { silent: true, source: 'IGP Revenue' });
    } else {
      addToSyncQueue('create', 'hog_sale', newSale);
    }
  };

  const handleUpdatePigExpense = (updatedExp: IgpExpense) => {
    const updatedExpenses = (hogRaising.expenses || []).map((e) => (e.id === updatedExp.id ? updatedExp : e));
    const updatedState: HogRaisingState = {
      ...hogRaising,
      expenses: updatedExpenses
    };
    setHogRaising(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    if (isOnline) {
      logAction('Updated IGP Expense', `Updated ${updatedExp.produce || 'IGP'} expense for "${updatedExp.category}" (PHP ${updatedExp.amount.toLocaleString()})`);
      showToastMessage('IGP expense updated successfully.');
      pushAllDataToCloud({ hogRaising: updatedState }, { silent: true, source: 'IGP Expense Update' });
    } else {
      addToSyncQueue('update', 'hog_expense', updatedExp);
    }
  };

  const handleDeletePigExpense = (expenseId: string) => {
    const target = (hogRaising.expenses || []).find((e) => e.id === expenseId);
    const updatedExpenses = (hogRaising.expenses || []).filter((e) => e.id !== expenseId);
    const updatedState: HogRaisingState = {
      ...hogRaising,
      expenses: updatedExpenses
    };
    setHogRaising(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    if (isOnline) {
      logAction('Deleted IGP Expense', `Removed ${target?.produce || 'IGP'} expense for "${target?.category || expenseId}" (PHP ${(target?.amount || 0).toLocaleString()})`);
      showToastMessage('IGP expense deleted.', 'info');
      pushAllDataToCloud({ hogRaising: updatedState }, { silent: true, source: 'IGP Expense Deletion' });
    } else {
      addToSyncQueue('delete', 'hog_expense', { id: expenseId });
    }
  };

  const handleUpdateHogSale = (updatedSale: IgpSale) => {
    const updatedSales = (hogRaising.sales || []).map((s) => (s.id === updatedSale.id ? updatedSale : s));
    const updatedState: HogRaisingState = {
      ...hogRaising,
      sales: updatedSales
    };
    setHogRaising(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    if (isOnline) {
      logAction('Updated IGP Revenue', `Updated ${updatedSale.produce || 'IGP'} revenue record (PHP ${updatedSale.revenue.toLocaleString()})`);
      showToastMessage('IGP revenue record updated successfully.');
      pushAllDataToCloud({ hogRaising: updatedState }, { silent: true, source: 'IGP Revenue Update' });
    } else {
      addToSyncQueue('update', 'hog_sale', updatedSale);
    }
  };

  const handleDeleteHogSale = (saleId: string) => {
    const target = (hogRaising.sales || []).find((s) => s.id === saleId);
    const updatedSales = (hogRaising.sales || []).filter((s) => s.id !== saleId);
    const updatedState: HogRaisingState = {
      ...hogRaising,
      sales: updatedSales
    };
    setHogRaising(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    if (isOnline) {
      logAction('Deleted IGP Revenue', `Removed ${target?.produce || 'IGP'} revenue record (PHP ${(target?.revenue || 0).toLocaleString()})`);
      showToastMessage('IGP revenue record deleted.', 'info');
      pushAllDataToCloud({ hogRaising: updatedState }, { silent: true, source: 'IGP Revenue Deletion' });
    } else {
      addToSyncQueue('delete', 'hog_sale', { id: saleId });
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
    setProducts(updated);
    updateStorage('bafa_products', updated);
    storeDeletedId('products', id);

    // Direct and permanent removal from PostgreSQL Cloud Database
    deleteFromDatabase('product', id);

    if (isOnline) {
      logAction('Deleted Product', `Removed product: "${target?.name || id}"`);
      showToastMessage('Gipapas ang produkto!', 'info');
      pushAllDataToCloud({ products: updated }, { silent: true, source: 'Product Deletion' });
    } else {
      addToSyncQueue('delete', 'product', { id });
    }
  };

  const handleAddActivity = (newAct: Omit<AssociationActivity, 'id'>) => {
    const activity: AssociationActivity = {
      ...newAct,
      id: `act-${Date.now()}`
    };
    const updated = [activity, ...activities];
    setActivities(updated);
    updateStorage('bafa_activities', updated);

    if (isOnline) {
      logAction('Scheduled Activity', `Created association activity: "${activity.title}" scheduled for ${activity.dateScheduled}`);
      showToastMessage(`Gipasa ang bag-ong kalihokan "${activity.title}"!`, 'success');
      pushAllDataToCloud({ activities: updated }, { silent: true });
    } else {
      addToSyncQueue('create', 'activity', activity);
    }
  };

  const handleUpdateActivity = (updatedAct: AssociationActivity) => {
    const updated = activities.map(a => a.id === updatedAct.id ? updatedAct : a);
    setActivities(updated);
    updateStorage('bafa_activities', updated);

    if (isOnline) {
      logAction('Updated Activity', `Updated activity status/details for "${updatedAct.title}"`);
      showToastMessage(`Gi-update ang kalihokan "${updatedAct.title}"!`, 'success');
      pushAllDataToCloud({ activities: updated }, { silent: true });
    } else {
      addToSyncQueue('update', 'activity', updatedAct);
    }
  };

  const handleDeleteActivity = (id: string) => {
    const target = activities.find(a => a.id === id);
    const updated = activities.filter(a => a.id !== id);
    setActivities(updated);
    updateStorage('bafa_activities', updated);
    storeDeletedId('activities', id);

    // Direct and permanent removal from PostgreSQL Cloud Database
    deleteFromDatabase('activity', id);

    if (isOnline) {
      logAction('Deleted Activity', `Removed activity: "${target?.title || id}"`);
      showToastMessage('Gipapas ang kalihokan!', 'info');
      pushAllDataToCloud({ activities: updated }, { silent: true, source: 'Activity Deletion' });
    } else {
      addToSyncQueue('delete', 'activity', { id });
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
    const updated = inventory.map(i => i.id === updatedItem.id ? updatedItem : i);
    setInventory(updated);
    updateStorage('bafa_inventory', updated);

    if (isOnline) {
      logAction('Updated Inventory Item', `Auditor updated inventory record for "${updatedItem.name}" (${updatedItem.condition})`);
      showToastMessage(`Inventory item "${updatedItem.name}" updated!`, 'success');
      pushAllDataToCloud({ inventory: updated }, { silent: true, source: 'Inventory Updated' });
    } else {
      addToSyncQueue('update', 'inventory', updatedItem);
    }
  };

  const handleDeleteInventoryItem = (id: string) => {
    const target = inventory.find(i => i.id === id);
    const updated = inventory.filter(i => i.id !== id);
    setInventory(updated);
    updateStorage('bafa_inventory', updated);
    storeDeletedId('inventory', id);

    // Direct and permanent removal from PostgreSQL Cloud Database
    deleteFromDatabase('inventory', id);

    if (isOnline) {
      logAction('Deleted Inventory Item', `Removed inventory record: "${target?.name || id}"`);
      showToastMessage('Inventory item removed!', 'info');
      pushAllDataToCloud({ inventory: updated }, { silent: true, source: 'Inventory Deletion' });
    } else {
      addToSyncQueue('delete', 'inventory', { id });
    }
  };

  const handleAddPigChore = (choreData: Omit<IgpChoreLog, 'id'>) => {
    const newChore: IgpChoreLog = {
      ...choreData,
      id: `chore-${Date.now()}`
    };
    const updatedState: HogRaisingState = {
      ...hogRaising,
      choreLogs: [newChore, ...hogRaising.choreLogs]
    };
    setHogRaising(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    if (isOnline) {
      logAction('Logged IGP Chore', `${newChore.checkedBy} checked-in: ${newChore.activities.join(', ')}`);
      showToastMessage('Daily IGP care/activity log has been recorded successfully!');
      pushAllDataToCloud({ hogRaising: updatedState }, { silent: true });
    } else {
      addToSyncQueue('create', 'hog_chore', newChore);
    }
  };

  const handleUpdateOpeningHogCount = (
    count: number,
    herdBreakdown?: HogHerdBreakdown
  ) => {
    const normalizedBreakdown: HogHerdBreakdown = herdBreakdown
      ? {
          fattening: Math.max(0, Math.floor(Number(herdBreakdown.fattening) || 0)),
          gestation: Math.max(0, Math.floor(Number(herdBreakdown.gestation) || 0)),
          lactating: Math.max(0, Math.floor(Number(herdBreakdown.lactating) || 0)),
          dispersal: Math.max(0, Math.floor(Number(herdBreakdown.dispersal) || 0)),
          cattleFattening: Math.max(0, Math.floor(Number(herdBreakdown.cattleFattening) || 0)),
          cattleDispersal: Math.max(0, Math.floor(Number(herdBreakdown.cattleDispersal) || 0)),
          rtlCount: Math.max(0, Math.floor(Number(herdBreakdown.rtlCount) || 0))
        }
      : hogRaising.herdBreakdown || { fattening: 0, gestation: 0, lactating: 0, dispersal: 0, cattleFattening: 0, cattleDispersal: 0, rtlCount: 0 };
    const openingHogCount = normalizedBreakdown
      ? normalizedBreakdown.fattening + normalizedBreakdown.gestation + normalizedBreakdown.lactating + (normalizedBreakdown.dispersal || 0)
      : Math.max(0, Math.floor(Number(count) || 0));
    const updatedState: HogRaisingState = {
      ...hogRaising,
      openingHogCount,
      herdBreakdown: normalizedBreakdown
    };
    setHogRaising(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    const breakdownDetail = normalizedBreakdown
      ? ` (Swine: ${openingHogCount}, Cattle: ${(normalizedBreakdown.cattleFattening || 0) + (normalizedBreakdown.cattleDispersal || 0)}, RTL: ${normalizedBreakdown.rtlCount || 0})`
      : '';

    if (isOnline) {
      logAction('Updated Livestock Headcount', `Updated livestock inventory counts${breakdownDetail}.`);
      showToastMessage(`Livestock inventory updated: ${openingHogCount} total swine, Cattle: ${(normalizedBreakdown.cattleFattening || 0) + (normalizedBreakdown.cattleDispersal || 0)}, RTL: ${normalizedBreakdown.rtlCount || 0}.`);
      pushAllDataToCloud({ hogRaising: updatedState }, { silent: true, source: 'Opening Livestock Inventory' });
    } else {
      addToSyncQueue('update', 'hog_expense', { id: 'opening-hog-count', quantity: openingHogCount, herdBreakdown: normalizedBreakdown });
    }
  };

  const handleAddProduce = (produceName: string) => {
    const cleanName = produceName.trim();
    if (!cleanName) return;
    const updatedState: HogRaisingState = {
      ...hogRaising,
      produces: Array.from(new Set([...(hogRaising.produces || []), cleanName]))
    };
    setHogRaising(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    if (isOnline) {
      logAction('Added AFA IGP Project', `Added current IGP project: "${cleanName}"`);
      showToastMessage(`Successfully added IGP project: "${cleanName}"`, 'success');
      pushAllDataToCloud({ hogRaising: updatedState }, { silent: true, source: 'Added AFA IGP Project' });
    }
  };

  const handleDeleteProduce = (produceName: string) => {
    const updatedState: HogRaisingState = {
      ...hogRaising,
      produces: (hogRaising.produces || []).filter(p => p !== produceName)
    };
    setHogRaising(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    if (isOnline) {
      logAction('Removed AFA IGP Project', `Removed IGP project from active list: "${produceName}"`);
      showToastMessage(`Removed IGP project: "${produceName}"`, 'info');
      pushAllDataToCloud({ hogRaising: updatedState }, { silent: true, source: 'Removed AFA IGP Project' });
    }
  };

  const handleCloseDecemberBook = (year: number) => {
    const closedList = hogRaising.closedYears || [2025];
    if (closedList.includes(year)) return;
    const updatedState: HogRaisingState = {
      ...hogRaising,
      closedYears: [...closedList, year]
    };
    setHogRaising(updatedState);
    updateStorage('bafa_afa_igp', updatedState);

    if (isOnline) {
      logAction('Closed Financial Book', `Officially closed and sealed the Hog Raising IGP financial book for December ${year}.`);
      showToastMessage(`Successfully closed and locked the financial books for ${year}!`, 'success');
      pushAllDataToCloud({ hogRaising: updatedState }, { silent: true });
    } else {
      addToSyncQueue('update', 'hog_expense', { id: `close-book-${year}`, year });
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
    const updated = meetings.map(m => m.id === id
      ? {
          ...m,
          minutesApprovalStatus: 'Approved' as const,
          approvedBy: `President (${getOfficerName('President')})`,
          approvedDate: new Date().toISOString().split('T')[0],
          approvalRemarks: remarks
        }
      : m);
    setMeetings(updated);
    updateStorage('bafa_meetings', updated);

    if (isOnline) {
      logAction('Approved Minutes of Meeting', `President approved the minutes for: "${targetMeeting?.title || 'Meeting'}"${remarks ? `. Remarks: "${remarks}"` : ''}`);
      showToastMessage(`Minutes for "${targetMeeting?.title || 'Meeting'}" approved by the President.`, 'success');
      pushAllDataToCloud({ meetings: updated }, { silent: true });
    } else {
      addToSyncQueue('update', 'meeting', { id, minutesApprovalStatus: 'Approved', remarks });
    }
  };

  const handleReturnMeetingMinutes = (id: string, remarks: string) => {
    const targetMeeting = meetings.find(m => m.id === id);
    const updated = meetings.map(m => m.id === id
      ? {
          ...m,
          minutesApprovalStatus: 'Returned' as const,
          approvedBy: `President (${getOfficerName('President')})`,
          approvedDate: new Date().toISOString().split('T')[0],
          approvalRemarks: remarks
        }
      : m);
    setMeetings(updated);
    updateStorage('bafa_meetings', updated);

    if (isOnline) {
      logAction('Returned Minutes of Meeting', `President returned the minutes for revision: "${targetMeeting?.title || 'Meeting'}". Remarks: "${remarks}"`);
      showToastMessage(`Minutes returned to the Secretary for revision.`, 'warning');
      pushAllDataToCloud({ meetings: updated }, { silent: true });
    } else {
      addToSyncQueue('update', 'meeting', { id, minutesApprovalStatus: 'Returned', remarks });
    }
  };

  // PRESIDENT APPROVAL WORKFLOW FOR AUDITED FINANCIAL REPORTS / RECORDS (Auditor → President)
  const handlePresidentApproveTransaction = (id: string, remarks?: string) => {
    const targetTx = transactions.find(t => t.id === id);
    const updated = transactions.map(t => t.id === id
      ? {
          ...t,
          presidentApprovalStatus: 'Approved' as const,
          presidentApprovedBy: `President (${getOfficerName('President')})`,
          presidentApprovedDate: new Date().toISOString().split('T')[0],
          presidentApprovalRemarks: remarks
        }
      : t);
    setTransactions(updated);
    updateStorage('bafa_transactions', updated);

    const txDescStr = targetTx ? `PHP ${targetTx.amount.toLocaleString()} (${targetTx.category})` : 'Transaction';

    if (isOnline) {
      logAction('President Approved Financial Record', `President approved the audited financial record: ${txDescStr}${remarks ? `. Remarks: "${remarks}"` : ''}`);
      showToastMessage(`Financial record approved by the President.`, 'success');
      pushAllDataToCloud({ financialTransactions: updated }, { silent: true });
    } else {
      addToSyncQueue('update', 'transaction', { id, presidentApprovalStatus: 'Approved', remarks });
    }
  };

  const handlePresidentReturnTransaction = (id: string, remarks: string) => {
    const targetTx = transactions.find(t => t.id === id);
    const updated = transactions.map(t => t.id === id
      ? {
          ...t,
          presidentApprovalStatus: 'Returned' as const,
          presidentApprovedBy: `President (${getOfficerName('President')})`,
          presidentApprovedDate: new Date().toISOString().split('T')[0],
          presidentApprovalRemarks: remarks
        }
      : t);
    setTransactions(updated);
    updateStorage('bafa_transactions', updated);

    const txDescStr = targetTx ? `PHP ${targetTx.amount.toLocaleString()} (${targetTx.category})` : 'Transaction';

    if (isOnline) {
      logAction('President Returned Financial Record', `President returned the financial record for revision: ${txDescStr}. Remarks: "${remarks}"`);
      showToastMessage(`Financial record returned for revision.`, 'warning');
      pushAllDataToCloud({ financialTransactions: updated }, { silent: true });
    } else {
      addToSyncQueue('update', 'transaction', { id, presidentApprovalStatus: 'Returned', remarks });
    }
  };

  // USER AUTHENTICATION & MANAGEMENT ACTIONS
  const handleLogin = (user: User, password: string, serverAuthenticated = false) => {
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

  const handleLogout = () => {
    if (currentUser) {
      logAction('Logged Out', `${currentUser.name} signed out of the system.`);
    }
    setCurrentUser(null);
    removeSecureItem('bafa_current_user');
    setGuestMode(true);
    if (import.meta.env.PROD || dbStatus.configured) {
      void fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    }
    showToastMessage('You have been signed out securely. Session ended.', 'info');
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
      status: 'Active'
    };
    const updated = [newUser, ...users];
    setUsers(updated);
    updateStorage('bafa_users', updated);

    if (isOnline) {
      pushAllDataToCloud({ users: updated }, { silent: true, force: true, source: isInitialAdminBootstrap ? 'Admin Bootstrap' : 'User Registration' });
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

  const handleRequestPasswordReset = (username: string) => {
    const matchedUser = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!matchedUser) {
      showToastMessage('Kung adunay account nga motakdo, ipadala ang password reset instructions.', 'success');
      return;
    }
    const updated = users.map(u => u.id === matchedUser.id ? { ...u, resetRequested: true } : u);
    setUsers(updated);
    updateStorage('bafa_users', updated);

    logAction('Requested Reset', `Requested password reset for ${matchedUser.name} (${matchedUser.username})`);
    if (isOnline) {
      pushAllDataToCloud({ users: updated }, { silent: true, force: true, source: 'Password Reset Requested' });
    } else {
      addToSyncQueue('update', 'user', { id: matchedUser.id, resetRequested: true });
    }
    showToastMessage('Kung adunay account nga motakdo, ipadala ang password reset instructions.', 'success');
  };

  const handleResetPassword = async (userId: string, newPass: string, currentPassword = ''): Promise<boolean> => {
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return false;

    // The President may reset officer credentials; the Secretary may reset member credentials.
    // but the President's own account can never be reset from this desk.
    const canResetPasswords =
      !!currentUser && (
        currentUser.role === 'President' ||
        (['Secretary', 'Assistant_Secretary'].includes(currentUser.role) && targetUser.role === 'Member')
      );
    if (!canResetPasswords) {
      showToastMessage('Only the President may reset officer credentials; the Secretary may reset member credentials.', 'error');
      return false;
    }
    if (targetUser.role === 'President') {
      showToastMessage('Dili ma-reset ang password sa Presidente. (The President\'s password cannot be reset.)', 'error');
      return false;
    }

    if (import.meta.env.PROD || dbStatus.configured) {
      try {
        const response = await fetch('/api/auth/password/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, targetUserId: userId, newPassword: newPass, currentPassword })
        });
        const result = await response.json();
        if (!response.ok || !result?.success) {
          showToastMessage(result?.message || 'Password reset was rejected.', 'error');
          return false;
        }
        const updatedTarget = { ...targetUser, mustChangePassword: true, resetRequested: false, failedLoginAttempts: 0, lockedUntil: undefined };
        setUsers(previous => previous.map(user => user.id === userId ? updatedTarget : user));
        updateStorage('bafa_users', users.map(user => user.id === userId ? updatedTarget : user));
        showToastMessage(`A temporary password was created for ${targetUser.name}; it must be changed at next sign-in.`, 'success');
        return true;
      } catch {
        showToastMessage('Password reset could not be completed because the server could not be reached.', 'error');
        return false;
      }
    }

    if (!currentUser || !verifyPassword(currentPassword, currentUser.passwordHash, currentUser.password)) {
      showToastMessage('Your current password is incorrect.', 'error');
      return false;
    }

    const safeHistory = Array.isArray(targetUser.passwordHistory) ? targetUser.passwordHistory : [];
    const policyError = validatePasswordPolicy(newPass, targetUser.username, targetUser.role, safeHistory);
    if (policyError) {
      showToastMessage(policyError, 'error');
      return false;
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
        { silent: true, force: true, source: 'Password Reset' }
      );
    } else {
      addToSyncQueue('update', 'user', { id: userId, resetRequested: false });
    }
    showToastMessage(`Malampusong na-reset ang password ni ${targetUser.name}!`, 'success');
    return true;
  };

  const handleApproveUser = (id: string) => {
    const targetUser = users.find(u => u.id === id);
    if (!targetUser) return;

    const updated = users.map(u => u.id === id ? { ...u, isApproved: true } : u);
    setUsers(updated);
    updateStorage('bafa_users', updated);

    let updatedMembers = members;
    // If they are a registered farmer member, enroll them into the primary members list too!
    if (targetUser.role === 'Member') {
      const alreadyInRoster = members.some(m => m.id === id || m.name.toLowerCase() === targetUser.name.toLowerCase());
      if (!alreadyInRoster) {
        const newMember: Member = {
          id: targetUser.id,
          name: targetUser.name,
          farmLocation: targetUser.farmLocation || 'Sitio Tapon',
          primaryCrops: targetUser.primaryCrops || ['Crops'],
          contactNumber: targetUser.contactNumber || '',
          status: 'Active',
          joinedDate: targetUser.joinedDate || new Date().toISOString().split('T')[0]
        };
        updatedMembers = [newMember, ...members];
        setMembers(updatedMembers);
        updateStorage('bafa_members', updatedMembers);
      }
    }

    logAction('Approved Registration', `Approved portal registration for ${targetUser.name} (${targetUser.role})`);
    showToastMessage(`Approved registration for ${targetUser.name}!`, 'success');

    if (isOnline) {
      pushAllDataToCloud({ users: updated, members: updatedMembers }, { silent: true, source: 'Approve Registration' });
    } else {
      addToSyncQueue('update', 'user', { id, isApproved: true });
    }
  };

  const handleDeclineUser = (id: string) => {
    const targetUser = users.find(u => u.id === id);
    if (!targetUser) return;

    const updated = users.filter(u => u.id !== id);
    setUsers(updated);
    updateStorage('bafa_users', updated);
    storeDeletedId('users', id);

    // Direct and permanent removal from PostgreSQL Cloud Database
    deleteFromDatabase('user', id);

    logAction('Declined Registration', `Declined portal registration for ${targetUser.name} (${targetUser.role})`);
    showToastMessage(`Declined registration for ${targetUser.name}.`, 'warning');

    if (isOnline) {
      pushAllDataToCloud({ users: updated }, { silent: true, source: 'Decline Registration' });
    } else {
      addToSyncQueue('delete', 'user', { id, name: targetUser.name });
    }
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

  const handleUpdateUserRole = (id: string, newRole: OfficerRole | 'Member') => {
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

    logAction(
      'Updated Officer Role',
      `Modified governance role for ${targetUser.name} from "${oldRoleName}" to "${newRoleName}".`
    );

    // If current logged-in user role changed, update session
    if (currentUser && currentUser.id === id) {
      const updatedCurrent = { ...currentUser, role: newRole };
      setCurrentUser(updatedCurrent);
      setCurrentRole(newRole as any);
      // Keep role updates in memory; do not persist an alternate session identity in web storage.
    }

    if (isOnline) {
      showToastMessage(`Updated ${targetUser.name}'s role to ${newRoleName}. Auto-syncing to database...`, 'info');
      pushAllDataToCloud({ users: updatedUsers }, { silent: true, source: 'Role Updated' });
    } else {
      addToSyncQueue('update', 'officer', { id, name: targetUser.name, newRole });
      showToastMessage(`Role updated offline. Will auto-sync to database once reconnected.`, 'warning');
    }
  };

  const handleAddOfficer = (officerData: { name: string; username: string; password: string; role: OfficerRole }) => {
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
    const newOfficer: User = {
      id: `user-${Date.now()}`,
      username: cleanUsername,
      passwordHash: hashPolicyPassword(rawPassword),
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
      showToastMessage(`Malampusong nadugang si ${cleanName} isip ${roleName}! Auto-syncing to database...`, 'success');
      pushAllDataToCloud({ users: updatedUsers }, { silent: true, source: 'Officer Created' });
    } else {
      addToSyncQueue('create', 'officer', { id: newOfficer.id, name: cleanName, role: officerData.role });
      showToastMessage(`Officer ${cleanName} added offline. Will sync to database when online.`, 'warning');
    }
    return true;
  };

  const handleUpdateProfile = (updatedUser: User) => {
    const owner = currentUser && users.find(u => u.id === currentUser.id);
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

    const updatedUsers = users.map(u => u.id === owner.id ? ownedProfile : u);
    setUsers(updatedUsers);
    updateStorage('bafa_users', updatedUsers);

    setCurrentUser(ownedProfile);
    updateStorage('bafa_current_user', ownedProfile);

    // Sync member list details if they are a member
    if (ownedProfile.role === 'Member') {
      const updatedMembers = members.map(m => (m.id === ownedProfile.id || (ownedProfile.memberIdNumber && m.memberIdNumber === ownedProfile.memberIdNumber) || m.name.toLowerCase() === ownedProfile.name.toLowerCase()) ? {
        ...m,
        name: ownedProfile.name,
        farmLocation: ownedProfile.farmLocation || m.farmLocation,
        primaryCrops: ownedProfile.primaryCrops || m.primaryCrops,
        contactNumber: ownedProfile.contactNumber || m.contactNumber,
        avatarUrl: ownedProfile.avatarUrl,
        affiliations: ownedProfile.affiliations || m.affiliations
      } : m);
      setMembers(updatedMembers);
      updateStorage('bafa_members', updatedMembers);
    }

    logAction('Updated Profile', `${ownedProfile.name} modified their profile details`);
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
        { silent: true, source: 'Presidential Turnover', force: true }
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
        hogRaising,
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

  const isPrivacyPage = typeof window !== 'undefined' && (window.location.pathname === '/privacy' || window.location.pathname === '/privacy/');
  if (isPrivacyPage) {
    return (
      <Suspense fallback={<DashboardSkeleton variant="app" />}>
        <PrivacyPolicy />
      </Suspense>
    );
  }

  if (isHydrating) {
    return <DashboardSkeleton variant={guestMode ? 'guest' : 'officer'} />;
  }

  if (!currentUser) {
    if (guestMode) {
      return (
        <Suspense fallback={<DashboardSkeleton variant="guest" />}>
          <GuestPortal
            onEnterLogin={() => setGuestMode(false)}
            members={members}
            hogRaising={hogRaising}
            products={products}
            announcements={announcements}
            activities={activities}
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
            <div className={`flex items-center gap-2 px-4.5 py-3 rounded-2xl shadow-2xl border-2 text-sm font-extrabold max-w-sm ${
              toast.type === 'success'
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
      <div id="member-screen-wrapper" className="min-h-screen bg-[#F5F2EB] text-slate-900 flex flex-col font-sans">
        {/* TOP HEADER NAVIGATION AND IDENTIFIER FOR MEMBER PORTAL */}
        <header className="bg-[#1B4332] border-b-2 border-[#122E22] py-3 sm:py-4 px-3.5 sm:px-6 shrink-0 shadow-md text-white no-print">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 max-w-full">
              <div className="bg-[#D8F3DC] p-1 rounded-full shadow-inner text-[#1B4332] shrink-0 overflow-hidden border-2 border-[#a8d5b0]">
                <img src="/logo.svg" alt="Alegria Farmers Association logo" className="w-14 h-14 sm:w-16 sm:h-16 object-contain block rounded-full bg-white" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <h1 className="text-base sm:text-lg font-black tracking-tight text-white uppercase font-display break-words">Alegria Farmers Association</h1>
                  <span className="text-[9px] sm:text-[10px] bg-bafa-600 text-bafa-100 px-2 py-0.5 rounded-full border border-bafa-500 font-black font-mono shrink-0">
                    Member Portal
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-[#D8F3DC]/80 mt-0.5 font-medium truncate">Tuburan, Cebu Province • Official Member Suite</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2 sm:gap-2.5 w-full sm:w-auto max-w-full">
              <LanguageToggle onDark />
              {/* Active session bar with prominent Logout button */}
              <div className="flex items-center justify-between gap-2.5 bg-[#081C15] px-3 py-1.5 rounded-2xl border-2 border-[#52B788] w-full sm:w-auto min-w-0 shrink-0 shadow-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-xl bg-[#D8F3DC] text-[#1B4332] font-mono font-black flex items-center justify-center text-xs shrink-0 uppercase shadow-xs">
                    {currentUser?.name.substring(0, 2)}
                  </div>
                  <div className="text-left min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] bg-[#2D6A4F] text-[#D8F3DC] font-mono font-black uppercase px-1.5 py-0.2 rounded shrink-0">
                        Active Member
                      </span>
                      <span className="text-xs font-black text-white truncate max-w-[130px] sm:max-w-[160px]">{currentUser?.name}</span>
                    </div>
                    <span className="block text-[10px] text-[#D8F3DC] font-bold uppercase tracking-wide truncate">
                      {currentUser?.farmLocation || 'Tuburan, Cebu'}
                    </span>
                  </div>
                </div>
                <button
                  id="header-member-logout-btn"
                  type="button"
                  onClick={handleLogout}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs cursor-pointer transition-all shadow-sm flex items-center gap-1.5 shrink-0 border border-rose-500"
                  title="Sign out of member portal"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span>Logout</span>
                </button>
              </div>

              {/* Offline Switch & Sync Trigger */}
              <OfflineIndicator
                isOnline={isOnline}
                queueCount={syncQueue.length}
                onSync={handleSynchronize}
                isSyncing={isSyncing}
                dbStatus={dbStatus}
                onCheckDb={checkDatabaseConnection}
                onClearLocalCache={handleClearLocalCache}
              />
            </div>
          </div>
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
        <main className="flex-1 max-w-7xl w-full mx-auto p-3.5 sm:p-6">
          <Suspense fallback={<DashboardSkeleton variant="member" />}>
            <MemberDashboard
              currentUser={currentUser}
              onUpdateProfile={handleUpdateProfile}
              onLogout={handleLogout}
              toast={showToastMessage}
              announcements={announcements}
              hogRaisingState={hogRaising}
              members={members}
              onAddChoreLog={handleAddPigChore}
              products={products}
              activities={activities}
            />
          </Suspense>
        </main>

        {toast && (
          <div className="fixed bottom-6 right-6 z-50 animate-bounce-short">
            <div className={`flex items-center gap-2 px-4.5 py-3 rounded-2xl shadow-2xl border-2 text-sm font-extrabold max-w-sm ${
              toast.type === 'success'
                ? 'bg-[#1B4332] text-[#D8F3DC] border-[#2D6A4F]'
                : toast.type === 'warning'
                ? 'bg-amber-900 text-amber-100 border-amber-600'
                : toast.type === 'error'
                ? 'bg-rose-950 text-rose-100 border-rose-600'
                : 'bg-slate-100 text-slate-900 border-slate-300'
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

  return (
    <div id="application-root" className="min-h-screen bg-[#F5F2EB] text-slate-900 flex flex-col font-sans lg:pl-72">

      {/* GLOBAL TOAST NOTIFICATION BANNER */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce-short">
          <div className={`flex items-center gap-2 px-4.5 py-3 rounded-2xl shadow-2xl border-2 text-sm font-extrabold max-w-sm ${
            toast.type === 'success'
              ? 'bg-[#1B4332] text-[#D8F3DC] border-[#2D6A4F]'
              : toast.type === 'warning'
              ? 'bg-amber-900 text-amber-100 border-amber-600'
              : toast.type === 'error'
              ? 'bg-rose-950 text-rose-100 border-rose-600'
              : 'bg-slate-100 text-slate-900 border-slate-300'
          }`}>
            {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-300 shrink-0" />}
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

      {/* TOP HEADER NAVIGATION AND IDENTIFIER */}
      <header className="bg-[#1B4332] border-b-2 border-[#122E22] py-3 sm:py-4 px-3.5 sm:px-6 shrink-0 shadow-md text-white">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 max-w-full">
            <div className="bg-[#D8F3DC] p-1 rounded-full shadow-inner text-[#1B4332] shrink-0 overflow-hidden border-2 border-[#a8d5b0]">
              <img src="/logo.svg" alt="Alegria Farmers Association logo" className="w-14 h-14 sm:w-16 sm:h-16 object-contain block rounded-full bg-white" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h1 className="text-base sm:text-lg font-black tracking-tight text-white uppercase font-display break-words">Alegria Farmers Association</h1>
                <span className="text-[9px] sm:text-[10px] bg-bafa-600 text-bafa-100 px-2 py-0.5 rounded-full border border-bafa-500 font-black font-mono shrink-0">
                  Barangay Portal
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#D8F3DC]/80 mt-0.5 font-medium truncate">Tuburan, Cebu Province • Official Officer Suite</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-start lg:justify-end gap-2 sm:gap-2.5 w-full lg:w-auto max-w-full">
            <LanguageToggle onDark />
            {/* Active session bar */}
            <div className="flex items-center justify-between gap-2 bg-[#081C15] px-3 py-1.5 rounded-2xl border-2 border-[#52B788] w-full sm:w-auto min-w-0 shrink-0 shadow-sm">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-xl bg-[#D8F3DC] text-[#1B4332] font-mono font-black flex items-center justify-center text-xs shrink-0 uppercase shadow-xs">
                  {currentUser?.name.substring(0, 2)}
                </div>
                <div className="text-left min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] bg-[#2D6A4F] text-[#D8F3DC] font-mono font-black uppercase px-1.5 py-0.2 rounded shrink-0">
                      Active Officer
                    </span>
                    <span className="text-xs font-black text-white truncate max-w-[130px] sm:max-w-[160px]">{currentUser?.name}</span>
                  </div>
                  <span className="block text-[10px] text-[#D8F3DC] font-bold uppercase tracking-wide truncate">
                    {currentUser?.role.replace('_', ' ')}
                  </span>
                </div>
              </div>
              <button
                id="header-officer-logout-btn"
                type="button"
                onClick={handleLogout}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs cursor-pointer transition-all shadow-sm flex items-center gap-1.5 shrink-0 border border-rose-500 ml-1 lg:hidden"
                title="Sign out of administration suite"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>Logout</span>
              </button>
            </div>

            {/* Offline Switch & Sync Trigger */}
            <OfflineIndicator
              isOnline={isOnline}
              queueCount={syncQueue.length}
              onSync={handleSynchronize}
              isSyncing={isSyncing}
              dbStatus={dbStatus}
              onCheckDb={checkDatabaseConnection}
              onClearLocalCache={handleClearLocalCache}
            />
          </div>
        </div>
      </header>

      {/* PERMANENT LEFT SIDEBAR NAVIGATION (Desktop) */}
      {!guestMode && currentUser && (currentUser.role as string) !== 'Member' && (
        <aside
          id="officer-left-sidebar"
          className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-72 flex-col bg-[#0F2D24] border-r-2 border-[#1B4332] shadow-2xl text-white"
        >
          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 pt-5 pb-4 space-y-1" aria-label="Officer navigation">
            <p className="px-3 pb-1 text-[11px] font-black uppercase tracking-wider text-[#74C69D]">Main Views</p>
            {([
              { tab: 'tasks' as const, label: 'Officer Task Panel', icon: ShieldCheck },
              { tab: 'hog-raising' as const, label: 'IGP Tracker', icon: Briefcase },
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
                  className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-bold text-left transition-all cursor-pointer border ${
                    isActive
                      ? 'bg-[#D8F3DC] text-[#1B4332] border-[#2D6A4F] shadow-md'
                      : 'bg-transparent text-[#D8F3DC] border-transparent hover:bg-[#1B4332] hover:text-white'
                  }`}
                >
                  <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-[#1B4332]' : 'text-[#95D5B2]'}`} />
                  <span className="truncate">{label}</span>
                  {isActive && <span className="ml-auto w-2 h-2 rounded-full bg-[#1B4332] shrink-0" aria-hidden="true" />}
                </button>
              );
            })}

            <p className="px-3 pt-4 pb-1 text-[11px] font-black uppercase tracking-wider text-[#74C69D]">System</p>
            <button
              id="sidebar-nav-sync"
              type="button"
              onClick={() => jumpToDashboardSection('sync-queue-panel-window')}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-bold text-left bg-transparent text-[#D8F3DC] border border-transparent hover:bg-[#1B4332] hover:text-white transition-all cursor-pointer"
            >
              <Layers className="w-4.5 h-4.5 shrink-0 text-[#95D5B2]" />
              <span className="truncate">Sync Queue</span>
              {syncQueue.length > 0 && (
                <span className="ml-auto min-w-6 text-center bg-amber-500 text-[#1B4332] text-[11px] font-black px-1.5 py-0.5 rounded-full">
                  {syncQueue.length}
                </span>
              )}
            </button>

            {(currentRole === 'Treasurer' || currentRole === 'Assistant_Treasurer') && (
              <button
                id="sidebar-treasurer-report-btn"
                type="button"
                onClick={() => setShowPresidentReport(true)}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-bold text-left bg-transparent text-[#D8F3DC] border border-transparent hover:bg-[#1B4332] hover:text-white transition-all cursor-pointer"
              >
                <FileText className="w-4.5 h-4.5 shrink-0 text-[#95D5B2]" />
                <span className="truncate">Financial Report (PDF)</span>
              </button>
            )}

            {currentRole === 'President' && (
              <button
                id="sidebar-download-backup-btn"
                type="button"
                onClick={handleDownloadSystemBackup}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-bold text-left bg-transparent text-[#D8F3DC] border border-transparent hover:bg-[#1B4332] hover:text-white transition-all cursor-pointer"
              >
                <Download className="w-4.5 h-4.5 shrink-0 text-[#95D5B2]" />
                <span className="truncate">Download Backup</span>
              </button>
            )}

            <button
              id="sidebar-nav-logout"
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-bold text-left bg-rose-950/40 text-rose-200 border border-rose-800/40 hover:bg-rose-900 hover:text-white hover:border-rose-700 transition-all cursor-pointer mt-2"
              title="Sign out of administration suite"
            >
              <LogOut className="w-4.5 h-4.5 shrink-0 text-rose-400" />
              <span className="truncate">Logout</span>
            </button>
          </nav>

          {/* Footer status */}
          <div className="px-5 py-4 border-t border-white/10">
            <div className="flex items-center gap-2 text-xs font-bold text-[#D8F3DC]">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dbStatus.connected ? 'bg-emerald-400' : 'bg-amber-400'}`} aria-hidden="true" />
              <span className="truncate">{dbStatus.checking ? 'Checking database…' : dbStatus.connected ? `${dbStatus.provider} connected` : 'Offline local mode'}</span>
            </div>
          </div>
        </aside>
      )}

      {/* MAIN LAYOUT BODY */}
      <main className="flex-1 p-3 sm:p-4 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-4">

          {/* OFFICER MAIN VIEWS TAB BAR (Mobile only — desktop uses the left sidebar) */}
          <div className="bg-white border-2 border-[#D5CFC1] rounded-2xl p-2.5 no-print space-y-1.5 shadow-sm lg:hidden">
            {/* Mobile Phone Scroll Hint Indicator */}
            <div className="flex sm:hidden items-center justify-between w-full px-2.5 py-1 text-[11px] font-black text-[#1B4332] bg-[#EAF4EC] rounded-lg border border-[#2D6A4F]/30">
              <span className="flex items-center gap-1">
                <ChevronLeft className="w-3.5 h-3.5 text-amber-700 animate-pulse" />
                Scroll / swipe menu to view all options →
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-amber-700 animate-pulse" />
            </div>

            <div className="relative w-full flex items-center">
              <div className="w-full flex justify-start gap-1.5 overflow-x-auto py-1 select-none scrollbar-thin scrollbar-thumb-emerald-600/30 px-2">
                <button
                  id="officer-tasks-tab-btn"
                  type="button"
                  role="tab"
                  aria-selected={officerTab === 'tasks'}
                  onClick={() => {
                    setOfficerTab('tasks');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`shrink-0 min-w-max px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold transition-all flex items-center gap-2 border-b-4 cursor-pointer whitespace-nowrap rounded-t-xl ${
                    officerTab === 'tasks'
                      ? 'border-[#1B4332] text-[#1B4332] bg-[#EAF4EC]'
                      : 'border-transparent text-slate-700 hover:text-[#1B4332] hover:bg-[#F2EFE9]'
                  }`}
                >
                  <img src="/logo.svg" alt="Alegria Farmers Association logo" className="w-6 h-6 object-contain rounded-full bg-white shrink-0" />
                  <span>Officer Task Panel</span>
                </button>

                <button
                  id="officer-hog-raising-tab-btn"
                  type="button"
                  role="tab"
                  aria-selected={officerTab === 'hog-raising'}
                  onClick={() => {
                    setOfficerTab('hog-raising');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`shrink-0 min-w-max px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold transition-all flex items-center gap-2 border-b-4 cursor-pointer whitespace-nowrap rounded-t-xl ${
                    officerTab === 'hog-raising'
                      ? 'border-[#1B4332] text-[#1B4332] bg-[#EAF4EC]'
                      : 'border-transparent text-slate-700 hover:text-[#1B4332] hover:bg-[#F2EFE9]'
                  }`}
                >
                  <Briefcase className="w-4 h-4 text-[#1B4332]" />                  <span>IGP Tracker</span>
                  <span className="bg-[#1B4332]/10 text-[#1B4332] border border-[#1B4332]/20 text-[9px] px-2 py-0.5 rounded-full font-black ml-1">
                    Active
                  </span>
                </button>

                <button
                  id="officer-announcements-tab-btn"
                  type="button"
                  role="tab"
                  aria-selected={officerTab === 'announcements'}
                  onClick={() => {
                    setOfficerTab('announcements');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`shrink-0 min-w-max px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold transition-all flex items-center gap-2 border-b-4 cursor-pointer whitespace-nowrap rounded-t-xl relative ${
                    officerTab === 'announcements'
                      ? 'border-[#1B4332] text-[#1B4332] bg-[#EAF4EC]'
                      : 'border-transparent text-slate-700 hover:text-[#1B4332] hover:bg-[#F2EFE9]'
                  }`}
                >
                  <Megaphone className="w-4 h-4 text-[#1B4332]" />
                  <span>Announcements Board</span>
                  <span className="bg-[#1B4332]/10 text-[#1B4332] border border-[#1B4332]/20 text-[9px] px-2 py-0.5 rounded-full font-black ml-1">
                    Dashboard
                  </span>
                </button>

                <button
                  id="officer-member-view-tab-btn"
                  type="button"
                  role="tab"
                  aria-selected={officerTab === 'member-view'}
                  onClick={() => {
                    setOfficerTab('member-view');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`shrink-0 min-w-max px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold transition-all flex items-center gap-2 border-b-4 cursor-pointer whitespace-nowrap rounded-t-xl relative ${
                    officerTab === 'member-view'
                      ? 'border-amber-600 text-amber-900 bg-amber-50'
                      : 'border-transparent text-slate-700 hover:text-amber-900 hover:bg-amber-50/50'
                  }`}
                >
                  <Users className="w-4 h-4 text-amber-700" />
                  <span>My Member Portal & ID (Officer as Member)</span>
                  <span className="bg-amber-200 text-amber-900 border border-amber-300 text-[9px] px-2 py-0.5 rounded-full font-black ml-1">
                    Officer as Member
                  </span>
                </button>

                <button
                  id="officer-products-tab-btn"
                  type="button"
                  role="tab"
                  aria-selected={officerTab === 'products'}
                  onClick={() => {
                    setOfficerTab('products');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`shrink-0 min-w-max px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold transition-all flex items-center gap-2 border-b-4 cursor-pointer whitespace-nowrap rounded-t-xl relative ${
                    officerTab === 'products'
                      ? 'border-[#1B4332] text-[#1B4332] bg-[#EAF4EC]'
                      : 'border-transparent text-slate-700 hover:text-[#1B4332] hover:bg-[#F2EFE9]'
                  }`}
                >
                  <ShoppingBag className="w-4 h-4 text-[#1B4332]" />
                  <span>Products Catalog</span>
                  <span className="bg-[#1B4332]/10 text-[#1B4332] border border-[#1B4332]/20 text-[9px] px-2 py-0.5 rounded-full font-black ml-1">
                    Market
                  </span>
                </button>
              </div>

            </div>
          </div>

          <Suspense fallback={<DashboardSkeleton variant="officer" />}>
            {officerTab === 'tasks' && (
              /* ACTIVE VIEW WRAPPER */
              <div id="officer-dashboard-window" className="bg-white border-2 border-[#D5CFC1] p-5 sm:p-6 rounded-3xl shadow-sm text-slate-900">

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
                onApproveUser={handleApproveUser}
                onDeclineUser={handleDeclineUser}
                onDeleteUser={handleDeleteUser}
                onUpdateUserRole={handleUpdateUserRole}
                onResetPassword={handleResetPassword}
                onPresidentTurnover={handlePresidentTurnover}
                onOpenReportModal={() => setShowReportModal(true)}
                onDownloadBackup={currentRole === 'President' ? handleDownloadSystemBackup : undefined}
                onApproveMeetingMinutes={handleApproveMeetingMinutes}
                onReturnMeetingMinutes={handleReturnMeetingMinutes}
                onPresidentApproveTransaction={handlePresidentApproveTransaction}
                onPresidentReturnTransaction={handlePresidentReturnTransaction}
                onUpdateUser={(updatedUser) => {
                  const updated = users.map(u => u.id === updatedUser.id ? updatedUser : u);
                  setUsers(updated);
                  updateStorage('bafa_users', updated);
                  if (currentUser?.id === updatedUser.id) {
                    setCurrentUser(updatedUser);
                    updateStorage('bafa_current_user', updatedUser);
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
            onAddMember={(memberData, loginCredentials) => {
                  if (loginCredentials && users.some((user) => user.username.toLowerCase() === loginCredentials.username.toLowerCase())) {
                    showToastMessage('That username is already in use.', 'error');
                    return;
                  }
                  handleAddMember(memberData, loginCredentials);
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
                funds={funds}
                hogRaising={hogRaising}
                onAddTransaction={handleAddTransaction}
                onDeleteTransaction={handleDeleteTransaction}
                onAddFund={handleAddFund}
                onDeleteFund={handleDeleteFund}
                onOpenReportModal={() => setShowReportModal(true)}
              />
            )}

            {currentRole === 'Auditor' && (
              <AuditorView
                transactions={transactions}
                onAuditTransaction={handleAuditTransaction}
                onOpenReportModal={() => setShowReportModal(true)}
                inventory={inventory}
                onAddInventory={handleAddInventoryItem}
                onUpdateInventory={handleUpdateInventoryItem}
                onDeleteInventory={handleDeleteInventoryItem}
                auditorName={`Auditor (${getOfficerName('Auditor')})`}
              />
            )}

            {/* PIO View */}
            {currentRole === 'PIO' && (
              <PioView
                announcements={announcements}
                activities={activities}
                onAddAnnouncement={handleAddAnnouncement}
                onDeleteAnnouncement={handleDeleteAnnouncement}
                onAddActivity={handleAddActivity}
                onUpdateActivity={handleUpdateActivity}
                onDeleteActivity={handleDeleteActivity}
                onOpenReportModal={() => setShowReportModal(true)}
              />
            )}

          </div>
          )}

          {officerTab === 'hog-raising' && (
            <div id="officer-hog-raising-window" className="bg-white border-2 border-[#D5CFC1] p-5 sm:p-6 rounded-3xl shadow-sm text-slate-900 text-left">
              <LivestockMonitor
                state={hogRaising}
                members={members}
                meetings={meetings}
                onAddExpense={handleAddPigExpense}
                onUpdateExpense={handleUpdatePigExpense}
                onDeleteExpense={handleDeletePigExpense}
                onAddSale={handleAddHogSale}
                onUpdateSale={handleUpdateHogSale}
                onDeleteSale={handleDeleteHogSale}
                onAddChoreLog={handleAddPigChore}
                onUpdateOpeningHogCount={handleUpdateOpeningHogCount}
                onAddProduce={handleAddProduce}
                onDeleteProduce={handleDeleteProduce}
                isTreasurerOrOfficer={['Auditor', 'Treasurer', 'Assistant_Treasurer', 'President', 'Vice_President'].includes(currentRole || '')}
                isTreasurer={currentRole === 'Treasurer'}
                currentUser={currentUser!}
                isOfficerMode={true}
                closedYears={hogRaising.closedYears || [2025]}
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
              />
            </div>
          )}

          {officerTab === 'announcements' && (
            <div id="officer-announcements-window" className="bg-white border-2 border-[#D5CFC1] p-5 sm:p-6 rounded-3xl shadow-sm text-slate-900">
              {/* The President (system admin) can publish and manage announcements. */}
              {currentRole === 'President' ? (
                <PioView
                  announcements={announcements}
                  activities={activities}
                  onAddAnnouncement={handleAddAnnouncement}
                  onDeleteAnnouncement={handleDeleteAnnouncement}
                  onAddActivity={handleAddActivity}
                  onUpdateActivity={handleUpdateActivity}
                  onDeleteActivity={handleDeleteActivity}
                  onOpenReportModal={() => setShowReportModal(true)}
                  postedByName={`President (${currentUser?.name || 'AFA President'})`}
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
            <div id="officer-member-view-window" className="bg-[#FAF8F5] text-slate-900 border border-[#D5CFC1] p-4 sm:p-6 rounded-3xl shadow-xl space-y-4">
              <div className="bg-[#EAF4EC] border-2 border-[#1B4332]/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#1B4332] text-white rounded-xl shadow-xs">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-[#1B4332]">My Member Dashboard & ID</h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOfficerTab('tasks');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-4 py-2 bg-[#1B4332] hover:bg-[#122e22] text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <img src="/logo.svg" alt="Alegria Farmers Association logo" className="w-6 h-6 object-contain rounded-full bg-white shrink-0" />
                  <span>Back to Officer Suite</span>
                </button>
              </div>

              <MemberDashboard
                currentUser={currentUser!}
                onUpdateProfile={handleUpdateProfile}
                onLogout={handleLogout}
                toast={showToastMessage}
                announcements={announcements}
                hogRaisingState={hogRaising}
                members={members}
                onAddChoreLog={handleAddPigChore}
                products={products}
                activities={activities}
              />
            </div>
          )}

          {/* OFFLINE SYNC QUEUE MANAGEMENT SCREEN (Always available to monitor) */}
          <div id="sync-queue-panel-window">
            <SyncQueuePanel
              queue={syncQueue}
              isOnline={isOnline}
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
            members={members}
            meetings={meetings}
            resolutions={resolutions}
            transactions={transactions}
            announcements={announcements}
            activities={activities}
            inventory={inventory}
            logs={logs}
            funds={funds}
            hogRaising={hogRaising}
            onClose={() => setShowReportModal(false)}
            onDownloadBackup={currentRole === 'President' ? handleDownloadSystemBackup : undefined}
          />
        </Suspense>
      )}

      {/* PRESIDENT'S LETTERHEAD REPORT (print / save as PDF) */}
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
                year={new Date().getFullYear()}
                users={users}
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

    </div>
  );
}
