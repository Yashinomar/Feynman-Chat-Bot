import { describe, expect, it } from 'vitest';
import { checkOrigin } from '@/lib/security';

describe('same-app origin validation', () => {
  const request = (address: string, origin: string, site = 'same-origin') => new Request(address, {
    method: 'POST', headers: { origin, 'sec-fetch-site': site },
  });
  it('accepts the two local loopback spellings on the same port', () => {
    process.env.AUTH_URL = 'http://localhost:3000';
    expect(() => checkOrigin(request('http://127.0.0.1:3000/api/auth/register', 'http://127.0.0.1:3000'))).not.toThrow();
    expect(() => checkOrigin(request('http://localhost:3000/api/auth/register', 'http://localhost:3000'))).not.toThrow();
  });
  it('rejects outside origins and other ports', () => {
    process.env.AUTH_URL = 'http://localhost:3000';
    expect(() => checkOrigin(request('http://127.0.0.1:3000/api/auth/register', 'http://evil.example'))).toThrow();
    expect(() => checkOrigin(request('http://127.0.0.1:3000/api/auth/register', 'http://127.0.0.1:3001'))).toThrow();
    expect(() => checkOrigin(request('http://127.0.0.1:3000/api/auth/register', 'http://127.0.0.1:3000', 'cross-site'))).toThrow();
  });
  it('does not grant a loopback exception for a production origin', () => {
    process.env.AUTH_URL = 'https://study.example';
    expect(() => checkOrigin(request('http://127.0.0.1:3000/api/auth/register', 'http://127.0.0.1:3000'))).toThrow();
  });
});
