/**
 * Smoke-test the collapsed `api/auth/[...path].js` dispatcher.
 *
 * Asserts that every former standalone endpoint still resolves to its handler,
 * and that routing works for both request shapes Vercel can produce for a
 * catch-all function. Auth guards are expected to reject unauthenticated
 * callers, so "did it reach the right handler" is read off the response body
 * rather than the status code: a 401 from `requireAuthenticated` proves the
 * right handler ran, while the dispatcher's own 404/405 proves it did not.
 */
import authRoutesHandler from '../src/api/auth/routes';

type Captured = { status: number; body: any; headers: Record<string, string> };

function fakeRes(): { res: any; captured: Captured } {
  const captured: Captured = { status: 0, body: null, headers: {} };
  const res: any = {
    headersSent: false,
    setHeader(key: string, value: string) { captured.headers[key] = value; },
    status(code: number) { captured.status = code; return res; },
    json(data: any) { captured.body = data; res.headersSent = true; return res; },
    end() { res.headersSent = true; return res; },
  };
  return { res, captured };
}

async function call(
  method: string,
  url: string,
  body: any = {},
  queryPath?: string[]
): Promise<Captured> {
  const { res, captured } = fakeRes();
  const req: any = {
    method,
    url,
    headers: { origin: 'http://localhost', host: 'localhost' },
    body,
    ...(queryPath ? { query: { path: queryPath } } : {}),
  };
  await authRoutesHandler(req, res);
  return captured;
}

const cases: Array<{
  name: string;
  method: string;
  url: string;
  queryPath?: string[];
  body?: any;
  expectStatus: number;
  expectMessage?: RegExp;
}> = [
    // `req.url` already relative to the function (raw Node / Express-style).
    { name: 'POST /auth/login', method: 'POST', url: '/auth/login', body: { username: 'x', password: 'y' }, expectStatus: 503 },
    // Full deployment path with the /api prefix still attached.
    { name: 'GET /api/auth/session', method: 'GET', url: '/api/auth/session', expectStatus: 200 },
    { name: 'POST /api/auth/mfa/reset', method: 'POST', url: '/api/auth/mfa/reset', body: { targetUserId: 'a', currentPassword: 'b' }, expectStatus: 503 },
    // Vercel catch-all style: remainder arrives as req.query.path segments.
    { name: 'POST /auth/mfa/enroll via query.path', method: 'POST', url: '/', queryPath: ['mfa', 'enroll'], body: { challengeToken: 'bad' }, expectStatus: 401 },
    { name: 'POST /auth/password/change via query.path', method: 'POST', url: '/', queryPath: ['password', 'change'], body: { newPassword: 'x' }, expectStatus: 503 },
    // Every endpoint must be *reachable* — no route may fall through to 404.
    { name: 'POST /auth/mfa/confirm reachable', method: 'POST', url: '/auth/mfa/confirm', body: {}, expectStatus: 401 },
    { name: 'POST /auth/logout reachable', method: 'POST', url: '/auth/logout', expectStatus: 200 },
    { name: 'POST /auth/bootstrap reachable', method: 'POST', url: '/auth/bootstrap', body: {}, expectStatus: 503 },
    { name: 'POST /auth/password/reset reachable', method: 'POST', url: '/auth/password/reset', body: {}, expectStatus: 503 },
    // Guard rails owned by the dispatcher itself.
    { name: 'unknown auth path is 404', method: 'POST', url: '/auth/nope', expectStatus: 404 },
    { name: 'wrong method is 405', method: 'GET', url: '/auth/login', expectStatus: 405 },
  ];

let failures = 0;
for (const testCase of cases) {
  const result = await call(testCase.method, testCase.url, testCase.body, testCase.queryPath);
  const statusOk = result.status === testCase.expectStatus;
  const messageOk = !testCase.expectMessage || testCase.expectMessage.test(String(result.body?.message || ''));
  const pass = statusOk && messageOk;
  if (!pass) failures++;
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${testCase.name.padEnd(46)} status=${result.status} ` +
    `expected=${testCase.expectStatus} msg="${result.body?.message ?? ''}"`
  );
}

console.log(failures === 0 ? '\nAll auth routes dispatched correctly.' : `\n${failures} route(s) misrouted.`);
process.exit(failures === 0 ? 0 : 1);
