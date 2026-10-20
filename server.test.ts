import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './server';

// Use the static/production branch so tests don't boot the Vite dev middleware.
const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'production';

describe('server routes', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const app = await createApp();
    server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('reports database status without throwing when DATABASE_URL is unset', async () => {
    const response = await fetch(`${baseUrl}/api/db/status`);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('connected');
    expect(body).toHaveProperty('configured');
    expect(typeof body.message).toBe('string');
  });

  it('answers unknown API routes without a 5xx server error', async () => {
    const response = await fetch(`${baseUrl}/api/does-not-exist`);

    expect(response.status).toBeLessThan(500);
  });
});
