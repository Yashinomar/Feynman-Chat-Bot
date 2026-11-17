import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { apiError, ApiError, readJson, requireUser } from '@/lib/api';
import { behaviorSchema, embedTexts, levelSchema, topicSchema } from '@/lib/ai';
import { chunkDocument } from '@/lib/rag';
import { generateLearningPath } from '@/lib/learning-path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const uploadSchema = z.object({
  documentText: z.string().max(60000),
  topic: topicSchema,
  studentLevel: levelSchema.default('highschool'),
  studentBehavior: behaviorSchema.default('curious'),
}).strict();

export async function POST(req: Request) {
  try {
    const user = await requireUser(req, 'rag', 4, 3600000);
    const input = uploadSchema.parse(await readJson(req, 250000));
    const chunks = chunkDocument(input.documentText);
    if (await prisma.session.count({ where: { userId: user.id } }) >= 200) {
      throw new ApiError(409, 'You have reached 200 study sessions. Delete an old session before uploading more notes.');
    }
    // Index the complete document before creating anything. A partial index is never advertised as usable.
    const vectors = await embedTexts(chunks);
    const path = await generateLearningPath(input.topic, input.studentLevel, input.documentText);
    const session = await prisma.$transaction(async transaction => {
      if (await transaction.session.count({ where: { userId: user.id } }) >= 200) {
        throw new ApiError(409, 'You have reached 200 study sessions. Delete an old session before uploading more notes.');
      }
      return transaction.session.create({
        data: {
          userId: user.id,
          topic: input.topic,
          studentLevel: input.studentLevel,
          studentBehavior: input.studentBehavior,
          isRagSession: true,
          learningPath: JSON.stringify(path),
          messages: { create: {
            role: 'ai', sequence: 0,
            content: `Your notes for ${input.topic} are ready. Explain one key idea, and I will use relevant passages to ask questions.`,
          } },
          noteChunks: { create: chunks.map((text, position) => ({ text, position, embedding: JSON.stringify(vectors[position]) })) },
        },
        include: { messages: { orderBy: { sequence: 'asc' } } },
      });
    });
    return NextResponse.json({ sessionId: session.id, session, success: true, chunksProcessed: chunks.length }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
