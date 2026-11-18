import { DelegationRequest, DelegationScope } from '../types';

export const DELEGATION_SCOPES: DelegationScope[] = [
  'password_change',
  'record_approval',
  'announcements_activities'
];

export const DELEGATION_SCOPE_LABELS: Record<DelegationScope, string> = {
  password_change: 'Password changes',
  record_approval: 'Record approvals',
  announcements_activities: 'Announcements and activities'
};

export function getActiveDelegationScopes(
  requests: readonly DelegationRequest[],
  userId: string,
  at = new Date()
): Set<DelegationScope> {
  const today = at.toISOString().slice(0, 10);
  const activeScopes = new Set<DelegationScope>();

  for (const request of requests) {
    if (
      request.requestedBy !== userId ||
      request.status !== 'Approved' ||
      request.effectiveStart > today ||
      request.effectiveEnd < today
    ) {
      continue;
    }

    for (const scope of request.scopes || []) {
      if (DELEGATION_SCOPES.includes(scope)) activeScopes.add(scope);
    }
  }

  return activeScopes;
}

export function isValidDelegationDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
