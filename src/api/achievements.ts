import { getPool, isDatabaseConfigured, ensureDatabaseSchema } from './db';
import { sendResponse } from './helper';

export default async function handler(req: any, res: any) {
  if (req.method && req.method !== 'GET') {
    return sendResponse(res, 405, { success: false, message: 'Method not allowed.' });
  }
  if (!isDatabaseConfigured()) {
    return sendResponse(res, 200, {
      success: false,
      offlineMode: true,
      message: 'Database is not configured. Using locally saved achievements.'
    });
  }

  try {
    const pool = getPool();
    await ensureDatabaseSchema(pool);
    const result = await pool.query(
      'SELECT id, year, title, ceb_title, description, icon FROM achievements ORDER BY year DESC, title ASC'
    );
    const achievements = result.rows.map(row => ({
      id: row.id,
      year: row.year,
      title: row.title,
      cebTitle: row.ceb_title,
      description: row.description,
      icon: row.icon
    }));
    return sendResponse(res, 200, { success: true, achievements });
  } catch (error: any) {
    console.error('[Public Achievements] Unable to load achievements:', error?.message || error);
    return sendResponse(res, 503, {
      success: false,
      message: 'Association achievements are temporarily unavailable.'
    });
  }
}
