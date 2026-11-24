import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Cpu,
  Crosshair,
  Edit3,
  FileCheck2,
  Flag,
  GitCompare,
  Layers,
  Maximize2,
  Plus,
  RotateCw,
  Save,
  Sparkles,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useEstimateStore } from '../../store/useEstimateStore';
import {
  DrawingFile,
  DrawingPipelineRun,
  DrawingType,
  PipelineConfidenceLevel,
  PipelineExtractedElement,
  PipelineScheduleRow,
  PipelineValidationWarning,
  Point2D,
  WORK_CATEGORIES,
  WorkCategory,
} from '../../types/estimate';
import { parseDxfDetailed } from '../../engine/dxfParser';
import { formatCompactCurrency, formatCurrency, formatNum } from '../../engine/formatters';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PipelineSheetDraft {
  id: string;
  name: string;
  fileType: 'pdf' | 'dxf' | 'dwg' | 'image';
  pageCount: number;
  activePage: number;
  dataUrl: string;
  renderedImageUrl: string;
  dxfText?: string;
  pdfExtractedText?: string;
  detectedScaleText: string;
  detectedUnits: 'm' | 'ft';
  rotationDeg: 0 | 90 | 180 | 270;
  contrastBoost: boolean;
  calibratedPixelsPerMeter?: number;
  immutableHash?: string;
}

const STEPS = [
  { id: 1, title: 'Upload & Batch' },
  { id: 2, title: 'Pre-process & Scale' },
  { id: 3, title: 'AI / CAD Extraction' },
  { id: 4, title: 'Quantities & Formulas' },
  { id: 5, title: 'Split-View Review' },
  { id: 6, title: 'BOQ Mapping' },
  { id: 7, title: 'Confirm & Auto-Calc' },
  { id: 8, title: 'Validation & Rev Diff' },
];

const DRAWING_TYPES: DrawingType[] = [
  'Architectural Plan',
  'Structural',
  'Foundation',
  'Road',
  'Drainage',
  'Site Plan',
  'MEP',
];

function confidenceFromScore(score: number): PipelineConfidenceLevel {
  if (score >= 0.82) return 'High';
  if (score >= 0.6) return 'Medium';
  return 'Low';
}

function confidenceStyle(level: PipelineConfidenceLevel): string {
  if (level === 'High') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
  }
  if (level === 'Medium') {
    return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
  }
  return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800';
}

function computeElementQuantities(
  no: number,
  l: number,
  b: number,
  h: number,
  deduction: number,
  unit: string
): { grossQty: number; netQty: number } {
  const n = no || 1;
  let gross = 0;
  if (unit === 'No.' || unit === 'LS') {
    gross = n;
  } else if (unit === 'm' || unit === 'ft') {
    gross = n * (l || 1);
  } else if (unit === 'm²' || unit === 'sq.ft') {
    gross = n * (l || 1) * (b || h || 1);
  } else {
    // m³, CFT, kg
    gross = n * (l || 1) * (b || 1) * (h || 1);
  }
  const net = Math.max(0, gross - (deduction || 0));
  return {
    grossQty: Math.round(gross * 100) / 100,
    netQty: Math.round(net * 100) / 100,
  };
}

function renderDxfPreviewDataUrl(dxfText: string): string {
  const detailed = parseDxfDetailed(dxfText);
  const w = 1280;
  const h = 760;
  const pad = 48;
  const spanX = Math.max(1, detailed.extents.maxX - detailed.extents.minX);
  const spanY = Math.max(1, detailed.extents.maxY - detailed.extents.minY);
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#f1f5f9';
  for (let gx = 0; gx < w; gx += 40) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, h);
    ctx.stroke();
  }
  for (let gy = 0; gy < h; gy += 40) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
  }
  const tx = (x: number) => pad + (x - detailed.extents.minX) * scale;
  const ty = (y: number) => h - pad - (y - detailed.extents.minY) * scale;
  ctx.strokeStyle = '#0f2137';
  ctx.lineWidth = 1.6;
  for (const ent of detailed.entities) {
    if ((ent.type === 'LINE' || ent.type === 'LWPOLYLINE') && ent.points && ent.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(tx(ent.points[0].x), ty(ent.points[0].y));
      for (let i = 1; i < ent.points.length; i++) {
        ctx.lineTo(tx(ent.points[i].x), ty(ent.points[i].y));
      }
      ctx.stroke();
    } else if (ent.type === 'CIRCLE' && ent.center && ent.radius) {
      ctx.beginPath();
      ctx.arc(tx(ent.center.x), ty(ent.center.y), ent.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
    } else if (ent.type === 'TEXT' && ent.center && ent.text) {
      ctx.fillStyle = '#334155';
      ctx.font = '11px monospace';
      ctx.fillText(ent.text, tx(ent.center.x), ty(ent.center.y));
    }
  }
  return off.toDataURL('image/png');
}

async function applyPreprocessTransform(
  imageUrl: string,
  rotationDeg: number,
  contrastBoost: boolean,
  maxDim = 1500,
  quality = 0.86
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const renderAt = (limitDim: number, jpegQuality: number): string => {
        const w = img.naturalWidth || 1200;
        const h = img.naturalHeight || 800;
        const swap = rotationDeg === 90 || rotationDeg === 270;
        const scale = Math.min(1, limitDim / Math.max(w, h));
        const cw = Math.max(1, Math.round((swap ? h : w) * scale));
        const ch = Math.max(1, Math.round((swap ? w : h) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        if (contrastBoost) {
          ctx.filter = 'contrast(1.35) grayscale(0.25) brightness(1.04)';
        }
        ctx.translate(cw / 2, ch / 2);
        ctx.rotate((rotationDeg * Math.PI) / 180);
        ctx.drawImage(img, (-w * scale) / 2, (-h * scale) / 2, w * scale, h * scale);
        return canvas.toDataURL('image/jpeg', jpegQuality);
      };

      let encoded = renderAt(maxDim, quality);
      // Keep each sheet well below gateway/proxy limits (~1.8 MB max per sheet)
      if (encoded.length > 2_400_000) {
        encoded = renderAt(1200, 0.74);
      }
      resolve(encoded);
    };
    img.onerror = () => resolve(imageUrl);
    img.src = imageUrl;
  });
}

class HttpStatusError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function safeFetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const rawText = await res.text();
  let parsed: unknown = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    if (res.status === 413) {
      throw new HttpStatusError(
        413,
        'Drawing payload exceeded server upload limit (HTTP 413). Try fewer sheets per batch or lower-resolution scans.'
      );
    }
    const snippet = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
    throw new HttpStatusError(
      res.status,
      `Server returned a non-JSON response (HTTP ${res.status})${snippet ? `: ${snippet}` : '.'}`
    );
  }
  if (!res.ok) {
    const errMsg =
      parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as { error: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : `Request failed (HTTP ${res.status}).`;
    throw new HttpStatusError(res.status, errMsg);
  }
  return parsed as T;
}

export const DrawingToEstimateModule: React.FC = () => {
  const { project, visibleProjects, summary, unitSystem, userRole, userMemory } =
    useActiveProject();
  const setActiveProject = useEstimateStore((s) => s.setActiveProject);
  const setActiveModule = useEstimateStore((s) => s.setActiveModule);
  const addBOQItem = useEstimateStore((s) => s.addBOQItem);
  const commitPipelineToEstimate = useEstimateStore((s) => s.commitPipelineToEstimate);
  const savePipelineTemplate = useEstimateStore((s) => s.savePipelineTemplate);
  const notifyDraftsmanRevisionUpload = useEstimateStore((s) => s.notifyDraftsmanRevisionUpload);
  const activeTraceTarget = useEstimateStore((s) => s.activeTraceTarget);
  const setActiveTraceTarget = useEstimateStore((s) => s.setActiveTraceTarget);

  const [step, setStep] = useState<number>(1);
  const [drawingType, setDrawingType] = useState<DrawingType>('Architectural Plan');
  const [revisionLabel, setRevisionLabel] = useState<string>(
    `Rev ${String.fromCharCode(65 + ((project.pipelineRuns?.length || 0) % 26))}`
  );
  const [notifyTeamOnUpload, setNotifyTeamOnUpload] = useState<boolean>(true);
  const [sheets, setSheets] = useState<PipelineSheetDraft[]>([]);
  const [activeSheetId, setActiveSheetId] = useState<string>('');

  // Step 2 Engineering Defaults & Scale Calibration
  const [wallHeightM, setWallHeightM] = useState<number>(3.05);
  const [slabThicknessM, setSlabThicknessM] = useState<number>(0.15);
  const [steelRatioKgPerM3, setSteelRatioKgPerM3] = useState<number>(110);
  const [calibMode, setCalibMode] = useState<boolean>(false);
  const [calibPts, setCalibPts] = useState<Point2D[]>([]);
  const [calibDistanceM, setCalibDistanceM] = useState<string>('13.6');

  // Step 3 Background Job State
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>('Idle');
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [jobMessage, setJobMessage] = useState<string>('');
  const [jobLogs, setJobLogs] = useState<Array<{ timestamp: string; stage: string; detail: string }>>([]);
  const [jobError, setJobError] = useState<string | null>(null);

  // Step 4-6 Extracted Elements, Schedules & Decisions
  const [elements, setElements] = useState<PipelineExtractedElement[]>([]);
  const [scheduleTables, setScheduleTables] = useState<PipelineScheduleRow[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [rememberMappings, setRememberMappings] = useState<boolean>(true);
  const [templateName, setTemplateName] = useState<string>('');
  const [auditDecisions, setAuditDecisions] = useState<Array<{ action: string; details: string }>>([]);

  // Quick Add New BOQ in Step 6
  const [newBoqDesc, setNewBoqDesc] = useState('');
  const [newBoqCat, setNewBoqCat] = useState<WorkCategory>('RCC');
  const [newBoqUnit, setNewBoqUnit] = useState('m³');
  const [newBoqRate, setNewBoqRate] = useState(28500);

  // Step 7 Commit Impact
  const [commitResult, setCommitResult] = useState<{
    runId: string;
    grandTotalBefore: number;
    grandTotalAfter: number;
    durationBefore: number;
    durationAfter: number;
  } | null>(null);

  // Step 8 Comparison Selection
  const [compareRunId, setCompareRunId] = useState<string>(
    project.pipelineRuns?.[0]?.id || ''
  );

  // Split-View Interactive Canvas State
  const reviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasZoom, setCanvasZoom] = useState<number>(0.85);
  const [canvasPan, setCanvasPan] = useState<Point2D>({ x: 16, y: 16 });
  const [isPanning, setIsPanning] = useState(false);
  const [panAnchor, setPanAnchor] = useState<Point2D>({ x: 0, y: 0 });
  const [loadedBgImg, setLoadedBgImg] = useState<HTMLImageElement | null>(null);
  const [loadedBgDim, setLoadedBgDim] = useState<{ w: number; h: number }>({ w: 1200, h: 720 });

  const activeSheet = sheets.find((s) => s.id === activeSheetId) || sheets[0];

  // Handle "View on drawing" traceability jump from Measurement Sheet / Abstract
  useEffect(() => {
    if (!activeTraceTarget) return;
    const matchDrawing =
      project.drawings.find(
        (d) => d.id === activeTraceTarget.drawingId || d.name === activeTraceTarget.drawingName
      ) || project.drawings[0];

    if (matchDrawing) {
      const existingSheet = sheets.find((s) => s.id === matchDrawing.id);
      if (!existingSheet) {
        const preview =
          matchDrawing.fileType === 'dxf' && matchDrawing.dxfEntities
            ? ''
            : matchDrawing.dataUrl;
        const nextSheet: PipelineSheetDraft = {
          id: matchDrawing.id,
          name: matchDrawing.name,
          fileType: matchDrawing.fileType,
          pageCount: matchDrawing.pageCount,
          activePage: activeTraceTarget.page || 1,
          dataUrl: matchDrawing.dataUrl,
          renderedImageUrl: preview,
          detectedScaleText: '1:100',
          detectedUnits: unitSystem === 'imperial' ? 'ft' : 'm',
          rotationDeg: 0,
          contrastBoost: false,
          calibratedPixelsPerMeter: matchDrawing.calibrations?.[1]?.pixelsPerUnit,
        };
        setSheets((prev) => [nextSheet, ...prev.filter((x) => x.id !== nextSheet.id)]);
      }
      setActiveSheetId(matchDrawing.id);

      if (activeTraceTarget.bbox) {
        const traceElId = `trace-${Date.now()}`;
        const existingMatch = elements.find(
          (el) =>
            el.sheetName === matchDrawing.name &&
            el.bbox.xPct === activeTraceTarget.bbox?.xPct &&
            el.bbox.yPct === activeTraceTarget.bbox?.yPct
        );
        if (existingMatch) {
          setSelectedElementId(existingMatch.id);
        } else {
          setElements((prev) => [
            {
              id: traceElId,
              sheetId: matchDrawing.id,
              sheetName: matchDrawing.name,
              page: activeTraceTarget.page || 1,
              elementName: activeTraceTarget.label || 'Traced BOQ Element',
              elementType: 'Traced Takeoff',
              category: 'RCC',
              no: 1,
              length: 1,
              breadth: 1,
              height: 1,
              deductionQty: 0,
              grossQty: 1,
              netQty: 1,
              unit: 'm³',
              formula: 'Linked from Measurement Sheet',
              confidenceScore: 0.99,
              confidenceLevel: 'High',
              bbox: activeTraceTarget.bbox!,
              coordinatesLabel: `P.${activeTraceTarget.page} (${Math.round(activeTraceTarget.bbox!.xPct)}%, ${Math.round(activeTraceTarget.bbox!.yPct)}%)`,
              status: 'Accepted',
              layer: 'Traceability',
              notes: 'Opened via View on Drawing link.',
            },
            ...prev,
          ]);
          setSelectedElementId(traceElId);
        }
        setStep(5);
      }
    }
    setActiveTraceTarget(null);
  }, [activeTraceTarget]);

  // Load image buffer for Step 2 / Step 5 canvas
  useEffect(() => {
    if (!activeSheet) {
      setLoadedBgImg(null);
      return;
    }
    const src = activeSheet.renderedImageUrl || activeSheet.dataUrl;
    if (!src) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setLoadedBgImg(img);
        setLoadedBgDim({ w: img.naturalWidth || 1200, h: img.naturalHeight || 720 });
      }
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [activeSheet?.id, activeSheet?.renderedImageUrl, activeSheet?.dataUrl]);

  // Render interactive drawing viewport (Step 2 Calibration & Step 5 Highlighted Split View)
  const drawViewport = useCallback(() => {
    const canvas = reviewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.parentElement?.getBoundingClientRect();
    const cw = Math.max(360, Math.floor(rect?.width || 720));
    const ch = Math.max(420, Math.floor(rect?.height || 500));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    ctx.translate(canvasPan.x, canvasPan.y);
    ctx.scale(canvasZoom, canvasZoom);

    if (loadedBgImg) {
      ctx.drawImage(loadedBgImg, 0, 0, loadedBgDim.w, loadedBgDim.h);
    }

    // Calibration draft line in Step 2
    if (calibPts.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#9333ea';
      ctx.lineWidth = 2.5 / canvasZoom;
      ctx.beginPath();
      ctx.arc(calibPts[0].x, calibPts[0].y, 5 / canvasZoom, 0, Math.PI * 2);
      ctx.fillStyle = '#9333ea';
      ctx.fill();
      if (calibPts.length === 2) {
        ctx.moveTo(calibPts[0].x, calibPts[0].y);
        ctx.lineTo(calibPts[1].x, calibPts[1].y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Highlighted extracted element boxes on active sheet & page
    if (activeSheet && step >= 4) {
      const sheetEls = elements.filter(
        (el) => el.sheetId === activeSheet.id && el.page === activeSheet.activePage
      );
      for (const el of sheetEls) {
        const isSelected = el.id === selectedElementId;
        const x = (el.bbox.xPct / 100) * loadedBgDim.w;
        const y = (el.bbox.yPct / 100) * loadedBgDim.h;
        const w = (el.bbox.wPct / 100) * loadedBgDim.w;
        const h = (el.bbox.hPct / 100) * loadedBgDim.h;

        let stroke = '#16a34a';
        if (el.status === 'Rejected') stroke = '#94a3b8';
        else if (el.status === 'Flagged' || el.confidenceLevel === 'Low') stroke = '#dc2626';
        else if (el.confidenceLevel === 'Medium') stroke = '#d97706';

        ctx.save();
        ctx.strokeStyle = isSelected ? '#ea580c' : stroke;
        ctx.lineWidth = (isSelected ? 4 : 2) / canvasZoom;
        if (el.status === 'Rejected') ctx.setLineDash([5 / canvasZoom, 4 / canvasZoom]);
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = isSelected
          ? 'rgba(234, 88, 12, 0.24)'
          : el.status === 'Rejected'
          ? 'rgba(148, 163, 184, 0.1)'
          : 'rgba(15, 33, 55, 0.08)';
        ctx.fillRect(x, y, w, h);

        const tag = `${el.elementName} (${formatNum(el.netQty, 1)} ${el.unit})`;
        ctx.font = `600 ${Math.max(10, 12 / canvasZoom)}px monospace`;
        const tw = ctx.measureText(tag).width + 8 / canvasZoom;
        const th = 16 / canvasZoom;
        ctx.fillStyle = isSelected ? '#ea580c' : 'rgba(15, 33, 55, 0.88)';
        ctx.fillRect(x, Math.max(0, y - th), tw, th);
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag, x + 4 / canvasZoom, Math.max(0, y - th) + th / 2);
        ctx.restore();
      }
    }

    ctx.restore();
  }, [
    canvasPan,
    canvasZoom,
    loadedBgImg,
    loadedBgDim,
    calibPts,
    activeSheet,
    step,
    elements,
    selectedElementId,
  ]);

  useEffect(() => {
    drawViewport();
  }, [drawViewport]);

  // Helper: find BOQ match using Project + Personal User Learned Memory -> Keyword/Category
  const autoMatchBoqId = useCallback(
    (elementName: string, elementType: string, category: WorkCategory): string | undefined => {
      const mem = [
        ...(project.pipelineMappingMemory || []),
        ...(userMemory?.pipelineMappingMemory || []),
      ];
      const lowerName = elementName.toLowerCase().trim();
      const memHit =
        mem.find((m) => m.pattern === lowerName) ||
        mem.find((m) => m.elementType.toLowerCase() === elementType.toLowerCase());
      if (memHit && project.boqItems.some((b) => b.id === memHit.boqItemId)) {
        return memHit.boqItemId;
      }
      const exactCat = project.boqItems.find(
        (b) =>
          b.category === category &&
          (lowerName.includes('footing')
            ? b.description.toLowerCase().includes('footing')
            : lowerName.includes('slab') || lowerName.includes('beam') || lowerName.includes('column')
            ? b.description.toLowerCase().includes('superstructure') || b.category === 'RCC'
            : true)
      );
      if (exactCat) return exactCat.id;
      return project.boqItems.find((b) => b.category === category)?.id;
    },
    [project.boqItems, project.pipelineMappingMemory, userMemory?.pipelineMappingMemory]
  );

  const availableTemplates = useMemo(() => {
    const map = new Map<string, NonNullable<typeof project.pipelineTemplates>[number]>();
    for (const t of [...(project.pipelineTemplates || []), ...(userMemory?.pipelineTemplates || [])]) {
      if (!map.has(t.name)) map.set(t.name, t);
    }
    return Array.from(map.values());
  }, [project.pipelineTemplates, userMemory?.pipelineTemplates]);

  // Upload handlers
  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const added: PipelineSheetDraft[] = [];

    for (const file of Array.from(fileList)) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const id = `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;

      if (ext === 'dxf') {
        const text = await file.text();
        const detailed = parseDxfDetailed(text);
        const preview = renderDxfPreviewDataUrl(text);
        added.push({
          id,
          name: file.name,
          fileType: 'dxf',
          pageCount: 1,
          activePage: 1,
          dataUrl: preview,
          renderedImageUrl: preview,
          dxfText: text,
          detectedScaleText: '1:1 CAD',
          detectedUnits: detailed.detectedUnits === 'ft' || detailed.detectedUnits === 'in' ? 'ft' : 'm',
          rotationDeg: 0,
          contrastBoost: false,
        });
      } else if (ext === 'dwg') {
        added.push({
          id,
          name: file.name,
          fileType: 'dwg',
          pageCount: 1,
          activePage: 1,
          dataUrl: '',
          renderedImageUrl: '',
          detectedScaleText: '1:100',
          detectedUnits: unitSystem === 'imperial' ? 'ft' : 'm',
          rotationDeg: 0,
          contrastBoost: false,
        });
      } else if (ext === 'pdf') {
        const dataUrl = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.readAsDataURL(file);
        });
        let pageCount = 1;
        let renderedImageUrl = '';
        let pdfExtractedText = '';
        let detectedScaleText = '1:100';
        try {
          const pdf = await pdfjsLib.getDocument({ url: dataUrl }).promise;
          pageCount = pdf.numPages;
          const pg = await pdf.getPage(1);
          const textContent = await pg.getTextContent();
          pdfExtractedText = textContent.items
            .map((it) => ('str' in it ? it.str : ''))
            .filter(Boolean)
            .join(' ');
          const scaleMatch = pdfExtractedText.match(/1\s*:\s*(20|25|50|75|100|150|200|250|500)/i);
          if (scaleMatch) detectedScaleText = `1:${scaleMatch[1]}`;
          const vp = pg.getViewport({ scale: 1.75 });
          const off = document.createElement('canvas');
          off.width = vp.width;
          off.height = vp.height;
          await pg.render({ canvasContext: off.getContext('2d')!, viewport: vp, canvas: off }).promise;
          renderedImageUrl = off.toDataURL('image/png');
        } catch {
          pageCount = 1;
        }
        added.push({
          id,
          name: file.name,
          fileType: 'pdf',
          pageCount,
          activePage: 1,
          dataUrl,
          renderedImageUrl,
          pdfExtractedText,
          detectedScaleText,
          detectedUnits: unitSystem === 'imperial' ? 'ft' : 'm',
          rotationDeg: 0,
          contrastBoost: false,
        });
      } else {
        const dataUrl = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.readAsDataURL(file);
        });
        added.push({
          id,
          name: file.name,
          fileType: 'image',
          pageCount: 1,
          activePage: 1,
          dataUrl,
          renderedImageUrl: dataUrl,
          detectedScaleText: '1:100',
          detectedUnits: unitSystem === 'imperial' ? 'ft' : 'm',
          rotationDeg: 0,
          contrastBoost: false,
        });
      }
    }

    if (added.length > 0) {
      setSheets((prev) => [...prev, ...added]);
      if (!activeSheetId) setActiveSheetId(added[0].id);
      if (notifyTeamOnUpload) {
        notifyDraftsmanRevisionUpload(
          added.map((a) => a.name),
          revisionLabel
        );
      }
    }
  };

  const loadExistingProjectDrawing = (drawing: DrawingFile) => {
    if (sheets.some((s) => s.id === drawing.id)) {
      setActiveSheetId(drawing.id);
      return;
    }
    const next: PipelineSheetDraft = {
      id: drawing.id,
      name: drawing.name,
      fileType: drawing.fileType,
      pageCount: drawing.pageCount,
      activePage: 1,
      dataUrl: drawing.dataUrl,
      renderedImageUrl: drawing.dataUrl,
      detectedScaleText: '1:100',
      detectedUnits: drawing.calibrations?.[1]?.unit || (unitSystem === 'imperial' ? 'ft' : 'm'),
      rotationDeg: 0,
      contrastBoost: false,
      calibratedPixelsPerMeter: drawing.calibrations?.[1]?.pixelsPerUnit,
    };
    setSheets((prev) => [...prev, next]);
    setActiveSheetId(next.id);
  };

  // Switch PDF page dynamically
  const handleChangePdfPage = async (sheetId: string, pageNum: number) => {
    const sh = sheets.find((s) => s.id === sheetId);
    if (!sh || sh.fileType !== 'pdf') return;
    try {
      const pdf = await pdfjsLib.getDocument({ url: sh.dataUrl }).promise;
      const clamped = Math.max(1, Math.min(pageNum, pdf.numPages));
      const pg = await pdf.getPage(clamped);
      const textContent = await pg.getTextContent();
      const text = textContent.items
        .map((it) => ('str' in it ? it.str : ''))
        .filter(Boolean)
        .join(' ');
      const vp = pg.getViewport({ scale: 1.75 });
      const off = document.createElement('canvas');
      off.width = vp.width;
      off.height = vp.height;
      await pg.render({ canvasContext: off.getContext('2d')!, viewport: vp, canvas: off }).promise;
      const imgUrl = off.toDataURL('image/png');
      setSheets((prev) =>
        prev.map((x) =>
          x.id === sheetId
            ? { ...x, activePage: clamped, renderedImageUrl: imgUrl, pdfExtractedText: text }
            : x
        )
      );
    } catch {
      setSheets((prev) => prev.map((x) => (x.id === sheetId ? { ...x, activePage: pageNum } : x)));
    }
  };

  // Step 3: Launch Background Extraction Job & Poll
  const startExtractionPipeline = async () => {
    if (sheets.length === 0) return;
    setStep(3);
    setJobError(null);
    setJobProgress(5);
    setJobStatus('Queued');
    setJobMessage('Submitting immutable drawing batch to background pipeline...');
    setJobLogs([]);

    try {
      setJobMessage('Optimizing & normalizing drawing sheets for AI vision extraction...');
      const preparedSheets = await Promise.all(
        sheets.map(async (sh) => {
          let processedImage = sh.renderedImageUrl || sh.dataUrl;
          if (processedImage && sh.fileType !== 'dxf' && sh.fileType !== 'dwg') {
            processedImage = await applyPreprocessTransform(
              processedImage,
              sh.rotationDeg,
              sh.contrastBoost,
              1500,
              0.85
            );
          }
          const mimeMatch = processedImage?.match(/^data:([^;]+);base64,/i);
          return {
            id: sh.id,
            name: sh.name,
            fileType: sh.fileType,
            page: sh.activePage,
            mimeType: mimeMatch ? mimeMatch[1] : 'image/jpeg',
            imageBase64: sh.fileType === 'dxf' ? undefined : processedImage,
            dxfText: sh.dxfText,
            pdfExtractedText: sh.pdfExtractedText,
            detectedScaleHint: sh.detectedScaleText,
            calibratedPixelsPerMeter: sh.calibratedPixelsPerMeter,
          };
        })
      );

      const commonMeta = {
        projectId: project.id,
        drawingType,
        revisionLabel,
        unitSystem,
        wallHeightM,
        slabThicknessM,
        steelRatioKgPerM3,
        scaleRatioText: activeSheet?.detectedScaleText || '1:100',
      };

      const estimatedPayloadSize = preparedSheets.reduce(
        (acc, s) => acc + (s.imageBase64?.length || 0) + (s.dxfText?.length || 0),
        0
      );
      const useChunkedUpload = preparedSheets.length > 1 || estimatedPayloadSize > 1_500_000;

      let finalResult: {
        detectedScaleText?: string;
        detectedUnits?: 'm' | 'ft';
        elements?: Array<Record<string, unknown>>;
        scheduleTables?: PipelineScheduleRow[];
      } | null = null;

      try {
        let postJson: {
          jobId: string;
          immutableHashes?: Array<{ sheetId: string; hash: string }>;
        };

        if (useChunkedUpload) {
          const initJson = await safeFetchJson<{ jobId: string }>('/api/pipeline/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...commonMeta,
              deferred: true,
              sheets: [],
            }),
          });

          setJobId(initJson.jobId);
          const collectedHashes: Array<{ sheetId: string; hash: string }> = [];
          for (let i = 0; i < preparedSheets.length; i++) {
            const sh = preparedSheets[i];
            setJobMessage(`Uploading sheet ${i + 1} of ${preparedSheets.length}: ${sh.name}...`);
            const sheetRes = await safeFetchJson<{
              immutableHash: { sheetId: string; hash: string };
            }>(`/api/pipeline/jobs/${initJson.jobId}/sheets`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sheet: sh }),
            });
            if (sheetRes.immutableHash) {
              collectedHashes.push(sheetRes.immutableHash);
              setSheets((prev) =>
                prev.map((s) =>
                  s.id === sheetRes.immutableHash.sheetId
                    ? { ...s, immutableHash: sheetRes.immutableHash.hash }
                    : s
                )
              );
            }
          }

          setJobMessage('Starting background extraction job...');
          postJson = await safeFetchJson<{
            jobId: string;
            immutableHashes?: Array<{ sheetId: string; hash: string }>;
          }>(`/api/pipeline/jobs/${initJson.jobId}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          if (!postJson.immutableHashes?.length) {
            postJson.immutableHashes = collectedHashes;
          }
        } else {
          postJson = await safeFetchJson<{
            jobId: string;
            immutableHashes?: Array<{ sheetId: string; hash: string }>;
          }>('/api/pipeline/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...commonMeta,
              sheets: preparedSheets,
            }),
          });
        }

        const newJobId = postJson.jobId;
        setJobId(newJobId);

        if (Array.isArray(postJson.immutableHashes)) {
          const hashMap = new Map<string, string>(
            postJson.immutableHashes.map((h) => [h.sheetId, h.hash])
          );
          setSheets((prev) =>
            prev.map((s) => ({ ...s, immutableHash: hashMap.get(s.id) || s.immutableHash }))
          );
        }

        let done = false;
        while (!done) {
          await new Promise((r) => setTimeout(r, 450));
          const jobData = await safeFetchJson<{
            status: string;
            progressPct?: number;
            stageMessage?: string;
            stageLogs?: Array<{ timestamp: string; stage: string; detail: string }>;
            error?: string;
            result?: {
              detectedScaleText?: string;
              detectedUnits?: 'm' | 'ft';
              elements?: Array<Record<string, unknown>>;
              scheduleTables?: PipelineScheduleRow[];
            };
          }>(`/api/pipeline/jobs/${newJobId}`);

          setJobStatus(jobData.status);
          setJobProgress(jobData.progressPct || 0);
          setJobMessage(jobData.stageMessage || '');
          setJobLogs(jobData.stageLogs || []);

          if (jobData.status === 'Failed') {
            throw new Error(jobData.error || 'Background extraction job failed.');
          }

          if (jobData.status === 'Completed' && jobData.result) {
            done = true;
            finalResult = jobData.result;
          }
        }
      } catch (jobErr: unknown) {
        // On serverless deployments (e.g., Vercel), stateful background job queues aren't mounted (HTTP 404).
        // Fall back seamlessly to stateless per-sheet extraction via /api/pipeline/extract-sheet.
        if (!(jobErr instanceof HttpStatusError && jobErr.status === 404)) {
          throw jobErr;
        }

        const serverlessJobId = `sls-${Date.now()}`;
        setJobId(serverlessJobId);
        setJobStatus('Extracting');
        setJobProgress(15);
        setJobLogs([
          {
            timestamp: new Date().toISOString(),
            stage: 'Serverless Mode',
            detail: `Running stateless per-sheet extraction across ${preparedSheets.length} sheet(s)...`,
          },
        ]);

        const combinedElements: Array<Record<string, unknown>> = [];
        const combinedSchedules: PipelineScheduleRow[] = [];
        let detectedScaleText = commonMeta.scaleRatioText;
        let detectedUnits: 'm' | 'ft' = unitSystem === 'imperial' ? 'ft' : 'm';

        for (let i = 0; i < preparedSheets.length; i++) {
          const sh = preparedSheets[i];
          setJobProgress(Math.min(90, 20 + Math.round(((i + 0.3) / preparedSheets.length) * 65)));
          setJobMessage(`Extracting sheet ${i + 1} of ${preparedSheets.length}: ${sh.name}...`);

          let sheetResult: {
            immutableHash?: { sheetId: string; hash: string };
            detectedScaleText?: string;
            detectedUnits?: 'm' | 'ft';
            elements?: Array<Record<string, unknown>>;
            scheduleTables?: PipelineScheduleRow[];
            logs?: Array<{ stage: string; detail: string }>;
          };

          try {
            sheetResult = await safeFetchJson('/api/pipeline/extract-sheet', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...commonMeta,
                sheet: sh,
              }),
            });
          } catch (slsErr: unknown) {
            if (slsErr instanceof HttpStatusError && slsErr.status === 404) {
              throw new Error(
                'Backend API routes (/api/pipeline/extract-sheet) were not found on this deployment (HTTP 404). Ensure the /api folder is deployed to Vercel with GEMINI_API_KEY configured in Project Settings > Environment Variables, or run the full-stack server via "npm run dev" / "npm start".'
              );
            }
            throw slsErr;
          }

          if (sheetResult.immutableHash?.hash) {
            const h = sheetResult.immutableHash.hash;
            setSheets((prev) =>
              prev.map((s) => (s.id === sh.id ? { ...s, immutableHash: h } : s))
            );
          }
          if (sheetResult.logs?.length) {
            setJobLogs((prev) => [
              ...prev,
              ...sheetResult.logs!.map((l) => ({
                timestamp: new Date().toISOString(),
                stage: l.stage,
                detail: l.detail,
              })),
            ]);
          }
          if (sheetResult.detectedScaleText) detectedScaleText = sheetResult.detectedScaleText;
          if (sheetResult.detectedUnits) detectedUnits = sheetResult.detectedUnits;
          if (Array.isArray(sheetResult.elements)) combinedElements.push(...sheetResult.elements);
          if (Array.isArray(sheetResult.scheduleTables)) {
            combinedSchedules.push(...sheetResult.scheduleTables);
          }
        }

        setJobStatus('Completed');
        setJobProgress(100);
        setJobMessage(`Completed extraction: ${combinedElements.length} elements ready for review.`);
        finalResult = {
          detectedScaleText,
          detectedUnits,
          elements: combinedElements,
          scheduleTables: combinedSchedules,
        };
      }

      if (finalResult) {
        const rawEls = (finalResult.elements || []) as Array<Record<string, unknown>>;
          const mappedEls: PipelineExtractedElement[] = rawEls.map((r, idx) => {
            const cat = (WORK_CATEGORIES.includes(r.category as WorkCategory)
              ? r.category
              : 'Miscellaneous') as WorkCategory;
            const no = Number(r.no) || 1;
            const length = Number(r.length) || 0;
            const breadth = Number(r.breadth) || 0;
            const height = Number(r.height) || 0;
            const deductionQty = Number(r.deductionQty) || 0;
            const unit = String(r.unit || 'm³');
            const { grossQty, netQty } = computeElementQuantities(
              no,
              length,
              breadth,
              height,
              deductionQty,
              unit
            );
            const score = Math.max(0.25, Math.min(0.99, Number(r.confidenceScore) || 0.78));
            const bbox = (r.bbox as { xPct: number; yPct: number; wPct: number; hPct: number }) || {
              xPct: 15 + (idx % 4) * 18,
              yPct: 18 + Math.floor(idx / 4) * 18,
              wPct: 16,
              hPct: 12,
            };
            const elName = String(r.elementName || `Element ${idx + 1}`);
            const elType = String(r.elementType || cat);

            return {
              id: `ext-${Date.now()}-${idx}`,
              sheetId: String(r.sheetId || sheets[0]?.id || ''),
              sheetName: String(r.sheetName || sheets[0]?.name || 'Drawing'),
              page: Number(r.page) || 1,
              elementName: elName,
              elementType: elType,
              category: cat,
              no,
              length,
              breadth,
              height,
              deductionQty,
              grossQty,
              netQty,
              unit,
              formula:
                String(r.formula || '') ||
                `${no} × ${length} × ${breadth} × ${height}${deductionQty > 0 ? ` − ${deductionQty}` : ''}`,
              confidenceScore: score,
              confidenceLevel: confidenceFromScore(score),
              bbox,
              coordinatesLabel: `X:${Math.round(bbox.xPct)}% Y:${Math.round(bbox.yPct)}%`,
              status: 'Pending',
              linkedBoqItemId: autoMatchBoqId(elName, elType, cat),
              layer: String(r.layer || drawingType),
              notes: String(r.notes || ''),
            };
          });

          setElements(mappedEls);
          setScheduleTables((finalResult.scheduleTables || []) as PipelineScheduleRow[]);
          setSelectedElementId(mappedEls[0]?.id || null);
          setAuditDecisions([]);
          setCommitResult(null);
          setStep(4);
      }
    } catch (err: unknown) {
      setJobStatus('Failed');
      setJobError(err instanceof Error ? err.message : 'Extraction pipeline error.');
    }
  };

  // Update individual element dimensions or BOQ mapping cleanly
  const updateElement = (id: string, patch: Partial<PipelineExtractedElement>, recordEdit = false) => {
    setElements((prev) =>
      prev.map((el) => {
        if (el.id !== id) return el;
        const merged = { ...el, ...patch };
        const calc = computeElementQuantities(
          merged.no,
          merged.length,
          merged.breadth,
          merged.height,
          merged.deductionQty,
          merged.unit
        );
        return {
          ...merged,
          grossQty: calc.grossQty,
          netQty: calc.netQty,
          status: recordEdit ? 'Edited' : merged.status,
        };
      })
    );
    if (recordEdit) {
      const target = elements.find((x) => x.id === id);
      if (target) {
        setAuditDecisions((d) => [
          ...d,
          { action: 'Edited Extracted Quantity', details: `${target.elementName} (${target.sheetName})` },
        ]);
      }
    }
  };

  const setElementStatus = (id: string, status: PipelineExtractedElement['status']) => {
    const target = elements.find((x) => x.id === id);
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, status } : el)));
    if (target) {
      setAuditDecisions((d) => [
        ...d,
        { action: `${status} Extracted Element`, details: `${target.elementName} (${formatNum(target.netQty, 2)} ${target.unit})` },
      ]);
    }
  };

  const deriveRebarAndShuttering = () => {
    const rccEls = elements.filter(
      (e) =>
        e.category === 'RCC' &&
        (e.unit === 'm³' || e.unit === 'CFT') &&
        !e.elementType.toLowerCase().includes('rebar') &&
        !e.elementType.toLowerCase().includes('shutter')
    );
    if (rccEls.length === 0) return;

    const totalRccVol = rccEls.reduce((s, e) => s + e.netQty, 0);
    const steelKg = Math.round(totalRccVol * steelRatioKgPerM3);
    const shutterSqM = Math.round(totalRccVol * 6.4 * 100) / 100;
    const baseSheet = rccEls[0];

    const derived: PipelineExtractedElement[] = [
      {
        id: `ext-rebar-${Date.now()}`,
        sheetId: baseSheet.sheetId,
        sheetName: baseSheet.sheetName,
        page: baseSheet.page,
        elementName: `Auto-Derived Steel Reinforcement (${steelRatioKgPerM3} kg/m³)`,
        elementType: 'Rebar',
        category: 'RCC',
        no: 1,
        length: totalRccVol,
        breadth: steelRatioKgPerM3,
        height: 1,
        deductionQty: 0,
        grossQty: steelKg,
        netQty: steelKg,
        unit: 'kg',
        formula: `${formatNum(totalRccVol, 2)} m³ RCC × ${steelRatioKgPerM3} kg/m³ = ${steelKg} kg`,
        confidenceScore: 0.76,
        confidenceLevel: 'Medium',
        bbox: baseSheet.bbox,
        coordinatesLabel: baseSheet.coordinatesLabel,
        status: 'Pending',
        linkedBoqItemId: autoMatchBoqId('Steel Reinforcement', 'Rebar', 'RCC'),
        layer: 'Structural',
        notes: 'Derived from extracted RCC concrete volume using standard structural steel ratio.',
      },
      {
        id: `ext-shutter-${Date.now() + 1}`,
        sheetId: baseSheet.sheetId,
        sheetName: baseSheet.sheetName,
        page: baseSheet.page,
        elementName: 'Auto-Derived Formwork / Shuttering Contact Area',
        elementType: 'Shuttering',
        category: 'RCC',
        no: 1,
        length: totalRccVol,
        breadth: 6.4,
        height: 1,
        deductionQty: 0,
        grossQty: shutterSqM,
        netQty: shutterSqM,
        unit: 'm²',
        formula: `${formatNum(totalRccVol, 2)} m³ RCC × 6.4 m²/m³ = ${shutterSqM} m²`,
        confidenceScore: 0.72,
        confidenceLevel: 'Medium',
        bbox: baseSheet.bbox,
        coordinatesLabel: baseSheet.coordinatesLabel,
        status: 'Pending',
        linkedBoqItemId: autoMatchBoqId('Formwork Shuttering', 'Shuttering', 'RCC'),
        layer: 'Structural',
        notes: 'Derived soffit & side shuttering factor across footings/columns/beams/slabs.',
      },
    ];
    setElements((prev) => [...prev, ...derived]);
  };

  // Automatic QA Validation Checks (Step 8)
  const validationWarnings = useMemo<PipelineValidationWarning[]>(() => {
    const list: PipelineValidationWarning[] = [];

    // 1. Missing Scale Calibration
    for (const sh of sheets) {
      if (sh.fileType !== 'dxf' && !sh.calibratedPixelsPerMeter && !sh.detectedScaleText) {
        list.push({
          id: `val-scale-${sh.id}`,
          severity: 'error',
          code: 'MISSING_SCALE',
          title: `Missing Scale Calibration on ${sh.name}`,
          description: 'No drawing scale text or two-point calibration was set. Run Step 2 calibration to verify true dimensions.',
        });
      }
    }

    // 2. Unusually Large / Small quantities & Missing Rates
    const boqRateMap = new Map(summary.items.map((b) => [b.id, b.unitRate]));
    const seenKeys = new Map<string, PipelineExtractedElement>();

    for (const el of elements) {
      if (el.status === 'Rejected') continue;

      if (el.netQty <= 0.01) {
        list.push({
          id: `val-small-${el.id}`,
          severity: 'warning',
          code: 'TINY_QUANTITY',
          title: `Unusually Small Quantity: ${el.elementName}`,
          description: `Computed net quantity is ${el.netQty} ${el.unit}. Check L × B × H inputs.`,
          elementId: el.id,
        });
      } else if (
        (el.unit === 'm³' && el.netQty > 800) ||
        (el.unit === 'm²' && el.netQty > 8000) ||
        (el.unit === 'kg' && el.netQty > 120000)
      ) {
        list.push({
          id: `val-large-${el.id}`,
          severity: 'warning',
          code: 'LARGE_QUANTITY',
          title: `Unusually Large Quantity: ${el.elementName}`,
          description: `${formatNum(el.netQty, 2)} ${el.unit} exceeds normal residential/single-sheet bounds — verify unit scale (mm vs m).`,
          elementId: el.id,
        });
      }

      // Duplicate check
      const dupKey = `${el.sheetName}::${el.elementName.toLowerCase()}::${el.netQty.toFixed(1)}`;
      if (seenKeys.has(dupKey)) {
        list.push({
          id: `val-dup-${el.id}`,
          severity: 'warning',
          code: 'DUPLICATE_ELEMENT',
          title: `Possible Duplicate Element: ${el.elementName}`,
          description: `Matches another extracted item on ${el.sheetName} with identical ${el.netQty} ${el.unit}.`,
          elementId: el.id,
        });
      } else {
        seenKeys.set(dupKey, el);
      }

      // Missing rate / unmapped BOQ
      if (!el.linkedBoqItemId) {
        list.push({
          id: `val-unmapped-${el.id}`,
          severity: 'error',
          code: 'UNMAPPED_BOQ',
          title: `Unmapped Element: ${el.elementName}`,
          description: 'Assign a target BOQ item in Step 6 so cost and schedule update properly.',
          elementId: el.id,
        });
      } else {
        const rate = boqRateMap.get(el.linkedBoqItemId) ?? 0;
        if (rate <= 0) {
          list.push({
            id: `val-norate-${el.id}`,
            severity: 'error',
            code: 'ZERO_RATE',
            title: `Missing Rate on Linked BOQ for ${el.elementName}`,
            description: 'The mapped BOQ item currently has a 0 unit rate. Update Rate Analysis or manual rate.',
            elementId: el.id,
          });
        }
      }

      // Deductions not applied on walls/plaster when openings exist
      const hasOpenings = elements.some(
        (o) =>
          o.status !== 'Rejected' &&
          (o.category === 'Doors & Windows' ||
            o.elementType === 'Door' ||
            o.elementType === 'Window')
      );
      if (
        hasOpenings &&
        (el.category === 'Masonry' || el.category === 'Plaster') &&
        el.deductionQty === 0
      ) {
        list.push({
          id: `val-deduct-${el.id}`,
          severity: 'info',
          code: 'NO_DEDUCTION',
          title: `Opening Deduction Not Applied: ${el.elementName}`,
          description: 'Doors/windows were detected on the sheet, but Deduction Qty is 0 on this wall/plaster item.',
          elementId: el.id,
        });
      }
    }

    // 3. Schedule vs Computed Count Mismatch
    for (const sch of scheduleTables) {
      const planMatching = elements.filter(
        (e) =>
          e.status !== 'Rejected' &&
          (e.elementType.toLowerCase().includes(sch.kind.toLowerCase()) ||
            e.elementName.toLowerCase().includes(sch.tag.toLowerCase()))
      );
      const planCount = planMatching.reduce((s, e) => s + (e.no || 1), 0);
      if (planCount > 0 && planCount !== sch.scheduleCount) {
        list.push({
          id: `val-sched-${sch.tag}`,
          severity: 'warning',
          code: 'SCHEDULE_MISMATCH',
          title: `Schedule vs Plan Count Mismatch (${sch.kind} ${sch.tag})`,
          description: `Drawing schedule specifies ${sch.scheduleCount} nos (${sch.dimensionsLabel}), whereas ${planCount} nos were extracted on plan.`,
        });
      }
    }

    return list;
  }, [sheets, elements, summary.items, scheduleTables]);

  // Revision Comparison (Current / Rev B vs Selected Baseline Run / Rev A)
  const revisionDiff = useMemo(() => {
    const runs = project.pipelineRuns || [];
    const baseRun: DrawingPipelineRun | undefined =
      runs.find((r) => r.id === compareRunId) || runs[0];
    if (!baseRun || elements.length === 0) return null;

    const currentMap = new Map<string, { label: string; netQty: number; unit: string; boqItemId?: string }>();
    for (const el of elements.filter((e) => e.status !== 'Rejected')) {
      const key = el.elementName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const prev = currentMap.get(key);
      currentMap.set(key, {
        label: el.elementName,
        netQty: (prev?.netQty || 0) + el.netQty,
        unit: el.unit,
        boqItemId: el.linkedBoqItemId,
      });
    }

    const baseMap = new Map(Object.entries(baseRun.summaryByKey));
    const diffs: Array<{
      key: string;
      label: string;
      changeType: 'Added' | 'Removed' | 'Changed' | 'Unchanged';
      oldQty: number;
      newQty: number;
      deltaQty: number;
      unit: string;
      deltaCost: number;
    }> = [];

    const rateByBoq = new Map(summary.items.map((b) => [b.id, b.unitRate]));

    for (const [k, cur] of currentMap.entries()) {
      const old = baseMap.get(k);
      const rate = (cur.boqItemId && rateByBoq.get(cur.boqItemId)) || 0;
      if (!old) {
        diffs.push({
          key: k,
          label: cur.label,
          changeType: 'Added',
          oldQty: 0,
          newQty: cur.netQty,
          deltaQty: cur.netQty,
          unit: cur.unit,
          deltaCost: cur.netQty * rate,
        });
      } else {
        const dq = cur.netQty - old.netQty;
        diffs.push({
          key: k,
          label: cur.label,
          changeType: Math.abs(dq) > 0.05 ? 'Changed' : 'Unchanged',
          oldQty: old.netQty,
          newQty: cur.netQty,
          deltaQty: dq,
          unit: cur.unit,
          deltaCost: dq * rate,
        });
      }
    }

    for (const [k, old] of baseMap.entries()) {
      if (!currentMap.has(k)) {
        const rate = (old.boqItemId && rateByBoq.get(old.boqItemId)) || 0;
        diffs.push({
          key: k,
          label: old.label,
          changeType: 'Removed',
          oldQty: old.netQty,
          newQty: 0,
          deltaQty: -old.netQty,
          unit: old.unit,
          deltaCost: -old.netQty * rate,
        });
      }
    }

    const totalCostDelta = diffs.reduce((s, d) => s + d.deltaCost, 0);
    const estDaysDelta = Math.round(totalCostDelta / Math.max(100000, summary.grandTotal / Math.max(1, summary.totalDurationWorkingDays)));

    return {
      baseRunLabel: baseRun.revisionLabel,
      diffs: diffs.filter((d) => d.changeType !== 'Unchanged'),
      totalCostDelta,
      estDaysDelta,
    };
  }, [project.pipelineRuns, compareRunId, elements, summary.items, summary.grandTotal, summary.totalDurationWorkingDays]);

  const acceptedCount = elements.filter((e) => e.status === 'Accepted' || e.status === 'Edited').length;
  const unmappedAccepted = elements.filter(
    (e) => (e.status === 'Accepted' || e.status === 'Edited') && !e.linkedBoqItemId
  );

  const handleConfirmAndPush = () => {
    const newDrawings: DrawingFile[] = sheets.map((sh) => ({
      id: sh.id,
      name: sh.name,
      fileType: sh.fileType === 'dwg' ? 'dxf' : sh.fileType,
      dataUrl: sh.dataUrl || sh.renderedImageUrl,
      dxfEntities: sh.dxfText ? parseDxfDetailed(sh.dxfText).entities : undefined,
      pageCount: sh.pageCount,
      calibrations: sh.calibratedPixelsPerMeter
        ? {
            [sh.activePage]: {
              page: sh.activePage,
              pixelsPerUnit: sh.calibratedPixelsPerMeter,
              unit: sh.detectedUnits,
              referenceDistance: parseFloat(calibDistanceM) || 10,
              p1: { x: 100, y: 100 },
              p2: { x: 100 + sh.calibratedPixelsPerMeter * 10, y: 100 },
            },
          }
        : {},
      markups: [],
      uploadedAt: new Date().toISOString(),
    }));

    const res = commitPipelineToEstimate({
      revisionLabel,
      drawingType,
      elements,
      newDrawings,
      rememberMappings,
      auditEntries: auditDecisions,
    });
    setCommitResult(res);
    setCompareRunId(res.runId);
    setStep(7);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Automated Takeoff Pipeline</span>
            <span aria-hidden="true">·</span>
            <span>{project.code} {project.name}</span>
            <span aria-hidden="true">·</span>
            <span>Role: {userRole}</span>
          </div>
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white tracking-tight mt-0.5">
            Drawing to Estimate Pipeline
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Upload PDF, DXF/DWG, or scanned plans → review AI & CAD detections → map to BOQ → update quantities, costs, resources & schedule.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={project.id}
            onChange={(e) => setActiveProject(e.target.value)}
            className="px-2.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
          >
            {visibleProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.visibility === 'private' ? '[Private] ' : ''}
                {p.code} · {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setStep(8)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>Checks ({validationWarnings.length})</span>
          </button>
        </div>
      </div>

      {/* 8-Step Wizard Progress Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            Step {step} of 8: {STEPS[step - 1]?.title}
          </span>
          <span className="font-mono text-slate-500 tabular-nums">
            {Math.round((step / 8) * 100)}% Pipeline Progress
          </span>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-600 transition-all duration-200"
            style={{ width: `${(step / 8) * 100}%` }}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5 pt-1">
          {STEPS.map((st) => {
            const active = st.id === step;
            const completed = st.id < step;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setStep(st.id)}
                className={`px-2 py-1.5 rounded text-[11px] font-medium text-left transition-colors truncate ${
                  active
                    ? 'bg-[#0F2137] text-white'
                    : completed
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50'
                    : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="font-mono mr-1">{st.id}.</span>
                {st.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          STEP 1: UPLOAD & BATCH MODE
      ===================================================================== */}
      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Upload Drawing Package (Single Sheet or Multi-Sheet Batch)
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Drawing Type</label>
                <select
                  value={drawingType}
                  onChange={(e) => setDrawingType(e.target.value as DrawingType)}
                  className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                >
                  {DRAWING_TYPES.map((dt) => (
                    <option key={dt} value={dt}>
                      {dt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Revision Tag</label>
                <input
                  type="text"
                  value={revisionLabel}
                  onChange={(e) => setRevisionLabel(e.target.value)}
                  className="w-full px-2.5 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 pb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyTeamOnUpload}
                    onChange={(e) => setNotifyTeamOnUpload(e.target.checked)}
                    className="accent-orange-600"
                  />
                  <span>Notify Estimator & Planner</span>
                </label>
              </div>
            </div>

            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void handleFilesSelected(e.dataTransfer.files);
              }}
              className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg hover:border-orange-500 cursor-pointer bg-slate-50/70 dark:bg-slate-800/40 transition-colors text-center"
            >
              <Upload className="w-8 h-8 text-orange-600 mb-2" />
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                Drag & drop PDF, DXF, DWG, PNG, or JPG sheets here
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Supports Batch Mode: select multiple Architectural, Structural, Foundation, or MEP sheets together
              </div>
              <input
                type="file"
                multiple
                accept=".pdf,.dxf,.dwg,.png,.jpg,.jpeg"
                onChange={(e) => void handleFilesSelected(e.target.files)}
                className="hidden"
              />
            </label>

            {/* Existing Project Drawings Quick Loader */}
            {project.drawings.length > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="text-[11px] font-medium text-slate-500 mb-2">
                  Or load an existing drawing from {project.name}:
                </div>
                <div className="flex flex-wrap gap-2">
                  {project.drawings.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => loadExistingProjectDrawing(d)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs hover:border-orange-500/60 bg-slate-50 dark:bg-slate-800"
                    >
                      <Layers className="w-3.5 h-3.5 text-orange-600" />
                      <span>{d.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Batch Queue & Saved Templates */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Queued Batch Sheets ({sheets.length})
                </h3>
                {sheets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSheets([])}
                    className="text-xs text-slate-500 hover:text-red-600"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {sheets.length === 0 ? (
                <div className="text-xs text-slate-500 py-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded">
                  Upload or load at least one drawing sheet to start pre-processing.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {sheets.map((sh) => (
                    <div key={sh.id} className="py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">
                          {sh.name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {sh.fileType.toUpperCase()} · {sh.pageCount} page(s) · Scale {sh.detectedScaleText}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSheets((prev) => prev.filter((x) => x.id !== sh.id))}
                        className="p-1 text-slate-400 hover:text-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                disabled={sheets.length === 0}
                onClick={() => setStep(2)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold disabled:opacity-40"
              >
                <span>Continue to Step 2: Pre-processing</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Templates */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-2.5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Saved Extraction Templates ({availableTemplates.length})
              </h3>
              {availableTemplates.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Save engineering assumptions &amp; BOQ mapping templates in Step 6 for reuse across your private and shared drawings.
                </p>
              ) : (
                <div className="space-y-1.5 text-xs">
                  {availableTemplates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => {
                        setDrawingType(tpl.drawingType);
                        setWallHeightM(tpl.defaultWallHeightM);
                        setSlabThicknessM(tpl.defaultSlabThicknessM);
                        setSteelRatioKgPerM3(tpl.steelRatioKgPerM3);
                      }}
                      className="w-full text-left p-2.5 rounded border border-slate-200 dark:border-slate-800 hover:border-orange-500/60 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">{tpl.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {tpl.drawingType} · Wall {tpl.defaultWallHeightM}m · Slab {tpl.defaultSlabThicknessM}m
                        </div>
                      </div>
                      <span className="text-orange-600 font-medium">Apply</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 2: PRE-PROCESSING (SCALE, UNITS, ROTATE & SCAN CLEANUP)
      ===================================================================== */}
      {step === 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4 text-xs">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Sheet Pre-Processing, Scale & Engineering Defaults
            </h2>

            {activeSheet ? (
              <>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Active Sheet</label>
                  <select
                    value={activeSheet.id}
                    onChange={(e) => setActiveSheetId(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-medium"
                  >
                    {sheets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.fileType.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>

                {activeSheet.fileType === 'pdf' && activeSheet.pageCount > 1 && (
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      PDF Page ({activeSheet.activePage} of {activeSheet.pageCount})
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={activeSheet.pageCount}
                      value={activeSheet.activePage}
                      onChange={(e) =>
                        void handleChangePdfPage(activeSheet.id, Number(e.target.value) || 1)
                      }
                      className="w-28 px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Scale Ratio / Text</label>
                    <input
                      type="text"
                      value={activeSheet.detectedScaleText}
                      onChange={(e) =>
                        setSheets((prev) =>
                          prev.map((x) =>
                            x.id === activeSheet.id ? { ...x, detectedScaleText: e.target.value } : x
                          )
                        )
                      }
                      className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Detected Units</label>
                    <select
                      value={activeSheet.detectedUnits}
                      onChange={(e) =>
                        setSheets((prev) =>
                          prev.map((x) =>
                            x.id === activeSheet.id
                              ? { ...x, detectedUnits: e.target.value as 'm' | 'ft' }
                              : x
                          )
                        )
                      }
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                    >
                      <option value="m">Metric (Meters / mm)</option>
                      <option value="ft">Imperial / FPS (Feet / Inches)</option>
                    </select>
                  </div>
                </div>

                {/* Image cleanup / rotation */}
                {activeSheet.fileType !== 'dxf' && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setSheets((prev) =>
                          prev.map((x) =>
                            x.id === activeSheet.id
                              ? { ...x, rotationDeg: ((x.rotationDeg + 90) % 360) as 0 | 90 | 180 | 270 }
                              : x
                          )
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Rotate ({activeSheet.rotationDeg}°)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSheets((prev) =>
                          prev.map((x) =>
                            x.id === activeSheet.id ? { ...x, contrastBoost: !x.contrastBoost } : x
                          )
                        )
                      }
                      className={`px-2.5 py-1.5 rounded border font-medium ${
                        activeSheet.contrastBoost
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      Scan Contrast Clean: {activeSheet.contrastBoost ? 'ON' : 'OFF'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCalibMode((c) => !c);
                        setCalibPts([]);
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded border font-medium ${
                        calibMode
                          ? 'border-purple-600 bg-purple-600 text-white'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>2-Point Scale Calibration</span>
                    </button>
                  </div>
                )}

                {calibMode && (
                  <div className="p-3 rounded bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 space-y-2">
                    <div className="font-medium text-purple-900 dark:text-purple-200">
                      {calibPts.length < 2
                        ? `Click two reference points on the sheet preview (${calibPts.length}/2 picked)`
                        : `Span: ${formatNum(Math.hypot(calibPts[1].x - calibPts[0].x, calibPts[1].y - calibPts[0].y), 1)} px`}
                    </div>
                    {calibPts.length === 2 && (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.1"
                          value={calibDistanceM}
                          onChange={(e) => setCalibDistanceM(e.target.value)}
                          className="w-24 px-2 py-1 font-mono bg-white dark:bg-slate-900 border border-purple-300 rounded"
                        />
                        <span>meters</span>
                        <button
                          type="button"
                          onClick={() => {
                            const px = Math.hypot(calibPts[1].x - calibPts[0].x, calibPts[1].y - calibPts[0].y);
                            const distM = parseFloat(calibDistanceM) || 1;
                            if (px > 0 && distM > 0) {
                              setSheets((prev) =>
                                prev.map((x) =>
                                  x.id === activeSheet.id
                                    ? { ...x, calibratedPixelsPerMeter: px / distM }
                                    : x
                                )
                              );
                            }
                            setCalibMode(false);
                          }}
                          className="px-2.5 py-1 rounded bg-purple-700 text-white font-semibold"
                        >
                          Save Scale
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Wall Height (m)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={wallHeightM}
                      onChange={(e) => setWallHeightM(Number(e.target.value) || 3.0)}
                      className="w-full px-2 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Slab Thick (m)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={slabThicknessM}
                      onChange={(e) => setSlabThicknessM(Number(e.target.value) || 0.15)}
                      className="w-full px-2 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Steel (kg/m³)</label>
                    <input
                      type="number"
                      step="5"
                      value={steelRatioKgPerM3}
                      onChange={(e) => setSteelRatioKgPerM3(Number(e.target.value) || 100)}
                      className="w-full px-2 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void startExtractionPipeline()}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-orange-600 hover:bg-orange-700 text-white font-semibold"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Step 3: Run Automated Extraction Job</span>
                </button>
              </>
            ) : (
              <div className="text-slate-500 py-8 text-center">
                No drawing sheets queued. Return to Step 1 to upload or load a project drawing.
              </div>
            )}
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
            <div className="h-[440px] bg-slate-200 dark:bg-slate-950 rounded overflow-hidden relative">
              <canvas
                ref={reviewCanvasRef}
                onClick={(e) => {
                  if (!calibMode || !reviewCanvasRef.current) return;
                  const rect = reviewCanvasRef.current.getBoundingClientRect();
                  const x = (e.clientX - rect.left - canvasPan.x) / canvasZoom;
                  const y = (e.clientY - rect.top - canvasPan.y) / canvasZoom;
                  setCalibPts((prev) => (prev.length >= 2 ? [{ x, y }] : [...prev, { x, y }]));
                }}
                onMouseDown={(e) => {
                  if (calibMode) return;
                  setIsPanning(true);
                  setPanAnchor({ x: e.clientX - canvasPan.x, y: e.clientY - canvasPan.y });
                }}
                onMouseMove={(e) => {
                  if (isPanning) {
                    setCanvasPan({ x: e.clientX - panAnchor.x, y: e.clientY - panAnchor.y });
                  }
                }}
                onMouseUp={() => setIsPanning(false)}
                className={`w-full h-full block ${calibMode ? 'cursor-crosshair' : 'cursor-grab'}`}
              />
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 3: BACKGROUND EXTRACTION JOB MONITOR
      ===================================================================== */}
      {step === 3 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 max-w-3xl mx-auto space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Cpu className="w-5 h-5 text-orange-600" />
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Background Drawing Extraction Job
                </h2>
                <div className="text-xs text-slate-500 font-mono">
                  {jobId ? `Job ${jobId}` : 'Starting...'} · Status: {jobStatus}
                </div>
              </div>
            </div>
            <span className="font-mono text-lg font-bold tabular-nums text-orange-600">
              {jobProgress}%
            </span>
          </div>

          <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                jobStatus === 'Failed' ? 'bg-red-600' : 'bg-orange-600'
              }`}
              style={{ width: `${jobProgress}%` }}
            />
          </div>

          <p className="text-xs text-slate-700 dark:text-slate-300">{jobMessage}</p>

          {jobError && (
            <div className="p-4 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 space-y-2">
              <div className="font-semibold">Extraction Job Stopped</div>
              <div>{jobError}</div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-3 py-1.5 rounded bg-white dark:bg-slate-900 border border-red-300 dark:border-red-700 text-xs font-medium"
                >
                  Back to Pre-processing
                </button>
                <button
                  type="button"
                  onClick={() => void startExtractionPipeline()}
                  className="px-3 py-1.5 rounded bg-red-600 text-white text-xs font-semibold"
                >
                  Retry Extraction
                </button>
              </div>
            </div>
          )}

          {/* Immutable Sheet Hashes */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-1.5 text-xs">
            <div className="font-semibold text-slate-800 dark:text-slate-200">
              Immutable Source Files & Job Stage Log
            </div>
            {sheets.map((s) => (
              <div key={s.id} className="text-[11px] text-slate-500 font-mono">
                {s.name} · SHA-256: {s.immutableHash || 'computing...'}
              </div>
            ))}
            <div className="space-y-1 pt-2 max-h-40 overflow-y-auto">
              {jobLogs.map((l, idx) => (
                <div key={idx} className="text-[11px] text-slate-600 dark:text-slate-400">
                  <span className="font-mono text-slate-400 mr-2">{l.timestamp.slice(11, 19)}</span>
                  <strong className="text-slate-800 dark:text-slate-200">{l.stage}:</strong> {l.detail}
                </div>
              ))}
            </div>
          </div>

          {jobStatus === 'Completed' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-orange-600 text-white text-xs font-semibold"
              >
                <span>Inspect Calculated Quantities</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          STEP 4: QUANTITY CALCULATION & FORMULAS
      ===================================================================== */}
      {step === 4 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Step 4: Quantity Calculations & Traceable Engineering Formulas ({elements.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Verify dimensions (No × L × B × H − Deductions) or auto-derive Rebar & Shuttering before split-screen review.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={deriveRebarAndShuttering}
                className="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
              >
                + Auto-Derive Rebar & Shuttering
              </button>
              <button
                type="button"
                onClick={() => setStep(5)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-orange-600 hover:bg-orange-700 text-white font-semibold"
              >
                <span>Open Step 5 Split-View Review</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                  <th className="py-2 pr-2 font-medium">Element & Source</th>
                  <th className="py-2 px-2 font-medium">Category</th>
                  <th className="py-2 px-2 font-medium text-right">No.</th>
                  <th className="py-2 px-2 font-medium text-right">L</th>
                  <th className="py-2 px-2 font-medium text-right">B</th>
                  <th className="py-2 px-2 font-medium text-right">H/D</th>
                  <th className="py-2 px-2 font-medium text-right">Deduct</th>
                  <th className="py-2 px-2 font-medium text-right">Net Qty</th>
                  <th className="py-2 pl-2 font-medium">Traceable Formula</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {elements.map((el) => (
                  <tr key={el.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-2 pr-2">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {el.elementName}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {el.sheetName} · P.{el.page} · {el.coordinatesLabel}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-slate-600 dark:text-slate-300">{el.category}</td>
                    <td className="py-2 px-2 text-right">
                      <input
                        type="number"
                        value={el.no}
                        onChange={(e) => updateElement(el.id, { no: Number(e.target.value) || 0 }, true)}
                        className="w-12 px-1 py-0.5 text-right font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={el.length}
                        onChange={(e) => updateElement(el.id, { length: Number(e.target.value) || 0 }, true)}
                        className="w-14 px-1 py-0.5 text-right font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={el.breadth}
                        onChange={(e) => updateElement(el.id, { breadth: Number(e.target.value) || 0 }, true)}
                        className="w-14 px-1 py-0.5 text-right font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={el.height}
                        onChange={(e) => updateElement(el.id, { height: Number(e.target.value) || 0 }, true)}
                        className="w-14 px-1 py-0.5 text-right font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={el.deductionQty}
                        onChange={(e) =>
                          updateElement(el.id, { deductionQty: Number(e.target.value) || 0 }, true)
                        }
                        className="w-14 px-1 py-0.5 text-right font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                      />
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                      {formatNum(el.netQty, 2)} {el.unit}
                    </td>
                    <td className="py-2 pl-2 font-mono text-[11px] text-sky-700 dark:text-sky-400">
                      {el.formula}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 5: SPLIT-VIEW REVIEW SCREEN (DRAWING LEFT, TABLE RIGHT)
      ===================================================================== */}
      {step === 5 && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setElements((prev) =>
                    prev.map((el) =>
                      el.confidenceLevel === 'High' && el.status === 'Pending'
                        ? { ...el, status: 'Accepted' }
                        : el
                    )
                  );
                  setAuditDecisions((d) => [
                    ...d,
                    { action: 'Bulk Accept High-Confidence', details: 'Accepted all High confidence elements' },
                  ]);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Accept all high-confidence</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setElements((prev) =>
                    prev.map((el) =>
                      el.confidenceLevel === 'Low' ? { ...el, status: 'Flagged' } : el
                    )
                  )
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-red-200 dark:border-red-900/50 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 font-medium"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Flag low-confidence for manual check</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-slate-500">
                Accepted/Edited: {acceptedCount} of {elements.length}
              </span>
              <button
                type="button"
                onClick={() => setStep(6)}
                className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded bg-orange-600 hover:bg-orange-700 text-white font-semibold"
              >
                <span>Step 6: Map to BOQ</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            {/* Left: Interactive Highlighted Drawing */}
            <div className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <select
                  value={activeSheet?.id || ''}
                  onChange={(e) => setActiveSheetId(e.target.value)}
                  className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded max-w-[260px] truncate"
                >
                  {sheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (P.{s.activePage})
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCanvasZoom((z) => Math.min(3, z + 0.15))}
                    className="p-1.5 rounded border border-slate-200 dark:border-slate-700"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCanvasZoom((z) => Math.max(0.3, z - 0.15))}
                    className="p-1.5 rounded border border-slate-200 dark:border-slate-700"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCanvasZoom(0.85);
                      setCanvasPan({ x: 16, y: 16 });
                    }}
                    className="p-1.5 rounded border border-slate-200 dark:border-slate-700"
                    title="Reset View"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="h-[520px] bg-slate-200 dark:bg-slate-950 rounded overflow-hidden relative">
                <canvas
                  ref={reviewCanvasRef}
                  onClick={(e) => {
                    if (!reviewCanvasRef.current || !activeSheet) return;
                    const rect = reviewCanvasRef.current.getBoundingClientRect();
                    const dx = (e.clientX - rect.left - canvasPan.x) / canvasZoom;
                    const dy = (e.clientY - rect.top - canvasPan.y) / canvasZoom;
                    const xPct = (dx / loadedBgDim.w) * 100;
                    const yPct = (dy / loadedBgDim.h) * 100;
                    const hit = elements.find(
                      (el) =>
                        el.sheetId === activeSheet.id &&
                        el.page === activeSheet.activePage &&
                        xPct >= el.bbox.xPct &&
                        xPct <= el.bbox.xPct + el.bbox.wPct &&
                        yPct >= el.bbox.yPct &&
                        yPct <= el.bbox.yPct + el.bbox.hPct
                    );
                    if (hit) setSelectedElementId(hit.id);
                  }}
                  onMouseDown={(e) => {
                    setIsPanning(true);
                    setPanAnchor({ x: e.clientX - canvasPan.x, y: e.clientY - canvasPan.y });
                  }}
                  onMouseMove={(e) => {
                    if (isPanning) {
                      setCanvasPan({ x: e.clientX - panAnchor.x, y: e.clientY - panAnchor.y });
                    }
                  }}
                  onMouseUp={() => setIsPanning(false)}
                  className="w-full h-full block cursor-pointer"
                />
                <div className="absolute bottom-2.5 left-2.5 bg-slate-900/85 text-white px-2.5 py-1 rounded text-[11px] pointer-events-none">
                  Click any highlighted box on the drawing to select its row · Drag to pan
                </div>
              </div>
            </div>

            {/* Right: Review Table */}
            <div className="xl:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 overflow-x-auto max-h-[580px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10 border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                  <tr>
                    <th className="py-2 pr-2 font-medium">Element</th>
                    <th className="py-2 px-2 font-medium text-right">Qty</th>
                    <th className="py-2 px-2 font-medium">Confidence</th>
                    <th className="py-2 px-2 font-medium">Linked BOQ</th>
                    <th className="py-2 pl-2 font-medium text-right">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {elements.map((el) => {
                    const isSel = el.id === selectedElementId;
                    const isEditing = el.id === editingElementId;
                    return (
                      <tr
                        key={el.id}
                        onClick={() => {
                          setSelectedElementId(el.id);
                          setActiveSheetId(el.sheetId);
                        }}
                        className={`cursor-pointer transition-colors ${
                          isSel
                            ? 'bg-orange-50/70 dark:bg-orange-950/30'
                            : el.status === 'Rejected'
                            ? 'opacity-50'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2.5 pr-2">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {el.elementName}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {el.formula}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Status: <strong>{el.status}</strong> · {el.coordinatesLabel}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.1"
                              value={el.length}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                updateElement(el.id, { length: Number(e.target.value) || 0 }, true)
                              }
                              className="w-16 px-1 py-0.5 text-right bg-white dark:bg-slate-900 border border-orange-400 rounded"
                            />
                          ) : (
                            `${formatNum(el.netQty, 2)} ${el.unit}`
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          <span
                            className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold ${confidenceStyle(
                              el.confidenceLevel
                            )}`}
                          >
                            {el.confidenceLevel} ({Math.round(el.confidenceScore * 100)}%)
                          </span>
                        </td>
                        <td className="py-2.5 px-2" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={el.linkedBoqItemId || ''}
                            onChange={(e) =>
                              updateElement(el.id, { linkedBoqItemId: e.target.value || undefined })
                            }
                            className="w-36 px-1.5 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded truncate"
                          >
                            <option value="">-- Unmapped --</option>
                            {project.boqItems.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.itemNo} {b.category}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 pl-2 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              title="Accept"
                              onClick={() => setElementStatus(el.id, 'Accepted')}
                              className={`p-1 rounded ${
                                el.status === 'Accepted'
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-emerald-600 hover:bg-emerald-100'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Edit"
                              onClick={() =>
                                setEditingElementId(isEditing ? null : el.id)
                              }
                              className={`p-1 rounded ${
                                isEditing
                                  ? 'bg-sky-600 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-sky-600 hover:bg-sky-100'
                              }`}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Reject"
                              onClick={() => setElementStatus(el.id, 'Rejected')}
                              className={`p-1 rounded ${
                                el.status === 'Rejected'
                                  ? 'bg-red-600 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-red-600 hover:bg-red-100'
                              }`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 6: BOQ & RATE LIBRARY MAPPING
      ===================================================================== */}
      {step === 6 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  BOQ Item & Rate Library Mapping ({acceptedCount} Confirmed Elements)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  AI suggestions stay isolated until you map and confirm them in Step 7.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMappings}
                  onChange={(e) => setRememberMappings(e.target.checked)}
                  className="accent-orange-600"
                />
                <span>Remember mappings (Learning)</span>
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                    <th className="py-2 pr-3 font-medium">Extracted Element</th>
                    <th className="py-2 px-3 font-medium text-right">Net Qty</th>
                    <th className="py-2 px-3 font-medium">Assigned BOQ Item</th>
                    <th className="py-2 px-3 font-medium text-right">Unit Rate</th>
                    <th className="py-2 pl-3 font-medium text-right">Est. Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {elements
                    .filter((e) => e.status === 'Accepted' || e.status === 'Edited')
                    .map((el) => {
                      const boq = summary.items.find((b) => b.id === el.linkedBoqItemId);
                      const estCost = boq ? el.netQty * boq.unitRate : 0;
                      return (
                        <tr key={el.id}>
                          <td className="py-2.5 pr-3">
                            <div className="font-medium text-slate-900 dark:text-white">
                              {el.elementName}
                            </div>
                            <div className="text-[10px] text-slate-500">{el.category}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {formatNum(el.netQty, 2)} {el.unit}
                          </td>
                          <td className="py-2.5 px-3">
                            <select
                              value={el.linkedBoqItemId || ''}
                              onChange={(e) =>
                                updateElement(el.id, { linkedBoqItemId: e.target.value || undefined })
                              }
                              className="w-full max-w-[240px] px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                            >
                              <option value="">-- Assign BOQ Item --</option>
                              {project.boqItems.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.itemNo} · {b.category} — {b.description.slice(0, 40)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {boq ? formatCurrency(boq.unitRate, project.currency) : '—'}
                          </td>
                          <td className="py-2.5 pl-3 text-right font-mono font-semibold tabular-nums">
                            {boq ? formatCurrency(estCost, project.currency) : 'Unmapped'}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-4">
            {/* Unmapped Alert & Quick New BOQ Item */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 text-xs">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Unmapped Items ({unmappedAccepted.length})
              </h3>
              {unmappedAccepted.length === 0 ? (
                <div className="text-emerald-600 dark:text-emerald-400 font-medium">
                  All accepted elements are mapped to BOQ items.
                </div>
              ) : (
                <div className="space-y-1 text-amber-700 dark:text-amber-300">
                  {unmappedAccepted.map((u) => (
                    <div key={u.id}>• {u.elementName} ({formatNum(u.netQty, 1)} {u.unit})</div>
                  ))}
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  Create New BOQ Item for Unmapped Scope
                </div>
                <input
                  type="text"
                  value={newBoqDesc}
                  onChange={(e) => setNewBoqDesc(e.target.value)}
                  placeholder="BOQ Item Description"
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
                <div className="grid grid-cols-3 gap-1.5">
                  <select
                    value={newBoqCat}
                    onChange={(e) => setNewBoqCat(e.target.value as WorkCategory)}
                    className="px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  >
                    {WORK_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newBoqUnit}
                    onChange={(e) => setNewBoqUnit(e.target.value)}
                    placeholder="Unit"
                    className="px-2 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  />
                  <input
                    type="number"
                    value={newBoqRate}
                    onChange={(e) => setNewBoqRate(Number(e.target.value) || 0)}
                    placeholder="Rate"
                    className="px-2 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!newBoqDesc.trim()) return;
                    addBOQItem({
                      itemNo: `${project.boqItems.length + 1}.1`,
                      category: newBoqCat,
                      description: newBoqDesc.trim(),
                      unit: newBoqUnit,
                      useRateAnalysis: false,
                      manualRate: newBoqRate,
                      productivityPerDay: 12,
                      crewSize: 1,
                      dependencies: [],
                      actualProgressPct: 0,
                    });
                    setNewBoqDesc('');
                  }}
                  className="w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add BOQ Item</span>
                </button>
              </div>
            </div>

            {/* Save Template & Confirm */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder={`Template name (${drawingType})`}
                  className="flex-1 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
                <button
                  type="button"
                  onClick={() => {
                    savePipelineTemplate({
                      name: templateName.trim() || `${drawingType} Standard`,
                      drawingType,
                      defaultScaleRatio: activeSheet?.detectedScaleText || '1:100',
                      defaultWallHeightM: wallHeightM,
                      defaultSlabThicknessM: slabThicknessM,
                      steelRatioKgPerM3,
                      autoAcceptMinConfidence: 0.85,
                      categoryMappings: {},
                    });
                    setTemplateName('');
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 font-medium"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </div>

              <button
                type="button"
                disabled={acceptedCount === 0}
                onClick={handleConfirmAndPush}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-orange-600 hover:bg-orange-700 text-white font-semibold disabled:opacity-40"
              >
                <FileCheck2 className="w-4 h-4" />
                <span>Step 7: Confirm & Update Estimate</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 7: AUTO-CALCULATION SUMMARY (BEFORE VS AFTER)
      ===================================================================== */}
      {step === 7 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5">
          {commitResult ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                      Estimate Auto-Recalculated from Drawing Batch ({revisionLabel})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Pushed into Measurement Sheet → Abstract of Quantities, Abstract of Cost, Materials, Labor, CPM Schedule & Charts updated.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(8)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#0F2137] text-white text-xs font-semibold"
                >
                  <span>Step 8: Validation & Revision Diff</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                  <div className="text-[11px] text-slate-500">Grand Total (Before)</div>
                  <div className="text-lg font-mono font-bold tabular-nums mt-1">
                    {formatCompactCurrency(commitResult.grandTotalBefore, project.currency)}
                  </div>
                </div>
                <div className="p-4 rounded-md border border-orange-200 dark:border-orange-900/40 bg-orange-50/40 dark:bg-orange-950/20">
                  <div className="text-[11px] text-slate-500">Grand Total (After)</div>
                  <div className="text-lg font-mono font-bold tabular-nums text-orange-600 dark:text-orange-400 mt-1">
                    {formatCompactCurrency(commitResult.grandTotalAfter, project.currency)}
                  </div>
                </div>
                <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                  <div className="text-[11px] text-slate-500">Net Cost Delta</div>
                  <div className="text-lg font-mono font-bold tabular-nums mt-1">
                    {commitResult.grandTotalAfter - commitResult.grandTotalBefore >= 0 ? '+' : ''}
                    {formatCompactCurrency(
                      commitResult.grandTotalAfter - commitResult.grandTotalBefore,
                      project.currency
                    )}
                  </div>
                </div>
                <div className="p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                  <div className="text-[11px] text-slate-500">Schedule Duration Impact</div>
                  <div className="text-lg font-mono font-bold tabular-nums mt-1">
                    {commitResult.durationBefore}d → {commitResult.durationAfter}d
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveModule('measurements')}
                  className="px-3.5 py-2 rounded border border-slate-200 dark:border-slate-700 font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Open Measurement Sheet
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModule('abstract-cost')}
                  className="px-3.5 py-2 rounded border border-slate-200 dark:border-slate-700 font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Open Abstract of Cost
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModule('planner')}
                  className="px-3.5 py-2 rounded border border-slate-200 dark:border-slate-700 font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Open Project Planner
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-8 space-y-3 text-xs text-slate-500">
              <div>No extraction run confirmed yet. Complete Step 6 mapping and click Confirm & Update Estimate.</div>
              <button
                type="button"
                onClick={() => setStep(6)}
                className="px-4 py-2 rounded bg-orange-600 text-white font-semibold"
              >
                Go to Step 6 Mapping
              </button>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          STEP 8: AUTOMATIC VALIDATION & REVISION COMPARISON (REV B vs REV A)
      ===================================================================== */}
      {step === 8 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* QA Validation Checks */}
          <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Automated QA Validation Checks ({validationWarnings.length})
              </h2>
              <span className="text-xs text-slate-500">Scale, Outliers, Rates, Deductions & Schedules</span>
            </div>

            {validationWarnings.length === 0 ? (
              <div className="p-4 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300">
                All automated validation checks passed with zero anomalies.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {validationWarnings.map((w) => (
                  <div
                    key={w.id}
                    className="p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs flex items-start justify-between gap-2"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <AlertTriangle
                          className={`w-3.5 h-3.5 shrink-0 ${
                            w.severity === 'error'
                              ? 'text-red-600'
                              : w.severity === 'warning'
                              ? 'text-amber-600'
                              : 'text-sky-600'
                          }`}
                        />
                        <span>{w.title}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{w.description}</div>
                    </div>
                    {w.elementId && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedElementId(w.elementId!);
                          setStep(5);
                        }}
                        className="text-[11px] text-orange-600 font-medium shrink-0 hover:underline"
                      >
                        Inspect →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Revision Comparison */}
          <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-orange-600" />
                <span>Revision Comparison ({revisionLabel} vs Baseline)</span>
              </h2>
              {(project.pipelineRuns || []).length > 0 && (
                <select
                  value={compareRunId}
                  onChange={(e) => setCompareRunId(e.target.value)}
                  className="px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                >
                  {(project.pipelineRuns || []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.revisionLabel} ({r.createdAt.slice(0, 10)})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {!revisionDiff ? (
              <div className="text-xs text-slate-500 py-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded">
                Commit at least one revision run in Step 7, then upload a newer revision (e.g., Rev B) to inspect quantity, cost & schedule deltas.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <div className="text-[10px] text-slate-500">Changed Items</div>
                    <div className="font-mono font-bold text-slate-900 dark:text-white">
                      {revisionDiff.diffs.length}
                    </div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <div className="text-[10px] text-slate-500">Cost Impact vs {revisionDiff.baseRunLabel}</div>
                    <div className="font-mono font-bold text-orange-600">
                      {revisionDiff.totalCostDelta >= 0 ? '+' : ''}
                      {formatCompactCurrency(revisionDiff.totalCostDelta, project.currency)}
                    </div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <div className="text-[10px] text-slate-500">Est. Time Impact</div>
                    <div className="font-mono font-bold text-slate-900 dark:text-white">
                      {revisionDiff.estDaysDelta >= 0 ? '+' : ''}
                      {revisionDiff.estDaysDelta} days
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto text-xs">
                  {revisionDiff.diffs.map((d) => (
                    <div key={d.key} className="py-2 flex items-center justify-between gap-2">
                      <div>
                        <span
                          className={`font-semibold mr-2 ${
                            d.changeType === 'Added'
                              ? 'text-emerald-600'
                              : d.changeType === 'Removed'
                              ? 'text-red-600'
                              : 'text-amber-600'
                          }`}
                        >
                          [{d.changeType}]
                        </span>
                        <span className="font-medium text-slate-900 dark:text-white">{d.label}</span>
                        <div className="text-[10px] font-mono text-slate-500">
                          {formatNum(d.oldQty, 2)} → {formatNum(d.newQty, 2)} {d.unit} (Δ {d.deltaQty >= 0 ? '+' : ''}
                          {formatNum(d.deltaQty, 2)})
                        </div>
                      </div>
                      <span className="font-mono font-semibold tabular-nums">
                        {d.deltaCost >= 0 ? '+' : ''}
                        {formatCompactCurrency(d.deltaCost, project.currency)}
                      </span>
                    </div>
                  ))}
                  {revisionDiff.diffs.length === 0 && (
                    <div className="py-6 text-center text-slate-500">
                      No quantity differences detected versus {revisionDiff.baseRunLabel}.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
