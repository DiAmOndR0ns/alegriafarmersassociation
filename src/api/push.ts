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
  [key: string]: unknown;
}

function isValidSyncState(state: unknown): state is PushSyncState {
  return typeof state === 'object' && state !== null && !Array.isArray(state);
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
  const user = await requireAuthenticated(req, res);
  if (!user) return;
  if (!isDatabaseConfigured()) return sendResponse(res, 503, { success: false, message: 'Database is not configured.' });
  try {
    const rawState = await parseRequestBody(req);
    if (!isValidSyncState(rawState)) {
      return sendResponse(res, 400, { success: false, message: 'A valid state object is required.' });
    }
    const state = rawState;
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
    // Keep egg-harvest records separate from the financial IGP state. Members may
    // add their own pending submissions; only the Auditor and President may
    // update the approval workflow.
    if (!isTreasurerRole(user.role)) {
      safeState = separateEggHarvestsFromFinancialState(safeState, user.role, user.name);
      const stripped = ['transactions', 'financialTransactions', 'funds', 'organizationFunds', 'hogRaising']
        .filter((key) => key in state);
      if (stripped.length > 0) {
        console.warn(`[Cloud DB Push] Ignoring financial fields from role "${user.role}": ${stripped.join(', ')}`);
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
    return sendResponse(res, error?.statusCode === 413 ? 413 : 500, {
      success: false,
      message: error?.statusCode === 413 ? 'Request body exceeds the allowed limit.' : 'Unable to sync state.',
    });
  }
}
