import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import App from './App';
import ConfirmationModal from './components/ConfirmationModal';
import { useDatabaseStatus } from './hooks/useDatabaseStatus';

describe('App Component', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      location: { pathname: '/' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      scrollTo: vi.fn(),
      innerWidth: 1024,
      navigator: { onLine: true }
    });

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url === '/api/db/status') {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({
            connected: true,
            configured: true,
            provider: 'Supabase',
            totalRecords: 10
          }))
        });
      }
      if (url === '/api/auth/session') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ authenticated: false })
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('{}'),
        json: () => Promise.resolve({})
      });
    }));
  });

  it('is defined and can be imported', () => {
    expect(App).toBeDefined();
    expect(typeof App).toBe('function');
  });

  it('renders initial markup without crashing', () => {
    const html = renderToString(<App />);
    expect(html).toBeDefined();
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
  });

  it('renders the privacy page when location matches /privacy', () => {
    vi.stubGlobal('window', {
      location: { pathname: '/privacy' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      scrollTo: vi.fn(),
      innerWidth: 1024,
      navigator: { onLine: true }
    });

    const html = renderToString(<App />);
    expect(html).toBeDefined();
    expect(typeof html).toBe('string');
  });

  it('renders ConfirmationModal correctly when open', () => {
    const html = renderToString(
      <ConfirmationModal
        isOpen={true}
        title="Test Modal"
        description="This is a test description"
        confirmLabel="Confirm Action"
        cancelLabel="Cancel Action"
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(html).toContain('Test Modal');
    expect(html).toContain('This is a test description');
    expect(html).toContain('Confirm Action');
    expect(html).toContain('Cancel Action');
  });

  it('does not render ConfirmationModal when closed', () => {
    const html = renderToString(
      <ConfirmationModal
        isOpen={false}
        title="Hidden Modal"
        description="Hidden description"
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(html).toBe('');
  });

  it('provides useDatabaseStatus hook with expected structure and functions', () => {
    function HookConsumer() {
      const { dbStatus, checkDatabaseConnection } = useDatabaseStatus({
        provider: 'Local Storage',
        connected: false
      });
      return <div>Status: {dbStatus.provider} - {typeof checkDatabaseConnection}</div>;
    }

    const html = renderToString(<HookConsumer />);
    expect(html).toContain('Local Storage');
    expect(html).toContain('function');
  });
});
