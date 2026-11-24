import type { ServerResponse } from 'http';
import type { ServerlessRequest } from '../src/server/vercelHttp';
import { sendJson } from '../src/server/vercelHttp';

export default function handler(_req: ServerlessRequest, res: ServerResponse): void {
  sendJson(res, 200, {
    status: 'ok',
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    runtime: 'vercel-serverless',
  });
}
