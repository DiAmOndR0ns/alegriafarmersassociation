import { describe, expect, it } from 'vitest';
import { getPublishedProducts } from './GuestPortal';
import { PublicProduct } from '../types';

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

describe('GuestPortal product catalog', () => {
  it('keeps unpublished products out of the public catalog', () => {
    const publishedProducts = getPublishedProducts([
      makeProduct('published-1', 'Published Corn', true),
      makeProduct('draft-1', 'Unpublished Draft', false)
    ]);

    expect(publishedProducts.map(product => product.name)).toEqual(['Published Corn']);
  });
});
