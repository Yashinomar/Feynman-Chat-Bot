import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

export async function POST(req: NextRequest) {
    try {
        const { messages, topic } = await req.json();

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Messages are required' }, { status: 400 });
        }

        const systemInstruction = `
You are an AI acting as an absolute beginner student. The user is using the Feynman technique to teach you about: "${topic}".
Your goals:
1. Act as a curious student. Ask simple clarifying questions, act slightly confused if their explanation is too complex, and prompt them to give analogies or simpler breakdowns.
2. Evaluate their CURRENT mastery of the topic from 0 to 100 based on how well they've explained it so far. 0 means they haven't explained anything, 100 means they explained it perfectly with great analogies and simple language.

You MUST respond with a valid JSON object in the following format:
{
  "reply": "Your response as the student here...",
  "score": <number 0-100>
}
`;

        if (!ai) {
            console.warn("GEMINI_API_KEY not found. Using mock response.");
            const userMessageCount = messages.filter((m: any) => m.role === 'user').length;
            return NextResponse.json({
                reply: "I think I get it a bit better now! So basically it's like " + topic + "? What happens if something goes wrong though? (Note: Mock response. Please add GEMINI_API_KEY to .env)",
                score: Math.min(userMessageCount * 20, 100)
            });
        }

        const contents = messages.map((msg: any) => ({
            role: msg.role === 'ai' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                { role: 'user', parts: [{ text: systemInstruction }] },
                ...contents
            ],
            config: {
                responseMimeType: "application/json",
                temperature: 0.7,
            }
        });

        const responseText = response.text;
        if (!responseText) {
            throw new Error('No response text received from Gemini');
        }

        const parsedResponse = JSON.parse(responseText);

        return NextResponse.json({
            reply: parsedResponse.reply,
            score: parsedResponse.score
        });

    } catch (error) {
        console.error("Chat API Error:", error);
        return NextResponse.json({ error: 'Failed to process chat' }, { status: 500 });
    }
}
