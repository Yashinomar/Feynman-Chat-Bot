import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessions = await prisma.session.findMany({
      where: { userId: session.user.id as string },
      include: { messages: true },
      orderBy: { updatedAt: 'desc' }
    });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { topic, isRagSession, studentLevel, studentBehavior, messages } = body;

    const newDbSession = await prisma.session.create({
      data: {
        userId: session.user.id as string,
        topic,
        isRagSession: isRagSession || false,
        studentLevel: studentLevel || 'highschool',
        studentBehavior: studentBehavior || 'curious',
        messages: {
          create: messages.map((m: any) => ({
            role: m.role,
            content: m.content
          }))
        }
      },
      include: { messages: true }
    });

    return NextResponse.json(newDbSession);
  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}
