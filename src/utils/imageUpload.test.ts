import { describe, expect, it } from 'vitest';
import { hasAttachedImage } from './imageUpload';
import { safeImageUrl } from '../api/sanitize';

describe('image attachment validation', () => {
  it('accepts valid base64 data URLs, https URLs, and safe /assets paths', () => {
    expect(hasAttachedImage('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(true);
    expect(hasAttachedImage('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(hasAttachedImage('https://example.com/product.jpg')).toBe(true);
    expect(hasAttachedImage('/assets/product-pastil.jpg')).toBe(true);
    expect(safeImageUrl('/assets/product-pastil.jpg')).toBe('/assets/product-pastil.jpg');
  });

  it('rejects missing, unsafe, or non-image URLs', () => {
    expect(hasAttachedImage('')).toBe(false);
    expect(hasAttachedImage('   ')).toBe(false);
    expect(hasAttachedImage(undefined)).toBe(false);
    expect(hasAttachedImage('javascript:alert(1)')).toBe(false);
    expect(hasAttachedImage('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(hasAttachedImage('/assets/../etc/passwd.png')).toBe(false);
    expect(safeImageUrl('/assets/../etc/passwd.png')).toBeNull();
  });
});
