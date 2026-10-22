import type { IncomingMessage, ServerResponse } from 'http';
import type { Request, Response } from 'express';
import { getPool, isDatabaseConfigured, saveFullStateToPostgres } from './db';
import { isPresidentRole, rejectCrossOriginMutation, requireAuthenticated } from './auth';
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

export default async function handler(req: PushApiRequest, res: PushApiResponse) {
  if (req.method && req.method !== 'POST') return sendResponse(res, 405, { success: false, message: 'Method not allowed.' });
  if (rejectCrossOriginMutation(req)) return sendResponse(res, 403, { success: false, message: 'Cross-origin requests are not allowed.' });
  const user = await requireAuthenticated(req, res);
  if (!user) return;
  // Fine-grained write authorization has not yet been implemented, so bulk writes fail closed for non-presidents.

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
    const safeState = { ...state };
    // Only the President can sync user/officer accounts
    if (!isPresidentRole(user.role)) {
      delete (safeState as any).users;
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
