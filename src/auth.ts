import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { consumeRateLimit, identityHash, requestIdentity } from '@/lib/security';

const loginInput = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,32}$/).transform(s => s.toLowerCase()),
  password: z.string().min(1).refine(s => Buffer.byteLength(s, 'utf8') <= 72),
});
let dummyHash: Promise<string> | undefined;

export const { handlers, signIn, signOut, auth } = NextAuth(() => {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('Configure AUTH_SECRET with at least 32 characters before starting the app.');
  return {
    secret,
    providers: [CredentialsProvider({
      name: 'Credentials',
      credentials: { username: { label: 'Username', type: 'text' }, password: { label: 'Password', type: 'password' } },
      async authorize(credentials, request) {
        const parsed = loginInput.safeParse(credentials);
        if (!parsed.success) return null;
        const { username, password } = parsed.data;
        try {
          await consumeRateLimit('login-global', 200, 900_000);
          await consumeRateLimit(`login-ip:${requestIdentity(request)}`, 30, 900_000);
          await consumeRateLimit(`login-user:${identityHash(username)}`, 10, 900_000);
          const user = await prisma.user.findUnique({ where: { username } });
          dummyHash ??= bcrypt.hash('nonexistent-account-timing-placeholder', 12);
          const valid = await bcrypt.compare(password, user?.password ?? await dummyHash);
          if (!user || !valid) return null;
          return { id: user.id, name: user.username, role: user.role };
        } catch {
          // Auth.js displays the same credential error for invalid credentials and throttling.
          return null;
        }
      },
    })],
    session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
    callbacks: {
      async jwt({ token, user }) {
        if (user) { token.id = user.id ?? ''; token.role = user.role; }
        return token;
      },
      async session({ session, token }) {
        if (session.user) { session.user.id = token.id; session.user.role = token.role; }
        return session;
      },
    },
    pages: { signIn: '/login' },
    logger: { error() { console.error('Authentication request failed.'); } },
  };
});
