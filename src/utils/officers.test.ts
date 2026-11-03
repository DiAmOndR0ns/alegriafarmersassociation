import { describe, expect, it } from 'vitest';
import { User } from '../types';
import { resolveBoardMemberNames, resolveOfficerRoster } from './officers';

const user = (id: string, name: string, role: User['role']): User => ({
  id,
  username: id,
  name,
  role,
  isApproved: true
});

describe('officer roster resolution', () => {
  it('resolves named officer positions from designated accounts', () => {
    const roster = resolveOfficerRoster([
      user('auditor-1', 'Ava Auditor', 'Auditor')
    ]);

    expect(roster.find((officer) => officer.title === 'Auditor')?.name).toBe('Ava Auditor');
  });

  it('lists every Board Member designation separately from single-seat officer roles', () => {
    const users = [
      user('board-1', 'Bea Boardmember', 'Board_Member'),
      user('board-2', 'Cal Boardmember', 'Board_Member')
    ];

    expect(resolveBoardMemberNames(users)).toEqual(['Bea Boardmember', 'Cal Boardmember']);
    expect(resolveOfficerRoster(users).some((officer) => officer.title === 'Board Member')).toBe(false);
  });
});
