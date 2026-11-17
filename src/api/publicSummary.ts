import { getPool, isDatabaseConfigured, ensureDatabaseSchema } from './db';
import { sendResponse } from './helper';

/**
 * Public, unauthenticated summary of the association.
 *
 * The guest portal must never need an officer login just to show "how many
 * members are registered" and "who the current officers are". Reading through
 * `/api/sync/pull` cannot do that: it requires a session, so every visitor
 * without a session silently fell back to whatever was cached on their device
 * (or to the seeded demo data) and the portal showed stale numbers.
 *
 * Deliberately returns aggregates and officer names only. Member rows carry
 * contact numbers, birth dates and RSBSA IDs, and user rows carry credentials,
 * so neither table is ever projected here — only `COUNT(*)` and the public
 * officer roster (role + display name).
 */

/** Roles that make up the public officer roster, in display order. */
const PUBLIC_OFFICER_ROLES: Array<{ role: string; title: string }> = [
  { role: 'president', title: 'President' },
  { role: 'vice_president', title: 'Vice President' },
  { role: 'secretary', title: 'Secretary' },
  { role: 'assistant_secretary', title: 'Assistant Secretary' },
  { role: 'treasurer', title: 'Treasurer' },
  { role: 'assistant_treasurer', title: 'Assistant Treasurer' },
  { role: 'auditor', title: 'Auditor' },
  { role: 'pio', title: 'PIO' },
];

/** Same normalization as the users_unique_named_role_idx partial index. */
const normalizeRole = "lower(replace(trim(role), ' ', '_'))";

export default async function handler(req: any, res: any) {
  if (req.method && req.method !== 'GET') {
    return sendResponse(res, 405, { success: false, message: 'Method not allowed.' });
  }

  if (!isDatabaseConfigured()) {
    return sendResponse(res, 200, {
      success: false,
      offlineMode: true,
      storageMode: 'local',
      provider: 'Local',
      message: 'Database is not configured.'
    });
  }

  try {
    const pool = getPool();
    await ensureDatabaseSchema(pool);

    const [countsRes, officersRes, announcementsRes, activitiesRes] = await Promise.all([
      pool.query(`
        SELECT
          count(*)::int AS total_members,
          count(*) FILTER (WHERE lower(coalesce(status, 'active')) = 'active')::int AS active_members
        FROM members
      `),
      // One row per officer seat. Board members are listed separately because
      // the seat is multi-occupancy.
      pool.query(`
        SELECT name, ${normalizeRole} AS normalized_role
        FROM users
        WHERE is_approved IS NOT FALSE
          AND ${normalizeRole} IN (${PUBLIC_OFFICER_ROLES.map((_, index) => `$${index + 1}`).join(', ')}, 'board_member')
        ORDER BY name ASC
      `, PUBLIC_OFFICER_ROLES.map(entry => entry.role)),
      // Public feed. `announcements` has no published flag, so every row is
      // public by definition; newest first. Cancelled/postponed are dropped in
      // SQL so the portal never advertises an event that will not happen.
      pool.query(`
        SELECT id, title, category, content, date_posted, priority, posted_by
        FROM announcements
        ORDER BY date_posted DESC NULLS LAST, id DESC
      `),
      pool.query(`
        SELECT id, title, ceb_title, category, scheduled_date, date_scheduled,
               scheduled_time, time_scheduled, location, description, organizer,
               status, status_reason, target_audience, attendees_count, image_url
        FROM activities
        WHERE lower(coalesce(status, '')) NOT IN ('cancelled', 'canceled', 'postponed')
        ORDER BY coalesce(nullif(scheduled_date, ''), nullif(date_scheduled, '')) DESC NULLS LAST, id DESC
      `)
    ]);

    const byRole = new Map<string, string>();
    const boardMembers: string[] = [];
    for (const row of officersRes.rows) {
      const name = String(row.name || '').trim();
      if (!name) continue;
      if (row.normalized_role === 'board_member') {
        boardMembers.push(name);
      } else if (!byRole.has(row.normalized_role)) {
        byRole.set(row.normalized_role, name);
      }
    }

    // Vacant seats are omitted rather than filled with a placeholder, so the
    // portal can render only officers that actually exist.
    const officers = PUBLIC_OFFICER_ROLES
      .filter(entry => byRole.has(entry.role))
      .map(entry => ({ role: entry.title, name: byRole.get(entry.role) as string }));

    const counts = countsRes.rows[0] || {};

    // Shaped to the client types (Announcement / AssociationActivity) so the
    // portal can render DB rows exactly like the props it already receives.
    const announcements = announcementsRes.rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      content: row.content,
      datePosted: row.date_posted,
      priority: row.priority,
      // Publisher name only: the officer's account id/username is not public.
      postedBy: row.posted_by
    }));

    const activities = activitiesRes.rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      cebTitle: row.ceb_title,
      category: row.category,
      scheduledDate: row.scheduled_date || row.date_scheduled,
      dateScheduled: row.date_scheduled || row.scheduled_date,
      scheduledTime: row.scheduled_time || row.time_scheduled,
      timeScheduled: row.time_scheduled || row.scheduled_time,
      location: row.location,
      description: row.description,
      organizer: row.organizer,
      status: row.status,
      statusReason: row.status_reason,
      targetAudience: row.target_audience,
      attendeesCount: Number(row.attendees_count || 0),
      imageUrl: row.image_url
    }));

    return sendResponse(res, 200, {
      success: true,
      totalMembers: Number(counts.total_members || 0),
      activeMembers: Number(counts.active_members || 0),
      officers,
      boardMembers,
      announcements,
      activities
    });
  } catch (error: any) {
    console.error('[Public summary] Unable to load association summary:', error?.message || error);
    return sendResponse(res, 503, {
      success: false,
      message: 'Association summary is temporarily unavailable.'
    });
  }
}
