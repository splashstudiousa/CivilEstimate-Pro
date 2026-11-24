import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import {
  analyzeSingleDrawing,
  computeSheetImmutableRecord,
  extractSingleSheet,
  HttpApiError,
  transcribeSiteAudio,
  type ImmutableDrawingRecord,
  type IncomingPipelineSheet,
} from './src/server/drawingPipelineCore';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '50mb' }));

interface PipelineJobRecord {
  jobId: string;
  status:
    | 'Queued'
    | 'Pre-processing'
    | 'Extracting'
    | 'Computing'
    | 'Validating'
    | 'Completed'
    | 'Failed';
  progressPct: number;
  stageMessage: string;
  stageLogs: Array<{ timestamp: string; stage: string; detail: string }>;
  immutableHashes: Array<{ sheetId: string; fileName: string; hash: string; byteSize: number }>;
  error?: string;
  result?: {
    detectedScaleText: string;
    detectedUnits: 'm' | 'ft';
    elements: Array<Record<string, unknown>>;
    scheduleTables: Array<Record<string, unknown>>;
    layerSummaries: Array<Record<string, unknown>>;
  };
}

const immutableDrawingStore = new Map<string, ImmutableDrawingRecord>();
const pipelineJobStore = new Map<string, PipelineJobRecord>();
const pendingPipelinePayloads = new Map<
  string,
  {
    drawingType: string;
    unitSystem: 'metric' | 'imperial';
    wallHeightM: number;
    slabThicknessM: number;
    steelRatioKgPerM3: number;
    scaleRatioText: string;
    sheets: IncomingPipelineSheet[];
  }
>();

function appendJobLog(job: PipelineJobRecord, stage: string, detail: string) {
  job.stageLogs.push({
    timestamp: new Date().toISOString(),
    stage,
    detail,
  });
}

function registerImmutableSheetHash(s: IncomingPipelineSheet) {
  const { sheetId, fileName, hash, byteSize, record } = computeSheetImmutableRecord(s);
  if (!immutableDrawingStore.has(hash)) {
    immutableDrawingStore.set(hash, record);
  }
  return { sheetId, fileName, hash, byteSize };
}

async function runPipelineBackgroundJob(
  jobId: string,
  payload: {
    drawingType: string;
    unitSystem: 'metric' | 'imperial';
    wallHeightM: number;
    slabThicknessM: number;
    steelRatioKgPerM3: number;
    scaleRatioText?: string;
    sheets: IncomingPipelineSheet[];
  }
) {
  const job = pipelineJobStore.get(jobId);
  if (!job) return;

  try {
    job.status = 'Pre-processing';
    job.progressPct = 15;
    job.stageMessage = `Validating ${payload.sheets.length} immutable drawing sheet(s) & detecting units...`;
    appendJobLog(
      job,
      'Pre-processing',
      `Locked ${payload.sheets.length} sheet(s) in immutable storage.`
    );

    await new Promise((r) => setTimeout(r, 180));

    const allElements: Array<Record<string, unknown>> = [];
    const allScheduleRows: Array<Record<string, unknown>> = [];
    const allLayerSummaries: Array<Record<string, unknown>> = [];
    let detectedScaleText = payload.scaleRatioText || '1:100';
    let detectedUnits: 'm' | 'ft' = payload.unitSystem === 'imperial' ? 'ft' : 'm';

    job.status = 'Extracting';
    job.progressPct = 35;
    job.stageMessage = 'Running CAD geometry parser / Vector PDF & Gemini Vision extraction...';

    for (let sIdx = 0; sIdx < payload.sheets.length; sIdx++) {
      const sheet = payload.sheets[sIdx];
      job.progressPct = Math.min(
        78,
        35 + Math.round(((sIdx + 0.5) / payload.sheets.length) * 40)
      );

      const sheetRes = await extractSingleSheet(sheet, {
        drawingType: payload.drawingType,
        unitSystem: payload.unitSystem,
        wallHeightM: payload.wallHeightM,
        slabThicknessM: payload.slabThicknessM,
        steelRatioKgPerM3: payload.steelRatioKgPerM3,
        scaleRatioText: payload.scaleRatioText,
      });

      if (!immutableDrawingStore.has(sheetRes.immutableHash.hash)) {
        immutableDrawingStore.set(sheetRes.immutableHash.hash, sheetRes.immutableHash.record);
      }
      for (const l of sheetRes.logs) {
        appendJobLog(job, l.stage, l.detail);
      }
      detectedScaleText = sheetRes.detectedScaleText || detectedScaleText;
      detectedUnits = sheetRes.detectedUnits || detectedUnits;
      allElements.push(...sheetRes.elements);
      allScheduleRows.push(...sheetRes.scheduleTables);
      allLayerSummaries.push(...sheetRes.layerSummaries);
    }

    job.status = 'Computing';
    job.progressPct = 88;
    job.stageMessage =
      'Computing net quantities, formulas & reinforcement/shuttering derivations...';
    appendJobLog(
      job,
      'Quantity Calculation',
      `Extracted ${allElements.length} candidate elements across ${payload.sheets.length} sheet(s).`
    );

    await new Promise((r) => setTimeout(r, 150));

    job.status = 'Validating';
    job.progressPct = 96;
    job.stageMessage = 'Finalizing confidence badges, coordinates & schedule checks...';

    job.status = 'Completed';
    job.progressPct = 100;
    job.stageMessage = `Completed extraction: ${allElements.length} elements ready for engineer review.`;
    job.result = {
      detectedScaleText,
      detectedUnits,
      elements: allElements,
      scheduleTables: allScheduleRows,
      layerSummaries: allLayerSummaries,
    };
  } catch (err: unknown) {
    job.status = 'Failed';
    job.progressPct = 100;
    const msg = err instanceof Error ? err.message : 'Drawing extraction pipeline failed.';
    job.error = msg;
    job.stageMessage = msg;
    appendJobLog(job, 'Error', msg);
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', aiConfigured: Boolean(process.env.GEMINI_API_KEY) });
});

app.post('/api/pipeline/extract-sheet', async (req, res) => {
  try {
    const {
      drawingType = 'Architectural Plan',
      unitSystem = 'metric',
      wallHeightM = 3.05,
      slabThicknessM = 0.15,
      steelRatioKgPerM3 = 110,
      scaleRatioText = '1:100',
      sheet,
    } = req.body as {
      drawingType?: string;
      unitSystem?: 'metric' | 'imperial';
      wallHeightM?: number;
      slabThicknessM?: number;
      steelRatioKgPerM3?: number;
      scaleRatioText?: string;
      sheet?: IncomingPipelineSheet;
    };

    if (!sheet || !sheet.id || !sheet.name) {
      res.status(400).json({ error: 'Missing drawing sheet payload for extraction.' });
      return;
    }

    const result = await extractSingleSheet(sheet, {
      drawingType,
      unitSystem,
      wallHeightM: Number(wallHeightM) || 3.05,
      slabThicknessM: Number(slabThicknessM) || 0.15,
      steelRatioKgPerM3: Number(steelRatioKgPerM3) || 110,
      scaleRatioText,
    });
    if (!immutableDrawingStore.has(result.immutableHash.hash)) {
      immutableDrawingStore.set(result.immutableHash.hash, result.immutableHash.record);
    }
    res.json(result);
  } catch (err: unknown) {
    const status = err instanceof HttpApiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Drawing sheet extraction failed.';
    res.status(status).json({ error: message });
  }
});

app.post('/api/pipeline/jobs', (req, res) => {
  const {
    drawingType = 'Architectural Plan',
    unitSystem = 'metric',
    wallHeightM = 3.05,
    slabThicknessM = 0.15,
    steelRatioKgPerM3 = 110,
    scaleRatioText = '1:100',
    sheets = [],
    deferred = false,
  } = req.body as {
    drawingType?: string;
    unitSystem?: 'metric' | 'imperial';
    wallHeightM?: number;
    slabThicknessM?: number;
    steelRatioKgPerM3?: number;
    scaleRatioText?: string;
    sheets?: IncomingPipelineSheet[];
    deferred?: boolean;
  };

  if (!deferred && (!Array.isArray(sheets) || sheets.length === 0)) {
    res.status(400).json({ error: 'Provide at least one drawing sheet for pipeline extraction.' });
    return;
  }

  const safeSheets = Array.isArray(sheets) ? sheets : [];
  const immutableHashes = safeSheets.map(registerImmutableSheetHash);

  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const job: PipelineJobRecord = {
    jobId,
    status: 'Queued',
    progressPct: 5,
    stageMessage: deferred
      ? 'Job initialized — receiving immutable drawing sheets...'
      : 'Job queued — storing original sheets immutably...',
    stageLogs: [
      {
        timestamp: new Date().toISOString(),
        stage: 'Queued',
        detail: deferred
          ? `Initialized batch job ${jobId}; uploading drawing sheets individually.`
          : `Created immutable job ${jobId} for ${safeSheets.length} sheet(s).`,
      },
    ],
    immutableHashes,
  };
  pipelineJobStore.set(jobId, job);

  if (deferred) {
    pendingPipelinePayloads.set(jobId, {
      drawingType,
      unitSystem,
      wallHeightM,
      slabThicknessM,
      steelRatioKgPerM3,
      scaleRatioText,
      sheets: [...safeSheets],
    });
  } else {
    setTimeout(() => {
      void runPipelineBackgroundJob(jobId, {
        drawingType,
        unitSystem,
        wallHeightM,
        slabThicknessM,
        steelRatioKgPerM3,
        scaleRatioText,
        sheets: safeSheets,
      });
    }, 40);
  }

  res.status(202).json({
    jobId,
    immutableHashes,
    status: job.status,
  });
});

app.post('/api/pipeline/jobs/:jobId/sheets', (req, res) => {
  const job = pipelineJobStore.get(req.params.jobId);
  const pending = pendingPipelinePayloads.get(req.params.jobId);
  if (!job || !pending) {
    res.status(404).json({ error: 'Pending pipeline job not found or already started.' });
    return;
  }
  const { sheet } = req.body as { sheet?: IncomingPipelineSheet };
  if (!sheet || !sheet.id || !sheet.name) {
    res.status(400).json({ error: 'Invalid drawing sheet payload.' });
    return;
  }
  const hashRec = registerImmutableSheetHash(sheet);
  pending.sheets.push(sheet);
  job.immutableHashes.push(hashRec);
  appendJobLog(job, 'Queued', `Locked immutable sheet "${sheet.name}" (SHA-256: ${hashRec.hash}).`);
  res.json({
    immutableHash: hashRec,
    totalSheets: pending.sheets.length,
  });
});

app.post('/api/pipeline/jobs/:jobId/start', (req, res) => {
  const job = pipelineJobStore.get(req.params.jobId);
  const pending = pendingPipelinePayloads.get(req.params.jobId);
  if (!job || !pending) {
    res.status(404).json({ error: 'Pending pipeline job not found or already started.' });
    return;
  }
  if (pending.sheets.length === 0) {
    res.status(400).json({ error: 'Provide at least one drawing sheet before starting extraction.' });
    return;
  }
  pendingPipelinePayloads.delete(req.params.jobId);
  job.stageMessage = `Queued ${pending.sheets.length} immutable sheet(s) for extraction...`;
  setTimeout(() => {
    void runPipelineBackgroundJob(req.params.jobId, pending);
  }, 40);
  res.status(202).json({
    jobId: job.jobId,
    immutableHashes: job.immutableHashes,
    status: job.status,
  });
});

app.get('/api/pipeline/jobs/:jobId', (req, res) => {
  const job = pipelineJobStore.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Pipeline job not found or expired.' });
    return;
  }
  res.json(job);
});

app.get('/api/pipeline/files/:hash', (req, res) => {
  const rec = immutableDrawingStore.get(req.params.hash);
  if (!rec) {
    res.status(404).json({ error: 'Immutable file record not found.' });
    return;
  }
  res.json(rec);
});

app.post('/api/analyze-drawing', async (req, res) => {
  try {
    const parsed = await analyzeSingleDrawing(req.body || {});
    res.json(parsed);
  } catch (err: unknown) {
    const status = err instanceof HttpApiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Failed to analyze drawing with Gemini AI.';
    console.error('Gemini drawing analysis error:', message);
    res.status(status).json({ error: message });
  }
});

app.post('/api/transcribe-audio', async (req, res) => {
  try {
    const result = await transcribeSiteAudio(req.body || {});
    res.json(result);
  } catch (err: unknown) {
    const status = err instanceof HttpApiError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Failed to transcribe site audio recording.';
    console.error('Gemini audio transcription error:', message);
    res.status(status).json({ error: message });
  }
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Requested API route was not found.' });
});

app.use(
  '/api',
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    const status =
      typeof err === 'object' &&
      err !== null &&
      'status' in err &&
      typeof (err as { status: unknown }).status === 'number'
        ? (err as { status: number }).status
        : 500;
    const message =
      err instanceof Error
        ? err.message
        : 'Unexpected server error while processing API request.';
    res.status(status).json({ error: message });
  }
);

async function startServer() {
  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CivilEstimate Pro server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
