import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import GuestPortal, {
  formatProductQuantity,
  getPublishedProducts,
  resolveProductArtwork,
  UPCOMING_HARVEST_TAG
} from './GuestPortal';
import AuthScreen from './AuthScreen';
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
    stage: 'Eggs',
    quantity: eggsSold,
    revenue: eggsSold * 5,
    recordedBy: 'Treasurer'
  }] : [],
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

  it('keeps published egg listings visible as Upcoming Harvest when no verified eggs remain', () => {
    const publishedEggs = { ...makeProduct('eggs', 'Chicken Eggs', true), price: 8, unit: 'per egg' };
    const draftEggs = { ...makeProduct('eggs-draft', 'Chicken Eggs', false), price: 8, unit: 'per egg' };

    expect(getPublishedProducts([publishedEggs], makeEggState(100, 'Pending Audit'))).toEqual([
      expect.objectContaining({
        name: 'Chicken Eggs',
        isPublished: true,
        stockStatus: 'Pre-Order',
        quantityAvailable: UPCOMING_HARVEST_TAG
      })
    ]);

    expect(getPublishedProducts([publishedEggs], makeEggState(100, 'Signed', 100))).toEqual([
      expect.objectContaining({
        name: 'Chicken Eggs',
        isPublished: true,
        stockStatus: 'Pre-Order',
        quantityAvailable: UPCOMING_HARVEST_TAG
      })
    ]);

    // Draft (unpublished) eggs with 0 available stock stay hidden.
    expect(getPublishedProducts([draftEggs], makeEggState(100, 'Pending Audit'))).toEqual([]);
  });

  it('requires an egg product configuration before adding egg stock to the catalog', () => {
    expect(getPublishedProducts([], makeEggState(100))).toEqual([]);
  });

  it('formats bare numeric quantities with units and localizes Upcoming Harvest', () => {
    const pastil: PublicProduct = {
      ...makeProduct('pastil-1', 'PASTIL', true),
      quantityAvailable: '1000',
      unit: 'per kilo'
    };
    const upcomingEggs: PublicProduct = {
      ...makeProduct('eggs-1', 'Chicken Eggs', true),
      quantityAvailable: UPCOMING_HARVEST_TAG
    };

    expect(formatProductQuantity(pastil, false)).toBe('1,000 kl');
    expect(formatProductQuantity(pastil, true)).toBe('1,000 kl');
    expect(formatProductQuantity(upcomingEggs, false)).toBe('Umaabot nga Harvest');
    expect(formatProductQuantity(upcomingEggs, true)).toBe('Upcoming Harvest');
  });

  it('maps catalog items to bespoke static artwork assets', () => {
    expect(resolveProductArtwork(makeProduct('1', 'PASTIL', true))).toBe('/assets/product-pastil.jpg');
    expect(resolveProductArtwork({ ...makeProduct('2', 'Monobloc Chairs', true), category: 'Rental Assets' }))
      .toBe('/assets/product-chairs.jpg');
    expect(resolveProductArtwork(makeProduct('3', 'Chicken Eggs', true))).toBe('/assets/product-eggs.jpg');
  });

  it('renders mobile-first dimensional portal shell with 6-tab bottom dock, sunrise hero, and 4-sitio map', () => {
    const html = renderToString(
      <GuestPortal
        onEnterLogin={() => {}}
        members={[]}
        hogRaising={{ expenses: [], sales: [] }}
        cachedSummary={{
          success: true,
          totalMembers: 42,
          activeMembers: 39,
          officers: [{ role: 'President', name: 'Zenaida A. Elbiña' }],
          boardMembers: ['Juan Dela Cruz'],
          announcements: [],
          activities: []
        }}
      />
    );

    expect(html).toContain('mobile-bottom-dock');
    expect(html).toContain('tab-nav-wrapper');
    expect(html).toContain('heritage-pill');
    expect(html).toContain('/assets/hero-alegria.jpg');
    expect(html).toContain('hero-banig-border');
    expect(html).toContain('Sitio Tapon');
    expect(html).toContain('Sitio Lamak');
    expect(html).toContain('42');
    expect(html).toContain('FAMS');
  });

  it('renders AuthScreen with accessible login labels, FAMS branding, and compact mobile header', () => {
    const html = renderToString(
      <AuthScreen
        users={[]}
        hasPresident={true}
        presidentName="Zenaida A. Elbiña"
        onLogin={() => {}}
        toast={() => {}}
        onBackToGuest={() => {}}
      />
    );

    expect(html).toContain('for="login-username"');
    expect(html).toContain('id="login-username"');
    expect(html).toContain('for="login-password"');
    expect(html).toContain('id="login-password"');
    expect(html).toContain('login-aside-header');
    expect(html).toContain('FAMS — Farmers Association Management System');
  });
});
