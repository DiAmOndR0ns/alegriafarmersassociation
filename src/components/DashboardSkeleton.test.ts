import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DashboardSkeleton from './DashboardSkeleton';

describe('DashboardSkeleton', () => {
  it('renders the animated loading shell by default', () => {
    const markup = renderToStaticMarkup(createElement(DashboardSkeleton));

    expect(markup).toContain('animate-pulse');
    expect(markup).toContain('max-w-7xl');
    expect(markup).toContain('bg-bafa-neutral-50');
  });

  it('renders without throwing for every variant', () => {
    for (const variant of ['app', 'guest', 'member', 'officer'] as const) {
      const markup = renderToStaticMarkup(createElement(DashboardSkeleton, { variant }));
      expect(markup).toContain('animate-pulse');
    }
  });
});
