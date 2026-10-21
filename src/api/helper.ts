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
    }
    return res.end(JSON.stringify(data));
  } catch (err) {
    console.error('[sendResponse Error]:', err);
  }
}

export async function parseRequestBody(req: any): Promise<any> {
  const maxBytes = 1024 * 1024;
  if (req.body !== undefined && req.body !== null) {
    const body = req.body;
    const byteLength = typeof body === 'string'
      ? Buffer.byteLength(body, 'utf8')
      : Buffer.byteLength(JSON.stringify(body), 'utf8');
    if (byteLength > maxBytes) {
      const error: any = new Error('Request body exceeds the 1 MiB limit.');
      error.statusCode = 413;
      throw error;
    }
    if (typeof body === 'string') {
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    }
    return body;
  }

  // If req is a stream (raw Node IncomingMessage)
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    let settled = false;
    req.on('data', (chunk: Buffer | string) => {
      if (settled) return;
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
      size += Buffer.byteLength(text, 'utf8');
      if (size > maxBytes) {
        settled = true;
        const error: any = new Error('Request body exceeds the 1 MiB limit.');
        error.statusCode = 413;
        reject(error);
        req.destroy(error);
        return;
      }
      raw += text;
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error('Request body contains invalid JSON.', { cause: error }));
      }
    });
    req.on('aborted', () => {
      if (settled) return;
      settled = true;
      reject(new Error('Request body was aborted before it was fully received.'));
    });
    req.on('error', (error: Error) => {
      if (settled) return;
      settled = true;
      reject(new Error('Failed to read request body.', { cause: error }));
    });
  });
}
