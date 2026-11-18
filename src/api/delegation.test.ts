import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({
  ensureDatabaseSchema: vi.fn().mockResolvedValue(undefined),
  getPool: vi.fn(),
  isDatabaseConfigured: vi.fn().mockReturnValue(true),
  saveFullStateToPostgres: vi.fn()
}));

vi.mock('./auth', () => ({
  isPresidentRole: (role: string) => role.trim().toLowerCase() === 'president',
  isSecretaryRole: (role: string) => role.trim().toLowerCase() === 'secretary',
  isTreasurerRole: (role: string) => ['treasurer', 'assistant_treasurer'].includes(role.trim().toLowerCase()),
  rejectCrossOriginMutation: vi.fn().mockReturnValue(false),
  requireAuthenticated: vi.fn()
}));

import handler from './push';
import { getPool, saveFullStateToPostgres } from './db';
import { requireAuthenticated } from './auth';

const user = (role: string) => ({
  id: `${role.toLowerCase()}-id`,
  username: role.toLowerCase(),
  name: role,
  role,
  isApproved: true,
  primaryCrops: []
});

const response = () => {
  const res: any = {
    statusCode: 0,
    body: undefined,
    headersSent: false,
    setHeader: vi.fn(),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      this.headersSent = true;
      return this;
    }
  };
  return res;
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('delegation API workflow', () => {
  it('lets the Vice President request only known scopes with a future expiry', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const expiry = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const query = vi.fn().mockResolvedValue({
      rowCount: 1,
      rows: [{
        id: 'request-1',
        requested_by: 'vice_president-id',
        reason: 'Cover the President during travel',
        scopes: ['record_approval'],
        requested_date: today,
        effective_start: today,
        effective_end: expiry,
        status: 'Pending'
      }]
    });
    vi.mocked(getPool).mockReturnValue({ query } as any);
    vi.mocked(requireAuthenticated).mockResolvedValue(user('Vice_President') as any);
    const res = response();

    await handler({
      method: 'POST',
      body: {
        delegationAction: {
          action: 'request',
          reason: 'Cover the President during travel',
          scopes: ['record_approval'],
          effectiveStart: today,
          effectiveEnd: expiry
        }
      }
    } as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.delegationRequest).toMatchObject({
      requestedBy: 'vice_president-id',
      scopes: ['record_approval'],
      status: 'Pending',
      effectiveEnd: expiry
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, 'Pending')"),
      [expect.any(String), 'vice_president-id', 'Cover the President during travel', '["record_approval"]', today, today, expiry]
    );
  });

  it('does not let the Vice President approve a delegation request', async () => {
    const query = vi.fn();
    vi.mocked(getPool).mockReturnValue({ query } as any);
    vi.mocked(requireAuthenticated).mockResolvedValue(user('Vice_President') as any);
    const res = response();

    await handler({
      method: 'POST',
      body: { delegationAction: { action: 'approve', requestId: 'request-1' } }
    } as any, res as any);

    expect(res.statusCode).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('allows only the President to review a pending request', async () => {
    const query = vi.fn().mockResolvedValue({
      rowCount: 1,
      rows: [{
        id: 'request-1',
        requested_by: 'vice_president-id',
        reason: 'Cover the President during travel',
        scopes: ['record_approval'],
        requested_date: '2026-11-18',
        effective_start: '2026-11-19',
        effective_end: '2026-11-20',
        status: 'Approved',
        reviewed_by: 'president-id',
        reviewed_date: '2026-11-18',
        remarks: 'Approved'
      }]
    });
    vi.mocked(getPool).mockReturnValue({ query } as any);
    vi.mocked(requireAuthenticated).mockResolvedValue(user('President') as any);
    const res = response();

    await handler({
      method: 'POST',
      body: {
        delegationAction: {
          action: 'approve',
          requestId: 'request-1',
          remarks: 'Approved'
        }
      }
    } as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.delegationRequest.status).toBe('Approved');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = $5 AND status = $6"),
      ['Approved', 'president-id', expect.any(String), 'Approved', 'request-1', 'Pending', 'Approved']
    );
  });

  it('rejects Vice President publishing without an active content delegation', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    vi.mocked(getPool).mockReturnValue({ query } as any);
    vi.mocked(requireAuthenticated).mockResolvedValue(user('Vice_President') as any);
    const res = response();

    await handler({
      method: 'POST',
      body: {
        announcements: [{
          id: 'announcement-1',
          title: 'Meeting',
          content: 'Please attend.',
          category: 'Meeting',
          priority: 'High'
        }]
      }
    } as any, res as any);

    expect(res.statusCode).toBe(403);
    expect(saveFullStateToPostgres).not.toHaveBeenCalled();
  });

  it('allows delegated publishing only as a new Vice President-authored post', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const expiry = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          id: 'request-1',
          requested_by: 'vice_president-id',
          reason: 'Coverage',
          scopes: ['announcements_activities'],
          requested_date: today,
          effective_start: today,
          effective_end: expiry,
          status: 'Approved'
        }]
      })
      .mockResolvedValueOnce({ rows: [{ id: 'old-announcement' }] });
    vi.mocked(getPool).mockReturnValue({ query } as any);
    vi.mocked(requireAuthenticated).mockResolvedValue(user('Vice_President') as any);
    const res = response();

    await handler({
      method: 'POST',
      body: {
        announcements: [
          { id: 'old-announcement', title: 'Tampered', content: 'Should not update.' },
          {
            id: 'announcement-2',
            title: 'Meeting',
            content: 'Please attend.',
            category: 'Meeting',
            priority: 'High',
            postedBy: 'Forged author',
            datePosted: '2000-01-01'
          }
        ]
      }
    } as any, res as any);

    expect(res.statusCode).toBe(200);
    const savedState = vi.mocked(saveFullStateToPostgres).mock.calls[0][1] as any;
    expect(savedState.announcements).toEqual([{
      id: 'announcement-2',
      title: 'Meeting',
      category: 'Meeting',
      content: 'Please attend.',
      datePosted: today,
      priority: 'High',
      postedBy: 'Vice President (Vice_President)'
    }]);
  });
});
