import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PrivacyPolicy from './PrivacyPolicy';

describe('PrivacyPolicy', () => {
  it('renders the policy headings and a link back to the portal', () => {
    const markup = renderToStaticMarkup(createElement(PrivacyPolicy));

    expect(markup).toContain('Privacy Policy');
    expect(markup).toContain('Alegria Farmers Association');
    expect(markup).toContain('Information we store');
    expect(markup).toContain('How information is used');
    expect(markup).toContain('Local and cloud storage');
    expect(markup).toContain('Access and security');
    expect(markup).toContain('Questions and requests');
    expect(markup).toContain('href="/"');
    expect(markup).toContain('Back to portal');
  });
});
