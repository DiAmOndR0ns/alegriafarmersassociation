import type { IncomingMessage, ServerResponse } from 'http';

export function sendResponse(res: any, statusCode: number, data: any) {
  try {
    if (res.headersSent) return;
    
    // Check if Express/Vercel helper methods are available
    if (typeof res.status === 'function' && typeof res.json === 'function') {
      return res.status(statusCode).json(data);
    }

    // Standard Node.js ServerResponse fallback
    res.statusCode = statusCode;
    if (typeof res.setHeader === 'function') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    return res.end(JSON.stringify(data));
  } catch (err) {
    console.error('[sendResponse Error]:', err);
  }
}

export async function parseRequestBody(req: any): Promise<any> {
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return req.body;
      }
    }
    return req.body;
  }

  // If req is a stream (raw Node IncomingMessage)
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk: any) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}
