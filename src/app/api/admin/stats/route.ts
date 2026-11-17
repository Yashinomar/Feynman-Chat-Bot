import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, apiError } from '@/lib/api';

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const totalUsers = await prisma.user.count();
    const totalSessions = await prisma.session.count();
    
    // Calculate average mastery score across all sessions globally
    const agg = await prisma.session.aggregate({
      _avg: {
        masteryScore: true
      }
    });

    const avgMasteryScore = Math.round(agg._avg.masteryScore || 0);

    // Get a summary of all users and their active sessions
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
        sessions: {
          select: {
            id: true,
            topic: true,
            masteryScore: true,
            updatedAt: true
          },
          orderBy: {
            updatedAt: 'desc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json({
      globalStats: { totalUsers, totalSessions, avgMasteryScore },
      users
    });
  } catch (error) {
    return apiError(error);
  }
}
