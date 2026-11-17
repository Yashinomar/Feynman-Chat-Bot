import env from '@next/env';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

env.loadEnvConfig(process.cwd());
if (!process.stdin.isTTY) throw new Error('Run this command in an interactive terminal. Password entry is hidden.');
let hidden = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!hidden) process.stdout.write(chunk, encoding); callback(); } });
const prompt = createInterface({ input: process.stdin, output, terminal: true });
const prisma = new PrismaClient();
try {
  const username = (await prompt.question('New admin username: ')).trim().toLowerCase();
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) throw new Error('Use 3–32 letters, numbers, or underscores.');
  process.stdout.write('New admin password (hidden, at least 12 characters): ');
  hidden = true;
  const password = await prompt.question('');
  process.stdout.write('\nConfirm password (hidden): ');
  const confirmation = await prompt.question('');
  hidden = false; process.stdout.write('\n');
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) throw new Error('Password must be at least 12 characters and at most 72 UTF-8 bytes.');
  if (password !== confirmation) throw new Error('Passwords do not match. No account was created.');
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) throw new Error('That username already exists. Choose a new admin username; existing accounts will not be changed.');
  await prisma.user.create({ data: { username, password: await bcrypt.hash(password, 12), role: 'ADMIN' } });
  console.log('Administrator created. Sign in at /admin/login.');
} catch (error) {
  console.error(error instanceof Error && !('code' in error) ? error.message : 'Admin creation failed. Check database setup and choose an unused username.');
  process.exitCode = 1;
} finally { prompt.close(); await prisma.$disconnect(); }
