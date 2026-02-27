import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

export async function POST(req: NextRequest) {
    try {
        const { topic, messages, score } = await req.json();

        if (!ai) {
            console.warn("GEMINI_API_KEY not found. Using mock hint.");
            return NextResponse.json({
                hint: `Try explaining the "how" and "why" of ${topic} using a simple analogy.`
            });
        }

        const systemInstruction = `
You are a tutor observing a student explaining the topic "${topic}" to a beginner. 
The current mastery score evaluated by the system is ${score}/100.
Based on the chat history, what is ONE specific, concise sentence suggesting what the student should try to explain next to improve their explanation?
Provide only the sentence, no extra text. Format as JSON:
{ "hint": "Your short hint here." }
`;

        const contents = (messages || []).map((msg: any) => ({
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
            throw new Error('No hint received from Gemini');
        }

        const parsedResponse = JSON.parse(responseText);

        return NextResponse.json({ hint: parsedResponse.hint });

    } catch (error) {
        console.error("Hint API Error:", error);
        return NextResponse.json({ error: 'Failed to generate hint' }, { status: 500 });
    }
}
