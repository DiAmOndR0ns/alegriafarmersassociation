// src/api/auth.ts
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt2 from "bcryptjs";

// src/api/db.ts
import pg from "pg";
var PgPool = pg?.Pool || pg?.default?.Pool || pg?.default || pg;

// src/api/helper.ts
function sendResponse(res, statusCode, data) {
  try {
    if (res.headersSent) return;
    if (typeof res.status === "function" && typeof res.json === "function") {
      return res.status(statusCode).json(data);
    }
    res.statusCode = statusCode;
    if (typeof res.setHeader === "function") {
      res.setHeader("Content-Type", "application/json");
    }
    return res.end(JSON.stringify(data));
  } catch (err) {
    console.error("[sendResponse Error]:", err);
  }
}

// src/utils/passwordPolicy.ts
import bcrypt from "bcryptjs";
var LOCKOUT_DURATION_MS = 15 * 60 * 1e3;

// src/api/auth.ts
var SESSION_COOKIE = "fams_session";
var SESSION_SECONDS = 8 * 60 * 60;
var CHALLENGE_SECONDS = 15 * 60;
function signingSecret() {
  const value = process.env.SESSION_SECRET || "";
  if (value.length < 32 || new Set(value).size < 16 || /^(change.?me|secret|password)/i.test(value)) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
    }
    const seed = "afa-farmers-association-development-secret-key-tuburan-cebu";
    return createHash("sha256").update(seed).digest();
  }
  return Buffer.from(value, "utf8");
}
function setSessionCookie(req, res, token) {
  const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  const secure = process.env.NODE_ENV === "production" || forwardedProto === "https";
  const value = token ? `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${SESSION_SECONDS}; Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}` : `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
  res.setHeader("Set-Cookie", value);
}
function rejectCrossOriginMutation(req) {
  const fetchSite = String(req.headers?.["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite === "cross-site") return true;
  const origin = req.headers?.origin;
  if (!origin) return false;
  try {
    const originUrl = new URL(String(origin));
    const configured = process.env.APP_ORIGIN;
    if (configured) return originUrl.origin !== new URL(configured).origin;
    const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || req.get?.("host") || "").split(",")[0].trim();
    const proto = String(req.headers?.["x-forwarded-proto"] || (req.secure ? "https" : "http")).split(",")[0].trim();
    return originUrl.origin !== `${proto}://${host}`;
  } catch {
    return true;
  }
}
function errorResponse(res, status, message) {
  return sendResponse(res, status, { success: false, message });
}
async function logoutHandler(req, res) {
  if (rejectCrossOriginMutation(req)) return errorResponse(res, 403, "Cross-origin requests are not allowed.");
  try {
    signingSecret();
  } catch {
    return errorResponse(res, 503, "Authentication is not configured.");
  }
  setSessionCookie(req, res);
  return sendResponse(res, 200, { success: true });
}
export {
  logoutHandler as default
};
