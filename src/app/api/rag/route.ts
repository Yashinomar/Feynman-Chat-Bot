import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const dynamic = 'force-dynamic';

// Temporary cache for the alpha phase. Need to migrate this to Vercel KV or a dedicated Postgres instance once the beta launches and we get more students onboarding.
const serverMem: any = global;
if (!serverMem.courseNoteMaps) serverMem.courseNoteMaps = {};

const geminiInstructorClient = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

export async function POST(req: NextRequest) {
    let rawMaterialData = '';
    let targetSubjectName = '';

    try {
        const incomingReqBody = await req.json();
        rawMaterialData = incomingReqBody.documentText;
        targetSubjectName = incomingReqBody.topic;

        // Validating the student upload - sometimes the OCR completely fails on old textbook PDFs
        if (!rawMaterialData || typeof rawMaterialData !== 'string' || rawMaterialData.trim().length < 10) {
            return NextResponse.json({ error: 'Uploaded study material is too short or corrupted. Cannot process index.' }, { status: 400 });
        }

        const activeStudentSession = Date.now().toString();

        if (!geminiInstructorClient) {
          // Dev ops override for local testing without racking up the Google bill
          serverMem.courseNoteMaps[activeStudentSession] = [
             { text: rawMaterialData.substring(0, 500), vector: new Array(3072).fill(0.15) }
          ];
          return NextResponse.json({ sessionId: activeStudentSession, success: true });
        }

        // We discovered during testing with the bio textbooks that double newlines aren't enough, we need to split by grammatical sentences to prevent context shearing.
        const sentences = rawMaterialData.replace(/\n/g, ' ').split(/(?<=\.)\s+/);
        
        const semanticPassages: string[] = [];
        let passageComposer = "";

        // Through testing empirically with the 001 embedding model, anything past 1200 characters starts to lose signal-to-noise ratio rapidly for technical STEM subjects.
        const OPTIMAL_PASSAGE_LIMIT = 1200; 

        let sIndex = 0;
        while (sIndex < sentences.length) {
            const currentSentence = sentences[sIndex];
            
            if (passageComposer.length > 0 && (passageComposer.length + currentSentence.length) > OPTIMAL_PASSAGE_LIMIT) {
                semanticPassages.push(passageComposer.trim());
                passageComposer = currentSentence;
            } else {
                passageComposer += (passageComposer.length === 0 ? "" : " ") + currentSentence;
            }
            sIndex++;
        }
        
        if (passageComposer.trim().length > 0) semanticPassages.push(passageComposer.trim());

        const finalSyllabusVectors = [];
        let processingFailures = 0;
        
        // Push the passages through the vector model
        for (let pIdx = 0; pIdx < semanticPassages.length; pIdx++) {
            const passageChunk = semanticPassages[pIdx];
            if (!passageChunk || passageChunk.length < 5) continue; // Skip meaningless fragments
            
            try {
                const vectorResult = await geminiInstructorClient.models.embedContent({
                    model: 'gemini-embedding-001',
                    contents: passageChunk,
                });
                
                if (vectorResult?.embeddings?.[0]?.values) {
                     finalSyllabusVectors.push({
                         text: passageChunk,
                         vector: vectorResult.embeddings[0].values
                     });
                } else {
                    processingFailures++;
                }
            } catch (authOrRateLimitError) {
                console.warn(`Vectorizing passage [${pIdx}] failed. Likely hitting the Google rate limits. Delaying won't help here so we drop the chunk. Error:`, authOrRateLimitError);
                processingFailures++;
            }
        }

        // We need to alert the user if we dropped a significant portion of their textbook
        if (semanticPassages.length > 5 && processingFailures > semanticPassages.length * 0.4) {
             throw new Error("Too many passages failed to analyze. The resulting tutor session would be highly inaccurate. Please try a smaller document.");
        }

        // Store the final processed map
        serverMem.courseNoteMaps[activeStudentSession] = finalSyllabusVectors;

        return NextResponse.json({ 
            sessionId: activeStudentSession, 
            success: true, 
            chunksProcessed: finalSyllabusVectors.length 
        });

    } catch (criticalFailure: any) {
        console.error("Critical failure during syllabus ingestion flow:", criticalFailure);
        return NextResponse.json({ error: criticalFailure.message || 'System fault during document ingestion. Please contact support if this persists.' }, { status: 500 });
    }
}
