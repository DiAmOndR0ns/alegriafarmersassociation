import React, { useState, useEffect, useRef } from 'react';
import { 
  OfficerRole, Member, Meeting, Resolution, 
  FinancialTransaction, Announcement, SyncQueueItem, SystemLog, User, HogRaisingState,
  IgpExpense, IgpSale, IgpChoreLog, Product, AssociationActivity, OrganizationFund, DatabaseStatus
} from './types';
import { 
  INITIAL_MEMBERS, INITIAL_MEETINGS, INITIAL_RESOLUTIONS, 
  INITIAL_TRANSACTIONS, INITIAL_ANNOUNCEMENTS, INITIAL_LOGS, INITIAL_HOG_RAISING,
  INITIAL_PRODUCTS, INITIAL_ACTIVITIES, OFFICIAL_OFFICERS, INITIAL_FUNDS
} from './initialData';
import OfflineIndicator from './components/OfflineIndicator';
import SecretaryView from './components/SecretaryView';
import TreasurerView from './components/TreasurerView';
import PioView from './components/PioView';
import ExecutiveView from './components/ExecutiveView';
import AnnouncementDashboard from './components/AnnouncementDashboard';
import HogRaisingIgpTracker from './components/HogRaisingIgpTracker';
import SyncQueuePanel from './components/SyncQueuePanel';
import AuthScreen from './components/AuthScreen';
import MemberDashboard from './components/MemberDashboard';
import GuestPortal from './components/GuestPortal';
import PrivacyPolicy from './components/PrivacyPolicy';
import OfficerReportModal from './components/OfficerReportModal';
import ProductManagementModal from './components/ProductManagementModal';
import DashboardSkeleton from './components/DashboardSkeleton';
import { buildAuditChain, hashPassword, sanitizeUserForStorage } from './utils/audit';
import { 
  Building, ShieldCheck, Megaphone, Users, Coins, 
  Layers, CheckCircle, AlertTriangle, HelpCircle, ArrowRight, LogOut, Briefcase, FileText, ShoppingBag,
  ChevronLeft, ChevronRight, Download
} from 'lucide-react';

export default function App() {
  // Auth & Accounts State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [guestMode, setGuestMode] = useState<boolean>(true);

  // Connection and Sync State
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isPurging, setIsPurging] = useState<boolean>(false);
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([]);
  const [dbStatus, setDbStatus] = useState<DatabaseStatus>({
    connected: false,
    configured: false,
    provider: 'Checking...',
    checking: true,
  });

  const checkDatabaseConnection = async () => {
    setDbStatus(prev => ({ ...prev, checking: true }));
    try {
      const res = await fetch('/api/db/status');
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = { connected: false, configured: false, provider: 'Local Storage', message: 'Offline mode active.' };
      }
      setDbStatus({
        connected: Boolean(data.connected),
        configured: Boolean(data.configured),
        provider: data.provider || (data.configured ? 'Supabase' : 'Local Storage'),
        database: data.database,
        timestamp: data.timestamp || new Date().toISOString(),
        message: data.message,
        error: data.error,
        tableCounts: data.tableCounts,
        totalRecords: data.totalRecords,
        checking: false,
      });
    } catch {
      setDbStatus({
        connected: false,
        configured: false,
        provider: 'Local Storage',
        message: 'Running in local offline-first storage mode.',
        checking: false,
      });
    }
  };

  // Officer Role State
  const [currentRole, setCurrentRole] = useState<OfficerRole>('President');
  const [officerTab, setOfficerTab] = useState<'tasks' | 'hog-raising' | 'announcements' | 'member-view' | 'products'>('tasks');
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [showProductModal, setShowProductModal] = useState<boolean>(false);

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
      logs
    };
  }, [users, members, meetings, resolutions, transactions, announcements, products, activities, hogRaising, funds, logs]);

  // Feedback State (Toasts)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' | 'info' | 'error' } | null>(null);

  const jumpToDashboardSection = (sectionId: string) => {
    const target = document.getElementById(sectionId);
    if (!target) return;

    const topOffset = window.innerWidth >= 1024 ? 130 : 90;
    const y = target.getBoundingClientRect().top + window.scrollY - topOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });
  };

  // Load Data on Mount
  useEffect(() => {
    try {
      const storedMembers = localStorage.getItem('bafa_members');
      const storedMeetings = localStorage.getItem('bafa_meetings');
      const storedResolutions = localStorage.getItem('bafa_resolutions');
      const storedTransactions = localStorage.getItem('bafa_transactions');
      const storedAnnouncements = localStorage.getItem('bafa_announcements');
      const storedHogRaising = localStorage.getItem('bafa_hog_raising');
      const storedProducts = localStorage.getItem('bafa_products');
      const storedActivities = localStorage.getItem('bafa_activities');
      const storedFunds = localStorage.getItem('bafa_funds');
      const storedQueue = localStorage.getItem('bafa_sync_queue');
      const storedLogs = localStorage.getItem('bafa_logs');
      const storedUsers = localStorage.getItem('bafa_users');

      // Detect and clear legacy dummy seed data from previous versions (e.g. Roberto Cañete / m-001)
      const hasOldSeedMembers = storedMembers && (storedMembers.includes('m-001') || storedMembers.includes('Roberto M. Cañete') || storedMembers.includes('Juanito') || storedMembers.includes('user-m1'));
      if (hasOldSeedMembers) {
        console.log('[Auto-Cleanup]: Detected legacy dummy seed data in local cache. Cleaning storage for real data...');
        localStorage.removeItem('bafa_members');
        localStorage.removeItem('bafa_meetings');
        localStorage.removeItem('bafa_resolutions');
        localStorage.removeItem('bafa_transactions');
        localStorage.removeItem('bafa_announcements');
        localStorage.removeItem('bafa_products');
        localStorage.removeItem('bafa_activities');
        localStorage.removeItem('bafa_funds');
        localStorage.removeItem('bafa_hog_raising');
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
        setMembers(storedMembers ? JSON.parse(storedMembers) : INITIAL_MEMBERS);
        setMeetings(storedMeetings ? JSON.parse(storedMeetings) : INITIAL_MEETINGS);
        setResolutions(storedResolutions ? JSON.parse(storedResolutions) : INITIAL_RESOLUTIONS);
        setTransactions(storedTransactions ? JSON.parse(storedTransactions) : INITIAL_TRANSACTIONS);
        setAnnouncements(storedAnnouncements ? JSON.parse(storedAnnouncements) : INITIAL_ANNOUNCEMENTS);
        setHogRaising(storedHogRaising ? JSON.parse(storedHogRaising) : INITIAL_HOG_RAISING);
        setProducts(storedProducts ? JSON.parse(storedProducts) : INITIAL_PRODUCTS);
        setActivities(storedActivities ? JSON.parse(storedActivities) : INITIAL_ACTIVITIES);
        setFunds(storedFunds ? JSON.parse(storedFunds) : INITIAL_FUNDS);
      }

      setSyncQueue(storedQueue ? JSON.parse(storedQueue) : []);

      const parsedUsers = storedUsers ? JSON.parse(storedUsers) : OFFICIAL_OFFICERS;
      // Filter out any dummy members from users and strip any plain-text passwords
      const sanitizedUsers = (Array.isArray(parsedUsers) ? parsedUsers : OFFICIAL_OFFICERS)
        .filter((u: any) => u.role !== 'Member' || !u.id.startsWith('user-m'))
        .map((u: any) => {
          const copy = { ...u };
          if (copy.password) {
            if (!copy.passwordHash) {
              copy.passwordHash = hashPassword(copy.password);
            }
            delete copy.password;
          }
          return copy;
        });
      setUsers(sanitizedUsers.length > 0 ? sanitizedUsers : OFFICIAL_OFFICERS);
      localStorage.setItem('bafa_users', JSON.stringify(sanitizedUsers.length > 0 ? sanitizedUsers : OFFICIAL_OFFICERS));

      // Also clean bafa_current_user in localStorage if it contains plaintext password
      const storedCurr = localStorage.getItem('bafa_current_user');
      if (storedCurr) {
        try {
          const parsedCurr = JSON.parse(storedCurr);
          if (parsedCurr && typeof parsedCurr === 'object' && parsedCurr.password) {
            delete parsedCurr.password;
            localStorage.setItem('bafa_current_user', JSON.stringify(parsedCurr));
          }
        } catch {}
      }

      const rawLogs = storedLogs ? JSON.parse(storedLogs) : INITIAL_LOGS;
      const needsChaining = rawLogs.some((l: any) => !l.hash || !l.previousHash);
      const activeLogs = needsChaining ? buildAuditChain(rawLogs) : rawLogs;
      if (needsChaining) {
        updateStorage('bafa_logs', activeLogs);
      }
      setLogs(activeLogs);

      // Initial database status check
      checkDatabaseConnection();
      setIsHydrating(false);

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
            // Check for any locally queued deleted IDs to prevent resurrecting deleted items before DB flush
            let bootDeletedIds: Record<string, string[]> = {};
            try {
              const rawDel = localStorage.getItem('bafa_deleted_ids');
              if (rawDel) bootDeletedIds = JSON.parse(rawDel);
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

            const cleanMembers = Array.isArray(res.data.members) ? res.data.members.filter((m: any) => !delMembers.has(m.id)) : [];
            const cleanMeetings = Array.isArray(res.data.meetings) ? res.data.meetings.filter((m: any) => !delMeetings.has(m.id)) : [];
            const cleanResolutions = Array.isArray(res.data.resolutions) ? res.data.resolutions.filter((r: any) => !delResolutions.has(r.id)) : [];
            const cleanTx = Array.isArray(res.data.financialTransactions) ? res.data.financialTransactions.filter((t: any) => !delTx.has(t.id)) : [];
            const cleanAnnouncements = Array.isArray(res.data.announcements) ? res.data.announcements.filter((a: any) => !delAnnouncements.has(a.id)) : [];
            const cleanProducts = Array.isArray(res.data.products) ? res.data.products.filter((p: any) => !delProducts.has(p.id)) : [];
            const cleanActivities = Array.isArray(res.data.activities) ? res.data.activities.filter((a: any) => !delActivities.has(a.id)) : [];
            const cleanFunds = Array.isArray(res.data.funds) ? res.data.funds.filter((f: any) => !delFunds.has(f.id)) : [];

            if (Array.isArray(res.data.members)) { setMembers(cleanMembers); updateStorage('bafa_members', cleanMembers); }
            if (Array.isArray(res.data.meetings)) { setMeetings(cleanMeetings); updateStorage('bafa_meetings', cleanMeetings); }
            if (Array.isArray(res.data.resolutions)) { setResolutions(cleanResolutions); updateStorage('bafa_resolutions', cleanResolutions); }
            if (Array.isArray(res.data.financialTransactions)) { setTransactions(cleanTx); updateStorage('bafa_transactions', cleanTx); }
            if (Array.isArray(res.data.announcements)) { setAnnouncements(cleanAnnouncements); updateStorage('bafa_announcements', cleanAnnouncements); }
            if (Array.isArray(res.data.products)) { setProducts(cleanProducts); updateStorage('bafa_products', cleanProducts); }
            if (Array.isArray(res.data.activities)) { setActivities(cleanActivities); updateStorage('bafa_activities', cleanActivities); }
            if (Array.isArray(res.data.funds)) { setFunds(cleanFunds); updateStorage('bafa_funds', cleanFunds); }
            if (res.data.hogRaising) { setHogRaising(res.data.hogRaising); updateStorage('bafa_hog_raising', res.data.hogRaising); }
            if (Array.isArray(res.data.users) && res.data.users.length > 0) {
              const officersOnly = res.data.users.filter((u: any) => !delUsers.has(u.id) && (u.role !== 'Member' || !u.id.startsWith('user-m')));
              const cleanUsers = officersOnly.length > 0 ? officersOnly : OFFICIAL_OFFICERS;
              setUsers(cleanUsers);
              updateStorage('bafa_users', cleanUsers);
            }
            console.log('[Cloud DB] Successfully loaded fresh data from PostgreSQL Cloud DB');
            setDbStatus(prev => ({
              ...prev,
              connected: true,
              configured: true,
              checking: false,
            }));

            // If there were pending offline operations or pending deletions queued in local storage, sync them immediately
            const hasQueuedItems = storedQueue && JSON.parse(storedQueue || '[]').length > 0;
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
                    hogRaising: res.data.hogRaising || INITIAL_HOG_RAISING,
                    systemLogs: activeLogs,
                    deletedIds: bootDeletedIds
                  })
                }).then(r => r.json()).then(pushRes => {
                  if (pushRes?.success) {
                    setSyncQueue([]);
                    localStorage.removeItem('bafa_sync_queue');
                    localStorage.removeItem('bafa_deleted_ids');
                    updateStorage('bafa_sync_queue', []);
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
      console.error('Error reading localStorage: ', e);
      // Fallback
      setMembers(INITIAL_MEMBERS);
      setMeetings(INITIAL_MEETINGS);
      setResolutions(INITIAL_RESOLUTIONS);
      setTransactions(INITIAL_TRANSACTIONS);
      setAnnouncements(INITIAL_ANNOUNCEMENTS);
      setHogRaising(INITIAL_HOG_RAISING);
      setFunds(INITIAL_FUNDS);
      setSyncQueue([]);
      setLogs(INITIAL_LOGS);
      setUsers(OFFICIAL_OFFICERS);
    }
  }, []);

  // Save changes helper with automatic security sanitization
  const updateStorage = (key: string, data: any) => {
    if (key === 'bafa_users' && Array.isArray(data)) {
      const sanitized = data.map((u: any) => {
        const copy = { ...u };
        if (copy.password) {
          if (!copy.passwordHash) {
            copy.passwordHash = hashPassword(copy.password);
          }
          delete copy.password;
        }
        return copy;
      });
      localStorage.setItem(key, JSON.stringify(sanitized));
      return;
    }
    if (key === 'bafa_current_user' && data && typeof data === 'object') {
      const copy = { ...data };
      delete copy.password;
      localStorage.setItem(key, JSON.stringify(copy));
      return;
    }
    localStorage.setItem(key, JSON.stringify(data));
  };

  const showToastMessage = (message: string, type: 'success' | 'warning' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  const getOfficerName = (role: OfficerRole) => {
    const matchedUser = users.find(u => u.role === role);
    if (matchedUser) return matchedUser.name;

    switch (role) {
      case 'President': return 'Zenaida A. Elbiña';
      case 'Vice_President': return 'Anselna B Arnado';
      case 'Secretary': return 'Jennylyn S Lumactao';
      case 'Treasurer': return 'Gracelyn P Asendiente';
      case 'Auditor': return 'Lorena B Pinote';
      case 'PIO': return 'Ida S Manera';
      default: return 'AFA Officer';
    }
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
  }

  const getStoredDeletedIds = (): StoredDeletedIds => {
    let result: StoredDeletedIds = {};
    try {
      const raw = localStorage.getItem('bafa_deleted_ids');
      if (raw) result = JSON.parse(raw);
    } catch {
      result = {};
    }

    // Also inspect bafa_sync_queue to extract any pending offline 'delete' operations
    try {
      const rawQueue = localStorage.getItem('bafa_sync_queue');
      if (rawQueue) {
        const parsedQueue = JSON.parse(rawQueue);
        if (Array.isArray(parsedQueue)) {
          for (const item of parsedQueue) {
            if (item.action === 'delete' && item.payload?.id) {
              const entity = (item.entityType || '').toLowerCase();
              const id = item.payload.id;
              if (entity === 'member') result.members = Array.from(new Set([...(result.members || []), id]));
              else if (entity === 'user' || entity === 'officer') result.users = Array.from(new Set([...(result.users || []), id]));
              else if (entity === 'meeting') result.meetings = Array.from(new Set([...(result.meetings || []), id]));
              else if (entity === 'resolution') result.resolutions = Array.from(new Set([...(result.resolutions || []), id]));
              else if (entity === 'transaction' || entity === 'financialtransaction') {
                result.financialTransactions = Array.from(new Set([...(result.financialTransactions || []), id]));
                result.transactions = Array.from(new Set([...(result.transactions || []), id]));
              }
              else if (entity === 'announcement') result.announcements = Array.from(new Set([...(result.announcements || []), id]));
              else if (entity === 'product') result.products = Array.from(new Set([...(result.products || []), id]));
              else if (entity === 'activity') result.activities = Array.from(new Set([...(result.activities || []), id]));
              else if (entity === 'fund') result.funds = Array.from(new Set([...(result.funds || []), id]));
            }
          }
        }
      }
    } catch {}

    return result;
  };

  const storeDeletedId = (entity: keyof StoredDeletedIds, id: string): StoredDeletedIds => {
    try {
      const current = getStoredDeletedIds();
      current[entity] = Array.from(new Set([...(current[entity] || []), id]));
      if (entity === 'financialTransactions') {
        current.transactions = Array.from(new Set([...(current.transactions || []), id]));
      } else if (entity === 'transactions') {
        current.financialTransactions = Array.from(new Set([...(current.financialTransactions || []), id]));
      }
      localStorage.setItem('bafa_deleted_ids', JSON.stringify(current));
      return current;
    } catch {
      return {};
    }
  };

  const clearStoredDeletedIds = () => {
    try {
      localStorage.removeItem('bafa_deleted_ids');
    } catch {
      // Ignore
    }
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
        localStorage.removeItem('bafa_sync_queue');
        updateStorage('bafa_sync_queue', []);
        clearStoredDeletedIds();

        // Mark pending system logs as synced in state and storage
        setLogs(prev => {
          const updated = prev.map(l => l.syncStatus === 'pending' ? { ...l, syncStatus: 'synced' as const } : l);
          updateStorage('bafa_logs', updated);
          return updated;
        });

        // Refresh database row stats and status
        checkDatabaseConnection();

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

  // Permanently Purge All Demo & Dummy Seed Records from Supabase and Local Storage
  const handlePurgeAllDummyData = async () => {
    if (!window.confirm("Are you sure you want to permanently delete all demo/seed data? This will clear all dummy records in Supabase and local browser cache so you can start inputting real data.")) {
      return;
    }
    setIsPurging(true);
    showToastMessage('Purging all demo and seed data from Supabase & local storage...', 'info');

    try {
      // 1. Wipe Cloud Supabase database tables
      const res = await fetch('/api/db/purge', { method: 'POST' });
      const data = await res.json();

      // 2. Clear browser local storage
      localStorage.removeItem('bafa_members');
      localStorage.removeItem('bafa_meetings');
      localStorage.removeItem('bafa_resolutions');
      localStorage.removeItem('bafa_transactions');
      localStorage.removeItem('bafa_announcements');
      localStorage.removeItem('bafa_products');
      localStorage.removeItem('bafa_activities');
      localStorage.removeItem('bafa_funds');
      localStorage.removeItem('bafa_hog_raising');
      localStorage.removeItem('bafa_logs');
      localStorage.removeItem('bafa_sync_queue');

      // 3. Reset React states
      setMembers([]);
      setMeetings([]);
      setResolutions([]);
      setTransactions([]);
      setAnnouncements([]);
      setProducts([]);
      setActivities([]);
      setFunds([]);
      setHogRaising(INITIAL_HOG_RAISING);
      setSyncQueue([]);
      setLogs([]);

      // Keep only the 6 official officer logins in users
      setUsers(OFFICIAL_OFFICERS);
      localStorage.setItem('bafa_users', JSON.stringify(OFFICIAL_OFFICERS));

      showToastMessage(data?.message || 'All demo records deleted! Ready for real data input.', 'success');
      checkDatabaseConnection();
    } catch (err: any) {
      console.error('Purge error:', err);
      showToastMessage(`Purged locally: ${err?.message || 'Ready for real data.'}`, 'info');
    } finally {
      setIsPurging(false);
    }
  };

  // Enforce Zero Residual Storage by clearing local browser cache once cloud database is active
  const handleClearLocalCache = () => {
    if (!dbStatus.connected) {
      showToastMessage('Cannot purge local browser cache while database is disconnected! Connect to Supabase first to prevent data loss.', 'error');
      return;
    }
    if (window.confirm('Clear all local browser table caches? All association records are safely stored in your live Supabase database. Clearing local cache enforces Zero-Residual confidential storage on this computer.')) {
      localStorage.removeItem('bafa_members');
      localStorage.removeItem('bafa_meetings');
      localStorage.removeItem('bafa_resolutions');
      localStorage.removeItem('bafa_transactions');
      localStorage.removeItem('bafa_announcements');
      localStorage.removeItem('bafa_products');
      localStorage.removeItem('bafa_activities');
      localStorage.removeItem('bafa_funds');
      localStorage.removeItem('bafa_hog_raising');
      localStorage.removeItem('bafa_logs');
      localStorage.removeItem('bafa_sync_queue');
      showToastMessage('Local browser cache cleared! Operating in Zero-Residual Cloud Database mode.', 'success');
    }
  };

  const handleClearQueue = () => {
    setSyncQueue([]);
    localStorage.removeItem('bafa_sync_queue');
    updateStorage('bafa_sync_queue', []);
    showToastMessage('Pending queue cleared. Confidential data purged from local cache.', 'info');
  };

  const handleRemoveQueueItem = (id: string) => {
    const updated = syncQueue.filter(item => item.id !== id);
    setSyncQueue(updated);
    updateStorage('bafa_sync_queue', updated);
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
      if (navigator.onLine && (syncQueue.length > 0 || hasPendingDeletions() || logs.some(l => l.syncStatus === 'pending'))) {
        console.log('[Auto-Sync Heartbeat]: Automatically synchronizing pending items to database...');
        pushAllDataToCloud(undefined, { silent: true, source: 'Auto-Sync (Heartbeat)' });
      }
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleWindowFocus);
      if (reactiveTimer) clearTimeout(reactiveTimer);
      clearInterval(intervalId);
    };
  }, [isOnline, syncQueue.length]);

  // SECRETARY ACTION HANDLERS
  const handleAddMember = (
    memberData: Omit<Member, 'id' | 'joinedDate'>,
    loginCredentials?: { username: string; initialPassword?: string }
  ) => {
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
      const initialPassword = loginCredentials.initialPassword?.trim() || 'password123';
      const cleanHash = hashPassword(initialPassword);

      const newMemberUser: User = {
        id: newId,
        username: cleanUsername,
        passwordHash: cleanHash,
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
        status: newMember.status
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
      showToastMessage(`Registered ${newMember.name} offline. Ready to sync when connected.`);
    }
  };

  // Secretary sets or resets portal credentials for an enrolled member
  const handleManageMemberLogin = (memberId: string, username: string, initialPassword: string) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;

    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = initialPassword.trim();
    const newHash = hashPassword(cleanPassword);

    const existingIndex = users.findIndex(u => u.id === memberId || u.memberIdNumber === member.memberIdNumber);

    let updatedUsers: User[];
    if (existingIndex >= 0) {
      updatedUsers = users.map((u, idx) => {
        if (idx === existingIndex) {
          const { password, ...rest } = u;
          return {
            ...rest,
            username: cleanUsername,
            passwordHash: newHash,
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
        passwordHash: newHash,
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
      id: `meet-${Date.now()}`
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

  // HOG RAISING IGP HANDLERS
  const handleAddPigExpense = (expData: Omit<IgpExpense, 'id' | 'recordedBy'>) => {
    const newExp: IgpExpense = {
      ...expData,
      id: `pig-exp-${Date.now()}`,
      recordedBy: currentUser ? `${currentUser.role} (${currentUser.name})` : 'Treasurer (Rodolfo Climaco)'
    };
    const updatedState: HogRaisingState = {
      ...hogRaising,
      expenses: [newExp, ...hogRaising.expenses]
    };
    setHogRaising(updatedState);
    updateStorage('bafa_hog_raising', updatedState);

    // Also register in general ledger for complete co-op records!
    handleAddTransaction({
      type: 'expense',
      category: 'Hog Raising Project',
      amount: expData.amount,
      date: expData.date,
      description: `[Hog Raising IGP] ${expData.category}: ${expData.description}`,
      recordedBy: currentUser ? `Treasurer (${currentUser.name})` : 'Treasurer (Rodolfo Climaco)'
    });

    if (isOnline) {
      logAction('Recorded Pig Expense', `Logged PHP ${newExp.amount.toLocaleString()} piggery expense for "${newExp.category}"`);
      showToastMessage('Hog raising expense recorded and linked to general ledger.');
    } else {
      addToSyncQueue('create', 'hog_expense', newExp);
    }
  };

  const handleAddHogSale = (saleData: Omit<IgpSale, 'id' | 'recordedBy'>) => {
    const newSale: IgpSale = {
      ...saleData,
      id: `pig-sale-${Date.now()}`,
      recordedBy: currentUser ? `${currentUser.role} (${currentUser.name})` : 'Treasurer (Rodolfo Climaco)'
    };
    const updatedState: HogRaisingState = {
      ...hogRaising,
      sales: [newSale, ...hogRaising.sales]
    };
    setHogRaising(updatedState);
    updateStorage('bafa_hog_raising', updatedState);

    // Also register in general ledger for complete co-op records!
    handleAddTransaction({
      type: 'income',
      category: 'Hog Raising Project',
      amount: saleData.revenue,
      date: saleData.date,
      description: `[Hog Raising IGP] Sold ${saleData.hogsCount} hogs: ${saleData.notes || 'Mature hogs sold.'}`,
      recordedBy: currentUser ? `Treasurer (${currentUser.name})` : 'Treasurer (Rodolfo Climaco)'
    });

    if (isOnline) {
      logAction('Recorded Hog Sale', `Sold ${newSale.hogsCount} mature hogs for PHP ${newSale.revenue.toLocaleString()}`);
      showToastMessage(`Hog sale of PHP ${newSale.revenue.toLocaleString()} recorded and linked to general ledger.`);
    } else {
      addToSyncQueue('create', 'hog_sale', newSale);
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
    updateStorage('bafa_hog_raising', updatedState);

    if (isOnline) {
      logAction('Logged Pig Chore', `${newChore.checkedBy} checked-in: ${newChore.activities.join(', ')}`);
      showToastMessage('Daily pig care activity has been recorded successfully!');
      pushAllDataToCloud({ hogRaising: updatedState }, { silent: true });
    } else {
      addToSyncQueue('create', 'hog_chore', newChore);
    }
  };

  const handleUpdateCapitalGrant = (amount: number) => {
    const numAmount = typeof amount === 'number' ? amount : (parseFloat(amount as any) || 0);
    const updatedState: HogRaisingState = {
      ...hogRaising,
      capitalGrant: numAmount
    };
    setHogRaising(updatedState);
    updateStorage('bafa_hog_raising', updatedState);

    if (isOnline) {
      logAction('Updated Capital Allocation', `Modified Hog Raising IGP capital allocation to PHP ${numAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
      showToastMessage(`Successfully updated Capital Allocation to PHP ${numAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}!`, 'success');
      pushAllDataToCloud({ hogRaising: updatedState }, { silent: true });
      fetch('/api/db/capital-grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: numAmount })
      }).catch(e => console.warn('[Capital Allocation direct DB update error]:', e));
    } else {
      addToSyncQueue('update', 'hog_expense', { id: 'capital-grant', amount: numAmount });
    }
  };

  const handleAddProduce = (produceName: string) => {
    const updatedState: HogRaisingState = {
      ...hogRaising,
      produces: Array.from(new Set([...(hogRaising.produces || ['Chairs Rental', 'Sacks Rental', 'Crop Livelihood']), produceName]))
    };
    setHogRaising(updatedState);
    updateStorage('bafa_hog_raising', updatedState);

    if (isOnline) {
      logAction('Added Dynamic IGP Produce', `Added new dynamic produce project: "${produceName}"`);
      showToastMessage(`Successfully added dynamic IGP project: "${produceName}"`, 'success');
      pushAllDataToCloud({ hogRaising: updatedState }, { silent: true });
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
    updateStorage('bafa_hog_raising', updatedState);

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

  // USER AUTHENTICATION & MANAGEMENT ACTIONS
  const handleLogin = (user: User) => {
    // Sanitize user object: strip password from local session to protect credentials
    const { password, ...safeUser } = user;
    setCurrentUser(safeUser as User);
    updateStorage('bafa_current_user', safeUser);
    if (user.role !== 'Member') {
      setCurrentRole(user.role as OfficerRole);
    }
    showToastMessage(`Maayong adlaw, ${user.name}! Successful login.`, 'success');
  };

  const handleLogout = () => {
    if (currentUser) {
      logAction('Logged Out', `${currentUser.name} signed out of the system.`);
    }
    setCurrentUser(null);
    localStorage.removeItem('bafa_current_user');
    setGuestMode(true);
    showToastMessage('You have been signed out securely. Session ended.', 'info');
  };

  const handleRegister = (userData: Omit<User, 'id' | 'isApproved'>) => {
    const copy = { ...userData };
    if (copy.password) {
      if (!copy.passwordHash) {
        copy.passwordHash = hashPassword(copy.password);
      }
      delete copy.password;
    }
    const newUser: User = {
      ...copy,
      id: `user-${Date.now()}`,
      isApproved: false,
      joinedDate: new Date().toISOString().split('T')[0]
    };
    const updated = [newUser, ...users];
    setUsers(updated);
    updateStorage('bafa_users', updated);

    if (isOnline) {
      pushAllDataToCloud({ users: updated }, { silent: true });
    }
    showToastMessage('Sign-up request received! Awaiting President/Admin approval.', 'warning');
  };

  const handleRequestPasswordReset = (username: string) => {
    const matchedUser = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!matchedUser) {
      showToastMessage('Wala makit-i ang username (Username not found).', 'error');
      return;
    }
    const updated = users.map(u => u.id === matchedUser.id ? { ...u, resetRequested: true } : u);
    setUsers(updated);
    updateStorage('bafa_users', updated);

    // Add simple system log
    logAction('Requested Reset', `Requested password reset for ${matchedUser.name} (${matchedUser.username})`);
    showToastMessage(`Ang hangyo sa pag-reset sa password para kang ${matchedUser.name} napadala na sa Presidente!`, 'success');
  };

  const handleResetPassword = (userId: string, newPass: string) => {
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;
    const newHash = hashPassword(newPass.trim());
    const updated = users.map(u => {
      if (u.id === userId) {
        const { password, ...rest } = u;
        return { ...rest, passwordHash: newHash, resetRequested: false };
      }
      return u;
    });
    setUsers(updated);
    updateStorage('bafa_users', updated);

    // Add simple system log
    logAction('Reset Password', `Updated password credentials for ${targetUser.name} (${targetUser.role})`);
    showToastMessage(`Malampusong na-reset ang password ni ${targetUser.name}!`, 'success');
  };

  const handleApproveUser = (id: string) => {
    const targetUser = users.find(u => u.id === id);
    if (!targetUser) return;

    const updated = users.map(u => u.id === id ? { ...u, isApproved: true } : u);
    setUsers(updated);
    updateStorage('bafa_users', updated);

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
        const updatedMembers = [newMember, ...members];
        setMembers(updatedMembers);
        updateStorage('bafa_members', updatedMembers);
      }
    }

    logAction('Approved Registration', `Approved portal registration for ${targetUser.name} (${targetUser.role})`);
    showToastMessage(`Approved registration for ${targetUser.name}!`, 'success');
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

    const roleName = targetUser.role.replace('_', ' ');
    const isOfficer = ['President', 'Vice_President', 'Secretary', 'Treasurer', 'Auditor', 'PIO'].includes(targetUser.role);

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
      sessionStorage.setItem('afa_user', JSON.stringify(updatedCurrent));
    }

    if (isOnline) {
      showToastMessage(`Updated ${targetUser.name}'s role to ${newRoleName}. Auto-syncing to database...`, 'info');
      pushAllDataToCloud({ users: updatedUsers }, { silent: true, source: 'Role Updated' });
    } else {
      addToSyncQueue('update', 'officer', { id, name: targetUser.name, newRole });
      showToastMessage(`Role updated offline. Will auto-sync to database once reconnected.`, 'warning');
    }
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
      joinedDate: updatedUser.joinedDate
    };

    const updatedUsers = users.map(u => u.id === owner.id ? ownedProfile : u);
    setUsers(updatedUsers);
    updateStorage('bafa_users', updatedUsers);

    setCurrentUser(ownedProfile);
    updateStorage('bafa_current_user', ownedProfile);

    // Sync member list details if they are a member
    if (ownedProfile.role === 'Member') {
      const updatedMembers = members.map(m => m.id === ownedProfile.id ? {
        ...m,
        name: ownedProfile.name,
        farmLocation: ownedProfile.farmLocation || m.farmLocation,
        primaryCrops: ownedProfile.primaryCrops || m.primaryCrops,
        contactNumber: ownedProfile.contactNumber || m.contactNumber,
        avatarUrl: ownedProfile.avatarUrl
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
    outgoingNewRole: 'Member' | 'Vice_President' | 'Secretary' | 'Treasurer' | 'Auditor' | 'PIO' | 'None'
  ) => {
    const currentPresident = users.find(u => u.role === 'President');
    if (!currentPresident) {
      showToastMessage('Error: No active President found in the system.', 'error');
      return;
    }

    const newPresidentUser = users.find(u => u.id === newPresidentId);
    if (!newPresidentUser) {
      showToastMessage('Error: Selected new President user not found.', 'error');
      return;
    }

    const updatedUsers = users.map(user => {
      if (user.role === 'President') {
        return {
          ...user,
          role: (outgoingNewRole === 'None' ? 'Member' : outgoingNewRole) as any
        };
      }
      if (user.id === newPresidentId) {
        return { ...user, role: 'President' as const };
      }
      return user;
    });

    setUsers(updatedUsers);
    updateStorage('bafa_users', updatedUsers);

    let updatedCurrentUser = currentUser;
    if (currentUser) {
      if (currentUser.role === 'President') {
        updatedCurrentUser = {
          ...currentUser,
          role: (outgoingNewRole === 'None' ? 'Member' : outgoingNewRole) as any
        };
        setCurrentRole(outgoingNewRole === 'None' ? 'Member' as any : outgoingNewRole as any);
      } else if (currentUser.id === newPresidentId) {
        updatedCurrentUser = {
          ...currentUser,
          role: 'President'
        };
        setCurrentRole('President');
      }
      setCurrentUser(updatedCurrentUser);
      updateStorage('bafa_current_user', updatedCurrentUser);
    }

    const turnoverDetails = `FORMAL OFFICERS TURNOVER: Following the election on ${electionDate}, ${currentPresident.name} has formally turned over the presidency and all AFA files, keys, and assets to the newly-elected President, ${newPresidentUser.name}. Memo/Notes: ${turnoverNotes}`;

    logAction('Presidential Turnover', turnoverDetails);
    showToastMessage(`Turnover completed! The new President is ${newPresidentUser.name}!`, 'success');
  };

  const handleDownloadSystemBackup = () => {
    const backupData = {
      exportDate: new Date().toISOString(),
      exportedBy: currentUser ? `${currentUser.name} (${currentUser.role})` : 'Guest / System',
      association: 'Alegria Farmers Association (Tuburan, Cebu)',
      version: '1.0.0',
      data: {
        users,
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

  if (window.location.pathname === '/privacy' || window.location.pathname === '/privacy/') {
    return <PrivacyPolicy />;
  }

  if (isHydrating) {
    return <DashboardSkeleton variant={guestMode ? 'guest' : 'officer'} />;
  }

  if (!currentUser) {
    if (guestMode) {
      return (
        <GuestPortal
          onEnterLogin={() => setGuestMode(false)}
          members={members}
          hogRaising={hogRaising}
          products={products}
          announcements={announcements}
          activities={activities}
        />
      );
    }

    return (
      <div id="auth-screen-wrapper" className="min-h-screen bg-bafa-50">
        <AuthScreen
          users={users}
          onLogin={handleLogin}
          onRegister={handleRegister}
          toast={showToastMessage}
          onRequestPasswordReset={handleRequestPasswordReset}
          onBackToGuest={() => setGuestMode(true)}
        />
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
      <div id="member-screen-wrapper" className="min-h-screen bg-[#FAF8F5]">
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
        {toast && (
          <div className="fixed bottom-6 right-6 z-50">
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

      {/* TOP HEADER NAVIGATION AND IDENTIFIER */}
      <header className="bg-[#1B4332] border-b-2 border-[#122E22] py-3 sm:py-4 px-3.5 sm:px-6 shrink-0 shadow-md text-white">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 max-w-full">
            <div className="bg-[#D8F3DC] rounded-2xl shadow-inner text-[#1B4332] shrink-0 overflow-hidden border border-[#a8d5b0]">
              <img src="/logo.svg" alt="Alegria Farmers Association logo" className="w-10 h-10 sm:w-12 sm:h-12 object-cover block" />
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
                onClick={handleLogout}
                className="p-1.5 hover:bg-rose-900/50 hover:text-rose-200 rounded-xl text-slate-300 cursor-pointer transition-colors border border-transparent hover:border-rose-400/30 shrink-0 ml-1"
                title="Sign out of administration suite"
              >
                <LogOut className="w-4 h-4" />
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
              onPurgeDb={handlePurgeAllDummyData}
              isPurging={isPurging}
              onClearLocalCache={handleClearLocalCache}
            />
          </div>
        </div>
      </header>

      {/* PERMANENT LEFT SIDEBAR NAVIGATION (Desktop) */}
      {!guestMode && currentUser && currentUser.role !== 'Member' && (
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
                  <img src="/logo.svg" alt="Alegria Farmers Association logo" className="w-4 h-4 object-cover rounded-sm shrink-0" />
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
              </div>

            </div>
          </div>

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
                onUpdateLogs={(newLogs) => {
                  setLogs(newLogs);
                  updateStorage('bafa_logs', newLogs);
                }}
                users={users}
                onApproveUser={handleApproveUser}
                onDeclineUser={handleDeclineUser}
                onDeleteUser={handleDeleteUser}
                onUpdateUserRole={handleUpdateUserRole}
                onResetPassword={handleResetPassword}
                onPresidentTurnover={handlePresidentTurnover}
                onOpenReportModal={() => setShowReportModal(true)}
                onDownloadBackup={currentRole === 'President' ? handleDownloadSystemBackup : undefined}
              />
            )}

            {/* Secretary View */}
            {currentRole === 'Secretary' && (
              <SecretaryView
                members={members}
                users={users}
                onAddMember={handleAddMember}
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

            {/* Treasurer & Auditor View */}
            {(currentRole === 'Treasurer' || currentRole === 'Auditor') && (
              <TreasurerView
                transactions={transactions}
                funds={funds}
                hogRaising={hogRaising}
                onAddTransaction={handleAddTransaction}
                onDeleteTransaction={handleDeleteTransaction}
                onAuditTransaction={handleAuditTransaction}
                onUpdateCapitalGrant={handleUpdateCapitalGrant}
                onAddFund={handleAddFund}
                onDeleteFund={handleDeleteFund}
                currentRole={currentRole}
                onOpenReportModal={() => setShowReportModal(true)}
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
              <HogRaisingIgpTracker
                state={hogRaising}
                members={members}
                meetings={meetings}
                onAddExpense={handleAddPigExpense}
                onAddSale={handleAddHogSale}
                onAddChoreLog={handleAddPigChore}
                onUpdateCapitalGrant={handleUpdateCapitalGrant}
                onAddProduce={handleAddProduce}
                isTreasurerOrOfficer={currentRole === 'Treasurer' || currentRole === 'Auditor' || currentRole === 'President'}
                currentUser={currentUser!}
                isOfficerMode={true}
                closedYears={hogRaising.closedYears || [2025]}
                onCloseDecemberBook={handleCloseDecemberBook}
              />
            </div>
          )}

          {officerTab === 'products' && (
            <div id="officer-products-window" className="bg-white border-2 border-[#D5CFC1] p-5 sm:p-6 rounded-3xl shadow-sm text-slate-900">
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
              <AnnouncementDashboard
                announcements={announcements}
                isOfficerMode={false}
              />
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
                    <h2 className="text-base font-black text-[#1B4332]">My Member Dashboard & ID (Officer as Member)</h2>
                    <p className="text-xs text-slate-600 font-bold">
                      View and manage your personal AFA member credentials, digital ID badge, and benefits ({currentUser?.role.replace('_', ' ')}).
                    </p>
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
                  <img src="/logo.svg" alt="Alegria Farmers Association logo" className="w-4 h-4 object-cover rounded-sm shrink-0" />
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
        <OfficerReportModal 
          currentRole={currentRole}
          members={members}
          meetings={meetings}
          resolutions={resolutions}
          transactions={transactions}
          announcements={announcements}
          logs={logs}
          funds={funds}
          hogRaising={hogRaising}
          onClose={() => setShowReportModal(false)}
          onDownloadBackup={currentRole === 'President' ? handleDownloadSystemBackup : undefined}
        />
      )}

      {/* PRODUCT MANAGEMENT MODAL */}
      {showProductModal && (
        <ProductManagementModal 
          products={products}
          currentRole={currentRole}
          onAddProduct={handleAddProduct}
          onUpdateProduct={handleUpdateProduct}
          onDeleteProduct={handleDeleteProduct}
          onClose={() => setShowProductModal(false)}
        />
      )}

    </div>
  );
}
