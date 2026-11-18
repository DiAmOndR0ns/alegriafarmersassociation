import { describe, expect, it } from 'vitest';
import { getActiveDelegationScopes, isValidDelegationDate } from './delegation';
import { DelegationRequest } from '../types';

const request = (overrides: Partial<DelegationRequest> = {}): DelegationRequest => ({
  id: 'request-1',
  requestedBy: 'vp-user',
  reason: 'Temporary coverage',
  scopes: ['record_approval'],
  requestedDate: '2026-11-18',
  effectiveStart: '2026-11-18',
  effectiveEnd: '2026-11-20',
  status: 'Approved',
  ...overrides
});

describe('delegation access', () => {
  it('grants only selected scopes for the requester during the inclusive effective period', () => {
    expect(getActiveDelegationScopes(
      [request({ scopes: ['record_approval', 'announcements_activities'] })],
      'vp-user',
      new Date('2026-11-20T12:00:00.000Z')
    )).toEqual(new Set(['record_approval', 'announcements_activities']));
  });

  it('does not grant access before start, after expiry, or after revocation', () => {
    const approved = request();
    expect(getActiveDelegationScopes([approved], 'vp-user', new Date('2026-11-17T12:00:00.000Z')).size).toBe(0);
    expect(getActiveDelegationScopes([approved], 'vp-user', new Date('2026-11-21T12:00:00.000Z')).size).toBe(0);
    expect(getActiveDelegationScopes([request({ status: 'Revoked' })], 'vp-user').size).toBe(0);
  });

  it('does not grant another user access or grant pending requests', () => {
    expect(getActiveDelegationScopes([request()], 'different-user').size).toBe(0);
    expect(getActiveDelegationScopes([request({ status: 'Pending' })], 'vp-user').size).toBe(0);
  });

  it('accepts only real ISO calendar dates', () => {
    expect(isValidDelegationDate('2026-11-18')).toBe(true);
    expect(isValidDelegationDate('2026-02-30')).toBe(false);
    expect(isValidDelegationDate('18-11-2026')).toBe(false);
  });
});
