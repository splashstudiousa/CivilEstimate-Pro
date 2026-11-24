import React, { useMemo, useState } from 'react';
import {
  Copy,
  Download,
  GitCompare,
  History,
  Plus,
  Trash2,
} from 'lucide-react';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useEstimateStore } from '../../store/useEstimateStore';
import {
  convertRateDisplay,
  convertUnitDisplay,
  formatCurrency,
  formatNum,
} from '../../engine/formatters';
import { exportReportToExcel, exportReportToPDF } from '../../engine/exporters';
import { WORK_CATEGORIES } from '../../types/estimate';

export const AbstractOfCost: React.FC = () => {
  const { project, summary, resources, unitSystem } = useActiveProject();
  const companyProfile = useEstimateStore((s) => s.companyProfile);
  const updateBOQItem = useEstimateStore((s) => s.updateBOQItem);
  const duplicateBOQItem = useEstimateStore((s) => s.duplicateBOQItem);
  const deleteBOQItem = useEstimateStore((s) => s.deleteBOQItem);
  const createRevision = useEstimateStore((s) => s.createRevision);
  const setActiveModule = useEstimateStore((s) => s.setActiveModule);
  const globalSearch = useEstimateStore((s) => s.globalSearch);

  const [showCompare, setShowCompare] = useState(false);
  const [selectedRevId, setSelectedRevId] = useState<string>(project.revisions[0]?.id || '');
  const [revLabel, setRevLabel] = useState(`Rev ${project.revisions.length}`);
  const [revNotes, setRevNotes] = useState('');
  const [showSaveRev, setShowSaveRev] = useState(false);

  const query = globalSearch.trim().toLowerCase();

  const grouped = useMemo(() => {
    return WORK_CATEGORIES.map((cat) => {
      const items = summary.items.filter(
        (i) =>
          i.category === cat &&
          (!query ||
            i.description.toLowerCase().includes(query) ||
            i.itemNo.toLowerCase().includes(query) ||
            i.category.toLowerCase().includes(query))
      );
      const subtotal = items.reduce((s, i) => s + i.amount, 0);
      return { category: cat, items, subtotal };
    }).filter((g) => g.items.length > 0);
  }, [summary.items, query]);

  const compareRev = project.revisions.find((r) => r.id === selectedRevId) || project.revisions[0];

  const handleSaveRevision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!revLabel.trim()) return;
    createRevision(revLabel.trim(), revNotes.trim() || 'Cost estimate snapshot');
    setShowSaveRev(false);
    setRevNotes('');
    setRevLabel(`Rev ${project.revisions.length + 1}`);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white">
            Abstract of Cost (Bill of Quantities)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Priced BOQ linked to Rate Analysis & Measurements. Compare saved revisions side-by-side.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCompare((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md border text-xs font-medium whitespace-nowrap ${
              showCompare
                ? 'bg-[#0F2137] text-white border-[#0F2137]'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5 text-orange-500" />
            <span>Compare Versions ({project.revisions.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setShowSaveRev(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <History className="w-3.5 h-3.5 text-sky-600" />
            <span>Save Revision</span>
          </button>
          <button
            type="button"
            onClick={() => exportReportToExcel('abstract-cost', project, summary, resources, unitSystem)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>
          <button
            type="button"
            onClick={() => exportReportToPDF('abstract-cost', project, summary, companyProfile, unitSystem)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export BOQ PDF</span>
          </button>
        </div>
      </div>

      {/* Revision Comparison Drawer */}
      {showCompare && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Side-by-Side Estimate Revision Comparison
              </h2>
              <p className="text-xs text-slate-500">
                Compare current working estimate against any saved baseline revision.
              </p>
            </div>
            {project.revisions.length > 0 && (
              <select
                value={compareRev?.id || ''}
                onChange={(e) => setSelectedRevId(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md"
              >
                {project.revisions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.versionLabel} ({r.createdAt.slice(0, 10)}) —{' '}
                    {formatCurrency(r.grandTotal, project.currency)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {!compareRev ? (
            <div className="text-xs text-slate-500 py-4">
              No saved revisions yet. Click "Save Revision" to snapshot the current BOQ.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-3 rounded bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-slate-500">{compareRev.versionLabel} Grand Total</div>
                  <div className="text-base font-mono font-bold mt-1">
                    {formatCurrency(compareRev.grandTotal, project.currency)}
                  </div>
                </div>
                <div className="p-3 rounded bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-slate-500">Current Working Total</div>
                  <div className="text-base font-mono font-bold mt-1">
                    {formatCurrency(summary.grandTotal, project.currency)}
                  </div>
                </div>
                <div className="p-3 rounded bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-slate-500">Net Variance</div>
                  {(() => {
                    const diff = summary.grandTotal - compareRev.grandTotal;
                    const pct = compareRev.grandTotal > 0 ? (diff / compareRev.grandTotal) * 100 : 0;
                    return (
                      <div
                        className={`text-base font-mono font-bold mt-1 ${
                          diff > 0 ? 'text-red-600' : 'text-emerald-600'
                        }`}
                      >
                        {diff >= 0 ? '+' : ''}
                        {formatCurrency(diff, project.currency)} ({pct >= 0 ? '+' : ''}
                        {pct.toFixed(1)}%)
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                      <th className="py-2 px-2 text-left">Item</th>
                      <th className="py-2 px-2 text-left">Description</th>
                      <th className="py-2 px-2 text-right">{compareRev.versionLabel} Amt</th>
                      <th className="py-2 px-2 text-right">Current Amt</th>
                      <th className="py-2 px-2 text-right">Delta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {compareRev.itemsSnapshot.map((old) => {
                      const cur = summary.items.find((i) => i.itemNo === old.itemNo);
                      const curAmt = cur ? cur.amount : 0;
                      const delta = curAmt - old.amount;
                      return (
                        <tr key={old.itemNo}>
                          <td className="py-2 px-2 font-mono">{old.itemNo}</td>
                          <td className="py-2 px-2">{old.description}</td>
                          <td className="py-2 px-2 text-right font-mono">
                            {formatCurrency(old.amount, project.currency)}
                          </td>
                          <td className="py-2 px-2 text-right font-mono">
                            {formatCurrency(curAmt, project.currency)}
                          </td>
                          <td
                            className={`py-2 px-2 text-right font-mono font-semibold ${
                              delta > 0 ? 'text-red-600' : delta < 0 ? 'text-emerald-600' : 'text-slate-400'
                            }`}
                          >
                            {delta >= 0 ? '+' : ''}
                            {formatCurrency(delta, project.currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Priced BOQ Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#0F2137] text-white">
                <th className="py-2.5 px-3 text-left font-semibold w-16">Item</th>
                <th className="py-2.5 px-3 text-left font-semibold min-w-[260px]">
                  Description of Work
                </th>
                <th className="py-2.5 px-3 text-right font-semibold w-24">Quantity</th>
                <th className="py-2.5 px-3 text-center font-semibold w-16">Unit</th>
                <th className="py-2.5 px-3 text-right font-semibold w-32">Unit Rate</th>
                <th className="py-2.5 px-3 text-center font-semibold w-24">Rate Basis</th>
                <th className="py-2.5 px-3 text-right font-semibold w-32">Amount</th>
                <th className="py-2.5 px-2 text-center font-semibold w-16">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {grouped.map((g) => (
                <React.Fragment key={g.category}>
                  <tr className="bg-slate-100/80 dark:bg-slate-800/60">
                    <td colSpan={6} className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                      {g.category}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      {formatCurrency(g.subtotal, project.currency)}
                    </td>
                    <td />
                  </tr>
                  {g.items.map((item) => {
                    const conv = convertUnitDisplay(item.quantity, item.unit, unitSystem);
                    const rateConv = convertRateDisplay(item.unitRate, item.unit, unitSystem);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {item.itemNo}
                        </td>
                        <td className="py-2.5 px-3 text-slate-900 dark:text-slate-100">
                          {item.description}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatNum(conv.value, 2)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-slate-500">
                          {conv.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {item.useRateAnalysis ? (
                            <button
                              type="button"
                              onClick={() => setActiveModule('rate-analysis')}
                              title="Click to inspect Rate Analysis"
                              className="text-sky-700 dark:text-sky-400 hover:underline font-medium"
                            >
                              {formatCurrency(rateConv.rate, project.currency)}
                            </button>
                          ) : (
                            <input
                              type="number"
                              step="0.5"
                              value={item.manualRate}
                              onChange={(e) =>
                                updateBOQItem(item.id, { manualRate: Number(e.target.value) || 0 })
                              }
                              className="w-24 px-1.5 py-0.5 text-right font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                            />
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              updateBOQItem(item.id, {
                                useRateAnalysis: !item.useRateAnalysis,
                                manualRate: item.manualRate || Math.round(item.unitRate),
                              })
                            }
                            className="text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-orange-600"
                          >
                            {item.useRateAnalysis ? 'Rate Analysis' : 'Manual'}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                          {formatCurrency(item.amount, project.currency)}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => duplicateBOQItem(item.id)}
                              title="Duplicate BOQ Item"
                              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteBOQItem(item.id)}
                              title="Delete BOQ Item"
                              className="p-1 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost Summary Sheet */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              General Abstract Summary & Tender Certification
            </h2>
            <div className="p-4 rounded-md bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Grand Estimated Cost in Words
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white mt-1">
                {summary.grandTotalInWords}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500">Materials Share</div>
                <div className="font-mono font-bold text-sm mt-0.5">
                  {formatCurrency(summary.materialCost, project.currency)}
                </div>
              </div>
              <div className="p-3 rounded border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500">Labor Share</div>
                <div className="font-mono font-bold text-sm mt-0.5">
                  {formatCurrency(summary.laborCost, project.currency)}
                </div>
              </div>
              <div className="p-3 rounded border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500">Equipment Share</div>
                <div className="font-mono font-bold text-sm mt-0.5">
                  {formatCurrency(summary.equipmentCost, project.currency)}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            <div className="py-2 flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">Direct Construction Cost</span>
              <span className="font-mono font-semibold tabular-nums">
                {formatCurrency(summary.directCost, project.currency)}
              </span>
            </div>
            <div className="py-2 flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">
                Site & Head Office Overhead ({project.overheadPct}%)
              </span>
              <span className="font-mono tabular-nums">
                {formatCurrency(summary.overheadAmount, project.currency)}
              </span>
            </div>
            <div className="py-2 flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">
                Contractor Profit ({project.profitPct}%)
              </span>
              <span className="font-mono tabular-nums">
                {formatCurrency(summary.profitAmount, project.currency)}
              </span>
            </div>
            <div className="py-2 flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">
                Taxes / GST ({project.taxPct}%)
              </span>
              <span className="font-mono tabular-nums">
                {formatCurrency(summary.taxAmount, project.currency)}
              </span>
            </div>
            <div className="py-2 flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">
                Physical Contingency ({project.contingencyPct}%)
              </span>
              <span className="font-mono tabular-nums">
                {formatCurrency(summary.contingencyAmount, project.currency)}
              </span>
            </div>
            <div className="py-2 flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">
                Price Escalation Reserve ({project.escalationPct}%)
              </span>
              <span className="font-mono tabular-nums">
                {formatCurrency(summary.escalationAmount, project.currency)}
              </span>
            </div>
            <div className="pt-3 flex justify-between items-baseline">
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                GRAND ESTIMATED TOTAL
              </span>
              <span className="text-lg font-mono font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                {formatCurrency(summary.grandTotal, project.currency)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Save Revision Modal */}
      {showSaveRev && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveRevision}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg max-w-md w-full p-5 space-y-4"
          >
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Save Estimate Revision Snapshot
            </h3>
            <div>
              <label className="block text-xs font-medium mb-1">Revision Label</label>
              <input
                type="text"
                value={revLabel}
                onChange={(e) => setRevLabel(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Revision Notes</label>
              <textarea
                rows={3}
                value={revNotes}
                onChange={(e) => setRevNotes(e.target.value)}
                placeholder="e.g., Updated steel market quotes and first-floor slab quantities"
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSaveRev(false)}
                className="px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs rounded bg-orange-600 text-white font-semibold inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Save Snapshot</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
