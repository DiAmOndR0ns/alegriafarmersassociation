import { describe, expect, it } from 'vitest';
import { rejectCrossOriginMutation, verifyTotp } from './auth';

describe('backend authentication primitives', () => {
  it('implements RFC 6238 SHA-1 TOTP with the standard six-digit vector', () => {
    expect(verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', 59_000)).toBe(1);
  });

  it('rejects invalid and replayed TOTP codes', () => {
    expect(verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '123', 59_000)).toBeNull();
    expect(verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', 59_000, 1)).toBeNull();
  });

  it('rejects cross-site and mismatched-origin state changes', () => {
    expect(rejectCrossOriginMutation({ headers: { 'sec-fetch-site': 'cross-site' } })).toBe(true);
    expect(rejectCrossOriginMutation({
      headers: { origin: 'https://attacker.example', host: 'fams.example', 'x-forwarded-proto': 'https' },
    })).toBe(true);
    expect(rejectCrossOriginMutation({
      headers: { origin: 'https://fams.example', host: 'fams.example', 'x-forwarded-proto': 'https' },
    })).toBe(false);
  });
});
