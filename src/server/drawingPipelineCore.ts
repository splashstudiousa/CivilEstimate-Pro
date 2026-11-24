import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { GoogleGenAI, Type } from '@google/genai';
import { parseDxfDetailed } from '../engine/dxfParser';

export interface ImmutableDrawingRecord {
  hash: string;
  fileName: string;
  fileType: 'pdf' | 'dxf' | 'dwg' | 'image';
  byteSize: number;
  uploadedAt: string;
  immutable: true;
}

export interface IncomingPipelineSheet {
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

export interface PipelineExtractOptions {
  drawingType: string;
  unitSystem: 'metric' | 'imperial';
  wallHeightM: number;
  slabThicknessM: number;
  steelRatioKgPerM3: number;
  scaleRatioText?: string;
}

export interface SingleSheetExtractionResult {
  immutableHash: {
    sheetId: string;
    fileName: string;
    hash: string;
    byteSize: number;
    record: ImmutableDrawingRecord;
  };
  detectedScaleText: string;
  detectedUnits: 'm' | 'ft';
  elements: Array<Record<string, unknown>>;
  scheduleTables: Array<Record<string, unknown>>;
  layerSummaries: Array<Record<string, unknown>>;
  logs: Array<{ stage: string; detail: string }>;
}

export class HttpApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getGeminiClient(): GoogleGenAI | null {
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

function hasBinaryOnPath(bin: string): boolean {
  try {
    execFileSync('which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function computeSheetImmutableRecord(s: IncomingPipelineSheet): {
  sheetId: string;
  fileName: string;
  hash: string;
  byteSize: number;
  record: ImmutableDrawingRecord;
} {
  const rawContent = s.dxfText || s.imageBase64 || s.name;
  const hash = crypto.createHash('sha256').update(rawContent).digest('hex').slice(0, 16);
  const byteSize = Buffer.byteLength(rawContent, 'utf8');
  return {
    sheetId: s.id,
    fileName: s.name,
    hash,
    byteSize,
    record: {
      hash,
      fileName: s.name,
      fileType: s.fileType,
      byteSize,
      uploadedAt: new Date().toISOString(),
      immutable: true,
    },
  };
}

export function classifyDxfLayer(
  layerName: string,
  drawingType: string
): {
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
  if (
    l.includes('pipe') ||
    l.includes('drain') ||
    l.includes('sewer') ||
    drawingType === 'Drainage'
  ) {
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

export async function extractSingleSheet(
  sheet: IncomingPipelineSheet,
  options: PipelineExtractOptions
): Promise<SingleSheetExtractionResult> {
  const immutableHash = computeSheetImmutableRecord(sheet);
  const elements: Array<Record<string, unknown>> = [];
  const scheduleTables: Array<Record<string, unknown>> = [];
  const layerSummaries: Array<Record<string, unknown>> = [];
  const logs: Array<{ stage: string; detail: string }> = [];
  let detectedScaleText = options.scaleRatioText || '1:100';
  let detectedUnits: 'm' | 'ft' = options.unitSystem === 'imperial' ? 'ft' : 'm';

  if (sheet.fileType === 'dwg') {
    const hasDwgTool = hasBinaryOnPath('dwg2dxf') || hasBinaryOnPath('ODAFileConverter');
    if (!hasDwgTool && !sheet.dxfText && !sheet.imageBase64) {
      throw new HttpApiError(
        422,
        `Binary DWG file "${sheet.name}" requires ODA File Converter or LibreDWG (dwg2dxf) on the server, or export as ASCII DXF / PDF.`
      );
    }
  }

  if (sheet.fileType === 'dxf' && sheet.dxfText) {
    logs.push({
      stage: 'CAD Extraction',
      detail: `Parsing DXF entities, layers, hatches & blocks for ${sheet.name}...`,
    });
    const dxf = parseDxfDetailed(sheet.dxfText);
    if (dxf.detectedUnits === 'ft' || dxf.detectedUnits === 'in') {
      detectedUnits = 'ft';
    } else {
      detectedUnits = 'm';
    }
    const extW = Math.max(1e-3, dxf.extents.maxX - dxf.extents.minX);
    const extH = Math.max(1e-3, dxf.extents.maxY - dxf.extents.minY);

    for (const layer of dxf.layers) {
      const mapped = classifyDxfLayer(layer.name, options.drawingType);
      const lenMeters = layer.totalLengthDrawingUnits * dxf.scaleToMeters;
      const areaMetersSq =
        layer.totalAreaDrawingUnitsSq * dxf.scaleToMeters * dxf.scaleToMeters;

      layerSummaries.push({
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
            ? options.slabThicknessM
            : mapped.elementType === 'Footing'
            ? 0.45
            : mapped.unit === 'm³'
            ? options.wallHeightM
            : 0;
        const grossQty = hOrThick > 0 ? areaMetersSq * hOrThick : areaMetersSq;
        elements.push({
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
        const wallBreadth =
          mapped.elementType === 'Wall' ? 0.23 : mapped.elementType === 'Trench' ? 0.9 : 1;
        const wallH =
          mapped.elementType === 'Wall'
            ? options.wallHeightM
            : mapped.elementType === 'Trench'
            ? 1.2
            : 0;
        const qty = isLinear ? lenMeters : lenMeters * wallBreadth * (wallH || 1);
        elements.push({
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

    for (const [blockName, info] of Object.entries(dxf.blockCounts)) {
      const mapped = classifyDxfLayer(`${blockName} ${info.layer}`, options.drawingType);
      const sample = info.sampleCenters[0];
      const bx = sample
        ? Math.max(3, Math.min(85, ((sample.x - dxf.extents.minX) / extW) * 100))
        : 30;
      const by = sample
        ? Math.max(3, Math.min(85, (1 - (sample.y - dxf.extents.minY) / extH) * 100))
        : 30;
      elements.push({
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
      if (
        mapped.elementType === 'Door' ||
        mapped.elementType === 'Window' ||
        mapped.elementType === 'Column'
      ) {
        scheduleTables.push({
          tag: blockName,
          kind: mapped.elementType,
          scheduleCount: info.count,
          dimensionsLabel: 'CAD Block',
          sheetName: sheet.name,
        });
      }
    }

    return {
      immutableHash,
      detectedScaleText,
      detectedUnits,
      elements,
      scheduleTables,
      layerSummaries,
      logs,
    };
  }

  if (!sheet.imageBase64) {
    throw new HttpApiError(
      400,
      `Sheet "${sheet.name}" has no image/rendered canvas payload for extraction.`
    );
  }

  const ai = getGeminiClient();
  if (!ai) {
    throw new HttpApiError(
      503,
      'GEMINI_API_KEY is not configured in environment secrets. Please add GEMINI_API_KEY in Settings > Secrets (or Vercel Environment Variables) to extract quantities from PDF/image drawings.'
    );
  }

  logs.push({
    stage: 'Vision AI Extraction',
    detail: `Analyzing ${sheet.name} (${options.drawingType}) with Gemini Vision + OCR/Vector tokens...`,
  });

  const mimeMatch = sheet.imageBase64.match(/^data:([^;]+);base64,/i);
  const detectedMimeType = mimeMatch ? mimeMatch[1] : sheet.mimeType || 'image/jpeg';
  const cleanBase64 = sheet.imageBase64.includes(',')
    ? sheet.imageBase64.split(',')[1]
    : sheet.imageBase64;

  const vectorContext = sheet.pdfExtractedText
    ? `\nExtracted Vector PDF Text & Dimension Labels:\n${sheet.pdfExtractedText.slice(0, 3500)}`
    : '';

  const calibContext = sheet.calibratedPixelsPerMeter
    ? `User calibrated drawing scale: ${sheet.calibratedPixelsPerMeter.toFixed(2)} px per meter.`
    : `Scale hint: ${sheet.detectedScaleHint || options.scaleRatioText || 'Auto-detect from title block / dimension strings'}.`;

  const promptText = `You are a senior Civil Quantity Surveyor & BIM Takeoff Specialist analyzing a "${options.drawingType}" sheet ("${sheet.name}", Page ${sheet.page || 1}).
${calibContext}
Assumptions when heights/thicknesses are not explicitly printed: wall height = ${options.wallHeightM} m, slab thickness = ${options.slabThicknessM} m, default RCC steel = ${options.steelRatioKgPerM3} kg/m³.
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
            mimeType: detectedMimeType,
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

  const rawJsonText = (response.text ?? '{}')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  let parsed: {
    detectedScaleText?: string;
    detectedUnits?: string;
    elements?: Array<Record<string, unknown>>;
    scheduleTables?: Array<Record<string, unknown>>;
  };
  try {
    parsed = JSON.parse(rawJsonText);
  } catch {
    throw new HttpApiError(
      502,
      `AI returned an unexpected non-JSON response while analyzing "${sheet.name}". Please retry extraction.`
    );
  }

  if (parsed.detectedScaleText) detectedScaleText = parsed.detectedScaleText;
  if (parsed.detectedUnits?.toLowerCase().includes('ft')) detectedUnits = 'ft';

  for (const rawEl of parsed.elements || []) {
    elements.push({
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
    scheduleTables.push({
      ...rawSch,
      sheetName: sheet.name,
    });
  }

  return {
    immutableHash,
    detectedScaleText,
    detectedUnits,
    elements,
    scheduleTables,
    layerSummaries,
    logs,
  };
}

export async function analyzeSingleDrawing(params: {
  imageBase64?: string;
  mimeType?: string;
  unitSystem?: 'metric' | 'imperial';
  drawingName?: string;
}): Promise<Record<string, unknown>> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new HttpApiError(
      503,
      'GEMINI_API_KEY is not configured in environment secrets. Please configure GEMINI_API_KEY in Settings > Secrets (or Vercel Environment Variables) to use AI drawing extraction.'
    );
  }

  const { imageBase64, mimeType, unitSystem, drawingName } = params;
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    throw new HttpApiError(400, 'Missing imageBase64 payload for drawing analysis.');
  }

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
  return JSON.parse(rawText) as Record<string, unknown>;
}

export async function transcribeSiteAudio(params: {
  audioBase64?: string;
  mimeType?: string;
  fieldContext?: string;
}): Promise<{ text: string; model: string }> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new HttpApiError(
      503,
      'GEMINI_API_KEY is not configured in Settings > Secrets. Please configure GEMINI_API_KEY to use Gemini voice transcription.'
    );
  }

  const { audioBase64, mimeType, fieldContext } = params;
  if (!audioBase64 || typeof audioBase64 !== 'string') {
    throw new HttpApiError(400, 'Missing audioBase64 payload for transcription.');
  }

  const cleanBase64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
  if (!cleanBase64 || cleanBase64.length < 32) {
    throw new HttpApiError(400, 'Recorded audio clip was empty or too short to transcribe.');
  }

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
    throw new HttpApiError(
      422,
      'No clear speech was detected in the recording. Please speak closer to the microphone and try again.'
    );
  }

  return {
    text: transcript,
    model: 'gemini-3.5-transcribe',
  };
}
