import { getPool, isDatabaseConfigured, deleteEntityFromPostgres } from './db';
import { sendResponse, parseRequestBody } from './helper';

export default async function handler(req: any, res: any) {
  try {
    if (typeof res.setHeader === 'function') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }

    if (req.method === 'OPTIONS') {
      if (typeof res.status === 'function') return res.status(200).end();
      res.statusCode = 200;
      return res.end();
    }

    if (!isDatabaseConfigured()) {
      return sendResponse(res, 200, {
        success: false,
        offlineMode: true,
        message: 'DATABASE_URL is not configured. Stored in local offline deletion queue.',
      });
    }

    const pool = getPool();
    const body = await parseRequestBody(req);

    // Handle batch deletedIds object e.g. { deletedIds: { members: ['id1'], products: ['id2'] } }
    if (body.deletedIds && typeof body.deletedIds === 'object') {
      let totalDeleted = 0;
      for (const [entityKey, ids] of Object.entries(body.deletedIds)) {
        if (Array.isArray(ids) && ids.length > 0) {
          try {
            const result = await deleteEntityFromPostgres(pool, entityKey, ids);
            totalDeleted += result.deletedCount;
          } catch (delErr: any) {
            console.warn(`[Delete Batch Warning for ${entityKey}]:`, delErr?.message);
          }
        }
      }
      return sendResponse(res, 200, {
        success: true,
        deletedCount: totalDeleted,
        message: `Successfully deleted ${totalDeleted} record(s) from database.`,
      });
    }

    // Support query params or body e.g. { entity: 'member', id: 'm-1' }
    let queryEntity: string | null = null;
    let queryId: string | null = null;
    try {
      const urlObj = new URL(req.url || '', 'http://localhost');
      queryEntity = urlObj.searchParams.get('entity');
      queryId = urlObj.searchParams.get('id');
    } catch {}

    const entity = body.entity || queryEntity;
    const ids = body.ids || (body.id ? [body.id] : (queryId ? [queryId] : []));

    if (!entity || !ids || ids.length === 0) {
      return sendResponse(res, 400, {
        success: false,
        message: "Missing 'entity' or 'id'/'ids' parameter in request.",
      });
    }

    const result = await deleteEntityFromPostgres(pool, entity, ids);
    return sendResponse(res, 200, {
      success: true,
      deletedCount: result.deletedCount,
      table: result.table,
      message: `Successfully deleted ${result.deletedCount} record(s) from database table "${result.table}".`,
    });
  } catch (error: any) {
    console.error('[Cloud DB Delete API Error]:', error?.message || error);
    return sendResponse(res, 500, {
      success: false,
      message: `Failed to delete from database: ${error?.message || 'Internal server error'}`,
    });
  }
}
