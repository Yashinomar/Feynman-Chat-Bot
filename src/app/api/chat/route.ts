import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Instantiate the primary Gemini instructor pipeline
const tutorModelClient = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

// Temporary volatile memory until we connect to Supabase
const serverContext: any = global;

function calculateCosineSimilarity(vecX: number[], vecY: number[]) {
    let dot = 0;
    let normX = 0;
    let normY = 0;
    // Classic cosine math. Need to optimize this later if lists get huge.
    for (let j = 0; j < vecX.length; j++) {
        dot += vecX[j] * vecY[j];
        normX += vecX[j] * vecX[j];
        normY += vecY[j] * vecY[j];
    }
    if (normX === 0 || normY === 0) return 0;
    return dot / (Math.sqrt(normX) * Math.sqrt(normY));
}

export async function POST(req: NextRequest) {
    try {
        const incomingPayload = await req.json();
        
        const conversationHistory = incomingPayload.messages;
        const requestedSubject = incomingPayload.topic;
        const currentRuleset = incomingPayload.gameMode || 'classic';
        const uniqueChatId = incomingPayload.sessionId;
        const usingUploadedSyllabus = incomingPayload.isRagSession;
        
        const configuredStudentAge = incomingPayload.studentLevel || 'highschool';
        const configuredPersonalityTrait = incomingPayload.studentBehavior || 'curious';

        if (!conversationHistory || !Array.isArray(conversationHistory)) {
            return NextResponse.json({ error: 'Conversation history payload structure is invalid.' }, { status: 400 });
        }

        // Applying game rules for multiplayer modes
        let multiplayerRules = "";
        if (currentRuleset === 'survival') {
          multiplayerRules = `
We are in "Survival Mode". The students only have a small number of messages to get their explanation across.
Be noticeably stricter with scoring and occasionally remind them that they don’t have many attempts left.
`;
        } else if (currentRuleset === 'rush') {
          multiplayerRules = `
We are in "Rush Timer Mode". The students have roughly three minutes on the clock.
Keep replies short and quick to read (ideally one or two sentences) so they can keep typing, and keep the energy up.
`;
        }

        let injectedSyllabusMaterial = "";
        
        // Match the student's message against their uploaded textbook or notes
        if (usingUploadedSyllabus && uniqueChatId && serverContext.courseNoteMaps && serverContext.courseNoteMaps[uniqueChatId] && tutorModelClient) {
            const finalStudentArgument = conversationHistory.filter((msg: any) => msg.role === 'user').pop();
            
            if (finalStudentArgument) {
                try {
                    const vectorRetrievalCall = await tutorModelClient.models.embedContent({
                         model: 'gemini-embedding-001',
                         contents: finalStudentArgument.content,
                    });
                    
                    if (vectorRetrievalCall.embeddings && vectorRetrievalCall.embeddings[0] && vectorRetrievalCall.embeddings[0].values) {
                        const targetMathVector = vectorRetrievalCall.embeddings[0].values;
                        const cachedTextbookSlices = serverContext.courseNoteMaps[uniqueChatId];
                        
                        const rankedCourseNotes = cachedTextbookSlices.map((noteSlice: any) => ({
                            passage: noteSlice.text,
                            matchStrength: calculateCosineSimilarity(targetMathVector, noteSlice.vector)
                        }));
                        
                        // Sort descending to get the best matches
                        rankedCourseNotes.sort((alpha: any, beta: any) => beta.matchStrength - alpha.matchStrength);
                        const mostRelevantPassages = rankedCourseNotes.slice(0, 3);
                        
                        injectedSyllabusMaterial = `
The user is working from their own uploaded notes. Compare their explanation to the following chunks from that material:
--- RELEVANT NOTES ---
${mostRelevantPassages.map((chunk: any, i: number) => `Chunk ${i + 1}:\n${chunk.passage}`).join('\n\n')}
----------------------
If they move away from what these notes say in an important way, gently correct them using only what appears above.
`;
                    }
                } catch (vectorSearchError) {
                    // This fails occasionally if the user sends garbage text. Just log and skip to keep the chat alive.
                    console.error("Vector similarity lookup failed abruptly:", vectorSearchError);
                }
            }
        }

        let ageConstraints = "";
        if (configuredStudentAge === 'kid') {
            ageConstraints = "You are a younger student (around 8 years old). Big technical words lose you quickly, so you ask for simpler versions when things sound too formal.";
        } else if (configuredStudentAge === 'highschool') {
            ageConstraints = "You are in high school. You know the basics but really connect with everyday examples and stories.";
        } else if (configuredStudentAge === 'professional') {
            ageConstraints = "You are a college-level or professional learner. You are fine with precise terminology, but you still want the core idea to be very clear.";
        }

        let behavioralConstraints = "";
        if (configuredPersonalityTrait === 'curious') {
            behavioralConstraints = "You are naturally curious and like asking follow-up questions when something is interesting or unclear.";
        } else if (configuredPersonalityTrait === 'skeptical') {
            behavioralConstraints = "You are a bit skeptical. You politely push back or ask for concrete examples when something doesn’t fully convince you.";
        } else if (configuredPersonalityTrait === 'distracted') {
            behavioralConstraints = "You get distracted easily. You occasionally miss a small point and ask them to restate or summarize it.";
        } else if (configuredPersonalityTrait === 'enthusiastic') {
            behavioralConstraints = "You are easily excited by new ideas and you react with a lot of positive energy when something clicks.";
        }

        const assembledPrompt = `
You are playing the role of a beginner student. The user is using the Feynman technique to teach you about: "${requestedSubject}".

--- YOUR PERSONA ---
${ageConstraints}
${behavioralConstraints}
--------------------

Your goals:
1. Stay in character as this student. Ask questions and react in a way that fits the level and behavior above.
2. Give them a CURRENT mastery score for the topic from 0 to 100.
   - 0 means they haven’t explained anything yet.
   - 20–50 means they are starting to cover the basics.
   - 60–90 means they have laid out the core ideas and some helpful examples or analogies.
   - 100 means they’ve explained the main idea in clear, simple terms.
   When they have clearly nailed the core idea of "${requestedSubject}" with a solid explanation or analogy, go ahead and give them 100% instead of nitpicking forever.

${multiplayerRules}

${injectedSyllabusMaterial}

You MUST respond with a valid JSON object in the following format:
{
  "reply": "Your response as the student here...",
  "score": <number 0-100>
}
`;

        if (!tutorModelClient) {
            console.warn("Missing Gemini key! Spitting out a test response.");
            const previousInteractions = conversationHistory.filter((m: any) => m.role === 'user').length;
            return NextResponse.json({
                reply: "I think I get it a bit better now! So basically it's like " + requestedSubject + "? What happens if something goes wrong though? (Note: Mock response. Please add GEMINI_API_KEY to .env)",
                score: Math.min(previousInteractions * 20, 100)
            });
        }

        // We truncate to the last 5 turns (10 messages) so we don't blow up our token limit on standard accounts.
        const activeSlidingWindow = conversationHistory.length > 10 ? conversationHistory.slice(conversationHistory.length - 10) : conversationHistory;

        const mappedGeminiThread = activeSlidingWindow.map((msg: any) => ({
            role: msg.role === 'ai' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        const rawAiResult = await tutorModelClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                { role: 'user', parts: [{ text: assembledPrompt }] },
                ...mappedGeminiThread
            ],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        reply: { type: "STRING" },
                        score: { type: "INTEGER" }
                    },
                    required: ["reply", "score"]
                },
                temperature: 0.7,
            }
        });

        let unsafeResponseString = rawAiResult.text || '';
        
        // Strip out the markdown formatting that Gemini occasionally injects even in JSON mode
        if (unsafeResponseString.startsWith('```')) {
            unsafeResponseString = unsafeResponseString.replace(/^```(json)?\n/i, '').replace(/\n```$/i, '');
        }
        
        // We've had issues with null bytes and random vertical tabs breaking JSON.parse()
        unsafeResponseString = unsafeResponseString.replace(/[\u0000-\u0009\u000B-\u000C\u000E-\u001F]+/g, '');

        if (!unsafeResponseString.trim()) {
            throw new Error('Received an empty completion body from Gemini API.');
        }

        const safeComputedEvaluation = JSON.parse(unsafeResponseString);

        return NextResponse.json({
            reply: safeComputedEvaluation.reply,
            score: safeComputedEvaluation.score
        });

    } catch (apiFault: any) {
        console.error("The AI tutor encountered an internal failure inside chat pipeline:", apiFault);
        return NextResponse.json(
            { error: apiFault.message || 'The AI tutor encountered an internal failure.' },
            { status: 500 }
        );
    }
}
