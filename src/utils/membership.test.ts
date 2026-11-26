import { describe, it, expect } from 'vitest';
import type { Member, MembershipPayment } from '../types';
import {
  DEFAULT_MEMBERSHIP_DUES,
  PENDING_MEMBER_ID_LABEL,
  assignNextMemberId,
  buildMembershipYearSnapshot,
  canCloseMembershipYear,
  getDerivedMemberStatus,
  getDuesCollected,
  getMembershipReceiptLabel,
  getMembershipStanding,
  getPaidMembers,
  getPaidThroughYear,
  getUnpaidMembers,
  hasAssignedMemberId,
  hasPaymentForYear,
  isDueForRenewal,
  isMemberActiveForYear,
  membershipYearOf
} from './membership';

const member = (overrides: Partial<Member> = {}): Member => ({
  id: 'm-1',
  name: 'Juan Dela Cruz',
  memberIdNumber: 'AFA-2026-001',
  farmLocation: 'Sitio Tapon',
  primaryCrops: ['Corn'],
  contactNumber: '09171234567',
  status: 'Active',
  joinedDate: '2024-01-10',
  ...overrides
});

const payment = (overrides: Partial<MembershipPayment> = {}): MembershipPayment => ({
  id: 'pay-1',
  memberId: 'm-1',
  memberName: 'Juan Dela Cruz',
  year: 2026,
  amount: DEFAULT_MEMBERSHIP_DUES,
  datePaid: '2026-01-15',
  method: 'Cash',
  status: 'Verified',
  recordedBy: 'Treasurer',
  recordedAt: '2026-01-15T08:00:00.000Z',
  ...overrides
});

describe('membership year', () => {
  it('reads the year from a stored date and from a Date', () => {
    expect(membershipYearOf('2027-02-03')).toBe(2027);
    expect(membershipYearOf(new Date(2028, 6, 1))).toBe(2028);
  });
});

describe('dues as the source of truth for status', () => {
  it('treats a member with no receipt as unpaid in the new year', () => {
    // The book closed for 2026; 2027 has begun and nobody has paid yet.
    const members = [member({ status: 'Active' })];
    const payments = [payment({ year: 2026 })];

    expect(getMembershipStanding(members[0], payments, 2027)).toBe('Unpaid');
    expect(isMemberActiveForYear(members[0], payments, 2027)).toBe(false);
    expect(getDerivedMemberStatus(members[0], payments, 2027)).toBe('Inactive');
    expect(getUnpaidMembers(members, payments, 2027)).toHaveLength(1);
  });

  it('lists the member again once the new year dues are recorded', () => {
    const members = [member({ status: 'Inactive' })];
    const payments = [payment({ year: 2026 }), payment({ id: 'pay-2', year: 2027, datePaid: '2027-01-05' })];

    expect(getMembershipStanding(members[0], payments, 2027)).toBe('Paid');
    expect(getDerivedMemberStatus(members[0], payments, 2027)).toBe('Active');
    expect(getPaidMembers(members, payments, 2027)).toHaveLength(1);
    expect(getUnpaidMembers(members, payments, 2027)).toHaveLength(0);
  });

  it('never counts a voided receipt', () => {
    const members = [member()];
    const payments = [payment({ status: 'Voided' })];

    expect(hasPaymentForYear(payments, 'm-1', 2026)).toBe(false);
    expect(isMemberActiveForYear(members[0], payments, 2026)).toBe(false);
    expect(getDuesCollected(payments, 2026)).toBe(0);
  });

  it('counts a pending Auditor check so a paid member is not locked out', () => {
    const members = [member()];
    const payments = [payment({ status: 'Pending' })];

    expect(isMemberActiveForYear(members[0], payments, 2026)).toBe(true);
    expect(getPaidThroughYear(payments, 'm-1')).toBe(2026);
  });

  it('respects an inactive status set for a reason other than unpaid dues', () => {
    const suspended = member({ status: 'Inactive', inactiveReason: 'Resigned' });
    const payments = [payment()];

    expect(getMembershipStanding(suspended, payments, 2026)).toBe('Inactive');
  });

  it('reports when a member is due for renewal only for years they have not settled', () => {
    const payments = [payment({ year: 2026 })];

    expect(isDueForRenewal(member(), payments, 2026)).toBe(false);
    expect(isDueForRenewal(member(), payments, 2027)).toBe(true);
  });
});

describe('closing a membership year', () => {
  const members = [
    member({ id: 'm-1', name: 'Juan Dela Cruz' }),
    member({ id: 'm-2', name: 'Maria Santos', memberIdNumber: 'AFA-2026-002' })
  ];
  const payments = [payment({ id: 'p1', memberId: 'm-1', year: 2026 })];

  it('snapshots who was listed, who was not, and what was collected', () => {
    const snapshot = buildMembershipYearSnapshot({
      year: 2026,
      members,
      payments,
      duesAmount: DEFAULT_MEMBERSHIP_DUES,
      closedBy: 'Treasurer',
      closedAt: '2026-12-31T16:00:00.000Z'
    });

    expect(snapshot.year).toBe(2026);
    expect(snapshot.totalMembers).toBe(2);
    expect(snapshot.paidMembers).toBe(1);
    expect(snapshot.unpaidMembers).toBe(1);
    expect(snapshot.totalCollected).toBe(DEFAULT_MEMBERSHIP_DUES);
    expect(snapshot.listedMembers.map(row => row.memberId)).toEqual(['m-1']);
    expect(snapshot.listedMembers[0].datePaid).toBe('2026-01-15');
    expect(snapshot.unpaidMemberIds).toEqual(['m-2']);
  });

  it('sums every non-voided receipt for the year, including a double payment', () => {
    const doubled = [...payments, payment({ id: 'p2', memberId: 'm-1', year: 2026, amount: 50 })];
    const snapshot = buildMembershipYearSnapshot({
      year: 2026,
      members,
      payments: doubled,
      duesAmount: DEFAULT_MEMBERSHIP_DUES,
      closedBy: 'Treasurer'
    });

    expect(snapshot.listedMembers[0].amountPaid).toBe(150);
    expect(snapshot.totalCollected).toBe(150);
  });

  it('refuses to close the same year twice', () => {
    const snapshot = buildMembershipYearSnapshot({
      year: 2026,
      members,
      payments,
      duesAmount: DEFAULT_MEMBERSHIP_DUES,
      closedBy: 'Treasurer'
    });

    expect(canCloseMembershipYear([snapshot], 2026)).toBe(false);
    expect(canCloseMembershipYear([snapshot], 2027)).toBe(true);
  });
});

describe('receipt labels', () => {
  it('prefers the official receipt number over the generated reference', () => {
    expect(getMembershipReceiptLabel(payment({ referenceNo: 'OR-2026-0155' }))).toBe('OR-2026-0155');
    expect(getMembershipReceiptLabel(payment({ id: 'mp-123456', referenceNo: undefined })))
      .toBe('AFA-DUES-2026-123456');
  });
});

describe('member ID issuance upon Treasurer confirmation', () => {
  it('treats blank or pending member IDs as unassigned', () => {
    expect(hasAssignedMemberId(undefined)).toBe(false);
    expect(hasAssignedMemberId('')).toBe(false);
    expect(hasAssignedMemberId(PENDING_MEMBER_ID_LABEL)).toBe(false);
    expect(hasAssignedMemberId('Pending')).toBe(false);
    expect(hasAssignedMemberId('AFA-2026-001')).toBe(true);
  });

  it('assigns the next sequential AFA-YYYY-NNN ID skipping pending members', () => {
    const roster = [
      member({ id: 'm-1', memberIdNumber: 'AFA-2026-001' }),
      member({ id: 'm-2', memberIdNumber: undefined }),
      member({ id: 'm-3', memberIdNumber: PENDING_MEMBER_ID_LABEL }),
      member({ id: 'm-4', memberIdNumber: 'AFA-2026-004' })
    ];
    expect(assignNextMemberId(roster, 2026)).toBe('AFA-2026-005');
  });
});
