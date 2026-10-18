import { getPool, isDatabaseConfigured, saveFullStateToPostgres } from './db';
import { sendResponse, parseRequestBody } from './helper';

export default async function handler(req: any, res: any) {
  try {
  /*  return sendResponse(res, 503, {
      success: false,
      offlineMode: true,
      message: 'Cloud sync is temporarily disabled until server-side authentication and authorization are configured.',
    }); */

    if (!isDatabaseConfigured()) {
      return sendResponse(res, 200, {
        success: true,
        offlineMode: true,
        message: 'Saved to local offline storage (DATABASE_URL not configured).',
      });
    }

    const pool = getPool();
    const body = await parseRequestBody(req);

    // Save full state directly to PostgreSQL
    const savePromise = saveFullStateToPostgres(pool, body);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Cloud DB push timed out after 30 seconds.')), 30000)
    );

    const result = await Promise.race([savePromise, timeoutPromise]);
    console.log('[PUSH DEBUG] Save result:', result);
    
    return sendResponse(res, 200, {
      success: true,
      offlineMode: false,
      message: 'State successfully synced to PostgreSQL Cloud DB!',
    });
  } catch (error: any) {
    console.error('[PUSH DEBUG] Full error:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      hint: error?.hint,
      where: error?.where,
      stack: error?.stack?.substring(0, 2000)
    });
    
    return sendResponse(res, 200, {
      success: false,
      offlineMode: true,
      message: `Failed to sync: ${error?.message || 'Database unavailable'}`,
      error: error?.message,
      detail: error?.detail,
      hint: error?.hint,
      where: error?.where
    });
  }
}
