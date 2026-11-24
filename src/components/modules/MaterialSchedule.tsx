import React, { useMemo, useState } from 'react';
import { Download, PackageCheck, Search } from 'lucide-react';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useEstimateStore } from '../../store/useEstimateStore';
import { computeMeasurementQty } from '../../engine/calculations';
import {
  convertRateDisplay,
  convertUnitDisplay,
  formatCurrency,
  formatNum,
} from '../../engine/formatters';
import { exportReportToExcel, exportReportToPDF } from '../../engine/exporters';

export const MaterialSchedule: React.FC = () => {
  const { project, summary, resources, unitSystem } = useActiveProject();
  const companyProfile = useEstimateStore((s) => s.companyProfile);
  const [search, setSearch] = useState('');
  const [procuredMap, setProcuredMap] = useState<Record<string, boolean>>({});

  // Rebar breakdown by diameter from BBS measurement rows
  const rebarByDia = useMemo(() => {
    const map = new Map<number, number>();
    for (const m of project.measurements) {
      if (m.rebarDiaMm) {
        const kg = computeMeasurementQty(m);
        map.set(m.rebarDiaMm, (map.get(m.rebarDiaMm) || 0) + kg);
      }
    }
    return Array.from(map.entries())
      .map(([dia, kg]) => ({ dia, kg }))
      .sort((a, b) => b.dia - a.dia);
  }, [project.measurements]);

  const filtered = summary.materialSchedule.filter(
    (m) =>
      !search.trim() ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.categoryGroup.toLowerCase().includes(search.toLowerCase())
  );

  const totalMaterialCost = summary.materialSchedule.reduce((s, m) => s + m.totalCost, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white">
            Material Schedule & Procurement List
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Quantities auto-calculated from BOQ measurements × Rate Analysis material constants (including wastage).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportReportToExcel('material-schedule', project, summary, resources, unitSystem)
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>
          <button
            type="button"
            onClick={() =>
              exportReportToPDF('material-schedule', project, summary, companyProfile, unitSystem)
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {/* Top KPI & Rebar Diameter Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-500">Total Material Procurement Cost</div>
          <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
            {formatCurrency(totalMaterialCost, project.currency)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Across {summary.materialSchedule.length} distinct material SKUs
          </div>
        </div>

        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-900 dark:text-white">
              Steel Reinforcement Schedule by Bar Diameter (BBS)
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              Total: {formatNum(rebarByDia.reduce((s, r) => s + r.kg, 0), 1)} kg
            </span>
          </div>
          {rebarByDia.length === 0 ? (
            <div className="text-xs text-slate-400 py-2">
              No bar-diameter tagged rows in Measurement Sheet. Use the Steel BBS Calculator to add tagged bars.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {rebarByDia.map((r) => (
                <div
                  key={r.dia}
                  className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700"
                >
                  <div className="text-[11px] text-slate-500 font-mono">Ø{r.dia} mm Bar</div>
                  <div className="text-sm font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                    {formatNum(r.kg, 1)} kg
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {(r.kg / 1000).toFixed(2)} MT
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <PackageCheck className="w-4 h-4 text-orange-600" />
          <span>Mark items as procured to track site ordering readiness.</span>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter materials..."
            className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md w-52"
          />
        </div>
      </div>

      {/* Schedule Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                <th className="py-2.5 px-3 text-center font-semibold w-16">Ordered</th>
                <th className="py-2.5 px-3 text-left font-semibold w-24">Code</th>
                <th className="py-2.5 px-3 text-left font-semibold">Material Specification</th>
                <th className="py-2.5 px-3 text-left font-semibold w-28">Group</th>
                <th className="py-2.5 px-3 text-right font-semibold w-28">Required Qty</th>
                <th className="py-2.5 px-3 text-center font-semibold w-20">Unit</th>
                <th className="py-2.5 px-3 text-right font-semibold w-28">Unit Rate</th>
                <th className="py-2.5 px-3 text-right font-semibold w-32">Total Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((m) => {
                const qConv = convertUnitDisplay(m.totalQty, m.unit, unitSystem);
                const rConv = convertRateDisplay(m.unitRate, m.unit, unitSystem);
                return (
                  <tr
                    key={m.resourceId}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                      procuredMap[m.resourceId] ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(procuredMap[m.resourceId])}
                        onChange={(e) =>
                          setProcuredMap((prev) => ({ ...prev, [m.resourceId]: e.target.checked }))
                        }
                        className="accent-orange-600"
                      />
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">{m.code}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">{m.name}</td>
                    <td className="py-2.5 px-3 text-slate-500">{m.categoryGroup}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">
                      {formatNum(qConv.value, 2)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-500">{qConv.unit}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {formatCurrency(rConv.rate, project.currency)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                      {formatCurrency(m.totalCost, project.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
