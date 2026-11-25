import type { IncomingMessage, ServerResponse } from 'http';

export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify({
      status: 'ok',
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
      runtime: 'vercel-serverless',
    })
  );
}
