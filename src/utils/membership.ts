import type { Member, MembershipPayment, MembershipYearSnapshot } from '../types';

/**
 * Annual membership dues and sinking fund collection (January 1 – January 31 DOLE Roster Cutoff).
 *
 * Membership opens every JANUARY because the association submits its annual Official
 * Roster of Members Report to the Department of Labor and Employment (DOLE) every
 * January 31. The association itself does not close; however, if a member is not able
 * to pay their PHP 145.00 dues before January 31:
 * - PHP 25.00 for the Annual Membership Fee
 * - PHP 120.00 for the Sinking Fund (PHP 10.00/month × 12 months, collected in January)
 * their name will NOT be included in the Official Roster of Members submitted to DOLE.
 */
export const ANNUAL_MEMBERSHIP_FEE = 25;
export const MONTHLY_SINKING_FUND = 10;
export const ANNUAL_SINKING_FUND = MONTHLY_SINKING_FUND * 12; // 120
export const DEFAULT_MEMBERSHIP_DUES = ANNUAL_MEMBERSHIP_FEE + ANNUAL_SINKING_FUND; // 145
export const DOLE_ROSTER_CUTOFF_LABEL = 'January 31';

/** The `inactiveReason` an officer's year-close writes; a later payment clears it. */
export const UNPAID_DUES_REASON = 'Unpaid dues';

/** Placeholder shown before the Treasurer confirms the member's membership fee. */
export const PENDING_MEMBER_ID_LABEL = 'Pending Treasurer Confirmation';

/** True when the member has been issued a real AFA Member ID code (not blank or pending). */
export function hasAssignedMemberId(memberIdNumber?: string | null): boolean {
  if (!memberIdNumber) return false;
  const trimmed = memberIdNumber.trim();
  if (!trimmed) return false;
  return !/^pending\b/i.test(trimmed);
}

/** Generates the next sequential `AFA-YYYY-NNN` Member ID upon Treasurer confirmation. */
export function assignNextMemberId(members: readonly Member[], year: number = new Date().getFullYear()): string {
  const prefix = `AFA-${year}-`;
  let maxSeq = 0;
  const used = new Set<string>();
  for (const m of members) {
    const code = m.memberIdNumber?.trim();
    if (!code || !hasAssignedMemberId(code)) continue;
    used.add(code.toUpperCase());
    if (code.toUpperCase().startsWith(prefix.toUpperCase())) {
      const tail = code.slice(prefix.length).replace(/[^0-9]/g, '');
      const num = parseInt(tail, 10);
      if (Number.isFinite(num) && num > maxSeq) maxSeq = num;
    }
  }
  let next = maxSeq + 1;
  let candidate = `${prefix}${String(next).padStart(3, '0')}`;
  while (used.has(candidate.toUpperCase())) {
    next += 1;
    candidate = `${prefix}${String(next).padStart(3, '0')}`;
  }
  return candidate;
}

/** "Now" as YYYY-MM-DD in local time, the same format the rest of the app stores. */
export function todayIso(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The membership year that a date falls in. */
export function membershipYearOf(date: string | Date = new Date()): number {
  if (date instanceof Date) return date.getFullYear();
  const parsed = Number(String(date).slice(0, 4));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : new Date().getFullYear();
}

/** Payments that actually count: a voided receipt never reinstates anybody. */
export function isEffectivePayment(payment: MembershipPayment): boolean {
  return payment.status !== 'Voided';
}

/** Payments that can be counted as settled dues (verified, or awaiting Auditor check). */
export function isSettledPayment(payment: MembershipPayment): boolean {
  return payment.status === 'Verified' || payment.status === 'Pending';
}

/** A member cannot hold two live receipts for the same year. */
export function hasPaymentForYear(
  payments: readonly MembershipPayment[],
  memberId: string,
  year: number
): boolean {
  return payments.some(payment =>
    payment.memberId === memberId && Number(payment.year) === year && isEffectivePayment(payment)
  );
}

/** Latest membership year this member has settled, from the dues ledger. */
export function getPaidThroughYear(
  payments: readonly MembershipPayment[],
  memberId: string
): number | undefined {
  let latest: number | undefined;
  for (const payment of payments) {
    if (payment.memberId !== memberId || !isSettledPayment(payment)) continue;
    const year = Number(payment.year);
    if (!Number.isFinite(year)) continue;
    if (latest === undefined || year > latest) latest = year;
  }
  return latest;
}

/** True when the member has no dues receipt for the given membership year. */
export function isDueForRenewal(
  member: Member,
  payments: readonly MembershipPayment[],
  year: number
): boolean {
  if (hasPaymentForYear(payments, member.id, year)) return false;
  const paidThrough = getPaidThroughYear(payments, member.id);
  return paidThrough === undefined || paidThrough < year;
}

export type MembershipStanding = 'Paid' | 'Unpaid' | 'Inactive';

/**
 * The member's standing for a given year. Dues are the source of truth; the
 * stored `status` is only honoured when it was set inactive for a reason other
 * than unpaid dues (e.g. resigning or a disciplinary removal).
 */
export function getMembershipStanding(
  member: Member,
  payments: readonly MembershipPayment[],
  year: number
): MembershipStanding {
  // An officer's decision (resigned, removed) outranks a dues receipt. Paying
  // ₱145 must never silently reinstate someone the association removed.
  if (member.status === 'Inactive' && member.inactiveReason && member.inactiveReason !== UNPAID_DUES_REASON) {
    return 'Inactive';
  }
  return hasPaymentForYear(payments, member.id, year) ? 'Paid' : 'Unpaid';
}

/** A member is listed as an active member of the association for the year when dues are settled. */
export function isMemberActiveForYear(
  member: Member,
  payments: readonly MembershipPayment[],
  year: number
): boolean {
  return getMembershipStanding(member, payments, year) === 'Paid';
}

/** Derived status used everywhere the UI filters `status === 'Active'`. */
export function getDerivedMemberStatus(
  member: Member,
  payments: readonly MembershipPayment[],
  year: number
): 'Active' | 'Inactive' {
  return isMemberActiveForYear(member, payments, year) ? 'Active' : 'Inactive';
}

/** Members who have not settled dues for the year (already-Inactive members for other reasons are skipped). */
export function getUnpaidMembers(
  members: readonly Member[],
  payments: readonly MembershipPayment[],
  year: number
): Member[] {
  return members.filter(member => getMembershipStanding(member, payments, year) !== 'Paid');
}

/** Members whose dues are settled for the year, in roster order. */
export function getPaidMembers(
  members: readonly Member[],
  payments: readonly MembershipPayment[],
  year: number
): Member[] {
  return members.filter(member => getMembershipStanding(member, payments, year) === 'Paid');
}

/** Total collected dues for a year, excluding voided receipts. */
export function getDuesCollected(payments: readonly MembershipPayment[], year: number): number {
  return payments
    .filter(payment => Number(payment.year) === year && isEffectivePayment(payment))
    .reduce((total, payment) => total + (Number(payment.amount) || 0), 0);
}

/**
 * Membership years that can be closed: the requested year must hold at least one
 * dues payment OR members exist in the roster. Guards the officer action so the
 * book cannot be closed twice.
 */
export function canCloseMembershipYear(snapshots: readonly MembershipYearSnapshot[], year: number): boolean {
  return !snapshots.some(snapshot => Number(snapshot.year) === year);
}

/**
 * Builds the immutable roster for a closed membership year. Kept separate from
 * the handler so the numbers can be verified without rendering the app.
 */
export function buildMembershipYearSnapshot(params: {
  year: number;
  members: readonly Member[];
  payments: readonly MembershipPayment[];
  duesAmount: number;
  closedBy: string;
  closedAt?: string;
  remarks?: string;
}): MembershipYearSnapshot {
  const { year, members, payments, duesAmount, closedBy, remarks } = params;
  const yearPayments = payments.filter(payment =>
    Number(payment.year) === year && isEffectivePayment(payment)
  );

  const listed = members.filter(member => isMemberActiveForYear(member, payments, year));
  const listedMembers = listed.map(member => {
    const memberPayments = yearPayments.filter(payment => payment.memberId === member.id);
    // A member who paid twice only paid what the ledger says; a partial payer is
    // still listed but with the amount actually received.
    const amountPaid = memberPayments.reduce((total, payment) => total + (Number(payment.amount) || 0), 0);
    const latest = [...memberPayments].sort((a, b) => String(b.datePaid).localeCompare(String(a.datePaid)))[0];
    return {
      memberId: member.id,
      name: member.name,
      memberIdNumber: member.memberIdNumber,
      farmLocation: member.farmLocation,
      amountPaid,
      datePaid: latest?.datePaid
    };
  });

  const listedIds = new Set(listedMembers.map(row => row.memberId));
  const unpaidMemberIds = members
    .filter(member => !listedIds.has(member.id))
    .map(member => member.id);

  return {
    year,
    closedBy,
    closedAt: params.closedAt || new Date().toISOString(),
    duesAmount,
    totalMembers: members.length,
    paidMembers: listedMembers.length,
    unpaidMembers: unpaidMemberIds.length,
    totalCollected: yearPayments.reduce((total, payment) => total + (Number(payment.amount) || 0), 0),
    listedMembers,
    unpaidMemberIds,
    remarks: remarks?.trim() || undefined
  };
}

/** Receipt reference shown to the member and printed in the dues ledger. */
export function getMembershipReceiptLabel(payment: MembershipPayment): string {
  if (payment.referenceNo?.trim()) return payment.referenceNo.trim();
  const shortId = String(payment.id).replace(/[^0-9a-z]/gi, '').slice(-6).toUpperCase();
  return `AFA-DUES-${payment.year}-${shortId || '000000'}`;
}
