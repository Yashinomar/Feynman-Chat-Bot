import env from '@next/env';
env.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL?.startsWith('file:')) throw new Error('DATABASE_URL must point to the persistent SQLite file.');
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) throw new Error('Set a private AUTH_SECRET of at least 32 characters.');
if (!process.env.AUTH_URL) throw new Error('Set AUTH_URL to the public application URL.');
if (!process.env.AUTH_URL.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(process.env.AUTH_URL)) throw new Error('Use HTTPS for student access.');
if (!process.env.GEMINI_API_KEY) console.warn('GEMINI_API_KEY is missing; AI endpoints will report unavailable.');
