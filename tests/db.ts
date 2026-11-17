import { prisma } from '@/lib/prisma';
export async function resetDatabase() {
 await prisma.room.deleteMany();
 await prisma.rateLimit.deleteMany();
 await prisma.session.deleteMany();
 await prisma.user.deleteMany();
}
