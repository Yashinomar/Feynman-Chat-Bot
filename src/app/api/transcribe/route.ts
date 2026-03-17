import { NextRequest, NextResponse } from 'next/server';
import { pipeline } from '@xenova/transformers';

// Keep the model cached in memory so we only load it once
let transcriber: any = null;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const audioArray = body.audio;

        if (!audioArray || !Array.isArray(audioArray)) {
            return NextResponse.json({ error: 'No valid audio Float32Array provided in JSON body' }, { status: 400 });
        }

        console.log("Loading local Whisper model...");
        if (!transcriber) {
            transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
        }

        console.log("Model loaded. Initializing Float32 AudioData...");
        
        // Convert the incoming pure JSON Array back into a Float32Array that Transformers.js natively expects
        const float32Audio = new Float32Array(audioArray);

        console.log("Running local inference...");
        
        // Pass the properly formatted 16kHz Float32Array directly into the AI!
        const output = await transcriber(float32Audio, {
            chunk_length_s: 30, // processes audio in 30 second chunks
        });

        console.log("Inference complete!", output.text);

        return NextResponse.json({ text: output.text });
    } catch (error: any) {
        console.error("Local Transcription error:", error);
        return NextResponse.json({ error: error.message || 'Internal server error during local transcription' }, { status: 500 });
    }
}
