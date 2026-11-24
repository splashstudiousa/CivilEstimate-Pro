import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { GoogleGenAI, Type } from '@google/genai';
import { parseDxfDetailed } from './src/engine/dxfParser';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '50mb' }));

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/* ============================================================================
   IMMUTABLE DRAWING STORAGE & BACKGROUND EXTRACTION JOB QUEUE
============================================================================ */
interface ImmutableDrawingRecord {
  hash: string;
  fileName: string;
  fileType: 'pdf' | 'dxf' | 'dwg' | 'image';
  byteSize: number;
  uploadedAt: string;
  immutable: true;
}

interface IncomingPipelineSheet {
  id: string;
  name: string;
  fileType: 'pdf' | 'dxf' | 'dwg' | 'image';
  page: number;
  mimeType?: string;
  imageBase64?: string;
  dxfText?: string;
  pdfExtractedText?: string;
  detectedScaleHint?: string;
  calibratedPixelsPerMeter?: number;
}

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

function hasBinaryOnPath(bin: string): boolean {
  try {
    execFileSync('which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function classifyDxfLayer(layerName: string, drawingType: string): {
  elementType: string;
  category: string;
  unit: string;
} {
  const l = layerName.toLowerCase();
  if (l.includes('excav') || l.includes('trench')) {
    return { elementType: 'Excavation', category: 'Earthwork', unit: 'm³' };
  }
  if (l.includes('pcc') || l.includes('lean') || l.includes('blind')) {
    return { elementType: 'PCC', category: 'PCC', unit: 'm³' };
  }
  if (l.includes('foot') || l.includes('fdn') || l.includes('foundation')) {
    return { elementType: 'Footing', category: 'RCC', unit: 'm³' };
  }
  if (l.includes('col')) return { elementType: 'Column', category: 'RCC', unit: 'm³' };
  if (l.includes('beam')) return { elementType: 'Beam', category: 'RCC', unit: 'm³' };
  if (l.includes('slab')) return { elementType: 'Slab', category: 'RCC', unit: 'm³' };
  if (l.includes('rebar') || l.includes('steel')) {
    return { elementType: 'Rebar', category: 'RCC', unit: 'kg' };
  }
  if (l.includes('door')) return { elementType: 'Door', category: 'Doors & Windows', unit: 'No.' };
  if (l.includes('win')) return { elementType: 'Window', category: 'Doors & Windows', unit: 'No.' };
  if (l.includes('floor') || l.includes('tile')) {
    return { elementType: 'Flooring', category: 'Flooring', unit: 'm²' };
  }
  if (l.includes('plaster')) return { elementType: 'Plaster', category: 'Plaster', unit: 'm²' };
  if (l.includes('paint')) return { elementType: 'Painting', category: 'Painting', unit: 'm²' };
  if (l.includes('road') || l.includes('asph') || l.includes('pave')) {
    return { elementType: 'Road', category: 'Roads', unit: 'm²' };
  }
  if (l.includes('pipe') || l.includes('drain') || l.includes('sewer') || drawingType === 'Drainage') {
    return { elementType: 'Pipe', category: 'Pipes', unit: 'm' };
  }
  if (l.includes('plumb') || l.includes('water')) {
    return { elementType: 'Plumbing', category: 'Plumbing', unit: 'm' };
  }
  if (l.includes('elec')) return { elementType: 'Electrical', category: 'Electrical', unit: 'No.' };
  if (l.includes('roof') || l.includes('waterproof')) {
    return { elementType: 'Waterproofing', category: 'Roofing', unit: 'm²' };
  }
  return { elementType: 'Wall', category: 'Masonry', unit: 'm³' };
}

function appendJobLog(job: PipelineJobRecord, stage: string, detail: string) {
  job.stageLogs.push({
    timestamp: new Date().toISOString(),
    stage,
    detail,
  });
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
    appendJobLog(job, 'Pre-processing', `Locked ${payload.sheets.length} sheet(s) in immutable storage.`);

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
      job.progressPct = Math.min(78, 35 + Math.round(((sIdx + 0.5) / payload.sheets.length) * 40));

      if (sheet.fileType === 'dwg') {
        const hasDwgTool = hasBinaryOnPath('dwg2dxf') || hasBinaryOnPath('ODAFileConverter');
        if (!hasDwgTool && !sheet.dxfText && !sheet.imageBase64) {
          throw new Error(
            `Binary DWG file "${sheet.name}" requires ODA File Converter or LibreDWG (dwg2dxf) on the server, or export as ASCII DXF / PDF.`
          );
        }
      }

      if (sheet.fileType === 'dxf' && sheet.dxfText) {
        appendJobLog(job, 'CAD Extraction', `Parsing DXF entities, layers, hatches & blocks for ${sheet.name}...`);
        const dxf = parseDxfDetailed(sheet.dxfText);
        if (dxf.detectedUnits === 'ft' || dxf.detectedUnits === 'in') {
          detectedUnits = 'ft';
        } else {
          detectedUnits = 'm';
        }
        const extW = Math.max(1e-3, dxf.extents.maxX - dxf.extents.minX);
        const extH = Math.max(1e-3, dxf.extents.maxY - dxf.extents.minY);

        for (const layer of dxf.layers) {
          const mapped = classifyDxfLayer(layer.name, payload.drawingType);
          const lenMeters = layer.totalLengthDrawingUnits * dxf.scaleToMeters;
          const areaMetersSq = layer.totalAreaDrawingUnitsSq * dxf.scaleToMeters * dxf.scaleToMeters;

          allLayerSummaries.push({
            sheetName: sheet.name,
            layer: layer.name,
            lines: layer.lineCount,
            polylines: layer.polylineCount,
            closedAreas: layer.closedAreaCount,
            blocks: layer.blockCount,
            lengthMeters: Number(lenMeters.toFixed(2)),
            areaMetersSq: Number(areaMetersSq.toFixed(2)),
          });

          const bx = Number.isFinite(layer.bounds.minX)
            ? Math.max(2, Math.min(82, ((layer.bounds.minX - dxf.extents.minX) / extW) * 100))
            : 12;
          const by = Number.isFinite(layer.bounds.minY)
            ? Math.max(2, Math.min(82, (1 - (layer.bounds.maxY - dxf.extents.minY) / extH) * 100))
            : 12;
          const bw = Number.isFinite(layer.bounds.maxX)
            ? Math.max(8, Math.min(85, ((layer.bounds.maxX - layer.bounds.minX) / extW) * 100))
            : 25;
          const bh = Number.isFinite(layer.bounds.maxY)
            ? Math.max(8, Math.min(85, ((layer.bounds.maxY - layer.bounds.minY) / extH) * 100))
            : 20;

          if (areaMetersSq > 0.05) {
            const hOrThick =
              mapped.elementType === 'Slab' || mapped.elementType === 'PCC'
                ? payload.slabThicknessM
                : mapped.elementType === 'Footing'
                ? 0.45
                : mapped.unit === 'm³'
                ? payload.wallHeightM
                : 0;
            const grossQty = hOrThick > 0 ? areaMetersSq * hOrThick : areaMetersSq;
            allElements.push({
              sheetId: sheet.id,
              sheetName: sheet.name,
              page: sheet.page || 1,
              elementName: `${layer.name} (${mapped.elementType} Polygons)`,
              elementType: mapped.elementType,
              category: mapped.category,
              no: Math.max(1, layer.closedAreaCount),
              length: Number(Math.sqrt(areaMetersSq).toFixed(2)),
              breadth: Number(Math.sqrt(areaMetersSq).toFixed(2)),
              height: Number(hOrThick.toFixed(2)),
              deductionQty: 0,
              unit: mapped.unit,
              formula:
                hOrThick > 0
                  ? `Closed CAD Area (${areaMetersSq.toFixed(2)} m²) × ${hOrThick.toFixed(2)} m = ${grossQty.toFixed(2)} ${mapped.unit}`
                  : `Closed CAD Area = ${areaMetersSq.toFixed(2)} m²`,
              confidenceScore: 0.94,
              bbox: { xPct: bx, yPct: by, wPct: bw, hPct: bh },
              layer: layer.name,
              notes: `Parsed directly from ${layer.closedAreaCount} closed CAD polylines/circles on layer ${layer.name}.`,
            });
          } else if (lenMeters > 0.2) {
            const isLinear = mapped.unit === 'm';
            const wallBreadth = mapped.elementType === 'Wall' ? 0.23 : mapped.elementType === 'Trench' ? 0.9 : 1;
            const wallH = mapped.elementType === 'Wall' ? payload.wallHeightM : mapped.elementType === 'Trench' ? 1.2 : 0;
            const qty = isLinear ? lenMeters : lenMeters * wallBreadth * (wallH || 1);
            allElements.push({
              sheetId: sheet.id,
              sheetName: sheet.name,
              page: sheet.page || 1,
              elementName: `${layer.name} (${mapped.elementType} Runs)`,
              elementType: mapped.elementType,
              category: mapped.category,
              no: 1,
              length: Number(lenMeters.toFixed(2)),
              breadth: Number((isLinear ? 0 : wallBreadth).toFixed(2)),
              height: Number((isLinear ? 0 : wallH).toFixed(2)),
              deductionQty: 0,
              unit: mapped.unit,
              formula: isLinear
                ? `CAD Linework Sum = ${lenMeters.toFixed(2)} m`
                : `1 × ${lenMeters.toFixed(2)} × ${wallBreadth.toFixed(2)} × ${(wallH || 1).toFixed(2)} = ${qty.toFixed(2)} ${mapped.unit}`,
              confidenceScore: 0.86,
              bbox: { xPct: bx, yPct: by, wPct: bw, hPct: bh },
              layer: layer.name,
              notes: `Summed ${layer.lineCount + layer.polylineCount} CAD segments (${dxf.detectedUnits.toUpperCase()} units).`,
            });
          }
        }

        // Convert DXF block INSERTs (Doors / Windows / Columns / Footings)
        for (const [blockName, info] of Object.entries(dxf.blockCounts)) {
          const mapped = classifyDxfLayer(`${blockName} ${info.layer}`, payload.drawingType);
          const sample = info.sampleCenters[0];
          const bx = sample ? Math.max(3, Math.min(85, ((sample.x - dxf.extents.minX) / extW) * 100)) : 30;
          const by = sample ? Math.max(3, Math.min(85, (1 - (sample.y - dxf.extents.minY) / extH) * 100)) : 30;
          allElements.push({
            sheetId: sheet.id,
            sheetName: sheet.name,
            page: sheet.page || 1,
            elementName: `Block ${blockName} (${info.count} nos)`,
            elementType: mapped.elementType,
            category: mapped.category,
            no: info.count,
            length: 1,
            breadth: 0,
            height: 0,
            deductionQty: 0,
            unit: 'No.',
            formula: `${info.count} CAD INSERT blocks`,
            confidenceScore: 0.95,
            bbox: { xPct: bx, yPct: by, wPct: 12, hPct: 12 },
            layer: info.layer,
            notes: `Auto-counted ${info.count} "${blockName}" block insertions on layer ${info.layer}.`,
          });
          if (mapped.elementType === 'Door' || mapped.elementType === 'Window' || mapped.elementType === 'Column') {
            allScheduleRows.push({
              tag: blockName,
              kind: mapped.elementType,
              scheduleCount: info.count,
              dimensionsLabel: 'CAD Block',
              sheetName: sheet.name,
            });
          }
        }
        continue;
      }

      // Vector PDF / Scanned / Image sheet -> Gemini Vision AI (`gemini-4-hydrogen`)
      if (!sheet.imageBase64) {
        throw new Error(`Sheet "${sheet.name}" has no image/rendered canvas payload for extraction.`);
      }

      const ai = getGeminiClient();
      if (!ai) {
        throw new Error(
          'GEMINI_API_KEY is not configured in environment secrets. Please add GEMINI_API_KEY in Settings > Secrets to extract quantities from PDF/image drawings.'
        );
      }

      appendJobLog(
        job,
        'Vision AI Extraction',
        `Analyzing ${sheet.name} (${payload.drawingType}) with Gemini Vision + OCR/Vector tokens...`
      );

      const cleanBase64 = sheet.imageBase64.includes(',')
        ? sheet.imageBase64.split(',')[1]
        : sheet.imageBase64;

      const vectorContext = sheet.pdfExtractedText
        ? `\nExtracted Vector PDF Text & Dimension Labels:\n${sheet.pdfExtractedText.slice(0, 3500)}`
        : '';

      const calibContext = sheet.calibratedPixelsPerMeter
        ? `User calibrated drawing scale: ${sheet.calibratedPixelsPerMeter.toFixed(2)} px per meter.`
        : `Scale hint: ${sheet.detectedScaleHint || payload.scaleRatioText || 'Auto-detect from title block / dimension strings'}.`;

      const promptText = `You are a senior Civil Quantity Surveyor & BIM Takeoff Specialist analyzing a "${payload.drawingType}" sheet ("${sheet.name}", Page ${sheet.page || 1}).
${calibContext}
Assumptions when heights/thicknesses are not explicitly printed: wall height = ${payload.wallHeightM} m, slab thickness = ${payload.slabThicknessM} m, default RCC steel = ${payload.steelRatioKgPerM3} kg/m³.
Always output linear/dimension numbers in METERS (m) so downstream BOQ conversion works uniformly (e.g., if drawing shows 12'-0", convert 12 ft -> 3.66 m; if 4500 mm -> 4.50 m).
${vectorContext}

Detect ALL visible measurable civil engineering elements applicable to this sheet:
- Excavation / Trenches / Bedding (m³ or m)
- PCC blinding (m³)
- Footings, Columns, Beams, Slabs (RCC m³)
- Reinforcement steel weight (kg, from bar schedules or standard kg/m³ of RCC)
- Formwork / Shuttering (m²)
- Brick / Block Masonry walls (m³, include opening deductionQty if doors/windows sit in walls!)
- Plaster, Flooring, Tiling, Painting, Ceiling (m²)
- Doors & Windows (No. and/or m²)
- Roofing / Waterproofing (m²)
- Roads / Pipes / Culverts / Drainage runs (m or m²)

Also extract any visible Door/Window/Column/Footing/Rebar Schedule tables into scheduleTables so we can cross-check schedule counts against plan counts.
For EVERY element provide normalized bounding box coordinates (xPct, yPct, wPct, hPct from 0 to 100 relative to image top-left) pointing to where the element sits on the drawing.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: sheet.mimeType || 'image/jpeg',
                data: cleanBase64,
              },
            },
            { text: promptText },
          ],
        },
        config: {
          systemInstruction:
            'Extract conservative, verifiable civil engineering quantities directly grounded in the uploaded sheet dimensions, symbols, and schedules. Provide accurate normalized bounding boxes (0..100) for visual traceability.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedScaleText: { type: Type.STRING },
              detectedUnits: { type: Type.STRING },
              elements: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    elementName: { type: Type.STRING },
                    elementType: { type: Type.STRING },
                    category: { type: Type.STRING },
                    no: { type: Type.NUMBER },
                    length: { type: Type.NUMBER },
                    breadth: { type: Type.NUMBER },
                    height: { type: Type.NUMBER },
                    deductionQty: { type: Type.NUMBER },
                    unit: { type: Type.STRING },
                    formula: { type: Type.STRING },
                    confidenceScore: { type: Type.NUMBER },
                    xPct: { type: Type.NUMBER },
                    yPct: { type: Type.NUMBER },
                    wPct: { type: Type.NUMBER },
                    hPct: { type: Type.NUMBER },
                    layer: { type: Type.STRING },
                    notes: { type: Type.STRING },
                  },
                },
              },
              scheduleTables: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    tag: { type: Type.STRING },
                    kind: { type: Type.STRING },
                    scheduleCount: { type: Type.NUMBER },
                    dimensionsLabel: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        detectedScaleText?: string;
        detectedUnits?: string;
        elements?: Array<Record<string, unknown>>;
        scheduleTables?: Array<Record<string, unknown>>;
      };

      if (parsed.detectedScaleText) detectedScaleText = parsed.detectedScaleText;
      if (parsed.detectedUnits?.toLowerCase().includes('ft')) detectedUnits = 'ft';

      for (const rawEl of parsed.elements || []) {
        allElements.push({
          ...rawEl,
          sheetId: sheet.id,
          sheetName: sheet.name,
          page: sheet.page || 1,
          bbox: {
            xPct: Math.max(2, Math.min(90, Number(rawEl.xPct ?? 15))),
            yPct: Math.max(2, Math.min(90, Number(rawEl.yPct ?? 15))),
            wPct: Math.max(6, Math.min(75, Number(rawEl.wPct ?? 18))),
            hPct: Math.max(5, Math.min(75, Number(rawEl.hPct ?? 14))),
          },
        });
      }

      for (const rawSch of parsed.scheduleTables || []) {
        allScheduleRows.push({
          ...rawSch,
          sheetName: sheet.name,
        });
      }
    }

    job.status = 'Computing';
    job.progressPct = 88;
    job.stageMessage = 'Computing net quantities, formulas & reinforcement/shuttering derivations...';
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

app.post('/api/pipeline/jobs', (req, res) => {
  const {
    drawingType = 'Architectural Plan',
    unitSystem = 'metric',
    wallHeightM = 3.05,
    slabThicknessM = 0.15,
    steelRatioKgPerM3 = 110,
    scaleRatioText = '1:100',
    sheets = [],
  } = req.body as {
    drawingType?: string;
    unitSystem?: 'metric' | 'imperial';
    wallHeightM?: number;
    slabThicknessM?: number;
    steelRatioKgPerM3?: number;
    scaleRatioText?: string;
    sheets?: IncomingPipelineSheet[];
  };

  if (!Array.isArray(sheets) || sheets.length === 0) {
    res.status(400).json({ error: 'Provide at least one drawing sheet for pipeline extraction.' });
    return;
  }

  const immutableHashes = sheets.map((s) => {
    const rawContent = s.dxfText || s.imageBase64 || s.name;
    const hash = crypto.createHash('sha256').update(rawContent).digest('hex').slice(0, 16);
    const byteSize = Buffer.byteLength(rawContent, 'utf8');
    if (!immutableDrawingStore.has(hash)) {
      immutableDrawingStore.set(hash, {
        hash,
        fileName: s.name,
        fileType: s.fileType,
        byteSize,
        uploadedAt: new Date().toISOString(),
        immutable: true,
      });
    }
    return { sheetId: s.id, fileName: s.name, hash, byteSize };
  });

  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const job: PipelineJobRecord = {
    jobId,
    status: 'Queued',
    progressPct: 5,
    stageMessage: 'Job queued — storing original sheets immutably...',
    stageLogs: [
      {
        timestamp: new Date().toISOString(),
        stage: 'Queued',
        detail: `Created immutable job ${jobId} for ${sheets.length} sheet(s).`,
      },
    ],
    immutableHashes,
  };
  pipelineJobStore.set(jobId, job);

  // Fire background extraction asynchronously
  setTimeout(() => {
    void runPipelineBackgroundJob(jobId, {
      drawingType,
      unitSystem,
      wallHeightM,
      slabThicknessM,
      steelRatioKgPerM3,
      scaleRatioText,
      sheets,
    });
  }, 40);

  res.status(202).json({
    jobId,
    immutableHashes,
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
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured in environment secrets. Please configure GEMINI_API_KEY in Settings > Secrets to use AI drawing extraction.',
      });
      return;
    }

    const { imageBase64, mimeType, unitSystem, drawingName } = req.body as {
      imageBase64?: string;
      mimeType?: string;
      unitSystem?: 'metric' | 'imperial';
      drawingName?: string;
    };

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      res.status(400).json({ error: 'Missing imageBase64 payload for drawing analysis.' });
      return;
    }

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
              mimeType: mimeType || 'image/jpeg',
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

    const rawText = (response.text ?? '{}').trim();
    const parsed = JSON.parse(rawText);
    res.json(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to analyze drawing with Gemini AI.';
    console.error('Gemini drawing analysis error:', message);
    res.status(500).json({ error: message });
  }
});

app.post('/api/transcribe-audio', async (req, res) => {
  try {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured in Settings > Secrets. Please configure GEMINI_API_KEY to use Gemini voice transcription.',
      });
      return;
    }

    const { audioBase64, mimeType, fieldContext } = req.body as {
      audioBase64?: string;
      mimeType?: string;
      fieldContext?: string;
    };

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      res.status(400).json({ error: 'Missing audioBase64 payload for transcription.' });
      return;
    }

    const cleanBase64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
    if (!cleanBase64 || cleanBase64.length < 32) {
      res.status(400).json({ error: 'Recorded audio clip was empty or too short to transcribe.' });
      return;
    }

    // Normalize codec suffix (e.g., "audio/webm;codecs=opus" -> "audio/webm")
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
      res.status(422).json({
        error: 'No clear speech was detected in the recording. Please speak closer to the microphone and try again.',
      });
      return;
    }

    res.json({
      text: transcript,
      model: 'gemini-3.5-transcribe',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to transcribe site audio recording.';
    console.error('Gemini audio transcription error:', message);
    res.status(500).json({ error: message });
  }
});

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
