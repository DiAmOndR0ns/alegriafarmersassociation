import { getPool, isDatabaseConfigured, fetchAllDataFromPostgres } from './db';
import { getAuthenticatedUser } from './auth';
import { sendResponse } from './helper';

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
    const data = await fetchAllDataFromPostgres(getPool());
    return sendResponse(res, 200, { success: true, data });
  } catch (error: any) {
    console.warn('[Cloud DB Pull Warning]:', error?.message || error);
    return sendResponse(res, 200, {
      success: false,
      offlineMode: true,
      message: `Offline fallback: ${error?.message || 'Database unavailable'}`,
    });
  }
}
