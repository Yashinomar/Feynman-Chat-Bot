import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { credentialsSchema } from '@/lib/validation';
import { ApiError, apiError, checkOrigin, consumeRateLimit, readJson, requestIdentity, secretsMatch } from '@/lib/security';

const registration = credentialsSchema.extend({ registrationCode: z.string().max(256).optional() }).strict();
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    await consumeRateLimit('register-global', 50, 3_600_000);
    await consumeRateLimit(`register:${requestIdentity(req)}`, 10, 3_600_000);
    const { username, password, registrationCode } = registration.parse(await readJson(req, 4096));
    const requiredCode = process.env.REGISTRATION_CODE;
    if (process.env.NODE_ENV === 'production' && !requiredCode) throw new ApiError(403, 'Registration is closed. Contact your teacher.');
    if (requiredCode && !secretsMatch(registrationCode || '', requiredCode)) throw new ApiError(403, 'A valid class registration code is required.');
    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { username, password: hash } });
    return NextResponse.json({ userId: user.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError(new ApiError(409, 'That username is unavailable.'));
    }
    return apiError(error);
  }
}
