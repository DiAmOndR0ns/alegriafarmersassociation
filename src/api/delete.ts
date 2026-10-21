import { getPool, isDatabaseConfigured, deleteEntityFromPostgres, lookupEntityTable } from './db';
import { isPresidentRole, rejectCrossOriginMutation, requireAuthenticated } from './auth';
import { parseRequestBody, sendResponse } from './helper';

async function assertSafeUserDeletion(pool: any, actorId: string, ids: string[]) {
  if (ids.includes(actorId)) throw new Error('The active account cannot be deleted.');
  const result = await pool.query('SELECT id, role FROM users WHERE id = ANY($1)', [ids]);
  if (result.rows.some((row: any) => isPresidentRole(row.role))) {
    throw new Error('President accounts cannot be deleted through this endpoint.');
  }
}

export default async function handler(req: any, res: any) {
  if (req.method && !['POST', 'DELETE'].includes(req.method)) return sendResponse(res, 405, { success: false, message: 'Method not allowed.' });
  if (rejectCrossOriginMutation(req)) return sendResponse(res, 403, { success: false, message: 'Cross-origin requests are not allowed.' });
  const user = await requireAuthenticated(req, res);
  if (!user) return;
  // Business-record deletion is also fail-closed until per-role authorization is implemented.
  if (!isPresidentRole(user.role)) return sendResponse(res, 403, { success: false, message: 'President access is required for deletion.' });
  if (!isDatabaseConfigured()) return sendResponse(res, 503, { success: false, message: 'Database is not configured.' });
  const pool = getPool();
  try {
    const body = await parseRequestBody(req);
    if (body?.deletedIds && typeof body.deletedIds === 'object') {
      let totalDeleted = 0;
      for (const [entity, value] of Object.entries(body.deletedIds)) {
        const ids = Array.isArray(value) ? value.filter((id) => typeof id === 'string' && id) as string[] : [];
        if (!ids.length) continue;
        if (lookupEntityTable(entity) === 'users') await assertSafeUserDeletion(pool, user.id, ids);
        totalDeleted += (await deleteEntityFromPostgres(pool, entity, ids)).deletedCount;
      }
      return sendResponse(res, 200, { success: true, deletedCount: totalDeleted });
    }
    const url = new URL(req.url || '', 'http://localhost');
    const entity = body?.entity || req.params?.entity || url.searchParams.get('entity');
    const rawIds = body?.ids || (body?.id ? [body.id] : req.params?.id ? [req.params.id] : url.searchParams.get('id') ? [url.searchParams.get('id')] : []);
    const ids = (Array.isArray(rawIds) ? rawIds : [rawIds]).filter((id) => typeof id === 'string' && id) as string[];
    if (typeof entity !== 'string' || !ids.length) {
      return sendResponse(res, 400, { success: false, message: "Missing 'entity' or 'id'/'ids' parameter." });
    }
    if (lookupEntityTable(entity) === 'users') await assertSafeUserDeletion(pool, user.id, ids);
    const result = await deleteEntityFromPostgres(pool, entity, ids);
    return sendResponse(res, 200, { success: true, deletedCount: result.deletedCount, table: result.table });
  } catch (error: any) {
    console.error('[Cloud DB Delete Error]:', error?.message || error);
    const status = ['The active account cannot be deleted.', 'President accounts cannot be deleted through this endpoint.'].includes(error?.message) ? 403 : 500;
    return sendResponse(res, status, { success: false, message: status === 403 ? error.message : 'Unable to delete records.' });
  }
}
