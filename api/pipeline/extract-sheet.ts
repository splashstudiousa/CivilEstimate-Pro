import crypto from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { GoogleGenAI, Type } from '@google/genai';

interface ServerlessReq extends IncomingMessage {
  body?: unknown;
}

interface IncomingSheet {
  id: string;
  name: string;
  fileType: 'pdf' | 'dxf' | 'dwg' | 'image';
  page?: number;
  mimeType?: string;
  imageBase64?: string;
  dxfText?: string;
  pdfExtractedText?: string;
  detectedScaleHint?: string;
  calibratedPixelsPerMeter?: number;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readBody<T>(req: ServerlessReq): Promise<T> {
  try {
    const existing = req.body;
    if (existing !== undefined && existing !== null) {
      if (Buffer.isBuffer(existing)) {
        const str = existing.toString('utf8').trim();
        return (str ? JSON.parse(str) : {}) as T;
      }
      if (typeof existing === 'string') {
        const str = existing.trim();
        return (str ? JSON.parse(str) : {}) as T;
      }
      return existing as T;
    }
  } catch {
    // Fall through to stream reading if req.body getter threw
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return (raw ? JSON.parse(raw) : {}) as T;
}

function resolveGeminiApiKey(): string {
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.VITE_GEMINI_API_KEY,
    process.env.API_KEY,
  ];
  for (const raw of candidates) {
    if (typeof raw === 'string') {
      const cleaned = raw.trim().replace(/^["']|["']$/g, '');
      if (cleaned && cleaned !== 'MY_GEMINI_API_KEY') {
        return cleaned;
      }
    }
  }
  return '';
}

function classifyDxfLayer(layerName: string, drawingType: string) {
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

export default async function handler(req: ServerlessReq, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const body = await readBody<{
      drawingType?: string;
      unitSystem?: 'metric' | 'imperial';
      wallHeightM?: number;
      slabThicknessM?: number;
      steelRatioKgPerM3?: number;
      scaleRatioText?: string;
      sheet?: IncomingSheet;
    }>(req);

    const sheet = body.sheet;
    if (!sheet || !sheet.id || !sheet.name) {
      sendJson(res, 400, { error: 'Missing drawing sheet payload for extraction.' });
      return;
    }

    const drawingType = body.drawingType || 'Architectural Plan';
    const unitSystem = body.unitSystem || 'metric';
    const wallHeightM = Number(body.wallHeightM) || 3.05;
    const slabThicknessM = Number(body.slabThicknessM) || 0.15;
    const steelRatioKgPerM3 = Number(body.steelRatioKgPerM3) || 110;
    let detectedScaleText = body.scaleRatioText || '1:100';
    let detectedUnits: 'm' | 'ft' = unitSystem === 'imperial' ? 'ft' : 'm';

    const rawContent = sheet.dxfText || sheet.imageBase64 || sheet.name;
    const hash = crypto.createHash('sha256').update(rawContent).digest('hex').slice(0, 16);
    const byteSize = Buffer.byteLength(rawContent, 'utf8');
    const immutableHash = {
      sheetId: sheet.id,
      fileName: sheet.name,
      hash,
      byteSize,
      record: {
        hash,
        fileName: sheet.name,
        fileType: sheet.fileType,
        byteSize,
        uploadedAt: new Date().toISOString(),
        immutable: true,
      },
    };

    const elements: Array<Record<string, unknown>> = [];
    const scheduleTables: Array<Record<string, unknown>> = [];
    const layerSummaries: Array<Record<string, unknown>> = [];
    const logs: Array<{ stage: string; detail: string }> = [];

    if (sheet.fileType === 'dwg' && !sheet.dxfText && !sheet.imageBase64) {
      sendJson(res, 422, {
        error: `Binary DWG file "${sheet.name}" requires conversion to ASCII DXF or PDF before extraction.`,
      });
      return;
    }

    if (sheet.fileType === 'dxf' && sheet.dxfText) {
      logs.push({
        stage: 'CAD Extraction',
        detail: `Parsing DXF entities, layers, hatches & blocks for ${sheet.name}...`,
      });
      const mod = await import('dxf-parser');
      const DxfParserCtor = (mod.default || mod) as unknown as new () => {
        parseSync: (s: string) => {
          header?: { $INSUNITS?: number };
          entities?: Array<Record<string, unknown>>;
        } | null;
      };
      const parser = new DxfParserCtor();
      const parsedDxf = parser.parseSync(sheet.dxfText);
      const insunits = parsedDxf?.header?.$INSUNITS;
      let scaleToMeters = 1;
      if (insunits === 1) {
        detectedUnits = 'ft';
        scaleToMeters = 0.0254;
      } else if (insunits === 2) {
        detectedUnits = 'ft';
        scaleToMeters = 0.3048;
      } else if (insunits === 4) {
        detectedUnits = 'm';
        scaleToMeters = 0.001;
      } else if (insunits === 5) {
        detectedUnits = 'm';
        scaleToMeters = 0.01;
      } else {
        detectedUnits = 'm';
        scaleToMeters = 1;
      }

      const layerStats = new Map<
        string,
        {
          lines: number;
          polylines: number;
          closedAreas: number;
          blocks: number;
          len: number;
          area: number;
        }
      >();
      const blockCounts: Record<string, { count: number; layer: string }> = {};

      for (const ent of parsedDxf?.entities || []) {
        const layer = String(ent.layer || '0');
        const st = layerStats.get(layer) || {
          lines: 0,
          polylines: 0,
          closedAreas: 0,
          blocks: 0,
          len: 0,
          area: 0,
        };
        const t = String(ent.type || '');
        if (t === 'LINE' && Array.isArray(ent.vertices) && ent.vertices.length >= 2) {
          const p0 = ent.vertices[0] as { x: number; y: number };
          const p1 = ent.vertices[1] as { x: number; y: number };
          st.lines += 1;
          st.len += Math.hypot(p1.x - p0.x, p1.y - p0.y);
        } else if (
          (t === 'LWPOLYLINE' || t === 'POLYLINE') &&
          Array.isArray(ent.vertices) &&
          ent.vertices.length >= 2
        ) {
          const pts = ent.vertices as Array<{ x: number; y: number }>;
          st.polylines += 1;
          for (let i = 1; i < pts.length; i++) {
            st.len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
          }
          if (Boolean(ent.shape) && pts.length >= 3) {
            let sum = 0;
            for (let i = 0; i < pts.length; i++) {
              const j = (i + 1) % pts.length;
              sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
            }
            st.area += Math.abs(sum) / 2;
            st.closedAreas += 1;
          }
        } else if (t === 'CIRCLE' && typeof ent.radius === 'number') {
          st.closedAreas += 1;
          st.area += Math.PI * ent.radius * ent.radius;
        } else if (t === 'INSERT' && ent.name) {
          const bName = String(ent.name);
          st.blocks += 1;
          if (!blockCounts[bName]) blockCounts[bName] = { count: 0, layer };
          blockCounts[bName].count += 1;
        }
        layerStats.set(layer, st);
      }

      for (const [layerName, st] of layerStats.entries()) {
        const mapped = classifyDxfLayer(layerName, drawingType);
        const lenMeters = st.len * scaleToMeters;
        const areaMetersSq = st.area * scaleToMeters * scaleToMeters;
        layerSummaries.push({
          sheetName: sheet.name,
          layer: layerName,
          lines: st.lines,
          polylines: st.polylines,
          closedAreas: st.closedAreas,
          blocks: st.blocks,
          lengthMeters: Number(lenMeters.toFixed(2)),
          areaMetersSq: Number(areaMetersSq.toFixed(2)),
        });

        if (areaMetersSq > 0.05) {
          const hOrThick =
            mapped.elementType === 'Slab' || mapped.elementType === 'PCC'
              ? slabThicknessM
              : mapped.elementType === 'Footing'
              ? 0.45
              : mapped.unit === 'm³'
              ? wallHeightM
              : 0;
          const grossQty = hOrThick > 0 ? areaMetersSq * hOrThick : areaMetersSq;
          elements.push({
            sheetId: sheet.id,
            sheetName: sheet.name,
            page: sheet.page || 1,
            elementName: `${layerName} (${mapped.elementType} Polygons)`,
            elementType: mapped.elementType,
            category: mapped.category,
            no: Math.max(1, st.closedAreas),
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
            bbox: { xPct: 12, yPct: 12, wPct: 28, hPct: 22 },
            layer: layerName,
            notes: `Parsed from ${st.closedAreas} closed CAD entities on layer ${layerName}.`,
          });
        } else if (lenMeters > 0.2) {
          const isLinear = mapped.unit === 'm';
          const wallBreadth = mapped.elementType === 'Wall' ? 0.23 : 1;
          const wallH = mapped.elementType === 'Wall' ? wallHeightM : 0;
          const qty = isLinear ? lenMeters : lenMeters * wallBreadth * (wallH || 1);
          elements.push({
            sheetId: sheet.id,
            sheetName: sheet.name,
            page: sheet.page || 1,
            elementName: `${layerName} (${mapped.elementType} Runs)`,
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
            bbox: { xPct: 15, yPct: 15, wPct: 30, hPct: 20 },
            layer: layerName,
            notes: `Summed ${st.lines + st.polylines} CAD segments.`,
          });
        }
      }

      for (const [blockName, info] of Object.entries(blockCounts)) {
        const mapped = classifyDxfLayer(`${blockName} ${info.layer}`, drawingType);
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
          bbox: { xPct: 28, yPct: 28, wPct: 12, hPct: 12 },
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

      sendJson(res, 200, {
        immutableHash,
        detectedScaleText,
        detectedUnits,
        elements,
        scheduleTables,
        layerSummaries,
        logs,
      });
      return;
    }

    if (!sheet.imageBase64) {
      sendJson(res, 400, {
        error: `Sheet "${sheet.name}" has no image/rendered canvas payload for extraction.`,
      });
      return;
    }

    const apiKey = resolveGeminiApiKey();
    if (!apiKey) {
      const vercelEnv = process.env.VERCEL_ENV;
      sendJson(res, 503, {
        error: vercelEnv
          ? `No Gemini API key found in Vercel "${vercelEnv}" environment (checked GEMINI_API_KEY, GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, VITE_GEMINI_API_KEY). In Vercel > Project Settings > Environment Variables, ensure GEMINI_API_KEY is enabled for "${vercelEnv}" and trigger a new Redeploy.`
          : 'GEMINI_API_KEY is not configured in environment secrets. Add GEMINI_API_KEY in Settings > Secrets and restart/redeploy to enable AI drawing extraction.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    logs.push({
      stage: 'Vision AI Extraction',
      detail: `Analyzing ${sheet.name} (${drawingType}) with Gemini Vision + OCR/Vector tokens...`,
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
      ? `User calibrated drawing scale: ${sheet.calibratedPixelsPerMeter.toFixed(2)} px per meter (${(sheet.calibratedPixelsPerMeter * 0.3048).toFixed(2)} px per foot).`
      : `Scale hint: ${sheet.detectedScaleHint || body.scaleRatioText || 'Auto-detect from title block / dimension strings'}.`;

    const promptText = `You are a senior Civil Quantity Surveyor & BIM Takeoff Specialist analyzing a "${drawingType}" sheet ("${sheet.name}", Page ${sheet.page || 1}).
${calibContext}
Assumptions when heights/thicknesses are not explicitly printed: wall height = ${wallHeightM} m, slab thickness = ${slabThicknessM} m, default RCC steel = ${steelRatioKgPerM3} kg/m³.
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
      sendJson(res, 502, {
        error: `AI returned an unexpected non-JSON response while analyzing "${sheet.name}". Please retry extraction.`,
      });
      return;
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

    sendJson(res, 200, {
      immutableHash,
      detectedScaleText,
      detectedUnits,
      elements,
      scheduleTables,
      layerSummaries,
      logs,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Drawing sheet extraction failed.';
    sendJson(res, 500, { error: message });
  }
}
