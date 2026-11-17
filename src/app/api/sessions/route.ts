import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, readJson, requireUser } from '@/lib/api';
import { createSessionSchema } from '@/lib/validation';
import { generateLearningPath } from '@/lib/learning-path';

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const sessions = await prisma.session.findMany({
      where: { userId: user.id }, include: { messages: { orderBy: { sequence: 'asc' } } },
      orderBy: { updatedAt: 'desc' }, take: 200,
    });
    return NextResponse.json(sessions);
  } catch (error) { return apiError(error); }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req, 'sessions-create', 10);
    const data = createSessionSchema.parse(await readJson(req, 4096));
    const path = await generateLearningPath(data.topic, data.studentLevel);
    const session = await prisma.$transaction(async tx => {
      if (await tx.session.count({ where: { userId: user.id } }) >= 200) throw new ApiError(409, 'You have 200 sessions. Delete an old session before creating another.');
      return tx.session.create({ data: {
        ...data, userId: user.id, learningPath: JSON.stringify(path),
        messages: { create: { role: 'ai', sequence: 0, content: `Let’s explore ${data.topic}. Explain the main idea in your own words, as if to a friend who is new to it.` } },
      }, include: { messages: { orderBy: { sequence: 'asc' } } } });
    });
    return NextResponse.json(session, { status: 201 });
  } catch (error) { return apiError(error); }
}
