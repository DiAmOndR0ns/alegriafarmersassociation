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
      message: 'DATABASE_URL is not configured. Running in offline/local storage mode.',
    });
  }

  const user = await getAuthenticatedUser(req);
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
