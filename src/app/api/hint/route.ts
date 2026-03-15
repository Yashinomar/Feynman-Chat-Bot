import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Initialize the assistant bot
const assistantBotClient = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

export async function POST(req: NextRequest) {
    try {
        const studentRequestPayload = await req.json();
        const activeCourseConcept = studentRequestPayload.topic;
        const currentChatLog = studentRequestPayload.messages;
        const currentGrade = studentRequestPayload.score;

        if (!assistantBotClient) {
            console.warn("API KEY MISSING! Returning a hardcoded hint for now so the UI doesn't break.");
            return NextResponse.json({
                hint: `Maybe try breaking down the "how" and "why" of ${activeCourseConcept} using a simple real-world analogy?`
            });
        }

        const helperBotInstruction = `
You are a helpful teaching assistant guiding a student struggling with "${activeCourseConcept}" using the Feynman Technique.
The student's current graded mastery score is ${currentGrade}/100.
They are stuck or asked for a hint. Look at the chat history, and give them ONE specific, concise sentence that serves as a conceptual clue, an analogy, or points out a missing piece of information.
DO NOT just say "what should we explain next?". You need to actually give them a gentle nudge in the right direction without spoon-feeding them the answer.
Return only the sentence. Format it exactly as JSON so my parser doesn't crash:
{ "hint": "Your short hint here." }
`;

        const mappedBotHistory = (currentChatLog || []).map((msgNode: any) => ({
            role: msgNode.role === 'ai' ? 'model' : 'user',
            parts: [{ text: msgNode.content }]
        }));

        const assistantInference = await assistantBotClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                { role: 'user', parts: [{ text: helperBotInstruction }] },
                ...mappedBotHistory
            ],
            config: {
                responseMimeType: "application/json",
                temperature: 0.7, // Higher temp here so hints feel more creative and less robotic
            }
        });

        const rawInferenceString = assistantInference.text;
        if (!rawInferenceString) {
            throw new Error('LLM returned an empty string for the hint request');
        }

        const cleanParsedHint = JSON.parse(rawInferenceString);

        return NextResponse.json({ hint: cleanParsedHint.hint });

    } catch (unexpectedFault) {
        console.error("The hint generation pipeline failed:", unexpectedFault);
        return NextResponse.json({ error: 'Failed to generate a helpful hint from the LLM' }, { status: 500 });
    }
}
