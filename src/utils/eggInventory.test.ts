import { describe, expect, it } from 'vitest';
import { EggHarvestLog, IgpSale } from '../types';
import { formatEggSizeBreakdown, getAvailableEggCount, getAvailableEggsBySize, getTotalAvailableEggCount } from './eggInventory';

const harvest = (id: string, eggCount: number, status: EggHarvestLog['status'] = 'Signed'): EggHarvestLog => ({
  id,
  produce: 'Poultry Raising (RTL)',
  date: '2026-11-03',
  time: '08:00',
  collectedBy: 'AFA Member',
  eggCount,
  status
});

const sale = (id: string, quantity: number, stage: IgpSale['stage'] = 'Eggs'): IgpSale => ({
  id,
  produce: 'Poultry Raising (RTL)',
  date: '2026-11-03',
  stage,
  quantity,
  revenue: quantity * 5,
  recordedBy: 'Treasurer'
});

describe('getAvailableEggCount', () => {
  it('deducts egg sales from verified harvest inventory', () => {
    expect(getAvailableEggCount([harvest('h1', 300)], [sale('s1', 100)], 'Poultry Raising (RTL)')).toBe(200);
  });

  it('does not count pending, returned, or un-signed harvests as available stock', () => {
    expect(getAvailableEggCount([
      harvest('h1', 100, 'Pending Audit'),
      harvest('h2', 75, 'Returned'),
      harvest('h3', 40, 'Audited'),
      harvest('h4', 60, 'Signed')
    ], [], 'Poultry Raising (RTL)')).toBe(60);
  });

  it('does not deduct poultry birds sold from egg inventory', () => {
    expect(getAvailableEggCount([harvest('h1', 300)], [sale('s1', 12, 'RTL')], 'Poultry Raising (RTL)')).toBe(300);
  });

  it('does not deduct other poultry income from egg inventory', () => {
    expect(getAvailableEggCount([harvest('h1', 300)], [sale('s1', 12, 'Other')], 'Poultry Raising (RTL)')).toBe(300);
  });

  it('treats legacy general poultry sales as egg sales', () => {
    expect(getAvailableEggCount([harvest('h1', 300)], [sale('s1', 100, 'General')], 'Poultry Raising (RTL)')).toBe(200);
  });

  it('excludes the edited sale when recalculating available eggs', () => {
    expect(getAvailableEggCount([harvest('h1', 300)], [sale('s1', 100)], 'Poultry Raising (RTL)', 's1')).toBe(300);
  });

  it('links harvests with blank or legacy produce names to custom RTL/poultry projects', () => {
    const blankProduceHarvest: EggHarvestLog = { ...harvest('h-blank', 120, 'Signed'), produce: undefined };
    const customProduceHarvest: EggHarvestLog = { ...harvest('h-custom', 80, 'Signed'), produce: 'RTL Chickens (Poultry / Eggs)' };
    expect(getAvailableEggCount([blankProduceHarvest, customProduceHarvest], [], 'RTL Chickens (Poultry / Eggs)')).toBe(200);
    expect(getTotalAvailableEggCount([blankProduceHarvest, customProduceHarvest], [])).toBe(200);
  });

  it('tracks and deducts segregated egg sizes (Small, Medium, Large, Extra Large (XL), Jumbo)', () => {
    const segregatedHarvest: EggHarvestLog = {
      ...harvest('h-seg', 95, 'Signed'),
      sizeBreakdown: {
        'Small': 15,
        'Medium': 30,
        'Large': 30,
        'Extra Large (XL)': 15,
        'Jumbo': 5,
      }
    };
    const largeSale: IgpSale = {
      ...sale('s-large', 12, 'Eggs'),
      eggSize: 'Large'
    };

    const stock = getAvailableEggsBySize([segregatedHarvest], [largeSale], 'Poultry Raising (RTL)');
    expect(stock.bySize['Large']).toBe(18);
    expect(stock.bySize['Medium']).toBe(30);
    expect(stock.total).toBe(83);
    expect(formatEggSizeBreakdown(segregatedHarvest.sizeBreakdown)).toBe(
      'S: 15 • M: 30 • L: 30 • XL: 15 • Jumbo: 5'
    );
  });
});
