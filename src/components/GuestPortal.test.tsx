import { describe, expect, it } from 'vitest';
import { getPublishedProducts } from './GuestPortal';
import { EggHarvestLog, HogRaisingState, PublicProduct } from '../types';

const makeProduct = (id: string, name: string, isPublished: boolean): PublicProduct => ({
  id,
  name,
  category: 'Produce',
  price: 100,
  unit: 'per kilo',
  description: `${name} description`,
  stockStatus: 'In Stock',
  isPublished
});

const makeEggState = (eggCount: number, status: EggHarvestLog['status'] = 'Signed', eggsSold = 0): HogRaisingState => ({
  expenses: [],
  sales: eggsSold > 0 ? [{
    id: 'egg-sale',
    produce: 'Poultry Raising (RTL)',
    date: '2026-11-03',
    hogStage: 'Eggs',
    hogsCount: 0,
    produceCount: eggsSold,
    revenue: eggsSold * 5,
    recordedBy: 'Treasurer'
  }] : [],
  groups: [],
  eggHarvests: [{
    id: 'egg-harvest',
    produce: 'Poultry Raising (RTL)',
    date: '2026-11-03',
    time: '08:00',
    collectedBy: 'AFA Member',
    eggCount,
    status
  }]
});

describe('GuestPortal product catalog', () => {
  it('keeps unpublished products out of the public catalog', () => {
    const publishedProducts = getPublishedProducts([
      makeProduct('published-1', 'Published Corn', true),
      makeProduct('draft-1', 'Unpublished Draft', false)
    ]);

    expect(publishedProducts.map(product => product.name)).toEqual(['Published Corn']);
  });

  it('automatically publishes the egg listing with verified stock minus recorded sales', () => {
    const eggProduct = { ...makeProduct('eggs', 'Chicken Eggs', false), price: 8, unit: 'per egg' };

    const publishedProducts = getPublishedProducts([eggProduct], makeEggState(100, 'Signed', 25));

    expect(publishedProducts).toHaveLength(1);
    expect(publishedProducts[0]).toMatchObject({
      name: 'Chicken Eggs',
      isPublished: true,
      stockStatus: 'In Stock',
      quantityAvailable: '75 eggs available',
      price: 8,
      unit: 'per egg'
    });
  });

  it('does not list eggs when harvests are unverified or no eggs remain', () => {
    const eggProduct = { ...makeProduct('eggs', 'Chicken Eggs', true), price: 8 };

    expect(getPublishedProducts([eggProduct], makeEggState(100, 'Pending Audit'))).toEqual([]);
    expect(getPublishedProducts([eggProduct], makeEggState(100, 'Signed', 100))).toEqual([]);
  });

  it('requires an egg product configuration before adding egg stock to the catalog', () => {
    expect(getPublishedProducts([], makeEggState(100))).toEqual([]);
  });
});
