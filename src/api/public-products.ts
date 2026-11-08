import { getPool, isDatabaseConfigured, ensureDatabaseSchema } from './db';
import { sendResponse } from './helper';

export default async function handler(req: any, res: any) {
  if (req.method && req.method !== 'GET') {
    return sendResponse(res, 405, { success: false, message: 'Method not allowed.' });
  }

  if (!isDatabaseConfigured()) {
    return sendResponse(res, 503, {
      success: false,
      message: 'The public product catalog is temporarily unavailable.'
    });
  }

  try {
    const pool = getPool();
    await ensureDatabaseSchema(pool);
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
  } catch (error: any) {
    console.error('[Public Products] Unable to load published products:', error?.message || error);
    return sendResponse(res, 503, {
      success: false,
      message: 'The public product catalog is temporarily unavailable.'
    });
  }
}
