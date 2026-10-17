import { getPool, isDatabaseConfigured, fetchAllDataFromPostgres } from './db';
import { sendResponse } from './helper';

export default async function handler(req: any, res: any) {
  try {
  /*  return sendResponse(res, 503, {
      success: false,
      offlineMode: true,
      message: 'Cloud data access is temporarily disabled until server-side authentication and authorization are configured.',
    }); */

    if (!isDatabaseConfigured()) {
      return sendResponse(res, 200, {
        success: false,
        offlineMode: true,
        message: 'DATABASE_URL is not configured. Running in offline/local storage mode.',
      });
    }

    const pool = getPool();
    const pullPromise = fetchAllDataFromPostgres(pool);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Cloud DB query timed out after 30 seconds.')), 30000)
    );

    const data = await Promise.race([pullPromise, timeoutPromise]);
    return sendResponse(res, 200, {
      success: true,
      data,
    });
  } catch (error: any) {
    console.warn('[Cloud DB Pull Warning]:', error?.message || error);
    return sendResponse(res, 200, {
      success: false,
      offlineMode: true,
      message: `Offline fallback: ${error?.message || 'Database unavailable'}`,
    });
  }
}
