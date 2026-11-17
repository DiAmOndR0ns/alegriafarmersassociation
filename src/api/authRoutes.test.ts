// @vitest-environment node
import { describe, expect, it } from 'vitest';
import authRoutes, { resolveAuthPath } from './authRoutes';

/**
 * The whole auth tree is served by one Vercel function (`api/auth.js`), reached
 * through the `/api/auth/:path*` rewrite in `vercel.json`. Route resolution and
 * method guarding live in the dispatcher, so they are pinned here: a break in
 * this table silently sends every sign-in to a 404.
 */

function makeRes() {
  const res: any = { statusCode: 0, payload: undefined, headers: {} as Record<string, any> };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (data: any) => { res.payload = data; return res; };
  res.setHeader = (name: string, value: string) => { res.headers[name] = value; };
  return res;
}

function makeReq(method: string, url: string, extra: Record<string, any> = {}) {
  return {
    method,
    url,
    body: {},
    headers: { origin: 'http://localhost', host: 'localhost', 'sec-fetch-site': 'same-origin' },
    ...extra,
  };
}

describe('auth route dispatcher', () => {
  it('resolves the original path from the rewrite header, url, or query-free URL only', () => {
    expect(resolveAuthPath(makeReq('POST', '/api/auth/login'))).toBe('/api/auth/login');
    expect(resolveAuthPath(makeReq('POST', '/api/auth/', { headers: { 'x-vercel-rewrite': '/api/auth/logout' } })))
      .toBe('/api/auth/logout');
    expect(resolveAuthPath(makeReq('POST', '/api/auth/mfa/confirm?x=1'))).toBe('/api/auth/mfa/confirm');
    // Anything outside /api/auth must never be used for routing.
    expect(resolveAuthPath(makeReq('POST', '/api/sync/push'))).toBeNull();
    // `/api/auth` itself has no handler, so it resolves to a path the table misses.
    expect(resolveAuthPath(makeReq('POST', '/api/auth'))).toBe('/api/auth');
  });

  it('rebuilds the original path when the rewrite moved it into the query string', () => {
    // Vercel documents `/resize/100/50` -> `/api/sharp?width=100&height=50`.
    expect(resolveAuthPath(makeReq('POST', '/api/auth?path=login'))).toBe('/api/auth/login');
    expect(resolveAuthPath(makeReq('POST', '/api/auth?path=mfa/enroll'))).toBe('/api/auth/mfa/enroll');
    expect(resolveAuthPath(makeReq('POST', '/api/auth?0=password&1=reset'))).toBe('/api/auth/password/reset');
  });

  it('does not invent a method when the runtime omits one', async () => {
    // Regression: `String(req.method || 'GET')` turned a missing method into GET,
    // so every POST endpoint answered 405 - which the UI reported as a failed
    // login for ALL accounts.
    for (const method of [undefined, null, '']) {
      const res = makeRes();
      await authRoutes(
        { url: '/api/auth/logout', body: {}, headers: { origin: 'http://localhost', host: 'localhost', 'sec-fetch-site': 'same-origin' }, method },
        res
      );
      expect(res.statusCode, String(method)).toBe(200);
    }
  });

  it('still rejects an explicitly wrong method', async () => {
    const res = makeRes();
    await authRoutes(makeReq('get', '/api/auth/login'), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('rejects unknown paths with 404 before any handler runs', async () => {
    const res = makeRes();
    await authRoutes(makeReq('POST', '/api/auth/nope'), res);
    expect(res.statusCode).toBe(404);
    expect(res.payload).toEqual({ success: false, message: 'Not found.' });
  });

  it('answers 405 with an Allow header when the method does not match', async () => {
    const res = makeRes();
    await authRoutes(makeReq('GET', '/api/auth/login'), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('dispatches every former endpoint to its handler', async () => {
    const posts = [
      '/api/auth/login',
      '/api/auth/logout',
      '/api/auth/bootstrap',
      '/api/auth/mfa/enroll',
      '/api/auth/mfa/confirm',
      '/api/auth/mfa/reset',
      '/api/auth/password/change',
      '/api/auth/password/reset',
      '/api/auth/accounts/provision',
    ];
    for (const url of posts) {
      const res = makeRes();
      // No database is configured in this environment, so each handler must
      // answer for itself rather than falling through to the dispatcher's 404.
      await authRoutes(makeReq('POST', url), res);
      expect(res.statusCode, url).not.toBe(404);
      expect(res.statusCode, url).not.toBe(405);
    }

    const session = makeRes();
    await authRoutes(makeReq('GET', '/api/auth/session'), session);
    expect(session.statusCode).not.toBe(404);
    expect(session.payload).toMatchObject({ authenticated: false });
  });
});
