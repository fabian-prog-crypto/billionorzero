import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateToken, validateToken, revokeToken } from './session-store';

describe('session-store (HMAC-signed stateless tokens)', () => {
  describe('generateToken', () => {
    it('returns a token in timestamp.signature format', async () => {
      const token = await generateToken();
      expect(token).toContain('.');
      const [timestamp, signature] = token.split('.');
      expect(Number(timestamp)).toBeGreaterThan(0);
      expect(signature.length).toBeGreaterThan(0);
    });

    it('generates unique tokens each call', async () => {
      const t1 = await generateToken();
      // Small delay to ensure different timestamps
      await new Promise(r => setTimeout(r, 2));
      const t2 = await generateToken();
      expect(t1).not.toBe(t2);
    });

    it('timestamp is close to current time', async () => {
      const before = Date.now();
      const token = await generateToken();
      const after = Date.now();
      const timestamp = Number(token.split('.')[0]);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('validateToken', () => {
    it('validates a freshly generated token', async () => {
      const token = await generateToken();
      expect(await validateToken(token)).toBe(true);
    });

    it('rejects empty string', async () => {
      expect(await validateToken('')).toBe(false);
    });

    it('rejects token without dot separator', async () => {
      expect(await validateToken('nodothere')).toBe(false);
    });

    it('rejects token with invalid timestamp', async () => {
      expect(await validateToken('notanumber.abc123')).toBe(false);
    });

    it('rejects token with tampered signature', async () => {
      const token = await generateToken();
      const [timestamp] = token.split('.');
      expect(await validateToken(`${timestamp}.tampered_signature`)).toBe(false);
    });

    it('rejects token with tampered timestamp', async () => {
      const token = await generateToken();
      const [, signature] = token.split('.');
      const tamperedTs = String(Date.now() - 1000);
      expect(await validateToken(`${tamperedTs}.${signature}`)).toBe(false);
    });

    it('rejects expired token (30+ days old)', async () => {
      // Generate a token with a timestamp from 31 days ago
      const thirtyOneDaysAgo = Date.now() - (31 * 24 * 60 * 60 * 1000);
      // We need to create a validly-signed token with an old timestamp
      // Mock Date.now for generation
      const realNow = Date.now;
      vi.spyOn(Date, 'now').mockReturnValue(thirtyOneDaysAgo);
      const oldToken = await generateToken();
      vi.spyOn(Date, 'now').mockImplementation(realNow);

      expect(await validateToken(oldToken)).toBe(false);
    });

    it('accepts token that is 29 days old (not yet expired)', async () => {
      const twentyNineDaysAgo = Date.now() - (29 * 24 * 60 * 60 * 1000);
      const realNow = Date.now;
      vi.spyOn(Date, 'now').mockReturnValue(twentyNineDaysAgo);
      const token = await generateToken();
      vi.spyOn(Date, 'now').mockImplementation(realNow);

      expect(await validateToken(token)).toBe(true);
    });

    it('validates same token multiple times (stateless)', async () => {
      const token = await generateToken();
      expect(await validateToken(token)).toBe(true);
      expect(await validateToken(token)).toBe(true);
      expect(await validateToken(token)).toBe(true);
    });
  });

  describe('revokeToken', () => {
    it('is a no-op and does not affect validation', async () => {
      const token = await generateToken();
      expect(await validateToken(token)).toBe(true);
      revokeToken(token);
      // Token still valid because revocation is a no-op for stateless tokens
      expect(await validateToken(token)).toBe(true);
    });
  });

  describe('cross-runtime compatibility', () => {
    it('uses Web Crypto API (crypto.subtle) available in both Edge and Node', async () => {
      // Verify crypto.subtle is available in the test environment
      expect(crypto.subtle).toBeDefined();
      expect(typeof crypto.subtle.importKey).toBe('function');
      expect(typeof crypto.subtle.sign).toBe('function');
      expect(typeof crypto.subtle.verify).toBe('function');
    });

    it('token format is a plain string (no Map or module state)', async () => {
      const token = await generateToken();
      expect(typeof token).toBe('string');
      // Token is self-contained: timestamp + HMAC signature
      const parts = token.split('.');
      expect(parts).toHaveLength(2);
    });
  });
});
