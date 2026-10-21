import { getPool, isDatabaseConfigured, fetchAllDataFromPostgres } from './db';
import { requireAuthenticated } from './auth';
import { sendResponse } from './helper';

export default async function handler(req: any, res: any) {
  if (req.method && req.method !== 'GET') return sendResponse(res, 405, { success: false, message: 'Method not allowed.' });
  const user = await requireAuthenticated(req, res);
  if (!user) return;
  if (!isDatabaseConfigured()) return sendResponse(res, 503, { success: false, message: 'Database is not configured.' });
  try {
    const data = await fetchAllDataFromPostgres(getPool());
    return sendResponse(res, 200, { success: true, data });
  } catch (error: any) {
    console.error('[Cloud DB Pull Error]:', error?.message || error);
    return sendResponse(res, 503, { success: false, message: 'Unable to load synchronized data.' });
  }
}
