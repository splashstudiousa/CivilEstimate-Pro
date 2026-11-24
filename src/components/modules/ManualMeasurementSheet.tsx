import React, { useMemo, useState } from 'react';
import {
  Calculator,
  ClipboardPaste,
  Compass,
  MinusCircle,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useEstimateStore } from '../../store/useEstimateStore';
import { computeMeasurementQty } from '../../engine/calculations';
import {
  convertLength,
  convertUnitDisplay,
  formatNum,
  getLengthLabel,
  toMetricLength,
} from '../../engine/formatters';
import { WORK_CATEGORIES, WorkCategory } from '../../types/estimate';

type CalcTab = 'concrete' | 'steel' | 'brick' | 'plaster' | 'excavation';

export const ManualMeasurementSheet: React.FC = () => {
  const { project, summary, unitSystem } = useActiveProject();
  const addMeasurement = useEstimateStore((s) => s.addMeasurement);
  const updateMeasurement = useEstimateStore((s) => s.updateMeasurement);
  const deleteMeasurement = useEstimateStore((s) => s.deleteMeasurement);
  const bulkAddMeasurements = useEstimateStore((s) => s.bulkAddMeasurements);
  const addBOQItem = useEstimateStore((s) => s.addBOQItem);
  const setActiveModule = useEstimateStore((s) => s.setActiveModule);
  const setActiveTraceTarget = useEstimateStore((s) => s.setActiveTraceTarget);
  const globalSearch = useEstimateStore((s) => s.globalSearch);

  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [localSearch, setLocalSearch] = useState('');
  const [showCalcs, setShowCalcs] = useState(false);
  const [calcTab, setCalcTab] = useState<CalcTab>('concrete');
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteBoqId, setPasteBoqId] = useState(project.boqItems[0]?.id || '');

  // New BOQ item modal
  const [showNewBoq, setShowNewBoq] = useState(false);
  const [newBoqNo, setNewBoqNo] = useState('12.2');
  const [newBoqCat, setNewBoqCat] = useState<WorkCategory>('RCC');
  const [newBoqDesc, setNewBoqDesc] = useState('');
  const [newBoqUnit, setNewBoqUnit] = useState('m³');
  const [newBoqRate, setNewBoqRate] = useState(120);

  // Calculator states
  const [concL, setConcL] = useState(5.0);
  const [concB, setConcB] = useState(4.0);
  const [concH, setConcH] = useState(0.15);
  const [concMix, setConcMix] = useState<'1:1:2' | '1:1.5:3' | '1:2:4' | '1:3:6' | '1:4:8'>('1:2:4');

  const [steelDia, setSteelDia] = useState(12);
  const [steelNo, setSteelNo] = useState(24);
  const [steelLen, setSteelLen] = useState(6.2);

  const [brkL, setBrkL] = useState(10);
  const [brkH, setBrkH] = useState(3.0);
  const [brkT, setBrkT] = useState(0.23);

  const [plsL, setPlsL] = useState(18);
  const [plsH, setPlsH] = useState(3.0);
  const [plsSides, setPlsSides] = useState(2);

  const [excL, setExcL] = useState(12);
  const [excB, setExcB] = useState(2.0);
  const [excH, setExcH] = useState(1.8);
  const [excSlope, setExcSlope] = useState(0.5);

  const boqMap = useMemo(() => {
    const m = new Map(project.boqItems.map((b) => [b.id, b]));
    return m;
  }, [project.boqItems]);

  const query = (localSearch || globalSearch).trim().toLowerCase();

  const filteredRows = useMemo(() => {
    return project.measurements.filter((row) => {
      const boq = boqMap.get(row.boqItemId);
      if (categoryFilter !== 'ALL' && boq?.category !== categoryFilter) return false;
      if (!query) return true;
      return (
        row.description.toLowerCase().includes(query) ||
        row.remarks.toLowerCase().includes(query) ||
        (boq && `${boq.itemNo} ${boq.description} ${boq.category}`.toLowerCase().includes(query))
      );
    });
  }, [project.measurements, boqMap, categoryFilter, query]);

  const handleAddRow = (isDeduction = false) => {
    const defaultBoq =
      categoryFilter !== 'ALL'
        ? project.boqItems.find((b) => b.category === categoryFilter) || project.boqItems[0]
        : project.boqItems[0];
    if (!defaultBoq) return;
    addMeasurement({
      boqItemId: defaultBoq.id,
      srNo: String(project.measurements.length + 1),
      description: isDeduction ? 'DEDUCTION: Opening / Void' : 'New Measurement Entry',
      no: 1,
      length: 1,
      breadth: 1,
      height: defaultBoq.unit === 'm³' ? 1 : 0,
      isDeduction,
      unit: defaultBoq.unit,
      remarks: '',
    });
  };

  const handlePasteImport = () => {
    const lines = pasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const targetBoq = boqMap.get(pasteBoqId) || project.boqItems[0];
    if (!targetBoq || lines.length === 0) return;

    const parsed = lines.map((line, idx) => {
      const cols = line.includes('\t') ? line.split('\t') : line.split(',');
      const desc = cols[0]?.trim() || `Imported Row ${idx + 1}`;
      const no = parseFloat(cols[1] || '1') || 1;
      const length = parseFloat(cols[2] || '0') || 0;
      const breadth = parseFloat(cols[3] || '0') || 0;
      const height = parseFloat(cols[4] || '0') || 0;
      const remarks = cols[5]?.trim() || 'Pasted from Excel';
      return {
        boqItemId: targetBoq.id,
        srNo: String(project.measurements.length + idx + 1),
        description: desc,
        no: Math.abs(no),
        isDeduction: no < 0,
        length,
        breadth,
        height,
        unit: targetBoq.unit,
        remarks,
      };
    });

    bulkAddMeasurements(parsed);
    setPasteText('');
    setShowPasteModal(false);
  };

  // Calculator math
  const mixFactors: Record<string, [number, number, number]> = {
    '1:1:2': [1, 1, 2],
    '1:1.5:3': [1, 1.5, 3],
    '1:2:4': [1, 2, 4],
    '1:3:6': [1, 3, 6],
    '1:4:8': [1, 4, 8],
  };
  const wetVol = concL * concB * concH;
  const dryVol = wetVol * 1.54;
  const [mc, ms, ma] = mixFactors[concMix];
  const mixSum = mc + ms + ma;
  const cementBags = ((dryVol * mc) / mixSum) / 0.0347;
  const sandVol = (dryVol * ms) / mixSum;
  const aggVol = (dryVol * ma) / mixSum;

  const steelUnitWt = (steelDia * steelDia) / 162;
  const steelTotalKg = steelNo * steelLen * steelUnitWt;

  const masonryVol = brkL * brkH * brkT;
  const bricksCount = Math.ceil(masonryVol * 500);
  const mortarVol = masonryVol * 0.25;

  const plasterArea = plsL * plsH * plsSides;
  const paintLiters = plasterArea * 0.24;

  // Excavation trapezoidal cross section: (B + slope * H) * H * L
  const excTopB = excB + 2 * excSlope * excH;
  const excVol = ((excB + excTopB) / 2) * excH * excL;

  const pushCalcToSheet = (
    preferredCategory: WorkCategory,
    desc: string,
    no: number,
    l: number,
    b: number,
    h: number,
    unit: string,
    remarks: string,
    rebarDiaMm?: number
  ) => {
    const matchBoq =
      project.boqItems.find((item) => item.category === preferredCategory && item.unit === unit) ||
      project.boqItems.find((item) => item.category === preferredCategory) ||
      project.boqItems[0];
    if (!matchBoq) return;
    addMeasurement({
      boqItemId: matchBoq.id,
      srNo: String(project.measurements.length + 1),
      description: desc,
      no,
      length: Math.round(l * 1000) / 1000,
      breadth: Math.round(b * 1000) / 1000,
      height: Math.round(h * 1000) / 1000,
      unit: matchBoq.unit,
      remarks,
      rebarDiaMm,
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white">
            Manual Measurement Sheet (Takeoff Ledger)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Dimensions auto-calculate quantities, sync with Abstract of Quantities, BOQ cost, and CPM duration.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCalcs((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md border text-xs font-medium whitespace-nowrap transition-colors ${
              showCalcs
                ? 'bg-[#0F2137] text-white border-[#0F2137]'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Calculator className="w-3.5 h-3.5 text-orange-500" />
            <span>Engineering Calculators</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPasteModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-sky-600" />
            <span>Paste Excel</span>
          </button>

          <button
            type="button"
            onClick={() => handleAddRow(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-900 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 whitespace-nowrap"
          >
            <MinusCircle className="w-3.5 h-3.5" />
            <span>Add Deduction</span>
          </button>

          <button
            type="button"
            onClick={() => handleAddRow(false)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Measurement</span>
          </button>
        </div>
      </div>

      {/* Built-In Engineering Calculators Panel */}
      {showCalcs && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md">
              {(
                [
                  ['concrete', 'Concrete & Mix'],
                  ['steel', 'Steel BBS Weight'],
                  ['brick', 'Brick Masonry'],
                  ['plaster', 'Plaster & Paint'],
                  ['excavation', 'Sloped Excavation'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCalcTab(id)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                    calcTab === id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-slate-500">
              Compute standard engineering quantities and push straight into Measurement Sheet
            </span>
          </div>

          {calcTab === 'concrete' && (
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Mix Ratio</label>
                <select
                  value={concMix}
                  onChange={(e) => setConcMix(e.target.value as typeof concMix)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                >
                  <option value="1:1:2">M25 (1:1:2)</option>
                  <option value="1:1.5:3">M20 (1:1.5:3)</option>
                  <option value="1:2:4">M15 (1:2:4)</option>
                  <option value="1:3:6">M10 (1:3:6)</option>
                  <option value="1:4:8">Lean (1:4:8)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">
                  Length ({getLengthLabel(unitSystem)})
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={Number(convertLength(concL, unitSystem).toFixed(2))}
                  onChange={(e) => setConcL(toMetricLength(Number(e.target.value) || 0, unitSystem))}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">
                  Breadth ({getLengthLabel(unitSystem)})
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={Number(convertLength(concB, unitSystem).toFixed(2))}
                  onChange={(e) => setConcB(toMetricLength(Number(e.target.value) || 0, unitSystem))}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">
                  Depth/Thick ({getLengthLabel(unitSystem)})
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={Number(convertLength(concH, unitSystem).toFixed(2))}
                  onChange={(e) => setConcH(toMetricLength(Number(e.target.value) || 0, unitSystem))}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
              <div className="md:col-span-2 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/70 px-3 py-2 rounded border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] font-mono">
                  {(() => {
                    const wConv = convertUnitDisplay(wetVol, 'm³', unitSystem);
                    const sConv = convertUnitDisplay(sandVol, 'm³', unitSystem);
                    const aConv = convertUnitDisplay(aggVol, 'm³', unitSystem);
                    return (
                      <>
                        <div>
                          Wet: <strong>{formatNum(wConv.value, 2)} {wConv.unit}</strong> · Cement:{' '}
                          <strong>{formatNum(cementBags, 1)} bags</strong>
                        </div>
                        <div className="text-slate-500">
                          Sand: {formatNum(sConv.value, 1)} {sConv.unit} · Agg: {formatNum(aConv.value, 1)} {aConv.unit}
                        </div>
                      </>
                    );
                  })()}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    pushCalcToSheet(
                      concMix === '1:4:8' ? 'PCC' : 'RCC',
                      `Concrete ${concMix} Element`,
                      1,
                      concL,
                      concB,
                      concH,
                      'm³',
                      `Dry vol ${formatNum(convertUnitDisplay(dryVol, 'm³', unitSystem).value, 2)} ${convertUnitDisplay(dryVol, 'm³', unitSystem).unit} · ${formatNum(cementBags, 1)} bags cement`
                    )
                  }
                  className="px-3 py-1.5 rounded bg-orange-600 text-white text-xs font-medium hover:bg-orange-700 whitespace-nowrap"
                >
                  Insert Row
                </button>
              </div>
            </div>
          )}

          {calcTab === 'steel' && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Bar Diameter (mm)</label>
                <select
                  value={steelDia}
                  onChange={(e) => setSteelDia(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                >
                  {[8, 10, 12, 16, 20, 25, 32].map((d) => (
                    <option key={d} value={d}>
                      Ø{d} mm ({((d * d) / 162).toFixed(2)} kg/m)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">No. of Bars</label>
                <input
                  type="number"
                  value={steelNo}
                  onChange={(e) => setSteelNo(Number(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Cut Length (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={steelLen}
                  onChange={(e) => setSteelLen(Number(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
              <div className="md:col-span-2 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/70 px-3 py-2 rounded border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] font-mono">
                  <div>
                    Unit Wt: <strong>{steelUnitWt.toFixed(3)} kg/m</strong>
                  </div>
                  <div>
                    Total Weight: <strong className="text-orange-600">{formatNum(steelTotalKg, 2)} kg</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    pushCalcToSheet(
                      'RCC',
                      `BBS Rebar Ø${steelDia}mm (${steelNo} bars x ${steelLen}m)`,
                      steelNo,
                      steelLen,
                      Number(steelUnitWt.toFixed(3)),
                      0,
                      'kg',
                      `D²/162 = ${steelUnitWt.toFixed(3)} kg/m`,
                      steelDia
                    )
                  }
                  className="px-3 py-1.5 rounded bg-orange-600 text-white text-xs font-medium hover:bg-orange-700 whitespace-nowrap"
                >
                  Insert BBS Row
                </button>
              </div>
            </div>
          )}

          {calcTab === 'brick' && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Wall Length (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={brkL}
                  onChange={(e) => setBrkL(Number(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Wall Height (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={brkH}
                  onChange={(e) => setBrkH(Number(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Thickness (m)</label>
                <select
                  value={brkT}
                  onChange={(e) => setBrkT(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                >
                  <option value={0.23}>230 mm (9" Main)</option>
                  <option value={0.115}>115 mm (4.5" Partition)</option>
                  <option value={0.345}>345 mm (13.5" Pier)</option>
                </select>
              </div>
              <div className="md:col-span-2 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/70 px-3 py-2 rounded border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] font-mono">
                  <div>
                    Volume: <strong>{formatNum(masonryVol, 2)} m³</strong> · Bricks:{' '}
                    <strong>{bricksCount.toLocaleString()}</strong>
                  </div>
                  <div className="text-slate-500">Mortar (25%): {formatNum(mortarVol, 2)} m³</div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    pushCalcToSheet(
                      'Masonry',
                      `Brick Masonry Wall (${brkL}m x ${brkH}m x ${brkT * 1000}mm)`,
                      1,
                      brkL,
                      brkT,
                      brkH,
                      'm³',
                      `~${bricksCount} bricks`
                    )
                  }
                  className="px-3 py-1.5 rounded bg-orange-600 text-white text-xs font-medium hover:bg-orange-700 whitespace-nowrap"
                >
                  Insert Row
                </button>
              </div>
            </div>
          )}

          {calcTab === 'plaster' && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Wall Run Length (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={plsL}
                  onChange={(e) => setPlsL(Number(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Height (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={plsH}
                  onChange={(e) => setPlsH(Number(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Faces / Coats</label>
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={plsSides}
                  onChange={(e) => setPlsSides(Number(e.target.value) || 1)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
              <div className="md:col-span-2 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/70 px-3 py-2 rounded border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] font-mono">
                  <div>
                    Gross Area: <strong>{formatNum(plasterArea, 2)} m²</strong>
                  </div>
                  <div className="text-slate-500">Est. Paint (2 coats): {formatNum(paintLiters, 1)} L</div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    pushCalcToSheet(
                      'Plaster',
                      `Wall Plaster (${plsSides} faces, ${plsL}x${plsH}m)`,
                      plsSides,
                      plsL,
                      plsH,
                      0,
                      'm²',
                      `Paint equiv: ${formatNum(paintLiters, 1)} L`
                    )
                  }
                  className="px-3 py-1.5 rounded bg-orange-600 text-white text-xs font-medium hover:bg-orange-700 whitespace-nowrap"
                >
                  Insert Row
                </button>
              </div>
            </div>
          )}

          {calcTab === 'excavation' && (
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Bottom L (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={excL}
                  onChange={(e) => setExcL(Number(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Bottom Width (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={excB}
                  onChange={(e) => setExcB(Number(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Depth H (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={excH}
                  onChange={(e) => setExcH(Number(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Side Slope (H:V)</label>
                <input
                  type="number"
                  step="0.1"
                  value={excSlope}
                  onChange={(e) => setExcSlope(Number(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
              <div className="md:col-span-2 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/70 px-3 py-2 rounded border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] font-mono">
                  <div>
                    Top Width: <strong>{formatNum(excTopB, 2)} m</strong>
                  </div>
                  <div>
                    Sloped Volume: <strong className="text-orange-600">{formatNum(excVol, 2)} m³</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    pushCalcToSheet(
                      'Earthwork',
                      `Sloped Trench Excavation (Top ${formatNum(excTopB, 2)}m, Bot ${excB}m)`,
                      1,
                      excL,
                      Number(((excB + excTopB) / 2).toFixed(3)),
                      excH,
                      'm³',
                      `Side slope ${excSlope}:1`
                    )
                  }
                  className="px-3 py-1.5 rounded bg-orange-600 text-white text-xs font-medium hover:bg-orange-700 whitespace-nowrap"
                >
                  Insert Row
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap ${
              categoryFilter === 'ALL'
                ? 'bg-[#0F2137] text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            All ({project.measurements.length})
          </button>
          {WORK_CATEGORIES.filter((cat) =>
            project.boqItems.some((b) => b.category === cat)
          ).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap ${
                categoryFilter === cat
                  ? 'bg-orange-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="search"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Filter rows..."
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white w-48"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowNewBoq(true)}
            className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            + New BOQ Item
          </button>
        </div>
      </div>

      {/* Excel-like Measurement Ledger Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                <th className="py-2.5 px-2.5 text-left font-semibold w-14">Sr</th>
                <th className="py-2.5 px-2.5 text-left font-semibold min-w-[170px]">BOQ Item</th>
                <th className="py-2.5 px-2.5 text-left font-semibold min-w-[230px]">
                  Description of Measurement
                </th>
                <th className="py-2.5 px-2 text-right font-semibold w-16">No.</th>
                <th className="py-2.5 px-2 text-right font-semibold w-20">
                  L ({getLengthLabel(unitSystem)})
                </th>
                <th className="py-2.5 px-2 text-right font-semibold w-20">
                  B ({getLengthLabel(unitSystem)})
                </th>
                <th className="py-2.5 px-2 text-right font-semibold w-20">
                  H ({getLengthLabel(unitSystem)})
                </th>
                <th className="py-2.5 px-2 text-left font-semibold w-28">Formula</th>
                <th className="py-2.5 px-2.5 text-right font-semibold w-24">Quantity</th>
                <th className="py-2.5 px-2 text-center font-semibold w-14">Unit</th>
                <th className="py-2.5 px-2.5 text-left font-semibold min-w-[150px]">
                  Source / Remarks
                </th>
                <th className="py-2.5 px-2 text-center font-semibold w-12">Act</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRows.map((row) => {
                const rawQty = computeMeasurementQty(row);
                const conv = convertUnitDisplay(rawQty, row.unit, unitSystem);
                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                      row.isDeduction ? 'bg-red-50/30 dark:bg-red-950/10' : ''
                    }`}
                  >
                    <td className="p-1.5">
                      <input
                        type="text"
                        value={row.srNo}
                        onChange={(e) => updateMeasurement(row.id, { srNo: e.target.value })}
                        className="w-12 px-1.5 py-1 font-mono bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-orange-500 rounded text-slate-700 dark:text-slate-300"
                      />
                    </td>
                    <td className="p-1.5">
                      <select
                        value={row.boqItemId}
                        onChange={(e) => {
                          const target = boqMap.get(e.target.value);
                          updateMeasurement(row.id, {
                            boqItemId: e.target.value,
                            unit: target?.unit || row.unit,
                          });
                        }}
                        className="w-full px-1.5 py-1 bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-orange-500 rounded text-slate-800 dark:text-slate-200 truncate"
                      >
                        {project.boqItems.map((b) => (
                          <option key={b.id} value={b.id} className="bg-white dark:bg-slate-900">
                            {b.itemNo} · {b.category}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-1.5">
                      <div className="flex items-center gap-1">
                        {row.isDeduction && (
                          <button
                            type="button"
                            onClick={() => updateMeasurement(row.id, { isDeduction: false })}
                            title="Toggle Deduction"
                            className="text-[10px] font-mono font-bold text-red-600 shrink-0"
                          >
                            [-]
                          </button>
                        )}
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) => updateMeasurement(row.id, { description: e.target.value })}
                          className="w-full px-1.5 py-1 bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-orange-500 rounded text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </td>
                    <td className="p-1.5">
                      <input
                        type="number"
                        step="1"
                        value={row.no}
                        onChange={(e) => updateMeasurement(row.id, { no: Number(e.target.value) || 0 })}
                        className="w-full px-1.5 py-1 text-right font-mono tabular-nums bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-orange-500 rounded"
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        type="number"
                        step="0.01"
                        value={Number(convertLength(row.length, unitSystem).toFixed(2))}
                        onChange={(e) =>
                          updateMeasurement(row.id, {
                            length: toMetricLength(Number(e.target.value) || 0, unitSystem),
                          })
                        }
                        className="w-full px-1.5 py-1 text-right font-mono tabular-nums bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-orange-500 rounded"
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        type="number"
                        step="0.01"
                        value={
                          row.unit === 'kg' && unitSystem === 'imperial'
                            ? Number((row.breadth * 0.671969).toFixed(3))
                            : Number(convertLength(row.breadth, unitSystem).toFixed(2))
                        }
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0;
                          const metricVal =
                            row.unit === 'kg' && unitSystem === 'imperial'
                              ? v / 0.671969
                              : toMetricLength(v, unitSystem);
                          updateMeasurement(row.id, { breadth: metricVal });
                        }}
                        className="w-full px-1.5 py-1 text-right font-mono tabular-nums bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-orange-500 rounded"
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        type="number"
                        step="0.01"
                        value={Number(convertLength(row.height, unitSystem).toFixed(2))}
                        onChange={(e) =>
                          updateMeasurement(row.id, {
                            height: toMetricLength(Number(e.target.value) || 0, unitSystem),
                          })
                        }
                        className="w-full px-1.5 py-1 text-right font-mono tabular-nums bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-orange-500 rounded"
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        type="text"
                        placeholder="e.g. 2*(4+3)"
                        value={row.formula || ''}
                        onChange={(e) => updateMeasurement(row.id, { formula: e.target.value })}
                        className="w-full px-1.5 py-1 font-mono text-[11px] bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-orange-500 rounded text-sky-700 dark:text-sky-400"
                      />
                    </td>
                    <td
                      className={`p-1.5 text-right font-mono font-semibold tabular-nums ${
                        rawQty < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {formatNum(conv.value, 2)}
                    </td>
                    <td className="p-1.5 text-center font-mono text-slate-500">{conv.unit}</td>
                    <td className="p-1.5">
                      <div className="flex items-center gap-1.5">
                        {row.sourceDrawingName && (
                          <button
                            type="button"
                            onClick={() => {
                              if (row.sourceCoords) {
                                setActiveTraceTarget({
                                  drawingId: row.sourceDrawingId || '',
                                  drawingName: row.sourceDrawingName || '',
                                  page: row.sourcePage || 1,
                                  bbox: row.sourceCoords,
                                  label: row.description,
                                });
                                setActiveModule('pipeline');
                              } else {
                                setActiveModule('takeoff');
                              }
                            }}
                            title={`View on drawing: ${row.sourceDrawingName} Page ${row.sourcePage || 1}`}
                            className="p-1 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30 rounded shrink-0"
                          >
                            <Compass className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <input
                          type="text"
                          value={row.remarks}
                          onChange={(e) => updateMeasurement(row.id, { remarks: e.target.value })}
                          className="w-full px-1.5 py-1 bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-orange-500 rounded text-slate-500 dark:text-slate-400"
                        />
                      </div>
                    </td>
                    <td className="p-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => deleteMeasurement(row.id)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded"
                        aria-label="Delete measurement row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredRows.length === 0 && (
          <div className="p-8 text-center text-xs text-slate-500">
            No measurement lines match your filter. Click "Add Measurement" to create an entry.
          </div>
        )}
      </div>

      {/* Quick Totals Footer */}
      <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <span>
          Showing {filteredRows.length} of {project.measurements.length} takeoff lines · Linked across{' '}
          {summary.items.length} BOQ work items
        </span>
        <span>
          Tip: Enter 0 for unused dimensions (e.g. L only for linear items, No. only for door counts) or write math formulas like <code className="font-mono">2*(4.8+4.2)</code>.
        </span>
      </div>

      {/* Paste from Excel Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg max-w-lg w-full p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Paste Rows from Excel / CSV
            </h3>
            <p className="text-xs text-slate-500">
              Format columns as tab-separated or comma-separated: <br />
              <code className="font-mono text-[11px]">Description, No, Length, Breadth, Height, Remarks</code>
            </p>
            <div>
              <label className="block text-xs font-medium mb-1">Assign to BOQ Item</label>
              <select
                value={pasteBoqId}
                onChange={(e) => setPasteBoqId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              >
                {project.boqItems.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.itemNo} — {b.description}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              rows={5}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"Footing F2\t4\t1.5\t1.5\t0.45\tGrid B\nPlinth Beam PB2\t1\t22.4\t0.23\t0.38\tEast wing"}
              className="w-full p-2.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePasteImport}
                className="px-4 py-1.5 text-xs rounded bg-orange-600 text-white font-semibold"
              >
                Import Rows
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New BOQ Item Modal */}
      {showNewBoq && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg max-w-md w-full p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Add New BOQ Work Item
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Item No.</label>
                <input
                  type="text"
                  value={newBoqNo}
                  onChange={(e) => setNewBoqNo(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Category</label>
                <select
                  value={newBoqCat}
                  onChange={(e) => setNewBoqCat(e.target.value as WorkCategory)}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                >
                  {WORK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Work Description</label>
              <input
                type="text"
                value={newBoqDesc}
                onChange={(e) => setNewBoqDesc(e.target.value)}
                placeholder="e.g., Granite Kitchen Countertop Slab"
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Unit</label>
                <select
                  value={newBoqUnit}
                  onChange={(e) => setNewBoqUnit(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                >
                  <option value="m³">m³</option>
                  <option value="m²">m²</option>
                  <option value="m">m</option>
                  <option value="kg">kg</option>
                  <option value="No.">No.</option>
                  <option value="pt">pt</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Initial Unit Rate</label>
                <input
                  type="number"
                  value={newBoqRate}
                  onChange={(e) => setNewBoqRate(Number(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewBoq(false)}
                className="px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newBoqDesc.trim()) return;
                  const boqId = addBOQItem({
                    itemNo: newBoqNo,
                    category: newBoqCat,
                    description: newBoqDesc.trim(),
                    unit: newBoqUnit,
                    useRateAnalysis: false,
                    manualRate: newBoqRate,
                    productivityPerDay: 15,
                    crewSize: 1,
                    dependencies: [],
                    actualProgressPct: 0,
                  });
                  addMeasurement({
                    boqItemId: boqId,
                    srNo: String(project.measurements.length + 1),
                    description: newBoqDesc.trim(),
                    no: 1,
                    length: 1,
                    breadth: newBoqUnit === 'm' || newBoqUnit === 'No.' ? 0 : 1,
                    height: newBoqUnit === 'm³' ? 1 : 0,
                    unit: newBoqUnit,
                    remarks: 'Initial measurement',
                  });
                  setNewBoqDesc('');
                  setShowNewBoq(false);
                }}
                className="px-4 py-1.5 text-xs rounded bg-orange-600 text-white font-semibold"
              >
                Create Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
