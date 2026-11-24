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

  return {
    ...data,
    users: scopedUsers,
    members: scopedMembers,
    membershipPayments: scopedPayments,
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
