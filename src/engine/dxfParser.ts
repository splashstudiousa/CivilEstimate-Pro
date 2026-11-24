import DxfParser from 'dxf-parser';
import { DxfEntity, Point2D } from '../types/estimate';

export interface DxfLayerSummary {
  name: string;
  lineCount: number;
  polylineCount: number;
  closedAreaCount: number;
  blockCount: number;
  textCount: number;
  dimensionCount: number;
  totalLengthDrawingUnits: number;
  totalAreaDrawingUnitsSq: number;
  sampleTexts: string[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface DetailedDxfSummary {
  entities: DxfEntity[];
  layers: DxfLayerSummary[];
  detectedUnits: 'm' | 'ft' | 'mm' | 'in';
  scaleToMeters: number;
  extents: { minX: number; minY: number; maxX: number; maxY: number };
  blockCounts: Record<string, { count: number; layer: string; sampleCenters: Point2D[] }>;
  texts: Array<{ text: string; layer: string; x: number; y: number }>;
}

function polyLength(pts: Point2D[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

function polyArea(pts: Point2D[]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Parses ASCII DXF files using dxf-parser with geometric layer summaries,
 * $INSUNITS unit detection, block counts, and bounding extents.
 */
export function parseDxfDetailed(dxfContent: string): DetailedDxfSummary {
  const entities: DxfEntity[] = [];
  const layerMap = new Map<string, DxfLayerSummary>();
  const blockCounts: Record<string, { count: number; layer: string; sampleCenters: Point2D[] }> = {};
  const texts: Array<{ text: string; layer: string; x: number; y: number }> = [];

  let detectedUnits: 'm' | 'ft' | 'mm' | 'in' = 'm';
  let scaleToMeters = 1;

  const ensureLayer = (name: string): DxfLayerSummary => {
    const key = name || '0';
    let existing = layerMap.get(key);
    if (!existing) {
      existing = {
        name: key,
        lineCount: 0,
        polylineCount: 0,
        closedAreaCount: 0,
        blockCount: 0,
        textCount: 0,
        dimensionCount: 0,
        totalLengthDrawingUnits: 0,
        totalAreaDrawingUnitsSq: 0,
        sampleTexts: [],
        bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      };
      layerMap.set(key, existing);
    }
    return existing;
  };

  const expandBounds = (ls: DxfLayerSummary, x: number, y: number) => {
    ls.bounds.minX = Math.min(ls.bounds.minX, x);
    ls.bounds.minY = Math.min(ls.bounds.minY, y);
    ls.bounds.maxX = Math.max(ls.bounds.maxX, x);
    ls.bounds.maxY = Math.max(ls.bounds.maxY, y);
  };

  try {
    const parser = new DxfParser();
    const parsed = parser.parseSync(dxfContent);

    const insunits = Number(parsed?.header?.['$INSUNITS'] ?? 6);
    if (insunits === 4) {
      detectedUnits = 'mm';
      scaleToMeters = 0.001;
    } else if (insunits === 1) {
      detectedUnits = 'in';
      scaleToMeters = 0.0254;
    } else if (insunits === 2) {
      detectedUnits = 'ft';
      scaleToMeters = 0.3048;
    } else {
      detectedUnits = 'm';
      scaleToMeters = 1;
    }

    for (const ent of parsed?.entities || []) {
      const layerName = ent.layer || '0';
      const ls = ensureLayer(layerName);

      if (ent.type === 'LINE' && ent.vertices && ent.vertices.length >= 2) {
        const pts = [
          { x: ent.vertices[0].x, y: ent.vertices[0].y },
          { x: ent.vertices[1].x, y: ent.vertices[1].y },
        ];
        entities.push({ type: 'LINE', layer: layerName, points: pts });
        ls.lineCount += 1;
        ls.totalLengthDrawingUnits += polyLength(pts);
        pts.forEach((p) => expandBounds(ls, p.x, p.y));
      } else if (
        (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') &&
        ent.vertices &&
        ent.vertices.length >= 2
      ) {
        const pts = ent.vertices.map((v) => ({ x: v.x, y: v.y }));
        const first = pts[0];
        const last = pts[pts.length - 1];
        const isClosed =
          Boolean(ent.shape) || (pts.length >= 3 && Math.hypot(last.x - first.x, last.y - first.y) < 1e-3);
        const closedPts = isClosed && Math.hypot(last.x - first.x, last.y - first.y) > 1e-6 ? [...pts, first] : pts;

        entities.push({ type: 'LWPOLYLINE', layer: layerName, points: closedPts });
        ls.polylineCount += 1;
        ls.totalLengthDrawingUnits += polyLength(closedPts);
        if (isClosed && pts.length >= 3) {
          ls.closedAreaCount += 1;
          ls.totalAreaDrawingUnitsSq += polyArea(pts);
        }
        pts.forEach((p) => expandBounds(ls, p.x, p.y));
      } else if (ent.type === 'CIRCLE' && ent.center && ent.radius) {
        const c = { x: ent.center.x, y: ent.center.y };
        entities.push({ type: 'CIRCLE', layer: layerName, center: c, radius: ent.radius });
        ls.closedAreaCount += 1;
        ls.totalAreaDrawingUnitsSq += Math.PI * ent.radius * ent.radius;
        expandBounds(ls, c.x - ent.radius, c.y - ent.radius);
        expandBounds(ls, c.x + ent.radius, c.y + ent.radius);
      } else if (ent.type === 'INSERT' && ent.position) {
        const bName = ent.name || 'BLOCK';
        const c = { x: ent.position.x, y: ent.position.y };
        ls.blockCount += 1;
        expandBounds(ls, c.x, c.y);
        if (!blockCounts[bName]) {
          blockCounts[bName] = { count: 0, layer: layerName, sampleCenters: [] };
        }
        blockCounts[bName].count += 1;
        if (blockCounts[bName].sampleCenters.length < 12) {
          blockCounts[bName].sampleCenters.push(c);
        }
        entities.push({ type: 'TEXT', layer: layerName, center: c, text: bName });
      } else if (ent.type === 'DIMENSION') {
        ls.dimensionCount += 1;
        if (ent.text) ls.sampleTexts.push(ent.text);
      } else if ((ent.type === 'TEXT' || ent.type === 'MTEXT') && ent.text) {
        const pos = ent.position || ent.startPoint || { x: 0, y: 0 };
        const cleanText = ent.text.replace(/\{\\[^;]*;|[{}]/g, '').trim();
        entities.push({
          type: 'TEXT',
          layer: layerName,
          center: { x: pos.x, y: pos.y },
          text: cleanText,
        });
        ls.textCount += 1;
        if (cleanText && ls.sampleTexts.length < 15) {
          ls.sampleTexts.push(cleanText);
        }
        texts.push({ text: cleanText, layer: layerName, x: pos.x, y: pos.y });
        expandBounds(ls, pos.x, pos.y);
      }
    }
  } catch {
    // Fallback lightweight ASCII scanner below if dxf-parser fails on non-standard header
    const fallback = parseDxfFallback(dxfContent);
    return {
      entities: fallback,
      layers: [],
      detectedUnits: 'm',
      scaleToMeters: 1,
      extents: { minX: 0, minY: 0, maxX: 100, maxY: 60 },
      blockCounts: {},
      texts: [],
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const l of layerMap.values()) {
    if (Number.isFinite(l.bounds.minX)) {
      minX = Math.min(minX, l.bounds.minX);
      minY = Math.min(minY, l.bounds.minY);
      maxX = Math.max(maxX, l.bounds.maxX);
      maxY = Math.max(maxY, l.bounds.maxY);
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 100;
    maxY = 60;
  }

  return {
    entities,
    layers: Array.from(layerMap.values()),
    detectedUnits,
    scaleToMeters,
    extents: { minX, minY, maxX, maxY },
    blockCounts,
    texts,
  };
}

export function parseDxfText(dxfContent: string): DxfEntity[] {
  return parseDxfDetailed(dxfContent).entities;
}

function parseDxfFallback(dxfContent: string): DxfEntity[] {
  const lines = dxfContent.split(/\r?\n/).map((l) => l.trim());
  const entities: DxfEntity[] = [];
  let inEntities = false;
  let i = 0;

  while (i < lines.length - 1) {
    const code = lines[i];
    const value = lines[i + 1];

    if (code === '2' && value === 'ENTITIES') {
      inEntities = true;
      i += 2;
      continue;
    }
    if (inEntities && code === '0' && value === 'ENDSEC') break;

    if (inEntities && code === '0') {
      const entityType = value;
      i += 2;
      let layer = '0';
      const pts: Point2D[] = [];
      let x1 = 0,
        y1 = 0,
        x2 = 0,
        y2 = 0;
      let cx = 0,
        cy = 0,
        radius = 0;
      let curX: number | null = null;
      let textVal = '';

      while (i < lines.length - 1 && lines[i] !== '0') {
        const gCode = lines[i];
        const gVal = lines[i + 1];
        if (gCode === '8') layer = gVal || '0';
        if (entityType === 'LINE') {
          if (gCode === '10') x1 = parseFloat(gVal) || 0;
          else if (gCode === '20') y1 = parseFloat(gVal) || 0;
          else if (gCode === '11') x2 = parseFloat(gVal) || 0;
          else if (gCode === '21') y2 = parseFloat(gVal) || 0;
        } else if (entityType === 'LWPOLYLINE') {
          if (gCode === '10') curX = parseFloat(gVal) || 0;
          else if (gCode === '20' && curX !== null) {
            pts.push({ x: curX, y: parseFloat(gVal) || 0 });
            curX = null;
          }
        } else if (entityType === 'CIRCLE') {
          if (gCode === '10') cx = parseFloat(gVal) || 0;
          else if (gCode === '20') cy = parseFloat(gVal) || 0;
          else if (gCode === '40') radius = parseFloat(gVal) || 0;
        } else if (entityType === 'TEXT' || entityType === 'MTEXT') {
          if (gCode === '10') cx = parseFloat(gVal) || 0;
          else if (gCode === '20') cy = parseFloat(gVal) || 0;
          else if (gCode === '1') textVal = gVal;
        }
        i += 2;
      }

      if (entityType === 'LINE') {
        entities.push({ type: 'LINE', layer, points: [{ x: x1, y: y1 }, { x: x2, y: y2 }] });
      } else if (entityType === 'LWPOLYLINE' && pts.length > 1) {
        entities.push({ type: 'LWPOLYLINE', layer, points: pts });
      } else if (entityType === 'CIRCLE' && radius > 0) {
        entities.push({ type: 'CIRCLE', layer, center: { x: cx, y: cy }, radius });
      } else if ((entityType === 'TEXT' || entityType === 'MTEXT') && textVal) {
        entities.push({ type: 'TEXT', layer, center: { x: cx, y: cy }, text: textVal });
      }
      continue;
    }
    i += 2;
  }
  return entities;
}
