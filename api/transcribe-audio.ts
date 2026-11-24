import type { ServerResponse } from 'http';
import { transcribeSiteAudio } from '../src/server/drawingPipelineCore';
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
      audioBase64?: string;
      mimeType?: string;
      fieldContext?: string;
    }>(req);

    const result = await transcribeSiteAudio(body);
    sendJson(res, 200, result);
  } catch (err: unknown) {
    console.error('Gemini audio transcription error:', err);
    handleApiError(res, err, 'Failed to transcribe site audio recording.');
  }
}
