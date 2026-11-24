import React from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useEstimateStore } from '../../store/useEstimateStore';
import {
  exportReportToExcel,
  exportReportToPDF,
  exportToCSV,
  ReportKind,
} from '../../engine/exporters';
import { formatCurrency, formatNum } from '../../engine/formatters';

interface ReportCardDef {
  kind: ReportKind;
  title: string;
  description: string;
  metric: string;
}

export const ReportsExportModule: React.FC = () => {
  const { project, summary, resources, unitSystem } = useActiveProject();
  const companyProfile = useEstimateStore((s) => s.companyProfile);

  const reports: ReportCardDef[] = [
    {
      kind: 'full-estimate',
      title: 'Full Estimate Tender Package',
      description:
        'Cover page, executive summary, Abstract of Quantities, priced BOQ, Material Schedule, Labor/Equipment, CPM Schedule & Cash Flow.',
      metric: `${formatCurrency(summary.grandTotal, project.currency)} Grand Total`,
    },
    {
      kind: 'abstract-cost',
      title: 'Abstract of Cost (BOQ)',
      description:
        'Categorized priced Bill of Quantities with overhead, profit, tax, contingency & amount in words.',
      metric: `${summary.items.length} Priced Items`,
    },
    {
      kind: 'abstract-quantities',
      title: 'Abstract of Quantities',
      description: 'Clean unpriced quantity summary grouped by construction trade.',
      metric: `${project.measurements.length} Takeoff Lines`,
    },
    {
      kind: 'rate-analysis',
      title: 'Unit Rate Analysis Schedule',
      description: 'Detailed material, labor, equipment, wastage & location breakdown per item.',
      metric: `${project.rateAnalyses.length} Analyzed Rates`,
    },
    {
      kind: 'material-schedule',
      title: 'Material Procurement Schedule',
      description: 'Aggregated cement, sand, aggregate, steel, bricks, tiles, paint & MEP totals.',
      metric: `${summary.materialSchedule.length} Material SKUs`,
    },
    {
      kind: 'labor-equipment',
      title: 'Labor & Equipment Report',
      description: 'Trade-wise man-days, machinery hours, and mobilization cost forecast.',
      metric: `${formatNum(summary.totalLaborManDays, 0)} Man-Days`,
    },
    {
      kind: 'gantt-schedule',
      title: 'CPM Project Schedule',
      description: 'Critical path tasks, start/finish days, float & progress table.',
      metric: `${summary.totalDurationWorkingDays} Working Days`,
    },
    {
      kind: 'cash-flow',
      title: 'Monthly Cash Flow & S-Curve',
      description: 'Period-by-period planned expenditure, cumulative S-curve & peak crew.',
      metric: `${summary.cashFlow.length} Months`,
    },
  ];

  const handleCSVExport = (kind: ReportKind) => {
    if (kind === 'material-schedule') {
      exportToCSV(
        summary.materialSchedule.map((m) => ({
          Code: m.code,
          Material: m.name,
          Unit: m.unit,
          Qty: Number(m.totalQty.toFixed(2)),
          Rate: m.unitRate,
          Total: Number(m.totalCost.toFixed(2)),
        })),
        `${project.code}_materials`
      );
    } else if (kind === 'gantt-schedule') {
      exportToCSV(
        summary.tasks.map((t) => ({
          Item: t.itemNo,
          Activity: t.name,
          Duration: t.durationDays,
          StartDay: t.earlyStart + 1,
          FinishDay: t.earlyFinish,
          Float: t.totalFloat,
          Critical: t.isCritical ? 'YES' : 'NO',
        })),
        `${project.code}_schedule`
      );
    } else {
      exportToCSV(
        summary.items.map((i) => ({
          ItemNo: i.itemNo,
          Category: i.category,
          Description: i.description,
          Unit: i.unit,
          Quantity: Number(i.quantity.toFixed(2)),
          Rate: Number(i.unitRate.toFixed(2)),
          Amount: Number(i.amount.toFixed(2)),
        })),
        `${project.code}_${kind}`
      );
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white">
          Reports & Export Center
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          One-click engineering deliverables with company cover page, license metadata, signature blocks, and page numbering.
        </p>
      </div>

      {/* Cover Preview Strip */}
      <div className="bg-[#0F2137] text-white rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border border-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-white p-1 shrink-0 overflow-hidden">
            <img
              src="/src/assets/images/company_emblem_1795496552579.jpg"
              alt={companyProfile.companyName}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <div className="text-[11px] text-orange-400 font-semibold">
              {companyProfile.companyName} · License {companyProfile.licenseNo}
            </div>
            <div className="text-base font-display font-bold">{project.name}</div>
            <div className="text-xs text-slate-300">
              Prepared: {companyProfile.preparedBy} · Reviewed: {companyProfile.reviewedBy}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            exportReportToPDF('full-estimate', project, summary, companyProfile, unitSystem)
          }
          className="px-4 py-2.5 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <FileText className="w-4 h-4" />
          <span>Download Complete PDF Package</span>
        </button>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {reports.map((rep) => (
          <div
            key={rep.kind}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col justify-between gap-4"
          >
            <div>
              <div className="text-[11px] font-mono text-orange-600 dark:text-orange-400 font-semibold">
                {rep.metric}
              </div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white mt-1">
                {rep.title}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                {rep.description}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() =>
                  exportReportToPDF(rep.kind, project, summary, companyProfile, unitSystem)
                }
                className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded bg-[#0F2137] hover:bg-slate-800 text-white text-[11px] font-medium"
              >
                <FileText className="w-3 h-3" />
                <span>PDF</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  exportReportToExcel(rep.kind, project, summary, resources, unitSystem)
                }
                className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-[11px] font-medium"
              >
                <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                <span>Excel</span>
              </button>
              <button
                type="button"
                onClick={() => handleCSVExport(rep.kind)}
                className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-[11px] font-mono"
              >
                CSV
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
