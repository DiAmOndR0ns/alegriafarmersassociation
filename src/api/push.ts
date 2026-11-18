import type { IncomingMessage, ServerResponse } from 'http';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ensureDatabaseSchema, getPool, isDatabaseConfigured, saveFullStateToPostgres } from './db';
import { isPresidentRole, isSecretaryRole, isTreasurerRole, rejectCrossOriginMutation, requireAuthenticated } from './auth';
import { parseRequestBody, sendResponse } from './helper';
import { sanitizeUserRows } from './sanitize';
import { DelegationRequest, DelegationScope } from '../types';
import { DELEGATION_SCOPES, getActiveDelegationScopes, isValidDelegationDate } from '../utils/delegation';

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
  delegationAction?: {
    action?: unknown;
    requestId?: unknown;
    reason?: unknown;
    scopes?: unknown;
    effectiveStart?: unknown;
    effectiveEnd?: unknown;
    decision?: unknown;
    remarks?: unknown;
  };
  [key: string]: unknown;
}

/** Upper bound for a single day's harvest; anything larger is a typo or abuse. */
const MAX_EGG_COUNT = 100_000;

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

function isVicePresidentRole(role: string): boolean {
  return role.trim().toLowerCase().replace(/\s+/g, '_') === 'vice_president';
}

function toDelegationRequest(row: Record<string, any>): DelegationRequest {
  return {
    id: String(row.id),
    requestedBy: String(row.requested_by),
    reason: String(row.reason || ''),
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    requestedDate: String(row.requested_date || ''),
    effectiveStart: String(row.effective_start || ''),
    effectiveEnd: String(row.effective_end || ''),
    status: row.status,
    reviewedBy: row.reviewed_by || undefined,
    reviewedDate: row.reviewed_date || undefined,
    remarks: row.remarks || undefined
  };
}

async function getUserDelegationScopes(userId: string): Promise<Set<DelegationScope>> {
  const today = new Date().toISOString().slice(0, 10);
  const result = await getPool().query(
    `SELECT id, requested_by, reason, scopes, requested_date, effective_start, effective_end,
            status, reviewed_by, reviewed_date, remarks
     FROM delegation_requests
     WHERE requested_by = $1 AND status = 'Approved'
       AND effective_start <= $2 AND effective_end >= $2`,
    [userId, today]
  );
  return getActiveDelegationScopes(result.rows.map(toDelegationRequest), userId);
}

async function handleDelegationAction(
  action: NonNullable<PushSyncState['delegationAction']>,
  user: { id: string; role: string },
  res: PushApiResponse
): Promise<void> {
  const pool = getPool();
  const actionType = action.action;
  const today = new Date().toISOString().slice(0, 10);

  if (actionType === 'request') {
    if (!isVicePresidentRole(user.role)) {
      sendResponse(res, 403, { success: false, message: 'Only the Vice President may request delegated access.' });
      return;
    }

    const reason = typeof action.reason === 'string' ? action.reason.trim() : '';
    const scopes = Array.isArray(action.scopes)
      ? [...new Set(action.scopes.filter((scope): scope is DelegationScope =>
          typeof scope === 'string' && DELEGATION_SCOPES.includes(scope as DelegationScope)
        ))]
      : [];
    const effectiveStart = typeof action.effectiveStart === 'string' ? action.effectiveStart : '';
    const effectiveEnd = typeof action.effectiveEnd === 'string' ? action.effectiveEnd : '';
    if (
      !reason || reason.length > 2000 || scopes.length === 0 ||
      !isValidDelegationDate(effectiveStart) || !isValidDelegationDate(effectiveEnd) ||
      effectiveStart < today || effectiveEnd < effectiveStart
    ) {
      sendResponse(res, 400, { success: false, message: 'Provide a reason, at least one valid scope, and a valid future access period.' });
      return;
    }

    const inserted = await pool.query(
      `INSERT INTO delegation_requests
        (id, requested_by, reason, scopes, requested_date, effective_start, effective_end, status)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, 'Pending')
       RETURNING id, requested_by, reason, scopes, requested_date, effective_start, effective_end,
                 status, reviewed_by, reviewed_date, remarks`,
      [randomUUID(), user.id, reason, JSON.stringify(scopes), today, effectiveStart, effectiveEnd]
    );
    sendResponse(res, 200, {
      success: true,
      delegationRequest: toDelegationRequest(inserted.rows[0])
    });
    return;
  }

  if (actionType !== 'approve' && actionType !== 'decline' && actionType !== 'revoke') {
    sendResponse(res, 400, { success: false, message: 'A valid delegation action is required.' });
    return;
  }
  if (!isPresidentRole(user.role)) {
    sendResponse(res, 403, { success: false, message: 'Only the President may review or revoke delegated access.' });
    return;
  }

  const requestId = typeof action.requestId === 'string' ? action.requestId.trim() : '';
  const remarks = typeof action.remarks === 'string' ? action.remarks.trim() : '';
  if (!requestId || requestId.length > 100 || remarks.length > 2000) {
    sendResponse(res, 400, { success: false, message: 'A valid request and remarks are required.' });
    return;
  }

  const nextStatus = actionType === 'approve' ? 'Approved' : actionType === 'decline' ? 'Declined' : 'Revoked';
  const allowedStatus = actionType === 'revoke' ? 'Approved' : 'Pending';
  const updated = await pool.query(
    `UPDATE delegation_requests
     SET status = $1, reviewed_by = $2, reviewed_date = $3, remarks = $4
     WHERE id = $5 AND status = $6
       AND ($7 <> 'Revoked' OR effective_end >= $3)
     RETURNING id, requested_by, reason, scopes, requested_date, effective_start, effective_end,
               status, reviewed_by, reviewed_date, remarks`,
    [nextStatus, user.id, today, remarks || null, requestId, allowedStatus, nextStatus]
  );
  if (updated.rowCount === 0) {
    sendResponse(res, 409, { success: false, message: 'The request is no longer pending or active.' });
    return;
  }
  sendResponse(res, 200, {
    success: true,
    delegationRequest: toDelegationRequest(updated.rows[0])
  });
}

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
  role: string,
  hasDelegatedApproval = false
): Array<Record<string, unknown>> | null {
  if (!isPresidentRole(role) && !(hasDelegatedApproval && isVicePresidentRole(role))) return null;
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
  name?: string,
  hasDelegatedApproval = false
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
  const mayUpdateEggWorkflow = normalizedRole === 'auditor' || normalizedRole === 'president' ||
    (normalizedRole === 'vice_president' && hasDelegatedApproval);

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
    safeState.eggHarvests = eggHarvests
      .filter((entry: any) =>
        entry &&
        typeof entry === 'object' &&
        entry.status === 'Pending Audit' &&
        typeof name === 'string' &&
        entry.collectedBy === name &&
        Number.isInteger(entry.eggCount) &&
        entry.eggCount >= 0 &&
        entry.eggCount <= MAX_EGG_COUNT &&
        typeof entry.date === 'string' &&
        typeof entry.time === 'string'
      )
      // Members may only add a submission, never rewrite an approved one: keep
      // the fields a pending harvest needs and drop workflow/MFA-side data.
      .map((entry: any) => ({
        ...(typeof entry.id === 'string' ? { id: entry.id } : {}),
        collectedBy: entry.collectedBy,
        eggCount: entry.eggCount,
        date: entry.date.slice(0, 50),
        time: entry.time.slice(0, 50),
        status: 'Pending Audit' as const,
        notes: typeof entry.notes === 'string' ? entry.notes.slice(0, 1000) : undefined
      }));
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
    await ensureDatabaseSchema(getPool());
    const state = rawState;
    if (state.delegationAction !== undefined) {
      if (Object.keys(state).length !== 1 || typeof state.delegationAction !== 'object' || state.delegationAction === null) {
        return sendResponse(res, 400, { success: false, message: 'Delegation actions must be sent separately.' });
      }
      await handleDelegationAction(state.delegationAction, user, res);
      return;
    }
    if (state.delegationRequests !== undefined) {
      return sendResponse(res, 403, { success: false, message: 'Delegation records can only be changed through the review workflow.' });
    }
    const isVicePresident = isVicePresidentRole(user.role);
    const delegationScopes = isVicePresident
      ? await getUserDelegationScopes(user.id)
      : new Set<DelegationScope>();
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
    // A synced user row may describe a profile, never a credential. Drop
    // password/MFA keys and strip roles down to Member. A role change only rides
    // along when the same request obtains the President's designation approval
    // in the `roleUpdate` branch above, and it is then flagged as authorised.
    const roleAuthorized = state.roleUpdate !== undefined;
    if (Array.isArray(safeState.users)) {
      (safeState as any).users = sanitizeUserRows(safeState.users, { roleAuthorized });
    }
    if (isVicePresident) {
      const deletedAnnouncements = Array.isArray(safeState.deletedIds?.announcements)
        ? safeState.deletedIds!.announcements as string[]
        : [];
      const deletedActivities = Array.isArray(safeState.deletedIds?.activities)
        ? safeState.deletedIds!.activities as string[]
        : [];
      const deleteEntity = String(safeState.deleteItem?.entity || '').toLowerCase().replace(/[\s-]/g, '_');
      if (
        deletedAnnouncements.length > 0 || deletedActivities.length > 0 ||
        ['announcement', 'announcements', 'activity', 'activities'].includes(deleteEntity)
      ) {
        return sendResponse(res, 403, { success: false, message: 'Delegated publishing does not include editing or deleting existing posts.' });
      }

      const contentAllowed = delegationScopes.has('announcements_activities');
      for (const entity of ['announcements', 'activities'] as const) {
        const incoming = safeState[entity];
        if (!Array.isArray(incoming)) continue;
        const ids = incoming
          .filter((record: any) => record && typeof record.id === 'string')
          .map((record: any) => String(record.id).slice(0, 100));
        const existing = ids.length > 0
          ? await getPool().query(`SELECT id FROM ${entity} WHERE id = ANY($1::varchar[])`, [ids])
          : { rows: [] };
        const existingIds = new Set(existing.rows.map((row: { id: string }) => row.id));
        const newRecords = incoming.filter((record: any) =>
          record && typeof record.id === 'string' && !existingIds.has(String(record.id).slice(0, 100))
        );
        if (newRecords.length > 0 && !contentAllowed) {
          return sendResponse(res, 403, { success: false, message: 'An active announcement and activity delegation is required to publish.' });
        }

        if (!contentAllowed) {
          delete safeState[entity];
        } else if (entity === 'announcements') {
          if (newRecords.some((record: any) =>
            typeof record.title !== 'string' || !record.title.trim() ||
            typeof record.content !== 'string' || !record.content.trim()
          )) {
            return sendResponse(res, 400, { success: false, message: 'A title and announcement content are required.' });
          }
          safeState.announcements = newRecords.map((record: any) => ({
            id: String(record.id).slice(0, 100),
            title: typeof record.title === 'string' ? record.title.slice(0, 200) : '',
            category: typeof record.category === 'string' ? record.category.slice(0, 100) : 'General',
            content: typeof record.content === 'string' ? record.content.slice(0, 10000) : '',
            datePosted: new Date().toISOString().slice(0, 10),
            priority: ['Low', 'Medium', 'High'].includes(record.priority) ? record.priority : 'Low',
            postedBy: `Vice President (${user.name})`
          }));
        } else {
          if (newRecords.some((record: any) =>
            typeof record.title !== 'string' || !record.title.trim() ||
            typeof record.description !== 'string' || !record.description.trim() ||
            typeof (record.scheduledDate || record.dateScheduled) !== 'string' ||
            typeof record.location !== 'string' || !record.location.trim()
          )) {
            return sendResponse(res, 400, { success: false, message: 'A title, date, location, and activity description are required.' });
          }
          safeState.activities = newRecords.map((record: any) => ({
            id: String(record.id).slice(0, 100),
            title: typeof record.title === 'string' ? record.title.slice(0, 200) : '',
            cebTitle: typeof record.cebTitle === 'string' ? record.cebTitle.slice(0, 200) : undefined,
            category: typeof record.category === 'string' ? record.category.slice(0, 100) : 'General',
            scheduledDate: typeof record.scheduledDate === 'string' ? record.scheduledDate.slice(0, 50) : '',
            dateScheduled: typeof record.dateScheduled === 'string' ? record.dateScheduled.slice(0, 50) : undefined,
            scheduledTime: typeof record.scheduledTime === 'string' ? record.scheduledTime.slice(0, 50) : '',
            timeScheduled: typeof record.timeScheduled === 'string' ? record.timeScheduled.slice(0, 50) : undefined,
            location: typeof record.location === 'string' ? record.location.slice(0, 500) : '',
            description: typeof record.description === 'string' ? record.description.slice(0, 10000) : '',
            organizer: `Vice President (${user.name})`,
            status: 'Scheduled',
            documentedNotes: typeof record.documentedNotes === 'string' ? record.documentedNotes.slice(0, 5000) : undefined,
            attendeesCount: 0,
            targetAudience: typeof record.targetAudience === 'string' ? record.targetAudience.slice(0, 500) : undefined
          }));
        }
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
    if (
      isVicePresident &&
      Array.isArray(state.eggHarvests) &&
      state.eggHarvests.length > 0 &&
      !delegationScopes.has('record_approval')
    ) {
      return sendResponse(res, 403, { success: false, message: 'An active record-approval delegation is required for egg-harvest sign-off.' });
    }
    // Keep egg-harvest records separate from the financial IGP state. Members may
    // add their own pending submissions; only the Auditor and President may
    // update the approval workflow.
    //
    // Only the Treasurer (or Assistant Treasurer) may write financial records.
    // The President's approval workflow is handled separately below so that
    // approving a budget does not strip the fund ledger from the snapshot.
    if (!isTreasurerRole(user.role)) {
      const delegatedRecordApproval = isVicePresident && delegationScopes.has('record_approval');
      const presidentApproval = extractPresidentFinancialApproval(state, user.role, delegatedRecordApproval);
      const auditorReview = extractAuditorReview(state, user.role);
      safeState = separateEggHarvestsFromFinancialState(safeState, user.role, user.name, delegatedRecordApproval);
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
