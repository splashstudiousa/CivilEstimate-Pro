import type { IncomingMessage, ServerResponse } from 'http';
import { GoogleGenAI, Type } from '@google/genai';

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
          : 'GEMINI_API_KEY is not configured in environment secrets. Please configure GEMINI_API_KEY in Settings > Secrets to use AI drawing extraction.',
      });
      return;
    }

    const { imageBase64, mimeType, unitSystem, drawingName } = await readBody<{
      imageBase64?: string;
      mimeType?: string;
      unitSystem?: 'metric' | 'imperial';
      drawingName?: string;
    }>(req);

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      sendJson(res, 400, { error: 'Missing imageBase64 payload for drawing analysis.' });
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

    const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/i);
    const resolvedMime = mimeMatch ? mimeMatch[1] : mimeType || 'image/jpeg';
    const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const targetUnit = unitSystem === 'imperial' ? 'ft' : 'm';

    const promptText = `You are a senior civil quantity surveyor analyzing an architectural or structural drawing (${drawingName || 'Uploaded Drawing'}).
Extract measurable building elements, room dimensions, wall runs, and schedules (doors, windows, columns, footings, stairs) visible on this drawing.
Convert all dimensions into ${targetUnit === 'ft' ? 'feet (decimal ft)' : 'meters (decimal m)'}.
For each detected item, provide:
- label: concise name (e.g., "Living Room Floor", "External Brick Wall Grid A-D", "2-Panel Window W1", "Main Entrance Door D1")
- kind: one of "room_area", "wall_length", "opening_count", "structural_element"
- suggestedCategory: one of "Earthwork", "PCC", "RCC", "Masonry", "Plaster", "Flooring", "Painting", "Doors & Windows", "Roofing", "Plumbing", "Electrical", "Miscellaneous"
- count: numeric count (e.g. 1 for a room, 2 for two identical windows)
- length: decimal length in ${targetUnit}
- breadth: decimal breadth/thickness in ${targetUnit} (use 0 if linear or count)
- height: decimal height/depth in ${targetUnit} (use 0 if 2D area only, or standard 3.0m / 10ft wall height if wall)
- unit: "m²" or "m³" or "m" or "No." (or "ft²", "ft³", "ft", "No." if imperial)
- confidence: number between 0 and 1
- notes: short engineering note explaining where on the drawing it was read from.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: resolvedMime,
              data: cleanBase64,
            },
          },
          { text: promptText },
        ],
      },
      config: {
        systemInstruction:
          'Return accurate, conservative quantity takeoff suggestions directly grounded in visible dimension labels and symbols in the drawing. Do not invent elements not supported by the image.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            drawingScaleDetected: {
              type: Type.STRING,
              description: 'Detected drawing scale text such as 1:50 or 1:100 if visible.',
            },
            summary: {
              type: Type.STRING,
              description: 'Brief 1-sentence engineering summary of the drawing.',
            },
            suggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  kind: { type: Type.STRING },
                  suggestedCategory: { type: Type.STRING },
                  count: { type: Type.NUMBER },
                  length: { type: Type.NUMBER },
                  breadth: { type: Type.NUMBER },
                  height: { type: Type.NUMBER },
                  unit: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
                  notes: { type: Type.STRING },
                },
              },
            },
          },
        },
      },
    });

    const rawText = (response.text ?? '{}')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    sendJson(res, 200, JSON.parse(rawText));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to analyze drawing with Gemini AI.';
    sendJson(res, 500, { error: message });
  }
}
