// Smoke-test the built api/auth.js serverless bundle (not the TypeScript source).
// Run with: node scripts/check-auth-bundle.mjs
const { default: handler } = await import('../api/auth.js');

function makeRes() {
  const res = { statusCode: 0, payload: undefined, headers: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.payload = data; return res; };
  res.setHeader = (name, value) => { res.headers[name] = value; };
  return res;
}

async function call(method, url) {
  const res = makeRes();
  await handler({
    method,
    url,
    body: {},
    headers: { origin: 'http://localhost', host: 'localhost', 'sec-fetch-site': 'same-origin' },
  }, res);
  return res;
}

// Only outcomes the dispatcher owns are pinned: a 404 (no route) or a 405 (wrong
// method). Handler status codes depend on the environment's DATABASE_URL and
// secrets, so they are merely required to be neither of those two.
const cases = [
  ['POST', '/api/auth/login'],
  ['POST', '/api/auth/logout'],
  ['GET', '/api/auth/session'],
  ['POST', '/api/auth/bootstrap'],
  ['POST', '/api/auth/mfa/enroll'],
  ['POST', '/api/auth/mfa/confirm'],
  ['POST', '/api/auth/mfa/reset'],
  ['POST', '/api/auth/password/change'],
  ['POST', '/api/auth/password/reset'],
];

let failures = 0;
for (const [method, url] of cases) {
  const res = await call(method, url);
  const pass = res.statusCode !== 404 && res.statusCode !== 405;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${method.padEnd(5)} ${url.padEnd(32)} ${res.statusCode}`);
}
for (const [method, url, expected] of [['POST', '/api/auth/nope', 404], ['GET', '/api/auth/login', 405]]) {
  const res = await call(method, url);
  const pass = res.statusCode === expected;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${method.padEnd(5)} ${url.padEnd(32)} ${res.statusCode} (expected ${expected})`);
}
console.log(failures === 0 ? '\napi/auth.js routes every endpoint correctly.' : `\n${failures} route(s) broken.`);
process.exit(failures === 0 ? 0 : 1);
