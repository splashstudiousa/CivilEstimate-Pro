import React from 'react';
import { Download } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useEstimateStore } from '../../store/useEstimateStore';
import { formatCurrency, formatNum } from '../../engine/formatters';
import { exportReportToExcel, exportReportToPDF } from '../../engine/exporters';

export const LaborEquipmentModule: React.FC = () => {
  const { project, summary, resources, unitSystem } = useActiveProject();
  const companyProfile = useEstimateStore((s) => s.companyProfile);
  const updateBOQItem = useEstimateStore((s) => s.updateBOQItem);

  const laborTotal = summary.laborSchedule.reduce((s, r) => s + r.totalCost, 0);
  const equipTotal = summary.equipmentSchedule.reduce((s, r) => s + r.totalCost, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white">
            Labor, Equipment & Productivity Constants
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Trade-wise man-days, machinery hours, and editable crew productivity norms driving the CPM schedule.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportReportToExcel('labor-equipment', project, summary, resources, unitSystem)
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>
          <button
            type="button"
            onClick={() =>
              exportReportToPDF('labor-equipment', project, summary, companyProfile, unitSystem)
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {/* Summary & Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-500">Total Labor Effort</div>
              <div className="text-xl font-mono font-bold text-slate-900 dark:text-white mt-1">
                {formatNum(summary.totalLaborManDays, 0)} <span className="text-xs font-normal">man-days</span>
              </div>
              <div className="text-xs font-mono text-orange-600 mt-1">
                {formatCurrency(laborTotal, project.currency)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-500">Equipment Runtime</div>
              <div className="text-xl font-mono font-bold text-slate-900 dark:text-white mt-1">
                {formatNum(summary.totalEquipmentHours, 0)} <span className="text-xs font-normal">hrs</span>
              </div>
              <div className="text-xs font-mono text-sky-600 mt-1">
                {formatCurrency(equipTotal, project.currency)}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <h2 className="text-xs font-semibold text-slate-900 dark:text-white mb-2">
              Man-Days by Construction Trade
            </h2>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={summary.laborSchedule}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 10, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" opacity={0.2} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#64748B' }} />
                  <YAxis
                    type="category"
                    dataKey="trade"
                    width={82}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                  />
                  <Tooltip
                    formatter={(v) => [`${formatNum(Number(v ?? 0), 1)} man-days`, 'Effort']}
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '6px',
                      color: '#F8FAFC',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="totalManDays" fill="#0F2137" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Labor & Equipment Tables */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white">
              Labor Requirement by Trade
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <th className="py-2 px-3 text-left">Trade</th>
                    <th className="py-2 px-3 text-right">Man-Days</th>
                    <th className="py-2 px-3 text-right">Daily Rate</th>
                    <th className="py-2 px-3 text-right">Total Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {summary.laborSchedule.map((l) => (
                    <tr key={l.resourceId}>
                      <td className="py-2 px-3 font-medium">{l.name}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {formatNum(l.totalManDays, 1)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {formatCurrency(l.dailyRate, project.currency)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums">
                        {formatCurrency(l.totalCost, project.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white">
              Plant & Equipment Utilization
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <th className="py-2 px-3 text-left">Equipment</th>
                    <th className="py-2 px-3 text-right">Hours</th>
                    <th className="py-2 px-3 text-right">Hourly Rate</th>
                    <th className="py-2 px-3 text-right">Total Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {summary.equipmentSchedule.map((e) => (
                    <tr key={e.resourceId}>
                      <td className="py-2 px-3 font-medium">{e.name}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {formatNum(e.totalHours, 1)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {formatCurrency(e.hourlyRate, project.currency)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums">
                        {formatCurrency(e.totalCost, project.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Editable Productivity Constants */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Activity Productivity Constants & Crew Sizing
            </h2>
            <p className="text-[11px] text-slate-500">
              Adjust daily crew output or number of crews to automatically compress or extend Gantt activity durations.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                <th className="py-2.5 px-3 text-left">Item</th>
                <th className="py-2.5 px-3 text-left">Work Activity</th>
                <th className="py-2.5 px-3 text-right">Total Qty</th>
                <th className="py-2.5 px-3 text-right">Output / Crew-Day</th>
                <th className="py-2.5 px-3 text-right">Crews</th>
                <th className="py-2.5 px-3 text-right">Computed Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {summary.tasks
                .filter((t) => !t.isMilestone)
                .map((t) => (
                  <tr key={t.boqItemId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 font-mono font-semibold">{t.itemNo}</td>
                    <td className="py-2 px-3 max-w-md truncate">{t.name}</td>
                    <td className="py-2 px-3 text-right font-mono">
                      {formatNum(t.quantity, 1)} {t.unit}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <input
                        type="number"
                        step="0.5"
                        min={0.5}
                        value={t.productivityPerDay}
                        onChange={(e) =>
                          updateBOQItem(t.boqItemId, {
                            productivityPerDay: Math.max(0.5, Number(e.target.value) || 1),
                            manualDurationDays: undefined,
                          })
                        }
                        className="w-20 px-2 py-1 text-right font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                      />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <input
                        type="number"
                        step="1"
                        min={1}
                        value={t.crewSize}
                        onChange={(e) =>
                          updateBOQItem(t.boqItemId, {
                            crewSize: Math.max(1, Number(e.target.value) || 1),
                            manualDurationDays: undefined,
                          })
                        }
                        className="w-16 px-2 py-1 text-right font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                      />
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-orange-600 dark:text-orange-400">
                      {t.durationDays} days
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
