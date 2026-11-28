import { getPool, isDatabaseConfigured, ensureDatabaseSchema } from './db';
import { sendResponse } from './helper';
import {
  getAvailableEggsBySize,
  getTotalAvailableEggCount,
  isEggCatalogProduct,
  normalizeEggSize,
  sanitizeEggSizeBreakdown
} from '../utils/eggInventory';
import type { EggHarvestLog, IgpSale, PublicProduct } from '../types';

const UPCOMING_HARVEST_TAG = 'Upcoming Harvest';

export default async function handler(req: any, res: any) {
  if (req.method && req.method !== 'GET') {
    return sendResponse(res, 405, { success: false, message: 'Method not allowed.' });
  }
  const resource = req.query?.resource || new URL(req.url || '/', 'http://localhost').searchParams.get('resource');
  if (!isDatabaseConfigured()) {
    return sendResponse(res, 200, {
      success: false,
      offlineMode: true,
      storageMode: 'local',
      provider: 'Local',
      message: 'Database is not configured. Using locally saved achievements.'
    });
  }

  try {
    const pool = getPool();
    await ensureDatabaseSchema(pool);
    if (resource === 'products') {
      const [result, harvestsRes, salesRes] = await Promise.all([
        pool.query(
          `SELECT id, name, ceb_name, category, description, unit, price, quantity_available,
            stock_status, farmer_name, farmer_sitio, farmer_phone, contact_person, image_url,
            is_published
           FROM products
           ORDER BY name ASC`
        ),
        pool.query(
          `SELECT id, produce, date, time, collected_by, egg_count, size_breakdown, status
           FROM afa_igp_harvests
           WHERE status = 'Signed'`
        ).catch(() => ({ rows: [] as any[] })),
        pool.query(
          `SELECT id, produce, date, stage, egg_size, quantity, revenue, recorded_by
           FROM afa_igp_sales`
        ).catch(() => ({ rows: [] as any[] }))
      ]);

      const allProducts: PublicProduct[] = result.rows.map(row => ({
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
        isPublished: Boolean(row.is_published)
      }));

      const harvests: EggHarvestLog[] = harvestsRes.rows.map(row => ({
        id: row.id,
        produce: row.produce || undefined,
        date: row.date || '',
        time: row.time || '',
        collectedBy: row.collected_by || '',
        eggCount: Number(row.egg_count || 0),
        sizeBreakdown: sanitizeEggSizeBreakdown(row.size_breakdown),
        status: 'Signed'
      }));

      const sales: IgpSale[] = salesRes.rows.map(row => ({
        id: row.id,
        produce: row.produce || undefined,
        date: row.date || '',
        stage: row.stage || undefined,
        eggSize: normalizeEggSize(row.egg_size),
        quantity: Number(row.quantity || 0),
        revenue: Number(row.revenue || 0),
        recordedBy: row.recorded_by || ''
      }));

      const eggProduct = allProducts.find(isEggCatalogProduct);
      const publishedProducts = allProducts.filter(
        product => product.isPublished && (!eggProduct || product.id !== eggProduct.id) && !isEggCatalogProduct(product)
      );

      let products: PublicProduct[] = publishedProducts;
      if (eggProduct) {
        const availableEggs = getTotalAvailableEggCount(harvests, sales);
        if (availableEggs > 0 && Number.isFinite(eggProduct.price) && eggProduct.price > 0) {
          const eggStockBySize = getAvailableEggsBySize(harvests, sales);
          const eggSizeBreakdown = sanitizeEggSizeBreakdown(eggStockBySize.bySize);
          products = [
            ...publishedProducts,
            {
              ...eggProduct,
              isPublished: true,
              stockStatus: 'In Stock',
              quantityAvailable: `${availableEggs.toLocaleString()} eggs available`,
              ...(eggSizeBreakdown ? { eggSizeBreakdown } : {})
            }
          ];
        } else if (eggProduct.isPublished) {
          products = [
            ...publishedProducts,
            {
              ...eggProduct,
              isPublished: true,
              stockStatus: 'Pre-Order',
              quantityAvailable: UPCOMING_HARVEST_TAG
            }
          ];
        }
      }

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
