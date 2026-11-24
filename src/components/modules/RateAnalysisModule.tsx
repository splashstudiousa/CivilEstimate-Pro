import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  Download,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useEstimateStore } from '../../store/useEstimateStore';
import { computeRateAnalysisBreakdown } from '../../engine/calculations';
import { convertRateDisplay, formatCurrency } from '../../engine/formatters';
import { exportReportToExcel } from '../../engine/exporters';
import { RateAnalysis, ResourceRate } from '../../types/estimate';

export const RateAnalysisModule: React.FC = () => {
  const { project, summary, resources, unitSystem } = useActiveProject();
  const upsertRateAnalysis = useEstimateStore((s) => s.upsertRateAnalysis);
  const updateResourceRate = useEstimateStore((s) => s.updateResourceRate);
  const addResourceRate = useEstimateStore((s) => s.addResourceRate);
  const importResourceRates = useEstimateStore((s) => s.importResourceRates);

  const [tab, setTab] = useState<'item-ra' | 'library'>('item-ra');
  const [selectedItemId, setSelectedItemId] = useState(project.boqItems[0]?.id || '');
  const [libFilter, setLibFilter] = useState<'all' | 'material' | 'labor' | 'equipment'>('all');
  const [newResName, setNewResName] = useState('');
  const [newResType, setNewResType] = useState<'material' | 'labor' | 'equipment'>('material');
  const [newResUnit, setNewResUnit] = useState('unit');
  const [newResRate, setNewResRate] = useState(25);

  const resourceMap = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);

  const selectedBOQ =
    project.boqItems.find((b) => b.id === selectedItemId) || project.boqItems[0];

  const currentRA: RateAnalysis = useMemo(() => {
    const existing = project.rateAnalyses.find((r) => r.boqItemId === selectedBOQ?.id);
    if (existing) return existing;
    return {
      id: `ra-${selectedBOQ?.id || 'new'}`,
      boqItemId: selectedBOQ?.id || '',
      baseQty: 1,
      outputUnit: selectedBOQ?.unit || 'm³',
      materials: [],
      labor: [],
      equipment: [],
      wastagePct: 3,
      locationFactor: 1.0,
      escalationPct: 0,
    };
  }, [project.rateAnalyses, selectedBOQ]);

  const breakdown = useMemo(
    () => computeRateAnalysisBreakdown(currentRA, resourceMap),
    [currentRA, resourceMap]
  );

  const updateLineQty = (
    section: 'materials' | 'labor' | 'equipment',
    idx: number,
    quantity: number
  ) => {
    const next = { ...currentRA, [section]: [...currentRA[section]] };
    next[section][idx] = { ...next[section][idx], quantity };
    upsertRateAnalysis(next);
  };

  const addLine = (section: 'materials' | 'labor' | 'equipment') => {
    const targetType = section === 'materials' ? 'material' : section === 'labor' ? 'labor' : 'equipment';
    const candidate = resources.find((r) => r.type === targetType);
    if (!candidate) return;
    const next = {
      ...currentRA,
      [section]: [...currentRA[section], { resourceId: candidate.id, quantity: 1 }],
    };
    upsertRateAnalysis(next);
  };

  const removeLine = (section: 'materials' | 'labor' | 'equipment', idx: number) => {
    const next = {
      ...currentRA,
      [section]: currentRA[section].filter((_, i) => i !== idx),
    };
    upsertRateAnalysis(next);
  };

  const changeLineResource = (
    section: 'materials' | 'labor' | 'equipment',
    idx: number,
    resourceId: string
  ) => {
    const next = { ...currentRA, [section]: [...currentRA[section]] };
    next[section][idx] = { ...next[section][idx], resourceId };
    upsertRateAnalysis(next);
  };

  const handleImportRatesFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const parsed: Omit<ResourceRate, 'id'>[] = rows
      .map((r, i) => ({
        code: String(r.Code || r.code || `IMP-${i + 1}`),
        name: String(r.Name || r.name || r.Resource || `Imported Resource ${i + 1}`),
        type: (String(r.Type || r.type || 'material').toLowerCase() as ResourceRate['type']),
        unit: String(r.Unit || r.unit || 'unit'),
        rate: Number(r.Rate || r.rate || 0) || 0,
        tradeOrGroup: String(r.Group || r.group || 'Imported'),
        lastUpdated: new Date().toISOString().slice(0, 10),
      }))
      .filter((r) => r.rate > 0);
    if (parsed.length > 0) importResourceRates(parsed);
    e.target.value = '';
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white">
            Unit Rate Analysis & Resource Rate Library
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Any change to material, labor, equipment, wastage, or location factor cascades across the entire BOQ.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-md">
            <button
              type="button"
              onClick={() => setTab('item-ra')}
              className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap ${
                tab === 'item-ra'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              BOQ Item Breakdown
            </button>
            <button
              type="button"
              onClick={() => setTab('library')}
              className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap ${
                tab === 'library'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Rate Library ({resources.length})
            </button>
          </div>
          <button
            type="button"
            onClick={() => exportReportToExcel('rate-analysis', project, summary, resources, unitSystem)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-orange-600" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {tab === 'item-ra' && selectedBOQ && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Left: Item Selector */}
          <div className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200">
              Select BOQ Item ({summary.items.length})
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[620px] overflow-y-auto">
              {summary.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedItemId(item.id)}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    item.id === selectedBOQ.id
                      ? 'bg-orange-50/70 dark:bg-orange-950/25'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                      {item.itemNo} · {item.category}
                    </span>
                    {(() => {
                      const rc = convertRateDisplay(item.unitRate, item.unit, unitSystem);
                      return (
                        <span className="text-xs font-mono font-semibold text-orange-600 dark:text-orange-400">
                          {formatCurrency(rc.rate, project.currency)} / {rc.unit}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">
                    {item.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Rate Analysis Sheet */}
          <div className="xl:col-span-8 space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="text-xs text-slate-500">
                    Item {selectedBOQ.itemNo} · {selectedBOQ.category}
                  </div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                    {selectedBOQ.description}
                  </h2>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] text-slate-500">Computed Unit Rate</div>
                  {(() => {
                    const rc = convertRateDisplay(breakdown.unitRate, selectedBOQ.unit, unitSystem);
                    return (
                      <div className="text-xl font-mono font-bold text-orange-600 dark:text-orange-400">
                        {formatCurrency(rc.rate, project.currency)}{' '}
                        <span className="text-xs font-normal text-slate-500">/ {rc.unit}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Base Qty, Wastage, Location Factor, Escalation */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Analysis Base Qty ({selectedBOQ.unit})
                  </label>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    value={currentRA.baseQty}
                    onChange={(e) =>
                      upsertRateAnalysis({ ...currentRA, baseQty: Math.max(1, Number(e.target.value) || 1) })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Material Wastage %</label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={currentRA.wastagePct}
                    onChange={(e) =>
                      upsertRateAnalysis({ ...currentRA, wastagePct: Math.max(0, Number(e.target.value) || 0) })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Location Factor</label>
                  <input
                    type="number"
                    min={0.5}
                    step="0.05"
                    value={currentRA.locationFactor}
                    onChange={(e) =>
                      upsertRateAnalysis({ ...currentRA, locationFactor: Math.max(0.1, Number(e.target.value) || 1) })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Escalation %</label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={currentRA.escalationPct}
                    onChange={(e) =>
                      upsertRateAnalysis({ ...currentRA, escalationPct: Math.max(0, Number(e.target.value) || 0) })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  />
                </div>
              </div>

              {/* Resource Sections */}
              {(
                [
                  { key: 'materials', title: 'A. Materials', type: 'material' },
                  { key: 'labor', title: 'B. Labor Crew', type: 'labor' },
                  { key: 'equipment', title: 'C. Plant & Equipment', type: 'equipment' },
                ] as const
              ).map((sec) => {
                const lines = currentRA[sec.key];
                const options = resources.filter((r) => r.type === sec.type);
                return (
                  <div key={sec.key} className="py-4 border-b last:border-b-0 border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {sec.title}
                      </h3>
                      <button
                        type="button"
                        onClick={() => addLine(sec.key)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-600 hover:text-orange-700"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Line</span>
                      </button>
                    </div>
                    {lines.length === 0 ? (
                      <div className="text-[11px] text-slate-400">No {sec.key} assigned.</div>
                    ) : (
                      <div className="space-y-2">
                        {lines.map((line, idx) => {
                          const res = resourceMap.get(line.resourceId);
                          const rowTotal = (res?.rate || 0) * line.quantity;
                          return (
                            <div
                              key={`${line.resourceId}-${idx}`}
                              className="grid grid-cols-12 gap-2 items-center text-xs"
                            >
                              <div className="col-span-6">
                                <select
                                  value={line.resourceId}
                                  onChange={(e) => changeLineResource(sec.key, idx, e.target.value)}
                                  className="w-full px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                                >
                                  {options.map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                      {opt.name} ({opt.unit})
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="col-span-2">
                                <input
                                  type="number"
                                  step="0.05"
                                  value={line.quantity}
                                  onChange={(e) =>
                                    updateLineQty(sec.key, idx, Number(e.target.value) || 0)
                                  }
                                  className="w-full px-2 py-1.5 text-right font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                                />
                              </div>
                              <div className="col-span-1 text-slate-500 font-mono text-[11px] truncate">
                                {res?.unit}
                              </div>
                              <div className="col-span-2 text-right font-mono font-medium">
                                {formatCurrency(rowTotal, project.currency)}
                              </div>
                              <div className="col-span-1 text-right">
                                <button
                                  type="button"
                                  onClick={() => removeLine(sec.key, idx)}
                                  className="p-1 text-slate-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Summary Breakdown */}
              <div className="mt-2 pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 dark:bg-slate-800/60 p-3 rounded-md">
                <div>
                  <div className="text-slate-500">Materials / {selectedBOQ.unit}</div>
                  <div className="font-mono font-semibold">
                    {formatCurrency(breakdown.materialUnitCost, project.currency)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Labor / {selectedBOQ.unit}</div>
                  <div className="font-mono font-semibold">
                    {formatCurrency(breakdown.laborUnitCost, project.currency)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Equipment / {selectedBOQ.unit}</div>
                  <div className="font-mono font-semibold">
                    {formatCurrency(breakdown.equipmentUnitCost, project.currency)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Final Unit Rate</div>
                  <div className="font-mono font-bold text-orange-600 dark:text-orange-400">
                    {formatCurrency(breakdown.unitRate, project.currency)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'library' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {(['all', 'material', 'labor', 'equipment'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setLibFilter(t)}
                  className={`px-3 py-1.5 rounded text-xs font-medium capitalize ${
                    libFilter === t
                      ? 'bg-[#0F2137] text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
              <Upload className="w-3.5 h-3.5 text-orange-600" />
              <span>Import Excel/CSV Rates</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImportRatesFile}
                className="hidden"
              />
            </label>
          </div>

          {/* Add New Resource Bar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-6 gap-2.5 items-end">
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-slate-500 mb-1">Resource Name</label>
              <input
                type="text"
                value={newResName}
                onChange={(e) => setNewResName(e.target.value)}
                placeholder="e.g., Ready-Mix Concrete M30"
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Type</label>
              <select
                value={newResType}
                onChange={(e) => setNewResType(e.target.value as ResourceRate['type'])}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              >
                <option value="material">Material</option>
                <option value="labor">Labor</option>
                <option value="equipment">Equipment</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Unit</label>
              <input
                type="text"
                value={newResUnit}
                onChange={(e) => setNewResUnit(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Unit Rate</label>
              <input
                type="number"
                value={newResRate}
                onChange={(e) => setNewResRate(Number(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                if (!newResName.trim()) return;
                addResourceRate({
                  code: `RES-${resources.length + 1}`,
                  name: newResName.trim(),
                  type: newResType,
                  unit: newResUnit || 'unit',
                  rate: newResRate,
                  tradeOrGroup: 'Custom',
                  lastUpdated: new Date().toISOString().slice(0, 10),
                });
                setNewResName('');
              }}
              className="px-3 py-1.5 rounded bg-orange-600 text-white text-xs font-semibold hover:bg-orange-700"
            >
              Add Resource
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2.5 px-3 text-left font-semibold">Code</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Type</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Resource Name</th>
                    <th className="py-2.5 px-3 text-center font-semibold">Unit</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Market Rate</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Last Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {resources
                    .filter((r) => libFilter === 'all' || r.type === libFilter)
                    .map((res) => (
                      <tr key={res.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-mono text-slate-500">{res.code}</td>
                        <td className="py-2 px-3 capitalize text-slate-600 dark:text-slate-300">
                          {res.type}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            <span>{res.name}</span>
                            {res.isOutdated && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-normal">
                                <AlertTriangle className="w-3 h-3" />
                                Quote aged
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-slate-500">{res.unit}</td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="0.1"
                            value={res.rate}
                            onChange={(e) =>
                              updateResourceRate(res.id, { rate: Math.max(0, Number(e.target.value) || 0) })
                            }
                            className="w-24 px-2 py-1 text-right font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-500">
                          {res.lastUpdated}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
