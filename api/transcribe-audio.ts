import type { IncomingMessage, ServerResponse } from 'http';
import { GoogleGenAI } from '@google/genai';

interface ServerlessReq extends IncomingMessage {
  body?: unknown;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readBody<T>(req: ServerlessReq): Promise<T> {
  try {
    const existing = req.body;
    if (existing !== undefined && existing !== null) {
      if (Buffer.isBuffer(existing)) {
        const str = existing.toString('utf8').trim();
        return (str ? JSON.parse(str) : {}) as T;
      }
      if (typeof existing === 'string') {
        const str = existing.trim();
        return (str ? JSON.parse(str) : {}) as T;
      }
      return existing as T;
    }
  } catch {
    // Fall through to stream reading
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return (raw ? JSON.parse(raw) : {}) as T;
}

export default async function handler(req: ServerlessReq, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const apiKey = [
      process.env.GEMINI_API_KEY,
      process.env.GOOGLE_API_KEY,
      process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      process.env.VITE_GEMINI_API_KEY,
      process.env.API_KEY,
    ]
      .map((v) => (typeof v === 'string' ? v.trim().replace(/^["']|["']$/g, '') : ''))
      .find((v) => v && v !== 'MY_GEMINI_API_KEY');

    if (!apiKey) {
      const vercelEnv = process.env.VERCEL_ENV;
      sendJson(res, 503, {
        error: vercelEnv
          ? `No Gemini API key found in Vercel "${vercelEnv}" environment (checked GEMINI_API_KEY, GOOGLE_API_KEY, VITE_GEMINI_API_KEY). Ensure it is enabled for "${vercelEnv}" and click Redeploy.`
          : 'GEMINI_API_KEY is not configured in Settings > Secrets. Please configure GEMINI_API_KEY to use Gemini voice transcription.',
      });
      return;
    }

    const { audioBase64, mimeType, fieldContext } = await readBody<{
      audioBase64?: string;
      mimeType?: string;
      fieldContext?: string;
    }>(req);

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      sendJson(res, 400, { error: 'Missing audioBase64 payload for transcription.' });
      return;
    }

    const cleanBase64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
    if (!cleanBase64 || cleanBase64.length < 32) {
      sendJson(res, 400, { error: 'Recorded audio clip was empty or too short to transcribe.' });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const normalizedMime = (mimeType || 'audio/webm').split(';')[0].trim().toLowerCase();
    const contextHint = fieldContext
      ? `The civil site engineer is dictating for the "${fieldContext}" section of a construction daily progress report.`
      : 'The civil site engineer is dictating notes for a construction daily progress report.';

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: normalizedMime,
              data: cleanBase64,
            },
          },
          {
            text: `${contextHint} Transcribe the spoken audio accurately into clean, properly punctuated engineering text. Preserve construction units, concrete grades, bar sizes, grid references, and material quantities accurately (for example: m³, CFT, mm, kg, OPC, Fe-500D, Grid A-C). Return only the transcribed text with no extra commentary or markdown wrappers.`,
          },
        ],
      },
    });

    const transcript = (response.text ?? '').trim();
    if (!transcript) {
      sendJson(res, 422, {
        error: 'No clear speech was detected in the recording. Please speak closer to the microphone and try again.',
      });
      return;
    }

    sendJson(res, 200, {
      text: transcript,
      model: 'gemini-3.5-transcribe',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to transcribe site audio recording.';
    sendJson(res, 500, { error: message });
  }
}
