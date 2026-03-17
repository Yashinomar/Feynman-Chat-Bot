import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';


// For saving messages
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { role, content } = body;

    const existingSession = await prisma.session.findUnique({
      where: { id }
    });

    if (!existingSession || existingSession.userId !== session.user.id) {
         return NextResponse.json({ error: 'Session not found or unauthorized' }, { status: 404 });
    }

    const message = await prisma.message.create({
      data: {
        sessionId: id,
        role,
        content
      }
    });

    // Also update the session's updatedAt time
    await prisma.session.update({
        where: { id },
        data: { updatedAt: new Date() }
    });

    return NextResponse.json(message);
  } catch (error) {
    console.error('Error adding message:', error);
    return NextResponse.json({ error: 'Failed to add message' }, { status: 500 });
  }
}
