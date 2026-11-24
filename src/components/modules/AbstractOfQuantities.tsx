import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Compass, Download, Search } from 'lucide-react';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useEstimateStore } from '../../store/useEstimateStore';
import { computeMeasurementQty } from '../../engine/calculations';
import { convertLength, convertUnitDisplay, formatNum } from '../../engine/formatters';
import { exportReportToExcel } from '../../engine/exporters';
import { WORK_CATEGORIES } from '../../types/estimate';

export const AbstractOfQuantities: React.FC = () => {
  const { project, summary, resources, unitSystem } = useActiveProject();
  const setActiveModule = useEstimateStore((s) => s.setActiveModule);
  const setActiveTraceTarget = useEstimateStore((s) => s.setActiveTraceTarget);
  const globalSearch = useEstimateStore((s) => s.globalSearch);

  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [localSearch, setLocalSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const query = (localSearch || globalSearch).trim().toLowerCase();

  const grouped = useMemo(() => {
    return WORK_CATEGORIES.map((cat) => {
      const items = summary.items.filter((item) => {
        if (item.category !== cat) return false;
        if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
        if (!query) return true;
        return (
          item.itemNo.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query)
        );
      });
      return { category: cat, items };
    }).filter((g) => g.items.length > 0);
  }, [summary.items, categoryFilter, query]);

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white">
            Abstract of Quantities
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Auto-aggregated quantities grouped by work category. Expand any row to audit source measurements and drawing markups.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            exportReportToExcel('abstract-quantities', project, summary, resources, unitSystem)
          }
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5 text-orange-600" />
          <span>Export Excel</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap ${
              categoryFilter === 'ALL'
                ? 'bg-[#0F2137] text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            All Categories
          </button>
          {WORK_CATEGORIES.filter((c) => summary.items.some((i) => i.category === c)).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategoryFilter(c)}
              className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap ${
                categoryFilter === c
                  ? 'bg-orange-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
          <input
            type="search"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search quantities..."
            className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md w-48"
          />
        </div>
      </div>

      {/* Grouped Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                <th className="py-2.5 px-3 text-left font-semibold w-10"></th>
                <th className="py-2.5 px-3 text-left font-semibold w-20">Item No.</th>
                <th className="py-2.5 px-3 text-left font-semibold">Description of Work</th>
                <th className="py-2.5 px-3 text-center font-semibold w-20">Unit</th>
                <th className="py-2.5 px-3 text-right font-semibold w-32">Total Quantity</th>
                <th className="py-2.5 px-3 text-right font-semibold w-28">Source Lines</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {grouped.map((group) => (
                <React.Fragment key={group.category}>
                  <tr className="bg-slate-50/90 dark:bg-slate-800/50">
                    <td colSpan={4} className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                      {group.category}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-[11px] text-slate-500">
                      {group.items.length} item(s)
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-[11px] text-slate-500">
                      {group.items.reduce((s, i) => s + i.measurementCount, 0)} entries
                    </td>
                  </tr>
                  {group.items.map((item) => {
                    const isOpen = Boolean(expandedIds[item.id]);
                    const conv = convertUnitDisplay(item.quantity, item.unit, unitSystem);
                    const childRows = project.measurements.filter((m) => m.boqItemId === item.id);
                    return (
                      <React.Fragment key={item.id}>
                        <tr
                          onClick={() => toggleExpand(item.id)}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                        >
                          <td className="py-2.5 px-3 text-slate-400">
                            {isOpen ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-800 dark:text-slate-200">
                            {item.itemNo}
                          </td>
                          <td className="py-2.5 px-3 text-slate-900 dark:text-slate-100">
                            {item.description}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-500">
                            {conv.unit}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                            {formatNum(conv.value, 2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                            {childRows.length}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-slate-50/70 dark:bg-slate-950/50">
                            <td colSpan={6} className="px-8 py-3">
                              {childRows.length === 0 ? (
                                <div className="text-xs text-slate-500 flex items-center justify-between">
                                  <span>No measurements logged for this item yet.</span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveModule('measurements')}
                                    className="text-orange-600 font-medium hover:underline"
                                  >
                                    Add Measurement →
                                  </button>
                                </div>
                              ) : (
                                <table className="w-full text-[11px] border border-slate-200 dark:border-slate-800 rounded">
                                  <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-800 text-slate-500">
                                      <th className="py-1.5 px-2 text-left">Sr</th>
                                      <th className="py-1.5 px-2 text-left">Measurement Description</th>
                                      <th className="py-1.5 px-2 text-right">No</th>
                                      <th className="py-1.5 px-2 text-right">L × B × H</th>
                                      <th className="py-1.5 px-2 text-right">Qty</th>
                                      <th className="py-1.5 px-2 text-left">Traceability</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                                    {childRows.map((cr) => {
                                      const cq = computeMeasurementQty(cr);
                                      const cconv = convertUnitDisplay(cq, cr.unit, unitSystem);
                                      return (
                                        <tr key={cr.id}>
                                          <td className="py-1.5 px-2 font-mono">{cr.srNo}</td>
                                          <td className="py-1.5 px-2">{cr.description}</td>
                                          <td className="py-1.5 px-2 text-right font-mono">
                                            {cr.isDeduction ? `-${cr.no}` : cr.no}
                                          </td>
                                          <td className="py-1.5 px-2 text-right font-mono text-slate-500">
                                            {cr.formula
                                              ? cr.formula
                                              : `${convertLength(cr.length, unitSystem).toFixed(2)} × ${convertLength(cr.breadth, unitSystem).toFixed(2)} × ${convertLength(cr.height, unitSystem).toFixed(2)}`}
                                          </td>
                                          <td
                                            className={`py-1.5 px-2 text-right font-mono font-semibold ${
                                              cq < 0 ? 'text-red-600' : ''
                                            }`}
                                          >
                                            {formatNum(cconv.value, 2)} {cconv.unit}
                                          </td>
                                          <td className="py-1.5 px-2 text-slate-500">
                                            {cr.sourceDrawingName ? (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  if (cr.sourceCoords) {
                                                    setActiveTraceTarget({
                                                      drawingId: cr.sourceDrawingId || '',
                                                      drawingName: cr.sourceDrawingName || '',
                                                      page: cr.sourcePage || 1,
                                                      bbox: cr.sourceCoords,
                                                      label: cr.description,
                                                    });
                                                    setActiveModule('pipeline');
                                                  } else {
                                                    setActiveModule('takeoff');
                                                  }
                                                }}
                                                title="View on drawing"
                                                className="inline-flex items-center gap-1 text-orange-600 hover:underline"
                                              >
                                                <Compass className="w-3 h-3" />
                                                <span>
                                                  View on drawing · {cr.sourceDrawingName} (P.{cr.sourcePage || 1})
                                                </span>
                                              </button>
                                            ) : (
                                              <span>Manual Sheet · {cr.remarks || '—'}</span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
