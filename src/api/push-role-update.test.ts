import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({
  getPool: vi.fn(),
  isDatabaseConfigured: vi.fn(),
  saveFullStateToPostgres: vi.fn()
}));

vi.mock('./auth', () => ({
  isPresidentRole: (role: string) => role.trim().toLowerCase().replace(/\s+/g, '_') === 'president',
  isSecretaryRole: () => false,
  isTreasurerRole: () => false,
  rejectCrossOriginMutation: () => false,
  requireAuthenticated: vi.fn()
}));

import { getPool, isDatabaseConfigured } from './db';
import { requireAuthenticated } from './auth';
import handler from './push';

describe('role designation sync endpoint', () => {
  const query = vi.fn();
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPool).mockReturnValue({ query } as never);
    vi.mocked(isDatabaseConfigured).mockReturnValue(true);
    vi.mocked(requireAuthenticated).mockResolvedValue({
      id: 'president-id',
      username: 'president',
      name: 'AFA President',
      role: 'President',
      isApproved: true,
      primaryCrops: [],
      isRsbsaRegistered: false,
      mustChangePassword: false,
      mfaEnabled: true
    });
  });

  it('updates the designated account role immediately for the President', async () => {
    query.mockResolvedValue({ rowCount: 1, rows: [{ id: 'member-1' }] });

    await handler({
      method: 'POST',
      headers: {},
      body: { roleUpdate: { userId: 'member-1', role: 'Auditor' } }
    } as never, response as never);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users'),
      ['Auditor', 'member-1']
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('rejects role designation updates from non-President sessions', async () => {
    vi.mocked(requireAuthenticated).mockResolvedValue({
      id: 'auditor-id',
      username: 'auditor',
      name: 'AFA Auditor',
      role: 'Auditor',
      isApproved: true,
      primaryCrops: [],
      isRsbsaRegistered: false,
      mustChangePassword: false,
      mfaEnabled: false
    });

    await handler({
      method: 'POST',
      headers: {},
      body: { roleUpdate: { userId: 'member-1', role: 'Auditor' } }
    } as never, response as never);

    expect(query).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it('returns a conflict when the selected officer seat is already occupied', async () => {
    query.mockRejectedValue({ code: '23505' });

    await handler({
      method: 'POST',
      headers: {},
      body: { roleUpdate: { userId: 'member-1', role: 'Auditor' } }
    } as never, response as never);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'That officer position is already assigned.'
    }));
  });
});
