import type { ServerResponse } from 'http';
import { analyzeSingleDrawing } from '../src/server/drawingPipelineCore';
import {
  handleApiError,
  readJsonBody,
  sendJson,
  type ServerlessRequest,
} from '../src/server/vercelHttp';

export default async function handler(req: ServerlessRequest, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const body = await readJsonBody<{
      imageBase64?: string;
      mimeType?: string;
      unitSystem?: 'metric' | 'imperial';
      drawingName?: string;
    }>(req);

    const parsed = await analyzeSingleDrawing(body);
    sendJson(res, 200, parsed);
  } catch (err: unknown) {
    console.error('Gemini drawing analysis error:', err);
    handleApiError(res, err, 'Failed to analyze drawing with Gemini AI.');
  }
}
