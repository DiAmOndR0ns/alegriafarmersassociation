import { describe, it, expect, vi, afterEach } from 'vitest';
import handler from './publicSummary';

type Query = { sql: string; values?: unknown[] };

/**
 * A pool stub that records every query and answers by matching the SQL.
 * This exercises the real handler logic (role normalization, ordering,
 * vacant-seat handling, projections) without a live database.
 */
function makePool(rows: { members?: any[]; users?: any[]; announcements?: any[]; activities?: any[] }) {
  const queries: Query[] = [];
  const pool = {
    query: async (sql: string, values?: unknown[]) => {
      queries.push({ sql, values });
      if (sql.includes('FROM members')) return { rows: rows.members || [] };
      if (sql.includes('FROM users')) return { rows: rows.users || [] };
      if (sql.includes('FROM announcements')) return { rows: rows.announcements || [] };
      if (sql.includes('FROM activities')) return { rows: rows.activities || [] };
      return { rows: [] };
    },
    connect: async () => ({ query: async () => ({ rows: [] }), release: () => undefined }),
  };
  return { pool, queries };
}

function makeRes() {
  const res: any = { statusCode: 0, body: undefined, headers: {} };
  res.setHeader = (key: string, value: string) => { res.headers[key] = value; };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (payload: unknown) => { res.body = payload; return res; };
  res.end = (payload: string) => { res.body = JSON.parse(payload); };
  return res;
}

// The handler calls getPool(); point it at our stub with spies (ESM exports
// are read-only, so plain assignment throws).
import * as db from './db';

function usePool(pool: unknown) {
  vi.spyOn(db, 'getPool').mockReturnValue(pool as any);
  vi.spyOn(db, 'isDatabaseConfigured').mockReturnValue(true);
  vi.spyOn(db, 'ensureDatabaseSchema').mockResolvedValue(undefined as any);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/public/summary', () => {
  it('returns member aggregates and only approved officers, in display order', async () => {
    const { pool, queries } = makePool({
      members: [{ total_members: 25, active_members: 21 }],
      users: [
        { name: 'Ana Treasurer', normalized_role: 'treasurer' },
        { name: 'Ben President', normalized_role: 'president' },
        { name: 'Cara Board', normalized_role: 'board_member' },
        { name: 'Dan Board', normalized_role: 'board_member' },
        { name: 'Eve Secretary', normalized_role: 'secretary' },
      ],
    });
    usePool(pool);

    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      totalMembers: 25,
      activeMembers: 21,
      // Ordered by hierarchy, not by query order; unsettled seats omitted.
      officers: [
        { role: 'President', name: 'Ben President' },
        { role: 'Secretary', name: 'Eve Secretary' },
        { role: 'Treasurer', name: 'Ana Treasurer' },
      ],
      boardMembers: ['Cara Board', 'Dan Board'],
      // No announcement/activity rows in this fixture.
      announcements: [],
      activities: []
    });

    // Never project PII or credentials out of either table.
    const memberSql = queries.find(q => q.sql.includes('FROM members'))!.sql;
    expect(memberSql).toMatch(/count\(\*\)/);
    expect(memberSql).not.toMatch(/contact_number|birth_date|rsbsa/);

    const userSql = queries.find(q => q.sql.includes('FROM users'))!.sql;
    expect(userSql).not.toMatch(/password|totp/);
    expect(userSql).toContain('is_approved IS NOT FALSE');
  });

  it('omits vacant officer seats instead of inventing placeholder names', async () => {
    const { pool } = makePool({
      members: [{ total_members: 5, active_members: 5 }],
      users: [{ name: 'Only President', normalized_role: 'president' }],
    });
    usePool(pool);

    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);

    expect(res.body.officers).toEqual([{ role: 'President', name: 'Only President' }]);
    expect(res.body.boardMembers).toEqual([]);
  });

  it('handles an empty association without throwing', async () => {
    const { pool } = makePool({ members: [], users: [] });
    usePool(pool);

    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      totalMembers: 0,
      activeMembers: 0,
      officers: [],
      announcements: [],
      activities: []
    });
  });

  it('returns announcements newest-first, shaped for the portal', async () => {
    const { pool, queries } = makePool({
      announcements: [
        { id: 'a2', title: 'Newer', category: 'Meeting', content: 'B', date_posted: '2026-11-10', priority: 'High', posted_by: 'PIO' },
        { id: 'a1', title: 'Older', category: 'General', content: 'A', date_posted: '2026-10-01', priority: 'Low', posted_by: 'PIO' },
      ],
    });
    usePool(pool);

    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);

    expect(res.body.announcements).toEqual([
      { id: 'a2', title: 'Newer', category: 'Meeting', content: 'B', datePosted: '2026-11-10', priority: 'High', postedBy: 'PIO' },
      { id: 'a1', title: 'Older', category: 'General', content: 'A', datePosted: '2026-10-01', priority: 'Low', postedBy: 'PIO' },
    ]);

    // Ordering is the database's job, not the client's.
    const sql = queries.find(q => q.sql.includes('FROM announcements'))!.sql;
    expect(sql).toMatch(/ORDER BY date_posted DESC/);
  });

  it('returns scheduled activities and excludes cancelled/postponed ones', async () => {
    const { pool, queries } = makePool({
      activities: [
        {
          id: 'act-1', title: 'Harvest Fair', ceb_title: 'Pista sa Ani', category: 'Harvest Fair',
          scheduled_date: '2026-12-05', date_scheduled: null, scheduled_time: '08:00', time_scheduled: null,
          location: 'Covered Court', description: 'Fair', organizer: 'PIO', status: 'Scheduled',
          status_reason: null, target_audience: 'All members', attendees_count: 120, image_url: null,
        },
      ],
    });
    usePool(pool);

    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);

    expect(res.body.activities).toEqual([
      {
        id: 'act-1', title: 'Harvest Fair', cebTitle: 'Pista sa Ani', category: 'Harvest Fair',
        scheduledDate: '2026-12-05', dateScheduled: '2026-12-05', scheduledTime: '08:00', timeScheduled: '08:00',
        location: 'Covered Court', description: 'Fair', organizer: 'PIO', status: 'Scheduled',
        statusReason: null, targetAudience: 'All members', attendeesCount: 120, imageUrl: null,
      },
    ]);

    const sql = queries.find(q => q.sql.includes('FROM activities'))!.sql;
    expect(sql).toMatch(/NOT IN \('cancelled', 'canceled', 'postponed'\)/);
    // Newest first, tolerating either date column being the populated one.
    expect(sql).toMatch(/coalesce\(nullif\(scheduled_date, ''\), nullif\(date_scheduled, ''\)\) DESC/);
  });

  it('never selects sensitive member or account columns for the public feeds', async () => {
    const { pool, queries } = makePool({});
    usePool(pool);

    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);

    for (const query of queries) {
      // No member rows are ever selected, only aggregates.
      if (query.sql.includes('FROM members')) {
        expect(query.sql).not.toMatch(/SELECT\s+\*/i);
        expect(query.sql).not.toMatch(/contact_number|birth_date|rsbsa_number|avatar_url/);
      }
      expect(query.sql).not.toMatch(/password|password_hash|totp_secret|username/);
    }
    expect(res.statusCode).toBe(200);
  });

  it('reports local mode without querying when the database is not configured', async () => {
    vi.spyOn(db, 'isDatabaseConfigured').mockReturnValue(false);
    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: false, offlineMode: true });
  });

  it('rejects non-GET methods', async () => {
    const res = makeRes();
    await handler({ method: 'POST' }, res);
    expect(res.statusCode).toBe(405);
  });

  it('returns a generic 503 without leaking driver details on failure', async () => {
    vi.spyOn(db, 'isDatabaseConfigured').mockReturnValue(true);
    vi.spyOn(db, 'ensureDatabaseSchema').mockResolvedValue(undefined as any);
    vi.spyOn(db, 'getPool').mockReturnValue({
      query: async () => { throw new Error('password authentication failed for user "postgres"'); },
    } as any);

    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);

    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('postgres');
  });
});
