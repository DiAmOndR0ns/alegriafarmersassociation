/**
 * Single Vercel Serverless Function for every `/api/auth/*` endpoint.
 *
 * Vercel counts one function per file under `api/`, and the auth tree used to be
 * nine one-line shim files (`api/auth/login.js`, `api/auth/mfa/reset.js`, ...).
 * They are all bundled into `api/auth.js` from this module, and `vercel.json`
 * rewrites `/api/auth/<anything>` to that one URL. Routing lives in
 * `AUTH_ROUTES` in `./auth`, keyed by the original path.
 *
 * NOTE: this is a plain function file, not a catch-all (`[...path].js`), so it
 * does not depend on optional catch-all routing being enabled for the project.
 */
export { default, resolveAuthPath } from './auth';
