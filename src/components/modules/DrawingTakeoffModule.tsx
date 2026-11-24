import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  Box,
  Check,
  Compass,
  Crosshair,
  Hand,
  Hash,
  Layers,
  Maximize2,
  Pentagon,
  Ruler,
  Sparkles,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useEstimateStore } from '../../store/useEstimateStore';
import {
  DrawingFile,
  DrawingMarkup,
  MarkupTool,
  Point2D,
  WorkCategory,
} from '../../types/estimate';
import { parseDxfText } from '../../engine/dxfParser';
import { formatNum } from '../../engine/formatters';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface AISuggestion {
  id: string;
  label: string;
  kind: string;
  suggestedCategory: WorkCategory;
  count: number;
  length: number;
  breadth: number;
  height: number;
  unit: string;
  confidence: number;
  notes: string;
  targetBoqId: string;
  accepted: boolean;
}

const LAYER_COLORS: Record<DrawingMarkup['layer'], string> = {
  Architectural: '#ea580c',
  Structural: '#16a34a',
  MEP: '#0284c7',
  Takeoff: '#9333ea',
};

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function polylineLength(pts: Point2D[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

function polygonArea(pts: Point2D[]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(sum) / 2;
}

export const DrawingTakeoffModule: React.FC = () => {
  const { project, unitSystem } = useActiveProject();
  const addDrawing = useEstimateStore((s) => s.addDrawing);
  const deleteDrawing = useEstimateStore((s) => s.deleteDrawing);
  const setDrawingCalibration = useEstimateStore((s) => s.setDrawingCalibration);
  const addDrawingMarkup = useEstimateStore((s) => s.addDrawingMarkup);
  const deleteDrawingMarkup = useEstimateStore((s) => s.deleteDrawingMarkup);
  const addMeasurement = useEstimateStore((s) => s.addMeasurement);
  const setActiveModule = useEstimateStore((s) => s.setActiveModule);

  const [activeDrawingId, setActiveDrawingId] = useState(project.drawings[0]?.id || '');
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState<Point2D>({ x: 24, y: 20 });
  const [tool, setTool] = useState<MarkupTool>('select');
  const [activeLayer, setActiveLayer] = useState<DrawingMarkup['layer']>('Architectural');
  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>({
    Architectural: true,
    Structural: true,
    MEP: true,
    Takeoff: true,
  });

  // Drawing canvas state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bgSize, setBgSize] = useState<{ w: number; h: number }>({ w: 1200, h: 720 });
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [pdfPageThumbs, setPdfPageThumbs] = useState<string[]>([]);
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const [panStart, setPanStart] = useState<Point2D>({ x: 0, y: 0 });
  const [draftPoints, setDraftPoints] = useState<Point2D[]>([]);
  const [mousePos, setMousePos] = useState<Point2D | null>(null);

  // Calibration prompt
  const [calibPoints, setCalibPoints] = useState<[Point2D, Point2D] | null>(null);
  const [calibInputDist, setCalibInputDist] = useState('13.6');

  // Save markup to BOQ modal
  const [pendingMarkup, setPendingMarkup] = useState<{
    tool: Exclude<MarkupTool, 'select' | 'calibrate'>;
    points: Point2D[];
    pixelValue: number;
    realValue: number;
    unit: string;
  } | null>(null);
  const [mkLabel, setMkLabel] = useState('');
  const [mkDepth, setMkDepth] = useState(0.15);
  const [mkBoqId, setMkBoqId] = useState(project.boqItems[0]?.id || '');

  // AI extraction state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);

  const activeDrawing: DrawingFile | undefined =
    project.drawings.find((d) => d.id === activeDrawingId) || project.drawings[0];

  const activeCalibration = activeDrawing?.calibrations[page];
  const pixelsPerUnit = activeCalibration?.pixelsPerUnit || 58.2;
  const distUnit = unitSystem === 'imperial' ? 'ft' : 'm';

  // Load image / PDF page / DXF onto offscreen image buffer
  useEffect(() => {
    if (!activeDrawing) {
      setBgImage(null);
      return;
    }

    let cancelled = false;

    if (activeDrawing.fileType === 'image') {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        setBgImage(img);
        setBgSize({ w: img.naturalWidth || 1200, h: img.naturalHeight || 720 });
      };
      img.src = activeDrawing.dataUrl;
      setPdfPageThumbs([]);
    } else if (activeDrawing.fileType === 'pdf') {
      (async () => {
        try {
          const loadingTask = pdfjsLib.getDocument({ url: activeDrawing.dataUrl });
          const pdf = await loadingTask.promise;
          const pdfPage = await pdf.getPage(Math.min(page, pdf.numPages));
          const viewport = pdfPage.getViewport({ scale: 1.8 });
          const off = document.createElement('canvas');
          off.width = viewport.width;
          off.height = viewport.height;
          const ctx = off.getContext('2d')!;
          await pdfPage.render({ canvasContext: ctx, viewport, canvas: off }).promise;
          const url = off.toDataURL('image/png');
          const img = new Image();
          img.onload = () => {
            if (!cancelled) {
              setBgImage(img);
              setBgSize({ w: viewport.width, h: viewport.height });
            }
          };
          img.src = url;

          // Build small thumbnails if >1 page
          if (pdf.numPages > 1 && pdfPageThumbs.length === 0) {
            const thumbs: string[] = [];
            for (let p = 1; p <= Math.min(pdf.numPages, 8); p++) {
              const pg = await pdf.getPage(p);
              const vp = pg.getViewport({ scale: 0.25 });
              const c = document.createElement('canvas');
              c.width = vp.width;
              c.height = vp.height;
              await pg.render({ canvasContext: c.getContext('2d')!, viewport: vp, canvas: c }).promise;
              thumbs.push(c.toDataURL('image/png'));
            }
            if (!cancelled) setPdfPageThumbs(thumbs);
          }
        } catch (err) {
          console.error('PDF render failed:', err);
        }
      })();
    } else if (activeDrawing.fileType === 'dxf') {
      // Render DXF entities onto an offscreen white drafting sheet
      const entities = activeDrawing.dxfEntities || [];
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const ent of entities) {
        if (ent.points) {
          for (const p of ent.points) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
          }
        }
        if (ent.center) {
          const r = ent.radius || 0;
          minX = Math.min(minX, ent.center.x - r);
          minY = Math.min(minY, ent.center.y - r);
          maxX = Math.max(maxX, ent.center.x + r);
          maxY = Math.max(maxY, ent.center.y + r);
        }
      }
      if (!Number.isFinite(minX)) {
        minX = 0;
        minY = 0;
        maxX = 100;
        maxY = 60;
      }
      const w = 1280;
      const h = 760;
      const pad = 48;
      const spanX = Math.max(1, maxX - minX);
      const spanY = Math.max(1, maxY - minY);
      const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);

      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const ctx = off.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);

      // Subtle CAD grid
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
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

      const tx = (x: number) => pad + (x - minX) * scale;
      const ty = (y: number) => h - pad - (y - minY) * scale;

      ctx.strokeStyle = '#0f2137';
      ctx.lineWidth = 1.6;
      for (const ent of entities) {
        if ((ent.type === 'LINE' || ent.type === 'LWPOLYLINE') && ent.points && ent.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(tx(ent.points[0].x), ty(ent.points[0].y));
          for (let k = 1; k < ent.points.length; k++) {
            ctx.lineTo(tx(ent.points[k].x), ty(ent.points[k].y));
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

      const img = new Image();
      img.onload = () => {
        if (!cancelled) {
          setBgImage(img);
          setBgSize({ w, h });
        }
      };
      img.src = off.toDataURL('image/png');
    }

    return () => {
      cancelled = true;
    };
  }, [activeDrawing?.id, activeDrawing?.fileType, activeDrawing?.dataUrl, page]);

  // Draw canvas frame
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    const cw = Math.max(400, Math.floor(rect?.width || 900));
    const ch = Math.max(460, Math.floor(rect?.height || 560));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    if (bgImage) {
      ctx.drawImage(bgImage, 0, 0, bgSize.w, bgSize.h);
    }

    // Draw Calibration reference line if active
    if (activeCalibration) {
      ctx.save();
      ctx.strokeStyle = '#9333ea';
      ctx.setLineDash([6 / zoom, 4 / zoom]);
      ctx.lineWidth = 2 / zoom;
      ctx.beginPath();
      ctx.moveTo(activeCalibration.p1.x, activeCalibration.p1.y);
      ctx.lineTo(activeCalibration.p2.x, activeCalibration.p2.y);
      ctx.stroke();
      ctx.restore();
    }

    // Draw saved markups on current page
    const pageMarkups = (activeDrawing?.markups || []).filter(
      (m) => m.page === page && visibleLayers[m.layer]
    );
    for (const mk of pageMarkups) {
      ctx.save();
      ctx.strokeStyle = mk.color;
      ctx.fillStyle = mk.color;
      ctx.lineWidth = 2.5 / zoom;

      if (mk.tool === 'count' && mk.points[0]) {
        const pt = mk.points[0];
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 10 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = mk.color;
        ctx.font = `bold ${11 / zoom}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', pt.x, pt.y);
      } else if (mk.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(mk.points[0].x, mk.points[0].y);
        for (let i = 1; i < mk.points.length; i++) {
          ctx.lineTo(mk.points[i].x, mk.points[i].y);
        }
        if (mk.tool === 'area' || mk.tool === 'volume' || mk.tool === 'perimeter') {
          ctx.closePath();
          if (mk.tool === 'area' || mk.tool === 'volume') {
            ctx.save();
            ctx.globalAlpha = 0.16;
            ctx.fill();
            ctx.restore();
          }
        }
        ctx.stroke();

        // Label badge
        const cx = mk.points.reduce((s, p) => s + p.x, 0) / mk.points.length;
        const cy = mk.points.reduce((s, p) => s + p.y, 0) / mk.points.length;
        const text = `${mk.label}: ${formatNum(mk.realValue, 2)} ${mk.unit}`;
        ctx.font = `600 ${12 / zoom}px monospace`;
        const tw = ctx.measureText(text).width + 10 / zoom;
        ctx.fillStyle = 'rgba(15, 33, 55, 0.88)';
        ctx.fillRect(cx - tw / 2, cy - 10 / zoom, tw, 18 / zoom);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, cx, cy);
      }
      ctx.restore();
    }

    // Draw draft points in progress
    if (draftPoints.length > 0) {
      ctx.save();
      ctx.strokeStyle = LAYER_COLORS[activeLayer];
      ctx.lineWidth = 2.5 / zoom;
      ctx.beginPath();
      ctx.moveTo(draftPoints[0].x, draftPoints[0].y);
      for (let i = 1; i < draftPoints.length; i++) {
        ctx.lineTo(draftPoints[i].x, draftPoints[i].y);
      }
      if (mousePos) {
        ctx.lineTo(mousePos.x, mousePos.y);
      }
      ctx.stroke();
      for (const pt of draftPoints) {
        ctx.fillStyle = '#ea580c';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4 / zoom, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
  }, [
    pan,
    zoom,
    bgImage,
    bgSize,
    activeDrawing,
    activeCalibration,
    page,
    visibleLayers,
    draftPoints,
    mousePos,
    activeLayer,
  ]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const toDrawingCoords = (clientX: number, clientY: number): Point2D => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  };

  const finalizeShape = (pts: Point2D[], activeTool: MarkupTool) => {
    if (activeTool === 'calibrate' && pts.length === 2) {
      setCalibPoints([pts[0], pts[1]]);
      setDraftPoints([]);
      return;
    }

    if (
      activeTool === 'select' ||
      activeTool === 'calibrate' ||
      pts.length === 0
    ) {
      return;
    }

    let pixelValue = 0;
    let realValue = 0;
    let unit = distUnit;

    if (activeTool === 'count') {
      pixelValue = 1;
      realValue = 1;
      unit = 'No.';
    } else if (activeTool === 'length' || activeTool === 'polyline') {
      pixelValue = polylineLength(pts);
      realValue = pixelValue / pixelsPerUnit;
      unit = distUnit;
    } else if (activeTool === 'perimeter') {
      const closed = [...pts, pts[0]];
      pixelValue = polylineLength(closed);
      realValue = pixelValue / pixelsPerUnit;
      unit = distUnit;
    } else if (activeTool === 'area') {
      pixelValue = polygonArea(pts);
      realValue = pixelValue / (pixelsPerUnit * pixelsPerUnit);
      unit = `${distUnit}²`;
    } else if (activeTool === 'volume') {
      pixelValue = polygonArea(pts);
      const areaReal = pixelValue / (pixelsPerUnit * pixelsPerUnit);
      realValue = areaReal * mkDepth;
      unit = `${distUnit}³`;
    }

    setPendingMarkup({
      tool: activeTool,
      points: pts,
      pixelValue,
      realValue: Math.round(realValue * 100) / 100,
      unit,
    });
    setMkLabel(`${activeTool.toUpperCase()} Takeoff`);
    setDraftPoints([]);
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (tool === 'select') return;
    const pt = toDrawingCoords(e.clientX, e.clientY);

    if (tool === 'count') {
      finalizeShape([pt], 'count');
      return;
    }

    const next = [...draftPoints, pt];
    if (tool === 'calibrate' && next.length === 2) {
      finalizeShape(next, 'calibrate');
      return;
    }
    if (tool === 'length' && next.length === 2) {
      finalizeShape(next, 'length');
      return;
    }
    setDraftPoints(next);
  };

  const handleCanvasDoubleClick = () => {
    if (
      (tool === 'polyline' || tool === 'area' || tool === 'perimeter' || tool === 'volume') &&
      draftPoints.length >= 2
    ) {
      finalizeShape(draftPoints, tool);
    }
  };

  const handleSaveMarkup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingMarkup || !activeDrawing) return;
    const boq = project.boqItems.find((b) => b.id === mkBoqId) || project.boqItems[0];
    const finalReal =
      pendingMarkup.tool === 'volume'
        ? (pendingMarkup.pixelValue / (pixelsPerUnit * pixelsPerUnit)) * mkDepth
        : pendingMarkup.realValue;

    const mkId = addDrawingMarkup(activeDrawing.id, {
      page,
      tool: pendingMarkup.tool,
      label: mkLabel || 'Takeoff',
      layer: activeLayer,
      points: pendingMarkup.points,
      depth: pendingMarkup.tool === 'volume' ? mkDepth : undefined,
      pixelValue: pendingMarkup.pixelValue,
      realValue: Math.round(finalReal * 100) / 100,
      unit: pendingMarkup.unit,
      color: LAYER_COLORS[activeLayer],
      boqItemId: boq?.id,
    });

    if (boq) {
      // Also log linked MeasurementRow for full traceability!
      const isArea = pendingMarkup.tool === 'area';
      const isVol = pendingMarkup.tool === 'volume';
      const isCount = pendingMarkup.tool === 'count';
      const areaVal = pendingMarkup.pixelValue / (pixelsPerUnit * pixelsPerUnit);
      addMeasurement({
        boqItemId: boq.id,
        srNo: String(project.measurements.length + 1),
        description: `${mkLabel} (Drawing Takeoff)`,
        no: 1,
        length: isCount ? 0 : isArea || isVol ? Math.round(areaVal * 100) / 100 : Math.round(finalReal * 100) / 100,
        breadth: isArea || isVol ? 1 : 0,
        height: isVol ? mkDepth : 0,
        unit: boq.unit,
        remarks: `Scale ${formatNum(pixelsPerUnit, 1)} px/${distUnit}`,
        sourceDrawingId: activeDrawing.id,
        sourceDrawingName: activeDrawing.name,
        sourcePage: page,
        sourceMarkupId: mkId,
      });
    }
    setPendingMarkup(null);
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (ext === 'dxf') {
      const text = await file.text();
      const entities = parseDxfText(text);
      const d: DrawingFile = {
        id: `drw-${Date.now()}`,
        name: file.name,
        fileType: 'dxf',
        dataUrl: '',
        dxfEntities: entities,
        pageCount: 1,
        calibrations: {},
        markups: [],
        uploadedAt: new Date().toISOString(),
      };
      addDrawing(d);
      setActiveDrawingId(d.id);
      setPage(1);
    } else if (ext === 'pdf') {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        let pageCount = 1;
        try {
          const pdf = await pdfjsLib.getDocument({ url: dataUrl }).promise;
          pageCount = pdf.numPages;
        } catch {
          pageCount = 1;
        }
        const d: DrawingFile = {
          id: `drw-${Date.now()}`,
          name: file.name,
          fileType: 'pdf',
          dataUrl,
          pageCount,
          calibrations: {},
          markups: [],
          uploadedAt: new Date().toISOString(),
        };
        addDrawing(d);
        setActiveDrawingId(d.id);
        setPage(1);
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        const d: DrawingFile = {
          id: `drw-${Date.now()}`,
          name: file.name,
          fileType: 'image',
          dataUrl: reader.result as string,
          pageCount: 1,
          calibrations: {},
          markups: [],
          uploadedAt: new Date().toISOString(),
        };
        addDrawing(d);
        setActiveDrawingId(d.id);
        setPage(1);
      };
      reader.readAsDataURL(file);
    }
  };

  const runAiExtraction = async () => {
    if (!bgImage || !activeDrawing) return;
    setAiLoading(true);
    setAiError(null);
    try {
      // Export clean drawing image to JPEG base64
      const off = document.createElement('canvas');
      off.width = Math.min(1400, bgSize.w);
      off.height = Math.round((off.width / bgSize.w) * bgSize.h);
      const ctx = off.getContext('2d')!;
      ctx.drawImage(bgImage, 0, 0, off.width, off.height);
      const imageBase64 = off.toDataURL('image/jpeg', 0.88);

      const resp = await fetch('/api/analyze-drawing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mimeType: 'image/jpeg',
          unitSystem,
          drawingName: activeDrawing.name,
        }),
      });
      const rawText = await resp.text();
      let data: {
        error?: string;
        summary?: string;
        suggestions?: Array<Record<string, unknown>>;
      } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        const snippet = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
        throw new Error(
          `Server returned a non-JSON response (HTTP ${resp.status})${snippet ? `: ${snippet}` : '.'}`
        );
      }
      if (!resp.ok) {
        throw new Error(data.error || `AI drawing extraction failed (HTTP ${resp.status}).`);
      }

      setAiSummary(data.summary || 'Extracted structural and architectural elements.');
      const mapped: AISuggestion[] = (data.suggestions || []).map((s: Record<string, unknown>, idx: number) => {
        const cat = (s.suggestedCategory as WorkCategory) || 'Flooring';
        const matchBoq =
          project.boqItems.find((b) => b.category === cat) || project.boqItems[0];
        return {
          id: `ai-${Date.now()}-${idx}`,
          label: String(s.label || `Element ${idx + 1}`),
          kind: String(s.kind || 'room_area'),
          suggestedCategory: cat,
          count: Number(s.count) || 1,
          length: Number(s.length) || 0,
          breadth: Number(s.breadth) || 0,
          height: Number(s.height) || 0,
          unit: String(s.unit || matchBoq?.unit || 'm²'),
          confidence: Number(s.confidence) || 0.85,
          notes: String(s.notes || ''),
          targetBoqId: matchBoq?.id || '',
          accepted: false,
        };
      });
      setAiSuggestions(mapped);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Unable to reach AI extraction service.');
    } finally {
      setAiLoading(false);
    }
  };

  const confirmAiSuggestion = (sugId: string) => {
    const sug = aiSuggestions.find((s) => s.id === sugId);
    if (!sug || !activeDrawing) return;
    const boq = project.boqItems.find((b) => b.id === sug.targetBoqId) || project.boqItems[0];
    if (!boq) return;

    addMeasurement({
      boqItemId: boq.id,
      srNo: String(project.measurements.length + 1),
      description: `${sug.label} (AI Takeoff)`,
      no: sug.count,
      length: sug.length,
      breadth: sug.breadth,
      height: sug.height,
      unit: boq.unit,
      remarks: sug.notes || 'Confirmed from Gemini Vision extraction',
      sourceDrawingId: activeDrawing.id,
      sourceDrawingName: activeDrawing.name,
      sourcePage: page,
    });

    setAiSuggestions((prev) =>
      prev.map((s) => (s.id === sugId ? { ...s, accepted: true } : s))
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white">
            Drawing Upload & Quantity Takeoff
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Upload PDF, PNG/JPG, or DXF CAD plans. Calibrate scale, measure areas/lengths/volumes, or run AI extraction.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap">
            <Upload className="w-3.5 h-3.5 text-orange-600" />
            <span>Upload Drawing (PDF / DXF / Img)</span>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.dxf"
              onChange={(e) => handleFileUpload(e.target.files)}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={runAiExtraction}
            disabled={aiLoading || !activeDrawing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#0F2137] hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-orange-400" />
            <span>{aiLoading ? 'Analyzing Drawing...' : 'AI Extract Quantities'}</span>
          </button>
        </div>
      </div>

      {/* Drawing Switcher & Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={activeDrawing?.id || ''}
            onChange={(e) => {
              setActiveDrawingId(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded max-w-[260px]"
          >
            {project.drawings.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.fileType.toUpperCase()})
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md">
            {(
              [
                ['select', Hand, 'Pan / Select'],
                ['calibrate', Crosshair, 'Calibrate Scale'],
                ['length', Ruler, 'Length'],
                ['polyline', Compass, 'Polyline'],
                ['area', Pentagon, 'Area'],
                ['perimeter', Layers, 'Perimeter'],
                ['volume', Box, 'Volume'],
                ['count', Hash, 'Count'],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTool(id);
                  setDraftPoints([]);
                }}
                title={label}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap ${
                  tool === id
                    ? 'bg-orange-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">{label}</span>
              </button>
            ))}
          </div>

          {draftPoints.length >= 2 &&
            (tool === 'polyline' || tool === 'area' || tool === 'perimeter' || tool === 'volume') && (
              <button
                type="button"
                onClick={() => finalizeShape(draftPoints, tool)}
                className="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold"
              >
                Finish Shape ({draftPoints.length} pts)
              </button>
            )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-slate-500">
            Scale: {formatNum(pixelsPerUnit, 1)} px/{distUnit}
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, z + 0.15))}
            className="p-1.5 rounded border border-slate-200 dark:border-slate-700"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.25, z - 0.15))}
            className="p-1.5 rounded border border-slate-200 dark:border-slate-700"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(0.85);
              setPan({ x: 24, y: 20 });
            }}
            className="p-1.5 rounded border border-slate-200 dark:border-slate-700"
            title="Fit View"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Canvas + Right Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 space-y-3">
          {/* Calibration Banner */}
          {calibPoints && (
            <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span>
                Two reference points picked ({formatNum(dist(calibPoints[0], calibPoints[1]), 1)} px).
                Enter real-world distance ({distUnit}):
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={calibInputDist}
                  onChange={(e) => setCalibInputDist(e.target.value)}
                  className="w-24 px-2 py-1 font-mono bg-white dark:bg-slate-900 border border-purple-300 rounded"
                />
                <button
                  type="button"
                  onClick={() => {
                    const realDist = parseFloat(calibInputDist) || 1;
                    const pxDist = dist(calibPoints[0], calibPoints[1]);
                    if (activeDrawing && realDist > 0 && pxDist > 0) {
                      setDrawingCalibration(activeDrawing.id, {
                        page,
                        pixelsPerUnit: pxDist / realDist,
                        unit: distUnit,
                        referenceDistance: realDist,
                        p1: calibPoints[0],
                        p2: calibPoints[1],
                      });
                    }
                    setCalibPoints(null);
                    setTool('select');
                  }}
                  className="px-3 py-1 rounded bg-purple-700 text-white font-semibold"
                >
                  Apply Scale
                </button>
                <button
                  type="button"
                  onClick={() => setCalibPoints(null)}
                  className="px-2 py-1 text-slate-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Interactive Viewport */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFileUpload(e.dataTransfer.files);
            }}
            className="relative h-[540px] bg-slate-200 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg overflow-hidden"
          >
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              onDoubleClick={handleCanvasDoubleClick}
              onMouseDown={(e) => {
                if (tool === 'select' || e.button === 1) {
                  setIsDraggingPan(true);
                  setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
                }
              }}
              onMouseMove={(e) => {
                if (isDraggingPan) {
                  setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
                } else if (draftPoints.length > 0 && canvasRef.current) {
                  setMousePos(toDrawingCoords(e.clientX, e.clientY));
                }
              }}
              onMouseUp={() => setIsDraggingPan(false)}
              onWheel={(e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.08 : -0.08;
                setZoom((z) => Math.min(3, Math.max(0.25, z + delta)));
              }}
              className={`w-full h-full block ${
                tool === 'select' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
              }`}
            />

            <div className="absolute bottom-3 left-3 bg-slate-900/85 text-white px-3 py-1.5 rounded text-[11px] pointer-events-none">
              {tool === 'select' && 'Drag canvas to pan · Scroll to zoom · Select a measurement tool above'}
              {tool === 'calibrate' && 'Click two points with a known dimension on the drawing'}
              {tool === 'length' && 'Click start point and end point'}
              {(tool === 'polyline' || tool === 'area' || tool === 'perimeter' || tool === 'volume') &&
                'Click vertices around feature · Double-click or press Finish Shape'}
              {tool === 'count' && 'Click anywhere on drawing to drop a count marker'}
            </div>
          </div>

          {/* PDF Page Thumbnails */}
          {activeDrawing && activeDrawing.pageCount > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
              {Array.from({ length: activeDrawing.pageCount }).map((_, idx) => {
                const pNum = idx + 1;
                return (
                  <button
                    key={pNum}
                    type="button"
                    onClick={() => setPage(pNum)}
                    className={`p-1.5 rounded border text-[11px] font-mono shrink-0 ${
                      page === pNum
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {pdfPageThumbs[idx] && (
                      <img
                        src={pdfPageThumbs[idx]}
                        alt={`Page ${pNum}`}
                        className="w-16 h-12 object-contain mb-1"
                      />
                    )}
                    <div>Page {pNum}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Layers, Markups & AI Extraction Panel */}
        <div className="xl:col-span-4 space-y-4">
          {/* Layer Controls */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900 dark:text-white">
                Takeoff Layers
              </span>
              <select
                value={activeLayer}
                onChange={(e) => setActiveLayer(e.target.value as DrawingMarkup['layer'])}
                className="text-[11px] px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              >
                <option value="Architectural">Active: Architectural</option>
                <option value="Structural">Active: Structural</option>
                <option value="MEP">Active: MEP</option>
                <option value="Takeoff">Active: Takeoff</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {(['Architectural', 'Structural', 'MEP', 'Takeoff'] as const).map((layer) => (
                <label key={layer} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visibleLayers[layer]}
                    onChange={(e) =>
                      setVisibleLayers((prev) => ({ ...prev, [layer]: e.target.checked }))
                    }
                    className="accent-orange-600"
                  />
                  <span
                    className="w-2.5 h-2.5 rounded-xs"
                    style={{ backgroundColor: LAYER_COLORS[layer] }}
                  />
                  <span>{layer}</span>
                </label>
              ))}
            </div>
          </div>

          {/* AI Assisted Extraction Results */}
          {(aiError || aiSuggestions.length > 0) && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                  <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                  <span>AI Extraction Suggestions (Confirm to Add)</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAiSuggestions([]);
                    setAiError(null);
                  }}
                  className="text-[11px] text-slate-400 hover:text-slate-600"
                >
                  Clear
                </button>
              </div>

              {aiError && (
                <div className="p-2.5 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-[11px] text-red-700 dark:text-red-300">
                  {aiError}
                </div>
              )}

              {aiSummary && <p className="text-[11px] text-slate-500">{aiSummary}</p>}

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {aiSuggestions.map((sug) => (
                  <div
                    key={sug.id}
                    className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 space-y-1.5 text-[11px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={sug.label}
                        onChange={(e) =>
                          setAiSuggestions((prev) =>
                            prev.map((x) => (x.id === sug.id ? { ...x, label: e.target.value } : x))
                          )
                        }
                        className="font-semibold bg-transparent border-b border-transparent focus:border-orange-500 flex-1"
                      />
                      <span className="font-mono text-slate-500">
                        {Math.round(sug.confidence * 100)}%
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 font-mono">
                      <input
                        type="number"
                        value={sug.count}
                        onChange={(e) =>
                          setAiSuggestions((prev) =>
                            prev.map((x) =>
                              x.id === sug.id ? { ...x, count: Number(e.target.value) || 0 } : x
                            )
                          )
                        }
                        title="Count"
                        className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
                      />
                      <input
                        type="number"
                        step="0.1"
                        value={sug.length}
                        onChange={(e) =>
                          setAiSuggestions((prev) =>
                            prev.map((x) =>
                              x.id === sug.id ? { ...x, length: Number(e.target.value) || 0 } : x
                            )
                          )
                        }
                        title="Length"
                        className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
                      />
                      <input
                        type="number"
                        step="0.1"
                        value={sug.breadth}
                        onChange={(e) =>
                          setAiSuggestions((prev) =>
                            prev.map((x) =>
                              x.id === sug.id ? { ...x, breadth: Number(e.target.value) || 0 } : x
                            )
                          )
                        }
                        title="Breadth"
                        className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
                      />
                      <input
                        type="number"
                        step="0.1"
                        value={sug.height}
                        onChange={(e) =>
                          setAiSuggestions((prev) =>
                            prev.map((x) =>
                              x.id === sug.id ? { ...x, height: Number(e.target.value) || 0 } : x
                            )
                          )
                        }
                        title="Height"
                        className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <select
                        value={sug.targetBoqId}
                        onChange={(e) =>
                          setAiSuggestions((prev) =>
                            prev.map((x) =>
                              x.id === sug.id ? { ...x, targetBoqId: e.target.value } : x
                            )
                          )
                        }
                        className="flex-1 px-1.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded truncate"
                      >
                        {project.boqItems.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.itemNo} {b.category}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={sug.accepted}
                        onClick={() => confirmAiSuggestion(sug.id)}
                        className={`px-2.5 py-1 rounded font-semibold inline-flex items-center gap-1 ${
                          sug.accepted
                            ? 'bg-emerald-600 text-white'
                            : 'bg-orange-600 hover:bg-orange-700 text-white'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                        <span>{sug.accepted ? 'Added' : 'Confirm'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Markups Traceability Ledger */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900 dark:text-white">
                Linked Takeoff Markups ({activeDrawing?.markups.length || 0})
              </span>
              <button
                type="button"
                onClick={() => setActiveModule('measurements')}
                className="text-[11px] font-medium text-orange-600 hover:underline"
              >
                Open Measurement Sheet →
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
              {(activeDrawing?.markups || []).map((mk) => {
                const boq = project.boqItems.find((b) => b.id === mk.boqItemId);
                return (
                  <div key={mk.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {mk.label}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {mk.layer} · P.{mk.page} · {boq ? `${boq.itemNo} ${boq.category}` : 'Unlinked'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {formatNum(mk.realValue, 2)} {mk.unit}
                      </span>
                      <button
                        type="button"
                        onClick={() => activeDrawing && deleteDrawingMarkup(activeDrawing.id, mk.id)}
                        className="text-slate-400 hover:text-red-600"
                        title="Delete markup and linked measurement"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {project.drawings.length > 1 && activeDrawing && (
              <button
                type="button"
                onClick={() => {
                  deleteDrawing(activeDrawing.id);
                  setActiveDrawingId(project.drawings[0]?.id || '');
                }}
                className="text-[11px] text-red-600 hover:underline"
              >
                Remove Active Drawing
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Save Takeoff Measurement Modal */}
      {pendingMarkup && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveMarkup}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg max-w-md w-full p-5 space-y-4"
          >
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Save Drawing Takeoff to BOQ Item
            </h3>
            <div className="p-3 rounded bg-slate-50 dark:bg-slate-800 text-xs font-mono flex justify-between">
              <span>Measured ({pendingMarkup.tool}):</span>
              <strong className="text-orange-600">
                {pendingMarkup.tool === 'volume'
                  ? formatNum(
                      (pendingMarkup.pixelValue / (pixelsPerUnit * pixelsPerUnit)) * mkDepth,
                      2
                    )
                  : formatNum(pendingMarkup.realValue, 2)}{' '}
                {pendingMarkup.unit}
              </strong>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Takeoff Label</label>
              <input
                type="text"
                value={mkLabel}
                onChange={(e) => setMkLabel(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            {pendingMarkup.tool === 'volume' && (
              <div>
                <label className="block text-xs font-medium mb-1">
                  Depth / Thickness ({distUnit})
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={mkDepth}
                  onChange={(e) => setMkDepth(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium mb-1">Assign to BOQ Work Item</label>
              <select
                value={mkBoqId}
                onChange={(e) => setMkBoqId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              >
                {project.boqItems.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.itemNo} · {b.category} — {b.description.slice(0, 45)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingMarkup(null)}
                className="px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700"
              >
                Discard
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs rounded bg-orange-600 text-white font-semibold"
              >
                Save & Link to Measurement Sheet
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
