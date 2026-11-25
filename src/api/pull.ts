import { getPool, isDatabaseConfigured, fetchAllDataFromPostgres } from './db';
import { getAuthenticatedUser, isMemberRole } from './auth';
import { sendResponse } from './helper';

function scopeDataForMember(data: any, user: { id: string; name: string; memberIdNumber?: string }) {
  const norm = (value: unknown) => String(value || '').trim().toLowerCase();
  const userName = norm(user.name);
  const userMemberIdNo = norm(user.memberIdNumber);

  const isOwnMember = (m: any) =>
    Boolean(
      (userMemberIdNo && norm(m?.memberIdNumber) === userMemberIdNo) ||
      (userName && norm(m?.name) === userName)
    );

  const ownMemberIds = new Set<string>(
    (Array.isArray(data.members) ? data.members : [])
      .filter(isOwnMember)
      .map((m: any) => String(m.id))
  );

  const scopedMembers = (Array.isArray(data.members) ? data.members : []).map((m: any) =>
    isOwnMember(m)
      ? m
      : {
          id: m.id,
          name: m.name,
          farmLocation: m.farmLocation,
          primaryCrops: Array.isArray(m.primaryCrops) ? m.primaryCrops : [],
          contactNumber: '',
          status: m.status,
          joinedDate: m.joinedDate,
          isRsbsaRegistered: Boolean(m.isRsbsaRegistered),
          membershipPaidThrough: m.membershipPaidThrough
        }
  );

  const scopedUsers = (Array.isArray(data.users) ? data.users : [])
    .filter((u: any) => u && (u.id === user.id || !isMemberRole(u.role)))
    .map((u: any) =>
      u.id === user.id
        ? u
        : {
            id: u.id,
            name: u.name,
            role: u.role,
            isApproved: Boolean(u.isApproved)
          }
    );

  const scopedPayments = (Array.isArray(data.membershipPayments) ? data.membershipPayments : []).filter((p: any) =>
    ownMemberIds.has(String(p?.memberId || '')) ||
    (userMemberIdNo && norm(p?.memberIdNumber) === userMemberIdNo) ||
    (userName && norm(p?.memberName) === userName)
  );

  // Plain Member accounts only receive financial transactions that have passed both
  // Auditor verification ('Audited') and President approval ('Approved'), with internal
  // audit/return remarks omitted.
  const rawTransactions = Array.isArray(data.transactions)
    ? data.transactions
    : Array.isArray(data.financialTransactions)
      ? data.financialTransactions
      : [];
  const scopedApprovedTransactions = rawTransactions
    .filter((tx: any) => tx && tx.auditedStatus === 'Audited' && tx.presidentApprovalStatus === 'Approved')
    .map((tx: any) => ({
      id: tx.id,
      type: tx.type,
      category: tx.category,
      amount: tx.amount,
      date: tx.date,
      description: tx.description,
      purpose: tx.purpose,
      fundSource: tx.fundSource,
      activityId: tx.activityId,
      meetingId: tx.meetingId,
      recordedBy: tx.recordedBy,
      auditedStatus: tx.auditedStatus,
      auditedBy: tx.auditedBy,
      auditedDate: tx.auditedDate,
      presidentApprovalStatus: tx.presidentApprovalStatus,
      presidentApprovedBy: tx.presidentApprovedBy,
      presidentApprovedDate: tx.presidentApprovedDate
    }));

  return {
    ...data,
    users: scopedUsers,
    members: scopedMembers,
    membershipPayments: scopedPayments,
    transactions: scopedApprovedTransactions,
    financialTransactions: scopedApprovedTransactions,
    delegationRequests: [],
    systemLogs: [],
    logs: []
  };
}

export default async function handler(req: any, res: any) {
  if (req.method && req.method !== 'GET') {
    return sendResponse(res, 405, { success: false, message: 'Method not allowed.' });
  }

  if (!isDatabaseConfigured()) {
    return sendResponse(res, 200, {
      success: false,
      offlineMode: true,
      storageMode: 'local',
      provider: 'Local',
      message: 'DATABASE_URL is not configured. Running in local storage mode; data stays on this device.',
    });
  }

  let user;
  try {
    user = await getAuthenticatedUser(req);
  } catch (error: any) {
    console.warn('[Cloud DB Pull Auth Warning]:', error?.message || error);
    return sendResponse(res, 503, {
      success: false,
      offlineMode: true,
      message: 'Authentication service is temporarily unavailable.',
    });
  }
  if (!user) {
    return sendResponse(res, 200, {
      success: false,
      offlineMode: true,
      message: 'Sign in to synchronize database.',
    });
  }

  try {
    const rawData = await fetchAllDataFromPostgres(getPool());
    const data = isMemberRole(user.role) ? scopeDataForMember(rawData, user) : rawData;
    return sendResponse(res, 200, { success: true, data });
  } catch (error: any) {
    console.warn('[Cloud DB Pull Warning]:', error?.message || error);
    return sendResponse(res, 200, {
      success: false,
      offlineMode: true,
      message: 'Offline fallback: Database temporarily unavailable.',
    });
  }
}
