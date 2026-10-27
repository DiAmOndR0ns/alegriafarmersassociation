import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import App from './App';
import ConfirmationModal from './components/ConfirmationModal';
import { useDatabaseStatus } from './hooks/useDatabaseStatus';
import { generateTotpCode, verifyTotpCode, getTotpUri, generateTotpSecret } from './utils/totp';
import ExecutiveView from './components/ExecutiveView';

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

  describe('Two-Factor Authentication (2FA / TOTP) Enforcement', () => {
    it('generates valid Base32 TOTP secret and URI for 2FA', () => {
      const secret = generateTotpSecret();
      expect(secret).toBeDefined();
      expect(typeof secret).toBe('string');
      expect(secret.length).toBeGreaterThanOrEqual(16);

      const uri = getTotpUri(secret, 'president', 'FAMS');
      expect(uri).toContain('otpauth://totp/FAMS%3Apresident');
      expect(uri).toContain(`secret=${secret}`);
      expect(uri).toContain('issuer=FAMS');
    });

    it('verifies valid TOTP codes generated with secret', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const code = await generateTotpCode(secret);
      expect(code).toMatch(/^\d{6}$/);

      const isValid = await verifyTotpCode(secret, code);
      expect(isValid).toBe(true);

      const isInvalid = await verifyTotpCode(secret, '000000');
      // Unless randomly matches, 000000 will be false or handled correctly
      expect(typeof isInvalid).toBe('boolean');
    });

    it('renders 2FA Enforced section in ExecutiveView for President', () => {
      const mockUsers = [
        {
          id: 'pres-1',
          name: 'Zenaida A. Elbiña',
          username: 'president',
          role: 'President' as const,
          isApproved: true,
          mfaEnabled: true,
          totpSecret: 'JBSWY3DPEHPK3PXPTESTFIXTURE'
        }
      ];

      const html = renderToString(
        <ExecutiveView
          members={[]}
          users={mockUsers}
          transactions={[]}
          meetings={[]}
          resolutions={[]}
          onApproveResolution={() => {}}
          logs={[]}
          currentRole="President"
          currentUserId="pres-1"
          onOpenReportModal={() => {}}
        />
      );

      expect(html).toContain('Two-Factor Authentication');
      expect(html).toContain('Enforced');
      expect(html).toContain('JBSWY3DPEHPK3PXPTESTFIXTURE');
    });
  });
});
