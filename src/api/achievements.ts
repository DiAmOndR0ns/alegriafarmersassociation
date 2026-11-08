import { getPool, isDatabaseConfigured, ensureDatabaseSchema } from './db';
import { sendResponse } from './helper';

export default async function handler(req: any, res: any) {
  if (req.method && req.method !== 'GET') {
    return sendResponse(res, 405, { success: false, message: 'Method not allowed.' });
  }
  const resource = req.query?.resource || new URL(req.url || '/', 'http://localhost').searchParams.get('resource');
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
    if (resource === 'products') {
      const result = await pool.query(
        `SELECT id, name, ceb_name, category, description, unit, price, quantity_available,
          stock_status, farmer_name, farmer_sitio, farmer_phone, contact_person, image_url,
          is_published
         FROM products
         WHERE is_published = TRUE
         ORDER BY name ASC`
      );
      const products = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        cebName: row.ceb_name,
        category: row.category,
        description: row.description,
        unit: row.unit,
        price: Number(row.price || 0),
        quantityAvailable: row.quantity_available,
        stockStatus: row.stock_status,
        farmerName: row.farmer_name,
        farmerSitio: row.farmer_sitio,
        farmerPhone: row.farmer_phone,
        contactPerson: row.contact_person,
        imageUrl: row.image_url,
        isPublished: row.is_published
      }));
      return sendResponse(res, 200, { success: true, products });
    }

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
    const resourceLabel = resource === 'products' ? 'products' : 'achievements';
    console.error(`[Public ${resourceLabel}] Unable to load public data:`, error?.message || error);
    return sendResponse(res, 503, {
      success: false,
      message: resource === 'products'
        ? 'The public product catalog is temporarily unavailable.'
        : 'Association achievements are temporarily unavailable.'
    });
  }
}
