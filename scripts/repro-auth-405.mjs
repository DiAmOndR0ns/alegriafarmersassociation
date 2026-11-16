// Reproduces the production "401 + Method not allowed" seen on /api/auth/login.
const { default: handler } = await import('../api/auth.js');

function makeRes() {
  const res = { statusCode: 0, payload: undefined, headers: {}, body: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.payload = data; return res; };
  res.setHeader = (name, value) => { res.headers[name] = value; };
  res.end = (data) => { res.body = data; };
  return res;
}

const variants = [
  { label: 'method uppercase POST', extra: { method: 'POST' } },
  { label: 'method lowercase post', extra: { method: 'post' } },
  { label: 'method missing', extra: {} },
  { label: 'method POST + empty headers', extra: { method: 'POST', headers: {} } },
];

for (const { label, extra } of variants) {
  const res = makeRes();
  await handler({
    url: '/api/auth/login',
    body: { username: 'x', password: 'y' },
    headers: { origin: 'http://localhost', host: 'localhost', 'sec-fetch-site': 'same-origin' },
    ...extra,
    // keep headers from above unless the variant deliberately emptied them
    ...(extra.headers !== undefined ? { headers: extra.headers } : {}),
  }, res);
  console.log(`${String(res.statusCode).padEnd(4)} ${label}  ->  ${JSON.stringify(res.payload)}`);
}
