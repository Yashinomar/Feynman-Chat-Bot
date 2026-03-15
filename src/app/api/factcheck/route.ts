import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

// Sticking the API key lookup up here so it doesn't run inside the request loop.
const fallbackEnvKey = process.env.GEMINI_API_KEY;

export async function POST(incomingPostReq: Request) {
  try {
    const rawParsedJson = await incomingPostReq.json();
    const activeDiscussionTopic = rawParsedJson.topic;
    const whatTheUserSaid = rawParsedJson.latestMessage;

    if (!fallbackEnvKey) {
      // In prod we use a Vault but locally this usually means someone forgot to clone the .env
      return NextResponse.json({ error: 'System is missing the Gemini API key.' }, { status: 500 });
    }

    if (!activeDiscussionTopic || !whatTheUserSaid) {
      return NextResponse.json({ error: 'Missing the actual discussion topic or user message in the body.' }, { status: 400 });
    }

    // Ping the Wikipedia API to grab the first 5 sentences for a baseline.
    // Sometimes their API throttles us if we don't encode the URI component properly.
    const wikiEndpoint = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exsentences=5&exlimit=1&titles=${encodeURIComponent(activeDiscussionTopic)}&explaintext=1&format=json`;
    const wikiFetchResponse = await fetch(wikiEndpoint);
    const rawWikiPayload = await wikiFetchResponse.json();
    
    // Wikipedia's API structure is super weird, it nests everything under arbitrary Page IDs
    const wikiPagesTree = rawWikiPayload.query?.pages;
    let truthBaselineText = '';
    
    if (wikiPagesTree) {
      const weirdPageIdKey = Object.keys(wikiPagesTree)[0];
      if (weirdPageIdKey !== '-1') {
        truthBaselineText = wikiPagesTree[weirdPageIdKey].extract;
      }
    }

    if (!truthBaselineText) {
        // If Wikipedia is down or doesn't have an article, just approve it and move on so we don't block the UI
        return NextResponse.json({ isAccurate: true, reason: 'Ground truth check bypassed; no wiki article.' });
    }

    // Fire up the Gemini client for verification
    const checkerAi = new GoogleGenAI({ apiKey: fallbackEnvKey });

    const verificationPromptRules = `
    You are an expert Socratic fact-checker. 
    The user is trying to explain the topic "${activeDiscussionTopic}".
    Here is the official Wikipedia summary of the topic:
    ---
    ${truthBaselineText}
    ---
    Here is the user's latest statement:
    "${whatTheUserSaid}"

    Analyze the user's statement against the Wikipedia summary. 
    If the user's statement contains a blatant factual error, you must return a JSON object with:
    { "isAccurate": false, "correction": "A short, polite 1-sentence correction citing Wikipedia." }
    
    If their statement is generally correct, conceptually sound, or just an opinion/question, return:
    { "isAccurate": true }
    
    ONLY return raw JSON. No markdown wrappings.
    `;

    // Low temp because we want determinism here, not creative hallucination
    const verificationInference = await checkerAi.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: verificationPromptRules }] }],
      config: { temperature: 0.1 }
    });

    const outputEvaluationText = verificationInference.text || '';
    // Gemini still loves wrapping things in markdown fences even when you tell it not to
    const scrubbedJsonData = outputEvaluationText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    try {
      const finalFactAssertion = JSON.parse(scrubbedJsonData);
      return NextResponse.json(finalFactAssertion);
    } catch (parseFault) {
      console.error("The LLM returned garbage JSON that we couldn't parse:", scrubbedJsonData);
      // Fallback is to assume they are correct so the chat doesn't completely die
      return NextResponse.json({ isAccurate: true, error: 'Sanitization failure' });
    }

  } catch (hardSysError: any) {
    console.error('Fatal crash during the background verification ping:', hardSysError);
    return NextResponse.json({ error: hardSysError.message }, { status: 500 });
  }
}
