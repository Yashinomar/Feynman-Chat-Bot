import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function checkOrigin(req: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.get('origin');
  const expected = new URL(process.env.AUTH_URL || req.url).origin;
  const requestUrl = new URL(req.url);
  const localHost = (host: string) => host === 'localhost' || host === '127.0.0.1';
  // Browsers treat localhost and 127.0.0.1 as different origins. Accept either
  // loopback spelling only when the configured app URL is itself loopback.
  let localAlias = false;
  try {
    if (origin) {
      const configured = new URL(expected);
      const supplied = new URL(origin);
      localAlias = localHost(configured.hostname) && localHost(requestUrl.hostname)
        && localHost(supplied.hostname) && supplied.protocol === configured.protocol
        && supplied.port === configured.port && requestUrl.port === configured.port;
    }
  } catch { /* Invalid origins fail below. */ }
  if (req.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== expected && !localAlias)) {
    throw new ApiError(403, 'This request must come from the study app.');
  }
}

// Content-Length is only an early rejection; the stream is independently bounded.
export async function readJson(req: Request, maxBytes = 65_536): Promise<unknown> {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'Send an application/json request.');
  }
  const declared = req.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    throw new ApiError(413, 'Request is too large.');
  }
  if (!req.body) throw new ApiError(400, 'A JSON request body is required.');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, 'Request is too large.');
      }
      chunks.push(value);
    }
    const combined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(combined));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'The request contains invalid JSON.');
  } finally {
    reader.releaseLock();
  }
}

export function identityHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function requestIdentity(req: Request) {
  // Never trust an arbitrary forwarded header on an Internet-facing Node process.
  const address = process.env.TRUST_PROXY === 'true'
    ? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 64)
    : undefined;
  return identityHash(address || 'direct-server');
}

export async function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowMs);
  const count = await prisma.$transaction(async tx => {
    await tx.rateLimit.deleteMany({ where: { expiresAt: { lte: now } } });
    const row = await tx.rateLimit.upsert({
      where: { key }, create: { key, count: 1, expiresAt }, update: { count: { increment: 1 } },
    });
    return row.count;
  });
  if (count > limit) throw new ApiError(429, 'Too many requests. Please wait before trying again.');
}

export function secretsMatch(actual: string, expected: string) {
  const a = createHash('sha256').update(actual).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message }, {
    status: error.status, headers: error.status === 429 ? { 'Retry-After': '60' } : undefined,
  });
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid request.', details: error.issues.map(issue => ({
      field: issue.path.join('.'), message: issue.message,
    })) }, { status: 400 });
  }
  // Neither request bodies nor ORM/provider exceptions are safe to log here.
  console.error('An API operation failed.');
  return NextResponse.json({ error: 'Unable to complete this request. Please try again.' }, { status: 500 });
}
