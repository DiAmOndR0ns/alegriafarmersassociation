/**
 * Single Vercel serverless function for every `/api/auth/*` endpoint.
 *
 * The Hobby plan caps a deployment at 12 Serverless Functions. One file per
 * auth route (login, logout, session, bootstrap, mfa/*, password/*) accounted
 * for nine of them on its own, which blocked every deploy. Vercel maps a catch-
 * all file (`api/auth/[...path].js`) to all remaining segments under `api/auth`,
 * so this one module is the only function the auth tree needs. Routing lives in
 * `AUTH_ROUTES` in `../auth.ts`.
 *
 * NOTE: this default export must stay a *routing function*, not a re-export of
 * a specific handler — unlike the old `api/auth/login.ts` style shims.
 */
export { authRoutesHandler as default } from '../auth';
