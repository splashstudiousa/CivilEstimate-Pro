import type { IncomingMessage, ServerResponse } from 'http';

function resolveGeminiApiKey(): { apiKey: string; matchedVar: string | null } {
  const candidates = [
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'VITE_GEMINI_API_KEY',
    'API_KEY',
  ] as const;

  for (const name of candidates) {
    const raw = process.env[name];
    if (typeof raw === 'string') {
      const cleaned = raw.trim().replace(/^["']|["']$/g, '');
      if (cleaned && cleaned !== 'MY_GEMINI_API_KEY') {
        return { apiKey: cleaned, matchedVar: name };
      }
    }
  }
  return { apiKey: '', matchedVar: null };
}

export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  const { apiKey, matchedVar } = resolveGeminiApiKey();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify({
      status: 'ok',
      aiConfigured: Boolean(apiKey),
      matchedEnvVar: matchedVar,
      vercelEnv: process.env.VERCEL_ENV || null,
      runtime: 'vercel-serverless',
    })
  );
}
