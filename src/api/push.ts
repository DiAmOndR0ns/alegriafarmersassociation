import type { IncomingMessage, ServerResponse } from 'http';
import type { Request, Response } from 'express';
import { getPool, isDatabaseConfigured, saveFullStateToPostgres } from './db';
import { isPresidentRole, isSecretaryRole, isTreasurerRole, rejectCrossOriginMutation, requireAuthenticated } from './auth';
import { parseRequestBody, sendResponse } from './helper';

export type PushApiRequest = Request | (IncomingMessage & {
  body?: unknown;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
});

export type PushApiResponse = Response | ServerResponse;

export interface PushSyncState {
  members?: unknown[];
  meetings?: unknown[];
  resolutions?: unknown[];
  transactions?: unknown[];
  financialTransactions?: unknown[];
  announcements?: unknown[];
  products?: unknown[];
  activities?: unknown[];
  achievements?: unknown[];
  funds?: unknown[];
  organizationFunds?: unknown[];
  auditorReports?: unknown[];
  delegationRequests?: unknown[];
  eggHarvests?: unknown[];
  hogRaising?: Record<string, unknown>;
  systemLogs?: unknown[];
  logs?: unknown[];
  deleteItem?: { entity?: string; id?: string };
  deletedIds?: Record<string, unknown>;
  roleUpdate?: { userId?: unknown; role?: unknown };
  presidentApprovalOnly?: boolean;
  auditorReviewOnly?: boolean;
  [key: string]: unknown;
}

const ASSIGNABLE_ROLES = [
  'Vice_President',
  'Secretary',
  'Assistant_Secretary',
  'Board_Member',
  'Treasurer',
  'Assistant_Treasurer',
  'Auditor',
  'PIO',
  'Member'
] as const;

function isValidSyncState(state: unknown): state is PushSyncState {
  return typeof state === 'object' && state !== null && !Array.isArray(state);
}

const PRESIDENT_APPROVAL_FIELDS = [
  'presidentApprovalStatus',
  'presidentApprovedBy',
  'presidentApprovedDate',
  'presidentApprovalRemarks',
] as const;

const AUDITOR_REVIEW_FIELDS = [
  'auditedStatus',
  'auditedBy',
  'auditedDate',
  'auditNotes',
] as const;

/**
 * The Auditor verifies ledger entries before they reach the President. Like the
 * President's sign-off, an audit must never carry amounts or fund sources.
 */
export function extractAuditorReview(
  state: PushSyncState,
  role: string
): Array<Record<string, unknown>> | null {
  const normalized = role.trim().toLowerCase().replace(/\s+/g, '_');
  if (normalized !== 'auditor') return null;
  const incoming = state.financialTransactions ?? state.transactions;
  if (!Array.isArray(incoming)) return null;

  const reviews: Array<Record<string, unknown>> = [];
  for (const record of incoming) {
    if (!record || typeof record !== 'object') continue;
    const row = record as Record<string, unknown>;
    if (typeof row.id !== 'string' || !row.id) continue;
    const status = row.auditedStatus;
    if (status !== 'Audited' && status !== 'Flagged') continue;
    const review: Record<string, unknown> = { id: row.id };
    for (const field of AUDITOR_REVIEW_FIELDS) {
      if (row[field] !== undefined) review[field] = row[field];
    }
    reviews.push(review);
  }
  return reviews.length > 0 ? reviews : null;
}

/**
 * The President signs off on audited financial records but must never author
 * financial data. When a non-Treasurer pushes `financialTransactions`, keep only
 * the approval fields of each record and drop everything else (amounts, fund
 * sources, new rows). Returns null when the role may not approve at all.
 */
export function extractPresidentFinancialApproval(
  state: PushSyncState,
  role: string
): Array<Record<string, unknown>> | null {
  if (!isPresidentRole(role)) return null;
  const incoming = state.financialTransactions ?? state.transactions;
  if (!Array.isArray(incoming)) return null;

  const approvals: Array<Record<string, unknown>> = [];
  for (const record of incoming) {
    if (!record || typeof record !== 'object') continue;
    const row = record as Record<string, unknown>;
    if (typeof row.id !== 'string' || !row.id) continue;
    const status = row.presidentApprovalStatus;
    if (status !== 'Approved' && status !== 'Returned') continue;
    const approval: Record<string, unknown> = { id: row.id };
    for (const field of PRESIDENT_APPROVAL_FIELDS) {
      if (row[field] !== undefined) approval[field] = row[field];
    }
    approvals.push(approval);
  }
  return approvals.length > 0 ? approvals : null;
}

export function separateEggHarvestsFromFinancialState(
  state: PushSyncState,
  role: string,
  name?: string
): PushSyncState {
  const safeState: PushSyncState = { ...state };
  const hogRaising = safeState.hogRaising;
  const eggHarvests = Array.isArray(safeState.eggHarvests)
    ? safeState.eggHarvests
    : Array.isArray(hogRaising?.eggHarvests)
      ? hogRaising.eggHarvests
      : [];
  const normalizedRole = role.trim().toLowerCase().replace(/\s+/g, '_');
  const isMember = normalizedRole === 'member';
  const mayUpdateEggWorkflow = normalizedRole === 'auditor' || normalizedRole === 'president';

  for (const key of ['transactions', 'financialTransactions', 'funds', 'organizationFunds', 'hogRaising']) {
    delete safeState[key];
  }
  if (safeState.deletedIds && typeof safeState.deletedIds === 'object') {
    const {
      transactions: _transactions,
      financialTransactions: _financialTransactions,
      funds: _funds,
      organizationFunds: _organizationFunds,
      ...allowedDeletions
    } = safeState.deletedIds;
    safeState.deletedIds = allowedDeletions;
  }
  if (safeState.deleteItem) {
    const entity = String(safeState.deleteItem.entity || '').toLowerCase().replace(/[\s-]/g, '_');
    if (['transaction', 'transactions', 'financial_transaction', 'financial_transactions', 'fund', 'funds', 'organization_fund', 'organization_funds'].includes(entity)) {
      delete safeState.deleteItem;
    }
  }

  if (isMember) {
    safeState.eggHarvests = eggHarvests.filter((entry: any) =>
      entry &&
      typeof entry === 'object' &&
      entry.status === 'Pending Audit' &&
      typeof name === 'string' &&
      entry.collectedBy === name &&
      Number.isInteger(entry.eggCount) &&
      entry.eggCount >= 0 &&
      typeof entry.date === 'string' &&
      typeof entry.time === 'string'
    );
    safeState.appendEggHarvests = true;
  } else if (mayUpdateEggWorkflow) {
    safeState.eggHarvests = eggHarvests;
    delete safeState.appendEggHarvests;
  } else {
    delete safeState.eggHarvests;
    delete safeState.appendEggHarvests;
  }
  return safeState;
}

export default async function handler(req: PushApiRequest, res: PushApiResponse) {
  if (req.method && req.method !== 'POST') return sendResponse(res, 405, { success: false, message: 'Method not allowed.' });
  if (rejectCrossOriginMutation(req)) return sendResponse(res, 403, { success: false, message: 'Cross-origin requests are not allowed.' });
  if (!isDatabaseConfigured()) return sendResponse(res, 503, { success: false, message: 'Database is not configured.' });
  const user = await requireAuthenticated(req, res);
  if (!user) return;
  try {
    const rawState = await parseRequestBody(req);
    if (!isValidSyncState(rawState)) {
      return sendResponse(res, 400, { success: false, message: 'A valid state object is required.' });
    }
    const state = rawState;
    if (state.roleUpdate !== undefined) {
      if (!isPresidentRole(user.role)) {
        return sendResponse(res, 403, { success: false, message: 'Only the President may designate or reassign officer roles.' });
      }
      if (typeof state.roleUpdate !== 'object' || state.roleUpdate === null || Array.isArray(state.roleUpdate)) {
        return sendResponse(res, 400, { success: false, message: 'A valid user and assignable role are required.' });
      }
      const { userId, role } = state.roleUpdate;
      if (typeof userId !== 'string' || !userId.trim() || typeof role !== 'string' || !ASSIGNABLE_ROLES.includes(role as typeof ASSIGNABLE_ROLES[number])) {
        return sendResponse(res, 400, { success: false, message: 'A valid user and assignable role are required.' });
      }

      const result = await getPool().query(
        `UPDATE users
         SET role = $1
         WHERE id = $2 AND lower(replace(role, ' ', '_')) <> 'president'
         RETURNING id`,
        [role, userId]
      );
      if (result.rowCount === 0) {
        return sendResponse(res, 409, { success: false, message: 'The account was not found or cannot be reassigned. Presidential changes require the turnover workflow.' });
      }
      return sendResponse(res, 200, { success: true, offlineMode: false, message: 'Officer role designation saved.' });
    }
    if (state.deleteItem && ['user', 'users', 'officer', 'officers'].includes(String(state.deleteItem.entity).toLowerCase())) {
      return sendResponse(res, 403, { success: false, message: 'User accounts cannot be deleted through bulk synchronization.' });
    }
    // Accounts, roles, hashes, MFA, lockout, and policy state are managed only by dedicated auth endpoints.
    let safeState: PushSyncState = { ...state };
    // President can sync all accounts; Secretary can sync Member portal accounts
    if (!isPresidentRole(user.role)) {
      if (isSecretaryRole(user.role) && Array.isArray(safeState.users)) {
        safeState.users = safeState.users.filter((u: any) => u && typeof u === 'object' && u.role === 'Member');
      } else {
        delete (safeState as any).users;
      }
    }
    if (!isPresidentRole(user.role) && user.role.trim().toLowerCase() !== 'pio') {
      delete safeState.achievements;
      if (safeState.deletedIds && typeof safeState.deletedIds === 'object') {
        const { achievements: _deletedAchievements, ...allowedDeletions } = safeState.deletedIds;
        safeState.deletedIds = allowedDeletions;
      }
      if (safeState.deleteItem && ['achievement', 'achievements'].includes(String(safeState.deleteItem.entity || '').toLowerCase())) {
        delete safeState.deleteItem;
      }
    }
    // Keep egg-harvest records separate from the financial IGP state. Members may
    // add their own pending submissions; only the Auditor and President may
    // update the approval workflow.
    //
    // Only the Treasurer (or Assistant Treasurer) may write financial records.
    // The President's approval workflow is handled separately below so that
    // approving a budget does not strip the fund ledger from the snapshot.
    if (!isTreasurerRole(user.role)) {
      const presidentApproval = extractPresidentFinancialApproval(state, user.role);
      const auditorReview = extractAuditorReview(state, user.role);
      safeState = separateEggHarvestsFromFinancialState(safeState, user.role, user.name);
      if (presidentApproval) {
        safeState.financialTransactions = presidentApproval;
        safeState.presidentApprovalOnly = true;
      } else if (auditorReview) {
        safeState.financialTransactions = auditorReview;
        safeState.auditorReviewOnly = true;
      }
      const allowedFinancialWrite = Boolean(presidentApproval || auditorReview);
      const stripped = ['transactions', 'financialTransactions', 'funds', 'organizationFunds', 'hogRaising']
        .filter((key) => key in state && !(allowedFinancialWrite && key === 'financialTransactions'));
      if (stripped.length > 0) {
        console.warn(`[Cloud DB Push] Ignoring financial fields from role "${user.role}": ${stripped.join(', ')}`);
        // Never report success for a write that was silently discarded.
        return sendResponse(res, 403, {
          success: false,
          message: `Only the Treasurer or Assistant Treasurer may update financial records (${stripped.join(', ')}).`,
        });
      }
    }
    if (safeState.deletedIds && typeof safeState.deletedIds === 'object') {
      const { users: _deletedUsers, ...safeDeletedIds } = safeState.deletedIds as Record<string, unknown>;
      safeState.deletedIds = safeDeletedIds;
    }
    await saveFullStateToPostgres(getPool(), safeState);
    return sendResponse(res, 200, { success: true, offlineMode: false, message: 'State successfully synced.' });
  } catch (error: any) {
    console.error('[Cloud DB Push Error]:', error?.message || error);
    const statusCode = error?.statusCode === 413 ? 413 : error?.code === '23505' ? 409 : 500;
    const isFundCodeConflict = error?.code === '23505' && /organization_funds/i.test(String(error?.constraint || error?.detail || ''));
    return sendResponse(res, statusCode, {
      success: false,
      message: error?.statusCode === 413
        ? 'Request body exceeds the allowed limit.'
        : isFundCodeConflict
          ? 'A fund source with that code already exists. Choose a different fund code.'
          : error?.code === '23505'
            ? 'That officer position is already assigned.'
            : 'Unable to sync state.',
    });
  }
}
