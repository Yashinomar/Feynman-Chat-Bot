import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';

// Prisma's dev singleton must never carry a previous test file's database forward.
const scope = globalThis as unknown as { prisma?: PrismaClient };
await scope.prisma?.$disconnect();
delete scope.prisma;
const directory = mkdtempSync(join(tmpdir(), 'teachback-test-'));
const database = join(directory, 'test.db');
writeFileSync(database, '', { flag: 'wx' });
process.env.DATABASE_URL = `file:${database}`;
process.env.AUTH_SECRET = 'controlled-test-secret-not-for-production-123456';
process.env.AUTH_URL = 'http://localhost:3000';
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: process.env, stdio: 'pipe' });
afterAll(async () => {
  await scope.prisma?.$disconnect();
  delete scope.prisma;
  rmSync(directory, { recursive: true, force: true });
});
