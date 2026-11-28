import { getPool, isDatabaseConfigured, ensureDatabaseSchema } from './db';
import { sendResponse } from './helper';
import {
  getAvailableEggsBySize,
  getTotalAvailableEggCount,
  hasConfiguredEggPrice,
  isEggCatalogProduct,
  normalizeEggSize,
  sanitizeEggSizeBreakdown,
  sanitizeEggSizePrices
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
      const [result, harvestsRes, salesRes, igpLegacyRes] = await Promise.all([
        pool.query(
          `SELECT id, name, ceb_name, category, description, unit, price, egg_size_prices, quantity_available,
            stock_status, farmer_name, farmer_sitio, farmer_phone, contact_person, image_url,
            is_published
           FROM products
           ORDER BY name ASC`
        ),
        pool.query(
          `SELECT id, produce, date, time, collected_by, egg_count, size_breakdown, status
           FROM afa_igp_harvests`
        ).catch(() => ({ rows: [] as any[] })),
        pool.query(
          `SELECT id, produce, date, stage, egg_size, quantity, revenue, recorded_by
           FROM afa_igp_sales`
        ).catch(() => ({ rows: [] as any[] })),
        pool.query(
          `SELECT sales, chore_logs
           FROM afa_igp
           WHERE id IN ('main_state', 'afa_igp_main', 'hog_raising_main')
           ORDER BY (id = 'main_state') DESC
           LIMIT 1`
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
        eggSizePrices: sanitizeEggSizePrices(row.egg_size_prices),
        quantityAvailable: row.quantity_available,
        stockStatus: row.stock_status,
        farmerName: row.farmer_name,
        farmerSitio: row.farmer_sitio,
        farmerPhone: row.farmer_phone,
        contactPerson: row.contact_person,
        imageUrl: row.image_url,
        isPublished: Boolean(row.is_published)
      }));

      const harvestMap = new Map<string, EggHarvestLog>();
      const legacyRow = igpLegacyRes.rows[0];
      if (legacyRow && Array.isArray(legacyRow.chore_logs)) {
        for (const h of legacyRow.chore_logs) {
          if (h && typeof h.id === 'string' && h.id) {
            harvestMap.set(h.id, {
              id: h.id,
              produce: h.produce || undefined,
              date: h.date || '',
              time: h.time || '',
              collectedBy: h.collectedBy || h.collected_by || '',
              eggCount: Number(h.eggCount ?? h.egg_count ?? 0),
              sizeBreakdown: sanitizeEggSizeBreakdown(h.sizeBreakdown ?? h.size_breakdown),
              status: h.status || 'Pending Audit'
            });
          }
        }
      }
      for (const row of harvestsRes.rows) {
        if (!row?.id) continue;
        const existing = harvestMap.get(row.id);
        harvestMap.set(row.id, {
          ...existing,
          id: row.id,
          produce: row.produce || existing?.produce || undefined,
          date: row.date || existing?.date || '',
          time: row.time || existing?.time || '',
          collectedBy: row.collected_by || existing?.collectedBy || '',
          eggCount: Number(row.egg_count ?? existing?.eggCount ?? 0),
          sizeBreakdown: sanitizeEggSizeBreakdown(row.size_breakdown) || existing?.sizeBreakdown,
          status: row.status || existing?.status || 'Pending Audit'
        });
      }
      const harvests = Array.from(harvestMap.values());

      const salesMap = new Map<string, IgpSale>();
      if (legacyRow && Array.isArray(legacyRow.sales)) {
        for (const s of legacyRow.sales) {
          if (s && typeof s.id === 'string' && s.id) {
            salesMap.set(s.id, {
              id: s.id,
              produce: s.produce || undefined,
              date: s.date || '',
              stage: s.stage || s.hogStage || undefined,
              eggSize: normalizeEggSize(s.eggSize ?? s.egg_size),
              quantity: Number(s.quantity ?? s.produceCount ?? s.hogsCount ?? 0),
              revenue: Number(s.revenue || 0),
              recordedBy: s.recordedBy || s.recorded_by || ''
            });
          }
        }
      }
      for (const row of salesRes.rows) {
        if (!row?.id) continue;
        const existing = salesMap.get(row.id);
        salesMap.set(row.id, {
          ...existing,
          id: row.id,
          produce: row.produce || existing?.produce || undefined,
          date: row.date || existing?.date || '',
          stage: row.stage || existing?.stage || undefined,
          eggSize: normalizeEggSize(row.egg_size) || existing?.eggSize,
          quantity: Number(row.quantity ?? existing?.quantity ?? 0),
          revenue: Number(row.revenue ?? existing?.revenue ?? 0),
          recordedBy: row.recorded_by || existing?.recordedBy || ''
        });
      }
      const sales = Array.from(salesMap.values());

      const eggProduct = allProducts.find(isEggCatalogProduct);
      const publishedProducts = allProducts.filter(
        product => product.isPublished && (!eggProduct || product.id !== eggProduct.id) && !isEggCatalogProduct(product)
      );

      let products: PublicProduct[] = publishedProducts;
      if (eggProduct) {
        const availableEggs = getTotalAvailableEggCount(harvests, sales);
        if (availableEggs > 0 && hasConfiguredEggPrice(eggProduct)) {
          const eggStockBySize = getAvailableEggsBySize(harvests, sales);
          products = [
            ...publishedProducts,
            {
              ...eggProduct,
              isPublished: true,
              stockStatus: 'In Stock',
              quantityAvailable: `${availableEggs.toLocaleString()} eggs available`,
              eggSizeBreakdown: eggStockBySize.bySize,
              eggSizePrices: sanitizeEggSizePrices(eggProduct.eggSizePrices),
              unsegregatedEggCount: eggStockBySize.unsegregated
            }
          ];
        } else if (eggProduct.isPublished) {
          products = [
            ...publishedProducts,
            {
              ...eggProduct,
              isPublished: true,
              stockStatus: 'Pre-Order',
              quantityAvailable: UPCOMING_HARVEST_TAG,
              eggSizeBreakdown: {
                'Small': 0,
                'Medium': 0,
                'Large': 0,
                'Extra Large (XL)': 0,
                'Jumbo': 0
              },
              eggSizePrices: sanitizeEggSizePrices(eggProduct.eggSizePrices),
              unsegregatedEggCount: 0
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
