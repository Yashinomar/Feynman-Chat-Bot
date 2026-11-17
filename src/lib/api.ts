import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ApiError, checkOrigin, consumeRateLimit } from '@/lib/security';
export { ApiError, apiError, readJson, consumeRateLimit } from '@/lib/security';

const expensive = new Set(['chat', 'rag', 'quiz', 'hint', 'factcheck', 'transcribe']);

export async function requireUser(req: Request, bucket = 'api', limit = 60, windowMs = 60_000) {
  const session = await auth();
  if (!session?.user?.id) throw new ApiError(401, 'Please sign in to continue.');
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true } });
  if (!user) throw new ApiError(401, 'Please sign in again.');
  checkOrigin(req);
  await consumeRateLimit(`${bucket}:${user.id}`, limit, windowMs);
  if (expensive.has(bucket)) {
    await consumeRateLimit(`ai-day:${user.id}`, 200, 86_400_000);
    await consumeRateLimit('ai-global-day', 2000, 86_400_000);
  }
  return user;
}
