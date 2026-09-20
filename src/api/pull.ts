import { getPool, isDatabaseConfigured, fetchAllDataFromPostgres } from './db';
import { sendResponse } from './helper';

export default async function handler(req: any, res: any) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      if (typeof res.status === 'function') return res.status(200).end();
      res.statusCode = 200;
      return res.end();
    }

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
