import { OfficerRole, User } from '../types';

/**
 * SINGLE SOURCE OF TRUTH FOR OFFICER NAMES IN DOCUMENTS.
 *
 * No document, report, signature block, or letterhead in FAMS may contain a
 * hardcoded officer name. Every officer reference must be resolved, at render
 * time, from the live officer accounts provisioned in the system (`users`).
 * If an officer changes (election, turnover, reassignment), every document
 * automatically reflects the new officer — no code changes required.
 */

/** Human-readable label for each officer role. */
export const OFFICER_ROLE_LABELS: Record<OfficerRole, string> = {
  President: 'President',
  Vice_President: 'Vice President',
  Secretary: 'Secretary',
  Assistant_Secretary: 'Assistant Secretary',
  Board_Member: 'Board Member',
  Treasurer: 'Treasurer',
  Assistant_Treasurer: 'Assistant Treasurer',
  Auditor: 'Auditor',
  PIO: 'PIO',
};

export const OFFICER_ROLES: OfficerRole[] = [
  'President',
  'Vice_President',
  'Secretary',
  'Assistant_Secretary',
  'Board_Member',
  'Treasurer',
  'Assistant_Treasurer',
  'Auditor',
  'PIO',
];

/**
 * Resolve the name of the officer currently holding `role` in the system.
 * Falls back to the generic role title (e.g. "AFA Treasurer") when the
 * position is vacant — never to a hardcoded person's name.
 */
export function resolveOfficerName(users: User[], role: OfficerRole): string {
  const matched = users.find(
    (u) => u.role === role && (u.role as string) !== 'Member'
  );
  if (matched) return matched.name;
  return `AFA ${OFFICER_ROLE_LABELS[role] ?? role.replace('_', ' ')}`;
}

/** Resolve name with the "Role (Name)" prefix style, e.g. "Treasurer (Juan Dela Cruz)". */
export function resolveOfficerLabel(users: User[], role: OfficerRole): string {
  const matched = users.find((u) => u.role === role);
  if (matched) return `${OFFICER_ROLE_LABELS[role]} (${matched.name})`;
  return `AFA ${OFFICER_ROLE_LABELS[role]}`;
}

/** Resolve name with the "Role Name" prefix style, e.g. "Treasurer Juan Dela Cruz". */
export function resolveOfficerPrefixed(users: User[], role: OfficerRole): string {
  const matched = users.find((u) => u.role === role);
  if (matched) return `${OFFICER_ROLE_LABELS[role]} ${matched.name}`;
  return `AFA ${OFFICER_ROLE_LABELS[role]}`;
}

/** Full officer roster (role + live name) ordered by hierarchy — for rosters/tables. */
export function resolveOfficerRoster(users: User[]): { title: string; name: string }[] {
  return OFFICER_ROLES.map((role) => ({
    title: OFFICER_ROLE_LABELS[role],
    name: resolveOfficerName(users, role),
  }));
}
