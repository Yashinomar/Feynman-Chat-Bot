import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const dynamic = 'force-dynamic';

const geminiInstructorClient = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { topic } = body;

        if (!topic || typeof topic !== 'string') {
            return NextResponse.json({ error: 'Topic is required.' }, { status: 400 });
        }

        if (!geminiInstructorClient) {
            // Mock response for quick dev/testing without an API key
            return NextResponse.json({
                questions: Array(10).fill(null).map((_, i) => ({
                    question: `Sample Question ${i + 1} about ${topic}?`,
                    options: ['Option A', 'Option B', 'Option C', 'Option D'],
                    answer: 'Option A'
                }))
            });
        }

        const prompt = `Generate exactly 10 multiple-choice questions about the topic "${topic}". 
Each question must have exactly 4 options and clearly indicate the correct answer.
Return the result strictly as a JSON object with a single "questions" array.
Do not include markdown blocks, backticks, or any other formatting outside the JSON.

Expected JSON schema:
{
  "questions": [
    {
      "question": "The question text?",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "answer": "Option 2"
    }
  ]
}`;

        const response = await geminiInstructorClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                temperature: 0.7,
            }
        });

        const rawText = response.text;
        if (!rawText) {
             throw new Error("No response text from Gemini");
        }

        // Clean up markdown wrapping if present
        const jsonString = rawText.replace(/```json\n?|\n?```/gi, '').trim();
        
        const parsedContext = JSON.parse(jsonString);

        if (!parsedContext.questions || !Array.isArray(parsedContext.questions) || parsedContext.questions.length !== 10) {
            throw new Error("Invalid output format from Gemini");
        }

        return NextResponse.json(parsedContext);

    } catch (error: any) {
        console.error("Quiz API Generation Error:", error);
        return NextResponse.json({ error: error.message || 'Failed to generate quiz.' }, { status: 500 });
    }
}
