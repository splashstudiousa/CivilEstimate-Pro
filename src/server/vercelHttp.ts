import type { IncomingMessage, ServerResponse } from 'http';
import { HttpApiError } from './drawingPipelineCore';

export interface ServerlessRequest extends IncomingMessage {
  body?: unknown;
}

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export async function readJsonBody<T = Record<string, unknown>>(
  req: ServerlessRequest
): Promise<T> {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      return (req.body ? JSON.parse(req.body) : {}) as T;
    }
    return req.body as T;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {} as T;
  }
  return JSON.parse(raw) as T;
}

export function handleApiError(res: ServerResponse, err: unknown, fallbackMessage: string): void {
  const status = err instanceof HttpApiError ? err.status : 500;
  const message = err instanceof Error ? err.message : fallbackMessage;
  sendJson(res, status, { error: message });
}
