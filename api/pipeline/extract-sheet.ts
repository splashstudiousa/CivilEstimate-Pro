import type { ServerResponse } from 'http';
import {
  extractSingleSheet,
  HttpApiError,
  type IncomingPipelineSheet,
} from '../../src/server/drawingPipelineCore';
import {
  handleApiError,
  readJsonBody,
  sendJson,
  type ServerlessRequest,
} from '../../src/server/vercelHttp';

export default async function handler(req: ServerlessRequest, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const body = await readJsonBody<{
      drawingType?: string;
      unitSystem?: 'metric' | 'imperial';
      wallHeightM?: number;
      slabThicknessM?: number;
      steelRatioKgPerM3?: number;
      scaleRatioText?: string;
      sheet?: IncomingPipelineSheet;
    }>(req);

    if (!body.sheet || !body.sheet.id || !body.sheet.name) {
      throw new HttpApiError(400, 'Missing drawing sheet payload for extraction.');
    }

    const result = await extractSingleSheet(body.sheet, {
      drawingType: body.drawingType || 'Architectural Plan',
      unitSystem: body.unitSystem || 'metric',
      wallHeightM: Number(body.wallHeightM) || 3.05,
      slabThicknessM: Number(body.slabThicknessM) || 0.15,
      steelRatioKgPerM3: Number(body.steelRatioKgPerM3) || 110,
      scaleRatioText: body.scaleRatioText || '1:100',
    });

    sendJson(res, 200, result);
  } catch (err: unknown) {
    handleApiError(res, err, 'Drawing sheet extraction failed.');
  }
}
